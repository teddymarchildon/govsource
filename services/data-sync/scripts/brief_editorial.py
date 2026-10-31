"""Transparent triage signals and the editorial contract shared by the pipeline.

Ranking spends no model budget and never approves or discards a document. The
selector must establish significance from full source text, including exceptions.
"""
import re
import time
from datetime import datetime, timedelta, timezone

RANK_VERSION = 'reader-value-v1'
QUALITY_CHECKS = ('reader_value', 'adds_explanation', 'context_not_metadata',
                  'paraphrases_sources', 'timing_clear')


def editorial_rank(kind, row):
    title = str(row.get('title') or row.get('case_name') or '').lower()
    abstract = str(row.get('abstract') or '').lower()
    text = title + ' ' + abstract
    reasons = []
    score = 45
    if kind == 'cluster':
        score = 80
        reasons.append('Supreme Court decision; distinguish merits from procedural opinions')
    elif kind == 'bill':
        actions = ' '.join(str(a.get('text') or '') for a in row.get('actions') or []).lower()
        if row.get('law_enacted_date'):
            score = 85
            reasons.append('Enacted legislation')
        elif re.search(r'passed|agreed to|reported|ordered to be reported', actions):
            score = 65
            reasons.append('Substantive legislative advancement')
        else:
            score = 30
            reasons.append('Introduction needs a strong public-interest justification')
    elif row.get('subtype') == 'Executive Order':
        score = 75
        reasons.append('Executive action; implementation and limits need explanation')
    elif row.get('type') in ('Rule', 'Proposed Rule'):
        score = 60
        reasons.append('Rulemaking; document type alone does not establish value')

    # A single capped boost avoids rewarding keyword repetition. These describe
    # reader-facing subjects, not a purported factual finding about legal effect.
    if re.search(r'\b(eligibility|benefits?|housing|mortgage|loan|consumer|fraud|vot(?:er|ing)|'
                 r'privacy|civil rights|health|medical|safety|emission|drinking water|'
                 r'carbon|tax credit|wage|overtime|student|disability|immigration|'
                 r'gift|financial disclosure|cybersecurity|sanctions?)\b', text):
        score += 15
        reasons.append('Potential effect on readers’ rights, costs, services, health, or safety')
    routine = re.search(r'\b(information collection|collection activities|paperwork reduction|'
                        r'notice of (?:closed |open |public )?meetings?|performance review board|'
                        r'bulk manufacturer|importer of controlled substances|'
                        r'prospective grant of exclusive patent license|current list of.*certified laboratories|'
                        r'instrument approach|standard instrument|survey plats?|'
                        r'inventory completion|intent to repatriate)\b', title)
    ceremonial = re.search(r'\b(post office.*(?:designat|nam)|(?:designat|nam).*post office|'
                           r'commemorat\w*|congratulat\w*|honoring|honouring)\b', title)
    if routine or ceremonial:
        score = min(score, 20)
        reasons.append('Routine/ceremonial signal: requires unusual consequences in the full evidence')
    if re.search(r'\b(technical amendments?|correction|correcting amendment)\b', title):
        score -= 15
        reasons.append('Technical change; check for a material correction before selecting')
    return {'version': RANK_VERSION, 'score': max(5, min(100, score)), 'reasons': reasons}


def rank_queue(db, queue='current', deadline=float('inf'), apply=True):
    """Refresh existing queue priorities; compare-and-set never steals a lease.

    Keyset pagination scans beyond the first page. It does not reopen archived,
    skipped, verified, or withheld jobs and preserves all paid checkpoints.
    """
    summary = {'scanned': 0, 'changed': 0}
    cursor = 0
    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=30)).isoformat()
    while time.monotonic() < deadline:
        q = db.table('brief_job').select('id,source_type,source_metadata,priority,status,updated_at,source_revision,manual_request_id').in_(
            'status', ['pending', 'retry']).gt('id', cursor).order('id').limit(100)
        q = q.lt('development_date', cutoff) if queue == 'backfill' else q.or_(
            f'development_date.is.null,development_date.gte.{cutoff}')
        jobs = q.execute().data or []
        if not jobs:
            return summary
        for job in jobs:
            if time.monotonic() >= deadline:
                return {**summary, 'incomplete': True}
            cursor = job['id']
            summary['scanned'] += 1
            if job.get('manual_request_id'):
                continue
            rank = editorial_rank(job['source_type'], job.get('source_metadata') or {})
            if rank['score'] == job['priority']:
                continue
            if apply:
                rows = db.table('brief_job').update({'priority': rank['score']}).eq('id', job['id']).eq(
                    'status', job['status']).eq('updated_at', job['updated_at']).eq(
                    'source_revision', job['source_revision']).execute().data or []
                summary['changed'] += len(rows)
            else:
                summary['changed'] += 1
    return {**summary, 'incomplete': True}


def quality_passes(quality):
    return (isinstance(quality, dict) and quality.get('passed') is True
            and all(quality.get(k) is True for k in QUALITY_CHECKS)
            and quality.get('issues') == [])


EDITORIAL_WRITING = (
    'Write an explanation, not a condensed filing. Answer the reader question in the supplied selection plan. '
    'Identify the affected audience and concrete change, then develop at least two distinct source-supported '
    'explanatory angles in context: for example the difference between eligibility and qualification, '
    'a reporting threshold and permission, a risk notification and a diagnosis, or program approval and a project permit. '
    'Use these as examples of reasoning, not facts to copy into unrelated stories. '
    'Explain what changes and what does not only where the source supports that distinction. '
    'Separate announcement, enactment, applicability, effective and comment dates. Use the supplied as_of_date '
    'to avoid announcing past events as upcoming. Do not infer that a meeting took place just because its date passed. '
    'Do not present a codification of an older approval as a new approval. '
    'Keep quotations in the internal evidence fields; paraphrase public prose except for essential legal terms. '
    'Context consisting only of a docket number, agency name, filing history, generic importance, or repeated points is inadequate. '
    'Use readable paragraphs and descriptive Markdown subheadings when useful. No filler or word-count target. '
    'If evidence cannot support useful explanation, report that limitation rather than inventing background. '
)

EDITORIAL_VERIFICATION = (
    'Also evaluate editorial_quality separately from factual support. Set each quality check explicitly. '
    'reader_value: the article answers a concrete question for an identifiable affected audience. '
    'adds_explanation: context develops at least two useful, supported distinctions, practical implications, '
    'limits, or background points beyond the bullets. context_not_metadata: context is not just filing details '
    'or legislative status. paraphrases_sources: public prose explains rather than stringing together quotations '
    'or lightly rearranging the source. timing_clear: proposals and operative changes are distinguished and '
    'past announcements are not described as upcoming relative to as_of_date. '
    'A brief can be entirely factual and still fail quality. Fail unsupported negative claims (for example '
    'that a rule does not change some requirement) unless the source supports the distinction. '
    'For every failed check, give specific repair feedback tied to the actual draft; never require padding. '
)
