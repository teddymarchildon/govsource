import pytest
from brief_style import style_issues
from generate_briefs_batch import validate_generated_drafts
from process_briefs import validate_draft, process
from brief_ai import PROMPT_VERSION
from test_brief_pipeline import PASSAGE, claim, draft, job, selection, FakeAI, DB


@pytest.mark.parametrize('text', [
    'The rule applies to large operators — small ones are exempt.',
    'Comments are due October 1 – 15.',
    'The rule applies to large operators -- small ones are exempt.',
    'The rule applies to large operators - small ones are exempt.',
])
def test_dashes_are_rejected_in_prose(text):
    assert any('dash' in issue for issue in style_issues('context', text))


@pytest.mark.parametrize('text', [
    'The notice says the draft "does not establish any rights—or obligations" for anyone.',
    'It allows “incidental — but not intentional — taking” of marine mammals.',
    'NMFS allows ‘‘incidental, but not intentional — taking’’ by harassment.',
    'The 2025-2026 cycle covers well-known small-business programs.',
    'Closures run Oct. 21–Dec. 31, 2026, for 0–6 months.',
    "Congress defined ``surviving spouse--widow or widower'' for this section.",
    'The bill makes the townsite a National Historic Landmark.',
    '### Who must report\n\n- Large operators file annually.\n- Small operators are exempt.',
])
def test_quotes_hyphenated_words_and_markdown_lists_are_allowed(text):
    assert style_issues('context', text) == []


@pytest.mark.parametrize('text,phrase', [
    ('In short, operators must file every year.', 'in short'),
    ('The bill is a significant step for exporters.', 'a significant step'),
    ('The law plays a key role in housing.', 'plays a key role'),
    ('This landmark rule changes reporting.', 'landmark rule'),
    ('Overall, the change is narrow.', 'overall,'),
    ('### Why this matters\n\nOperators must file.', 'why this matters'),
])
def test_stock_phrases_are_rejected(text, phrase):
    assert any(f'"{phrase}"' in issue for issue in style_issues('context', text))


@pytest.mark.parametrize('text', [
    'The NRC issued a Finding of No Significant Impact for the site.',
    'States must keep vital records for 75 years.',
    'The agency found no significant change in emissions.',
])
def test_official_terms_with_common_words_are_allowed(text):
    assert style_issues('context', text) == []


@pytest.mark.parametrize('text', [
    'Angle 1: Eligibility versus scope. The rule covers two models.',
    'Two explanatory angles for readers: who must inspect and when.',
    'The reader question is who must file.',
    'The second angle is timing.',
])
def test_leaked_planning_notes_are_rejected(text):
    assert any('planning language' in issue for issue in style_issues('context', text))


def test_validate_draft_reports_style_issues_per_field():
    d = draft()
    d['points'][1] = claim('Comments close on October 1, 2026 — after the hearing.')
    d['context'] = claim('Angle 1: who is covered. In short, large operators.')
    errors = validate_draft(d, {'passages': [PASSAGE]})
    assert any(e.startswith('point_2:') and 'dash' in e for e in errors)
    assert any(e.startswith('context:') and 'planning language' in e for e in errors)
    assert any(e.startswith('context:') and '"in short"' in e for e in errors)


def test_batch_generation_rejects_style_violations():
    records = [{'record_key': 'r1'}]
    good = {'record_key': 'r1', 'title': 'Senate passes bill', 'dek': 'The bill sets a deadline.',
            'points': ['It sets a deadline.'], 'context_markdown': ''}
    validate_generated_drafts([good], records)
    with pytest.raises(ValueError, match='style violations'):
        validate_generated_drafts([{**good, 'dek': 'The bill — a landmark — sets a deadline.'}], records)


def test_v6_work_keeps_selection_and_extraction_but_redrafts():
    j = job()
    j['work'] = {'prompt_version': 'continuous-v6-scored-shortlist', 'selection': selection(),
                 'extracted': [{'passage_id': 's1', 'facts': [claim()], 'qualifications': []}],
                 'draft': draft(), 'repair': 1, 'feedback': ['old feedback']}
    ai = FakeAI(None, None)
    process(DB(), j, 'lease', ai_factory=lambda *a: ai)
    assert 'selection' not in ai.stages and 'extract' not in ai.stages
    assert 'write' in ai.stages
    assert ai.stages.count('write') <= 3


def test_older_work_is_discarded():
    j = job()
    j['work'] = {'prompt_version': 'continuous-v5-reader-value', 'selection': selection(),
                 'extracted': [{'passage_id': 's1', 'facts': [claim()], 'qualifications': []}]}
    ai = FakeAI(None, None)
    process(DB(), j, 'lease', ai_factory=lambda *a: ai)
    assert 'selection' in ai.stages


from brief_style import repetition_issues, plain_definitions, GLOSSARY
from brief_evidence import bill_status_text
from process_briefs import MAX_CONTEXT_CHARS


@pytest.mark.parametrize('text,expected', [
    ('The bill would repeal Section 27 of the Clayton Act (15 U.S.C. 26b).', 'legal citation'),
    ('The rule amends 40 CFR part 60 for large plants.', 'legal citation'),
    ('The bill would repeal Clayton Act §27.', 'legal citation'),
    ('The record shows no enactment (source_2_section_1).', 'internal label'),
    ('The record explicitly shows "law_enacted_date": null.', 'internal label'),
    ('### Source excerpts\n\nThe bill was introduced.', 'internal label'),
    ('Pursuant to the bill, teams face the same rules.', '"pursuant to"'),
    ('It removes the statutory protection for baseball.', '"statutory"'),
    ('The bill was read twice and sent to committee.', '"read twice"'),
    ('Operators shall file a report each year.', '"shall"'),
])
def test_citations_labels_and_legal_wording_are_rejected(text, expected):
    assert any(expected in issue for issue in style_issues('context', text))


def test_email_addresses_and_docket_names_are_not_labels():
    assert style_issues('point_1', 'Send comments to tina_hardy@nps.gov or docket DOL_PRA_PUBLIC by email.') == []


def test_legal_wording_inside_a_short_quote_is_allowed():
    assert style_issues('point_1', 'Operators must file a report. The bill says they "shall file annually."') == []


def test_quote_heavy_and_long_quoted_text_is_rejected():
    heavy = ('The bill says baseball is "subject to the antitrust laws to the same extent" as other sports and '
             'that "Section 27 of the Clayton Act is repealed" and that the term "includes section 5 of the '
             'Federal Trade Commission Act to the extent that such section applies to unfair methods."')
    assert any('quotation' in issue for issue in style_issues('context', heavy))
    long = ('The bill says "the conduct, acts, practices, or agreements of persons in the business of organized '
            'professional baseball are subject to the antitrust laws to the same extent such conduct would be." '
            + 'Teams would be treated like other leagues. ' * 6)
    assert any('too long' in issue for issue in style_issues('context', long))


def test_repetition_within_context_and_across_fields():
    clause = 'organized professional baseball would be treated the same as every other professional sport under these rules'
    assert any(i.startswith('context:') for i in repetition_issues({'context': f'{clause}. Then more. {clause}.'}))
    issues = repetition_issues({'title': clause, 'dek': clause + '.', 'point_1': 'Teams could be sued.',
                                'point_2': clause + ' too.', 'context': 'Fans would see no change this season.'})
    assert issues == [issues[0]] and issues[0].startswith('point_2: repeats') and 'from dek' in issues[0]


def test_distinct_fields_and_shared_short_names_pass():
    name = 'the Senate Committee on the Judiciary'
    assert repetition_issues({'dek': f'The bill went to {name}.', 'point_1': f'{name} has not acted.',
                              'context': 'Teams could face lawsuits over league rules if it becomes law.'}) == []


def test_definitions_are_offered_only_for_terms_in_the_source_and_carry_no_numbers():
    terms = {d['term'] for d in plain_definitions([{'text': 'Baseball is subject to the antitrust laws. '
                                                            'Read twice and referred to the Committee on the Judiciary.'}])}
    assert {'antitrust laws', 'referred to committee'} <= terms and 'final rule' not in terms
    assert all(not any(ch.isdigit() for ch in definition) for _, _, definition in GLOSSARY)
    assert all(style_issues('context', definition) == [] for _, _, definition in GLOSSARY)


def test_writer_and_verifier_receive_definitions():
    payloads = {}
    class Recording(FakeAI):
        def call(self, stage, instructions, payload, *a, **kw):
            payloads[stage] = payload
            return super().call(stage, instructions, payload, *a, **kw)
    process(DB(), job(), 'lease', ai_factory=Recording)
    for stage in ('write', 'verify'):
        assert {d['term'] for d in payloads[stage]['plain_definitions']} >= {'exemption', 'proposed rule'}


def test_context_length_cap():
    d = draft()
    d['context'] = claim('Large operators file. ' * (MAX_CONTEXT_CHARS // 20))
    assert any('Context is too long' in e for e in validate_draft(d, {'passages': [PASSAGE]}))


def test_bill_status_is_readable_text_without_field_names():
    text = bill_status_text({'title': 'Baseball bill', 'introduced_date': '2026-11-10', 'law_enacted_date': None,
                             'law_number': None, 'actions': [{'date': '2026-11-10T00:00:00',
                                                              'text': 'Read twice and referred to the Committee on the Judiciary.'}]})
    assert 'Became law: No enactment recorded' in text
    assert '2026-11-10: Read twice and referred' in text
    assert '_' not in text and '{' not in text
