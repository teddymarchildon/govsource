from copy import deepcopy
from types import SimpleNamespace

import pytest

from brief_ai import DraftLimitReached, BudgetExhausted, PROMPT_VERSION
from brief_editorial import editorial_rank, quality_passes, QUALITY_CHECKS, rank_queue
from brief_prefilter import prefilter_reason
from process_briefs import process, process_queue, verification_passes
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


def test_unsupported_significance_is_stopped_before_paid_extraction():
    class UnsupportedAI(FakeAI):
        def call(self, stage, *args, **kwargs):
            result = super().call(stage, *args, **kwargs)
            if stage == 'selection':
                result['reader_value']['evidence'][0]['quote'] = 'This will save everyone millions of dollars.'
            return result
    ai = UnsupportedAI(None, None)
    assert process(DB(), job(), 'lease', ai_factory=lambda *a: ai) == 'withheld'
    assert ai.stages == ['selection']


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
