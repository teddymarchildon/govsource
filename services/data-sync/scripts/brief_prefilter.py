"""Conservative, auditable exclusions before paid editorial screening.

Unknown or mixed-purpose content stays in the AI queue. These rules never
approve publication and never discard saved AI work or corrections to coverage.
"""
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from brief_evidence import validate_packet, EvidenceReviewRequired

VERSION = 'routine-v1'


def normalized(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip().lower()


def prefilter_reason(job, has_previous=False):
    if has_previous or job.get('work') or job.get('draft') or job.get('brief_id'):
        return None
    row = job.get('source_metadata') or {}
    try:
        validate_packet(job.get('evidence') or {})
    except (EvidenceReviewRequired, KeyError, TypeError, ValueError):
        return None
    kind = job.get('source_type')
    reason = None
    if kind == 'bill':
        if row.get('law_enacted_date') or row.get('law_number') or row.get('sync_pending') or set(row.get('sync_missing_fields') or []) & {'actions','texts'}:
            return None
        actions, texts = row.get('actions') or [], row.get('texts') or []
        # Check the whole action/version history, not just the latest referral.
        routine = r'(introduced in (?:house|senate)\.?|referred to (?:the )?.+|read twice and referred to (?:the )?.+)'
        if (actions and texts
                and all(re.fullmatch(routine, normalized(a.get('text'))) for a in actions)
                and not any(re.search(r'\b(amend|passed|agreed|reported|discharg|veto|hearing|markup)', normalized(a.get('text'))) for a in actions)
                and all(normalized(t.get('type')) in ('introduced in house','introduced in senate') for t in texts)):
            reason = 'Bill has introduction/referral actions only and only introduced text'
    elif kind == 'agency_document' and row.get('type') == 'Notice':
        title = normalized(row.get('title'))
        body = normalized(' '.join(p['text'] for p in job['evidence']['passages']))
        # Explicit unchanged renewals only. Mixed new/revised collections and
        # judicial/policy changes must still receive editorial screening.
        if (re.search(r'\b(information collection|collection activities|paperwork reduction)\b', title)
                and re.search(r'\b(?:extension|renewal)[, ]+(?:of [^.]{0,80}?)?without change\b', body)
                and not re.search(r'\b(revision|revised|revising|reinstatement|reinstate|new collection|new information collection|vacated|rescinded|rescind|new requirements?|new rule|new reporting|new data collection|changes to eligibility)\b', body)):
            reason = 'Paperwork collection renewal explicitly without change'
        # Closed scientific peer review is administrative, not a public hearing
        # or a decision on funding eligibility, allocations, or policy.
        if (not reason and re.search(r'\bnotice of closed meetings?\b', title)
                and re.search(r'\breview and evaluat(?:e|ion of) (?:the )?grant applications\b', body)
                and not re.search(r'\b(rulemaking|policy change|funding opportunities|eligibility|allocations?|public hearing|scoping|approve awards|vote|voting)\b', body)):
            reason = 'Closed meeting solely for scientific grant-application review'
        if (not reason and re.fullmatch(r'.*performance review board(?: members| membership)?', title)
                and 'senior executive' in body
                and not re.search(r'\b(rulemaking|proposed rule|final rule|policy change)\b', body)):
            reason = 'Internal Senior Executive Service performance-review board membership'
    return f'Prefilter {VERSION}: {reason}' if reason else None


def previous_coverage(db, job):
    return db.table('brief').select('id').eq('primary_item_id',job['item_id']).in_(
        'primary_item_type',list({job['item_type'],job['source_type']})).limit(1).execute().data or []


def filter_queue(db, queue='current', apply=False, deadline=float('inf')):
    """Keyset scan so nonmatching or budget-deferred jobs cannot block free filtering.

    Compare-and-set excludes active workers and concurrent edits. Source changes
    continue through normal revision discovery; original evidence is retained.
    """
    summary = {'scanned':0,'matched':0,'skipped':0,'reasons':{}}
    cursor = 0
    cutoff = (datetime.now(timezone.utc).date()-timedelta(days=30)).isoformat()
    while True:
        if time.monotonic()>deadline:
            summary['incomplete'] = True
            break
        query = db.table('brief_job').select('*').in_('status',['pending','retry']).gt('id',cursor).order('id').limit(100)
        query = (query.lt('development_date',cutoff) if queue == 'backfill'
                 else query.or_(f'development_date.is.null,development_date.gte.{cutoff}'))
        jobs = query.execute().data or []
        if not jobs:
            break
        for job in jobs:
            if time.monotonic()>deadline:
                summary['incomplete'] = True
                return summary
            cursor = job['id']
            summary['scanned'] += 1
            reason = prefilter_reason(job)
            if not reason or previous_coverage(db,job):
                continue
            logging.getLogger(__name__).info('brief_prefilter_match id=%s title=%s reason=%s',job['id'],job['source_metadata'].get('title'),reason)
            summary['matched'] += 1
            summary['reasons'][reason] = summary['reasons'].get(reason,0)+1
            if apply:
                result = (db.table('brief_job').update({'status':'skipped','reason':reason,'last_error':None,
                    'lease_token':None,'lease_until':None,'updated_at':datetime.now(timezone.utc).isoformat()})
                    .eq('id',job['id']).eq('status',job['status']).eq('updated_at',job['updated_at'])
                    .eq('source_revision',job['source_revision']).execute().data)
                summary['skipped'] += len(result or [])
    return summary
