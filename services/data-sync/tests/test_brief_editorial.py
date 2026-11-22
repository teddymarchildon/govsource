from copy import deepcopy
from types import SimpleNamespace

import pytest

from brief_ai import DraftLimitReached, BudgetExhausted, PROMPT_VERSION, SELECTION
from brief_editorial import editorial_rank, quality_passes, QUALITY_CHECKS, rank_queue
from brief_prefilter import prefilter_reason
from process_briefs import process, process_queue, selection_score, verification_passes
from test_brief_pipeline import DB, FakeAI, job, report, draft, selection
from test_brief_prefilter import bill


def test_consequential_introductions_reach_editorial_selection():
    j = bill()
    j['source_metadata']['title'] = 'Ad-Free Means Ad-Free Act'
    assert prefilter_reason(j) is None


@pytest.mark.parametrize('field', QUALITY_CHECKS)
def test_factual_accuracy_cannot_override_any_failed_quality_check(field):
    r = report(draft())
    r['editorial_quality'][field] = False
    assert not verification_passes(r, draft())


@pytest.mark.parametrize('quality', [None, {}, {'passed': True},
    dict(passed=True, issues=['Only filing metadata'], **{k: True for k in QUALITY_CHECKS})])
def test_missing_or_contradictory_quality_checks_fail_closed(quality):
    assert not quality_passes(quality)


def test_accurate_but_thin_draft_is_repaired_then_withheld():
    class ThinAI(FakeAI):
        def call(self, stage, instructions, payload, *args, **kwargs):
            result = super().call(stage, instructions, payload, *args, **kwargs)
            if stage == 'verify':
                result['editorial_quality'].update(adds_explanation=False, issues=['Context only repeats the points'])
            if stage == 'write' and self.stages.count('write') > 1:
                assert 'Context only repeats the points' in payload['feedback']
            return result
    ai = ThinAI(None, None)
    assert process(DB(), job(), 'lease', ai_factory=lambda *a: ai) == 'withheld'
    assert ai.stages.count('write') == 3


def test_selection_without_a_reader_plan_is_stopped_before_paid_extraction():
    class VagueAI(FakeAI):
        def call(self, stage, *args, **kwargs):
            result = super().call(stage, *args, **kwargs)
            if stage == 'selection':
                result['explanation_plan'] = ['Only one angle', '  ']
            return result
    ai = VagueAI(None, None)
    assert process(DB(), job(), 'lease', ai_factory=lambda *a: ai) == 'withheld'
    assert ai.stages == ['selection']


def test_selection_needs_no_quotations_and_scores_are_bounded():
    # Triage notes are not public copy; quotation checks start at extraction.
    assert 'evidence' not in str(SELECTION['properties']['reader_value'])
    assert selection_score(selection()) == 63
    assert selection_score({'scores': {'reach': 99, 'magnitude': -4, 'timeliness': True, 'certainty': '25'}}) == 25
    assert selection_score({}) == 0 and selection_score({'scores': None}) == 0


def test_passing_selection_is_shortlisted_with_its_score_before_any_drafting():
    ai = FakeAI(None, None)
    db = DB()
    assert process(db, job(), 'lease', ai_factory=lambda *a: ai, shortlist=True) == 'shortlisted'
    assert ai.stages == ['selection']
    shortlisted = [args for name, args in db.calls if name == 'shortlist_brief_job']
    assert shortlisted == [{'p_id': 1, 'p_token': 'lease', 'p_score': 63, 'p_reason': 'Consequential rule'}]
    assert not any(name == 'finish_brief_job' for name, _ in db.calls)


def test_shortlisted_and_requested_jobs_draft_without_reentering_the_shortlist():
    for extra in ({'selection_score': 63}, {'manual_request_id': 1}):
        ai = FakeAI(None, None)
        db = DB()
        assert process(db, {**job(), **extra}, 'lease', ai_factory=lambda *a: ai, shortlist=True) == 'verified'
        assert not any(name == 'shortlist_brief_job' for name, _ in db.calls)


def test_worker_drafts_top_shortlisted_candidate_before_screening(monkeypatch):
    import process_briefs
    class QueueDB(DB):
        def __init__(self):
            super().__init__()
            self.queues = {'claim_shortlisted_brief_job': [{**job(), 'id': 9, 'selection_score': 80}],
                           'claim_brief_job': [{**job(), 'id': 2}, {**job(), 'id': 3}]}
        def rpc(self, name, args):
            self.calls.append((name, args))
            rows = [self.queues[name].pop(0)] if self.queues.get(name) else []
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=rows))
    seen = []
    def fake(db, j, token, **kwargs):
        seen.append((j['id'], kwargs['shortlist']))
        return 'verified' if j.get('selection_score') else 'shortlisted'
    monkeypatch.setattr(process_briefs, 'process', fake)
    db = QueueDB()
    result = process_queue(db, 10, float('inf'))
    assert seen == [(9, True), (2, True), (3, True)]
    assert result['verified'] == 1 and result['shortlisted'] == 2
    # Once no draft slot is open, the run stops asking and only screens.
    assert [name for name, _ in db.calls].count('claim_shortlisted_brief_job') == 2


def test_draft_cap_returns_shortlisted_job_with_its_rank(monkeypatch):
    import process_briefs
    class QueueDB(DB):
        def rpc(self, name, args):
            self.calls.append((name, args))
            rows = [{**job(), 'selection_score': 71, 'reason': 'Ranked'}] if name == 'claim_shortlisted_brief_job' else []
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=rows))
    def capped(*args, **kwargs):
        raise DraftLimitReached('draft cap')
    monkeypatch.setattr(process_briefs, 'process', capped)
    db = QueueDB()
    process_queue(db, 5, float('inf'))
    names = [name for name, _ in db.calls]
    assert names.count('claim_shortlisted_brief_job') == 1 and 'defer_brief_budget' not in names
    assert dict(db.calls)['shortlist_brief_job']['p_score'] == 71


def test_reader_plan_and_current_date_reach_writer_and_verifier():
    class PlannedAI(FakeAI):
        def call(self, stage, instructions, payload, *args, **kwargs):
            if stage in ('write', 'verify'):
                assert payload['editorial_plan'] == selection()
                assert len(payload['as_of_date']) == 10
            if stage == 'verify':
                assert 'entirely factual and still fail quality' in instructions
            return super().call(stage, instructions, payload, *args, **kwargs)
    assert process(DB(), job(), 'lease', ai_factory=PlannedAI) == 'verified'


def test_old_checkpoint_cannot_bypass_new_selection_and_quality_contract():
    j = job()
    j['work'] = {'prompt_version': 'continuous-v4-selective-explainers',
                 'selection': {'important': True, 'new_development': True}, 'draft': draft()}
    ai = FakeAI(None, None)
    assert process(DB(), j, 'lease', ai_factory=lambda *a: ai) == 'verified'
    assert ai.stages == ['selection', 'extract', 'write', 'verify']


def test_draft_cap_continues_screening_but_dollar_cap_stops(monkeypatch):
    import process_briefs
    class QueueDB(DB):
        def rpc(self, name, args):
            self.calls.append((name, args))
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=[job()] if name == 'claim_brief_job' else []))
    for exc, expected in [(DraftLimitReached('draft cap'), 3), (BudgetExhausted('dollar cap'), 1)]:
        def capped(*args, **kwargs):
            raise exc
        monkeypatch.setattr(process_briefs, 'process', capped)
        db = QueueDB()
        result = process_queue(db, 3, float('inf'))
        assert result['claimed'] == expected
        assert sum(n == 'defer_brief_budget' for n, _ in db.calls) == expected


def test_reader_changes_outrank_routine_documents_even_when_both_are_rules():
    substantive = editorial_rank('agency_document', {'title': 'Single Family Housing Guaranteed Loan Program—Income Producing ADU Provisions', 'type': 'Rule'})
    routine = editorial_rank('agency_document', {'title': 'Standard Instrument Approach Procedures', 'type': 'Rule'})
    paperwork = editorial_rank('agency_document', {'title': 'Agency Information Collection Activities: Medical Safety Survey', 'type': 'Notice'})
    assert substantive['score'] > routine['score'] + 10
    assert substantive['score'] > paperwork['score'] + 10
    assert substantive['reasons'] and routine['reasons']


def test_audited_explainers_remain_ahead_of_routine_notices():
    import json
    from pathlib import Path
    cases = json.loads((Path(__file__).parent/'fixtures/editorial-audit-candidates.json').read_text())
    routine = editorial_rank('agency_document', {'type':'Notice', 'title':'Importer of Controlled Substances Application: Janssen'})
    for case in cases:
        assert editorial_rank(case['kind'],case['metadata'])['score'] > routine['score'], case['brief_id']


def test_rank_sweep_preserves_work_and_respects_concurrent_claim():
    class Query:
        def __init__(self, db): self.db=db;self.filters=[];self.payload=None
        def select(self, *a): return self
        def in_(self, *a): return self
        def gt(self, *a): return self
        def order(self, *a): return self
        def limit(self, *a): return self
        def or_(self, *a): return self
        def eq(self, *a): self.filters.append(a);return self
        def update(self, payload): self.payload=payload;return self
        def execute(self):
            if self.payload is not None:
                self.db.writes.append(self)
                return SimpleNamespace(data=[])  # Another worker claimed it.
            self.db.reads += 1
            return SimpleNamespace(data=[dict(id=1,source_type='agency_document',source_metadata={'type':'Rule','title':'Housing eligibility'},priority=70,status='pending',updated_at='stamp',source_revision=2)] if self.db.reads == 1 else [])
    class QueueDB:
        def __init__(self): self.reads=0;self.writes=[]
        def table(self, name): return Query(self)
    db = QueueDB()
    result = rank_queue(db)
    assert result == {'scanned':1, 'changed':0}
    assert set(db.writes[0].payload) == {'priority'}
    assert ('status','pending') in db.writes[0].filters
    assert ('source_revision',2) in db.writes[0].filters
    assert ('updated_at','stamp') in db.writes[0].filters
    assert rank_queue(None, deadline=0)['incomplete'] is True


def test_editor_requested_routine_source_skips_free_filter():
    j = bill()
    assert prefilter_reason(j)
    j['manual_request_id'] = 1
    assert prefilter_reason(j) is None


def test_editor_requested_source_still_requires_quality():
    class RequestedAI(FakeAI):
        def call(self, stage, instructions, payload, *args, **kwargs):
            if stage == 'selection':
                assert 'editor explicitly requested' in instructions
                assert 'historical' in instructions
            result = super().call(stage, instructions, payload, *args, **kwargs)
            if stage == 'verify':
                result['editorial_quality']['adds_explanation'] = False
            return result
    j = job()
    j['manual_request_id'] = 1
    assert process(DB(), j, 'lease', ai_factory=RequestedAI) == 'withheld'
