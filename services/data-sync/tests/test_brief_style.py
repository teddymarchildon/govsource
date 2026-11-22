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
    assert PROMPT_VERSION == 'continuous-v7-style-rules'
