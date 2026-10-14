#!/usr/bin/env python3
"""Discover durable source changes and generate verified briefs. Publication is DB-gated."""
from __future__ import annotations
import argparse
import json
import logging
import re
import sys
import time
from copy import deepcopy
from difflib import SequenceMatcher
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from typing import Any
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv

from brief_ai import AI, BudgetExhausted, ResponseWithheld, validate_json_text, DRAFT, EXTRACTION, SELECTION, VERIFICATION, PROMPT_VERSION
from brief_style import PLAIN_ENGLISH_STYLE
from brief_evidence import EvidenceUnavailable, EvidenceReviewRequired, build_packet, fingerprint, validate_packet
from generate_briefs_batch import dek_is_complete, slugify
from import_briefs_supabase import validate_manifest
from sync_common import create_supabase_client

log = logging.getLogger(__name__)
SOURCE_NAMES = {'bill':'congress','agency_document':'federal_register','cluster':'courtlistener'}

SELECTION_INSTRUCTIONS = (
    'Assess whether this development merits a factual public-service news brief using the original passages. '
    'Prioritize enactment, chamber passage, substantive executive orders, Supreme Court merits decisions, '
    'and consequential proposed/final agency actions. National reach and final legal effect are NOT prerequisites: '
    'sector-specific or regional changes to rights, obligations, benefits, safety, sanctions, permits, funding, '
    'or meaningful opportunities for public participation can be important. A notice can announce a substantive '
    'decision, license, proposal, withdrawal, or deadline; judge its contents, not its document label. '
    'Skip purely ceremonial actions, housekeeping with no practical change, routine meeting announcements, '
    'and bill introductions without a substantive advancement. Do not infer duplicate coverage merely because '
    'a document previously appeared on an agency website. Compare the supplied previous coverage: '
    'new_development is false only when it already covers this same development without a meaningful change '
    'or correction. Importance and novelty are separate decisions. Explain the concrete impact and decision.'
)


def citation_errors(claim: dict, passages: list[dict]) -> list[str]:
    by_id = {p['id']:p['text'] for p in passages}
    if not isinstance(claim,dict) or not isinstance(claim.get('text'),str):
        return ['Invalid claim']
    if not claim['text'].strip():
        return []
    refs = claim.get('evidence') or []
    if not refs:
        return ['Claim has no supporting passage']
    errors = []
    for ref in refs:
        quote = ref.get('quote','')
        source = by_id.get(ref.get('passage_id'), '')
        if len(quote.strip()) >= 12 and quote not in source:
            # Recover only whitespace changes introduced when copying wrapped
            # government text. Store the literal original quote for the audit.
            pattern = r'\s+'.join(re.escape(word) for word in quote.strip().split())
            match = re.search(pattern,source)
            if match:
                quote = ref['quote'] = match.group(0)
        if len(quote.strip()) < 12 or quote not in by_id.get(ref.get('passage_id'), ''):
            errors.append('Evidence quotation is missing or does not match its source')
    # Every numeric literal must occur in one of the cited passages. Semantic verification
    # checks whether the number belongs to the correct entity/date/qualification.
    cited = ' '.join(by_id.get(r.get('passage_id'),'') for r in refs)
    for number in re.findall(r'\b\d[\d,.%]*', claim['text']):
        if number.rstrip('.,') not in cited:
            errors.append(f'Unsupported number: {number}')
    return errors


def draft_claims(draft: dict) -> dict[str, dict]:
    return {'title':draft['title'],'dek':draft['dek'],**{f'point_{i}':v for i,v in enumerate(draft['points'],1)},'context':draft['context']}


def literal_source_hints(claims: dict, passages: list[dict]) -> dict:
    """Offer original text for repair; approximate matches never validate a quote."""
    by_id={p['id']:p['text'] for p in passages}
    hints={}
    for field,claim in claims.items():
        for ref in claim.get('evidence',[]):
            source=by_id.get(ref.get('passage_id'),'')
            quote=ref.get('quote','')
            if not source or quote in source:
                continue
            tokens=list(re.finditer(r'\S+',source))
            words=quote.split()
            match=SequenceMatcher(None,words,[t.group() for t in tokens],autojunk=False).find_longest_match()
            if match.size<3:
                continue
            start=max(0,match.b-match.a-12)
            end=min(len(tokens),match.b+max(match.size,len(words)-match.a)+12)
            excerpt=source[tokens[start].start():tokens[end-1].end()]
            hints.setdefault(field,[]).append({'passage_id':ref['passage_id'],
                'original_source_excerpt':excerpt[:6000]})
    return hints


def validate_draft(draft: dict, packet: dict) -> list[str]:
    errors = []
    claims = draft_claims(draft)
    for field, claim in claims.items():
        errors.extend(f'{field}: {e}' for e in citation_errors(claim,packet['passages']))
        if field!='context' and not claim['text'].strip():
            errors.append(f'{field}: empty claim')
    if not 1 <= len(draft['title']['text']) <= 180:
        errors.append('Headline length is invalid')
    if not 1 <= len(draft['dek']['text']) <= 300 or not dek_is_complete(draft['dek']['text']):
        errors.append('Dek must be a complete sentence of at most 300 characters')
    if not 3 <= len(draft['points']) <= 5 or any(len(p['text'])>900 for p in draft['points']):
        errors.append('Brief must contain three to five concise points')
    if len(draft['context']['text'])>1200:
        errors.append('Context is too long')
    if not 1<=len(draft['policy_areas'])<=3 or any(not s.strip() or len(s)>100 for s in draft['policy_areas']):
        errors.append('Invalid topics')
    return errors


def verification_passes(report: dict, draft: dict) -> bool:
    expected = {k for k,v in draft_claims(draft).items() if v['text'].strip()}
    claims = report.get('claims') or []
    return (report.get('passed') is True and report.get('status_correct') is True
            and report.get('material_omissions') == [] and report.get('issues') == []
            and len(claims)==len(expected) and {c.get('field') for c in claims}==expected
            and all(c.get('supported') is True for c in claims))


def assemble(job: dict, draft: dict) -> dict:
    packet = job['evidence']
    passages = {p['id']:p for p in packet['passages']}
    points = [{'id':f'point_{i}','text':c['text'].strip(),
               'source_refs':list(dict.fromkeys(passages[e['passage_id']]['source_id'] for e in c['evidence']))}
              for i,c in enumerate(draft['points'],1)]
    slug_base = slugify(draft['title']['text'])[:140].rstrip('-') or 'brief'
    return {'title':draft['title']['text'].strip(), 'slug':f"{slug_base}-brief-{job['id']}",
            'dek':draft['dek']['text'].strip(),'points':points,'context_markdown':draft['context']['text'].strip(),
            'policy_areas':draft['policy_areas'],'sources':packet['sources']}


def discover(db: Any, limit: int) -> dict:
    # Fetch only outstanding changes through a server-side filter; pagination never
    # repeatedly walks already processed rows.
    changes = db.rpc('pending_brief_source_changes',{'p_limit':limit}).execute().data or []
    counts = {'enqueued':0,'deferred':0}
    for change in changes:
        kind, item_id = change['item_type'],change['item_id']
        try:
            row = db.rpc('brief_source_bundle',{'p_type':kind,'p_id':item_id}).execute().data
            if not row:
                raise EvidenceReviewRequired('Source record was removed')
            packet = build_packet(db,kind,row)
            db.rpc('enqueue_brief_job',{'p_type':kind,'p_id':item_id,'p_revision':change['revision'],
                'p_fingerprint':fingerprint({'metadata':row,'packet':packet}),'p_development':packet['development_key'],
                'p_item_type':packet['item_type'],'p_metadata':row,'p_evidence':packet,'p_priority':packet['priority']}).execute()
            counts['enqueued']+=1
        except Exception as exc:
            # Compare revision so a new change cannot be delayed by an older failing read.
            delay = min(24,2**min(change['attempts'],5))
            error_kind = ('review' if isinstance(exc,EvidenceReviewRequired) else
                          'waiting' if isinstance(exc,EvidenceUnavailable) else 'temporary')
            db.table('brief_source_change').update({'attempts':change['attempts']+1,'error':str(exc)[:1000],
                'error_kind':error_kind,
                'next_attempt_at':(datetime.now(timezone.utc)+timedelta(hours=delay)).isoformat()}).eq('item_type',kind).eq('item_id',item_id).eq('revision',change['revision']).execute()
            counts['deferred']+=1
            log.warning('Source %s/%s deferred: %s',kind,item_id,exc)
    return counts


def complete(db: Any, job: dict, token: str, status: str, reason: str, *, draft=None, report=None, ai=None):
    validate_json_text([reason, draft, report])
    db.rpc('finish_brief_job',{'p_id':job['id'],'p_token':token,'p_status':status,'p_reason':reason,
        'p_draft':draft,'p_verification':report,'p_writer':ai.writer if ai else '',
        'p_verifier':ai.verifier if ai else '', 'p_prompt':PROMPT_VERSION}).execute()


def process(db: Any, job: dict, token: str, *, ai_factory=AI, deadline=None) -> str:
    # Queued jobs can predate source validation and contain cached bad evidence.
    try:
        validate_packet(job['evidence'])
    except EvidenceReviewRequired as exc:
        complete(db,job,token,'withheld',str(exc))
        return 'withheld'
    ai = ai_factory(db,job['id'])
    ai.deadline = deadline
    packet = job['evidence']
    previous = db.table('brief').select('title,dek,published_at,generation_metadata').eq('primary_item_id',job['item_id']).in_('primary_item_type',[job['item_type'],job['source_type']]).order('published_at',desc=True).limit(5).execute().data or []
    work = job.get('work') or {}
    if work.get('prompt_version',PROMPT_VERSION) != PROMPT_VERSION:
        work={}
    work['prompt_version']=PROMPT_VERSION
    def checkpoint():
        validate_json_text(work)
        db.rpc('save_brief_work',{'p_id':job['id'],'p_token':token,'p_work':work}).execute()
    selection = work.get('selection') or ai.call('selection',SELECTION_INSTRUCTIONS,
        {'metadata':job['source_metadata'],'passages':packet['passages'],'previous_coverage':previous}, SELECTION)
    work['selection']=selection
    checkpoint()
    if selection.get('important') is not True or selection.get('new_development') is not True:
        complete(db,job,token,'skipped',selection['reason'])
        return 'skipped'
    extracted = work.get('extracted',[])
    for passage in packet['passages'][len(extracted):]:
        repair = work.get('extraction_repair') or {}
        if repair.get('passage_id') != passage['id']:
            repair = {'passage_id':passage['id'],'attempts':0,'feedback':[]}
        while repair['attempts'] < 3:
            if deadline and time.monotonic()>deadline:
                raise TimeoutError('Run time budget reached')
            prior=repair.get('previous')
            invalid=[i for i,fact in enumerate(prior['facts']) if citation_errors(fact,[passage])] if prior else []
            facts = ai.call('extract',
                'Extract factual claims and all material qualifications from this passage. Each fact needs a verbatim supporting '
                'quote (at least 12 characters) and this passage_id. Copy quotes exactly, including whitespace and punctuation; '
                'do not paraphrase quotes or insert ellipses. Every number in a claim must occur in this passage. '
                'Preserve dates, scope, exceptions and opinion type. Address validation feedback using the original passage. '
                'Do not require facts where the passage contains none. '
                'Prefer concise, atomic facts and short contiguous quotations. Preserve literal page markers and '
                'typesetting punctuation inside quotes; never join distant text with ellipses. Use separate evidence '
                'entries for separate quotations. On repair, return exactly one corrected fact for each zero-based '
                'repair_fact_indexes entry, in that order, and no other facts. Keep the fact supported, correcting '
                'its wording if needed. Already valid facts are preserved by the worker. '
                f'Every evidence entry must use passage_id "{passage["id"]}" exactly.',
                {'passage':passage,'previous_extraction':prior,'repair_fact_indexes':invalid,
                 'literal_source_hints':literal_source_hints(
                     {f'fact_{i+1}':prior['facts'][i] for i in invalid},[passage]) if prior else {},
                 'feedback':repair['feedback']},EXTRACTION)
            if prior:
                if len(facts['facts'])!=len(invalid):
                    repair.update(attempts=repair['attempts']+1,
                        feedback=[f'Return exactly {len(invalid)} corrected facts, one per repair_fact_indexes entry.'])
                    work['extraction_repair']=repair
                    checkpoint()
                    continue
                merged=deepcopy(prior)
                for index,replacement in zip(invalid,facts['facts']):
                    merged['facts'][index]=replacement
                merged['qualifications']=list(dict.fromkeys(prior.get('qualifications',[])+facts['qualifications']))
                facts=merged
            errors = [f'fact_{i}: {error}' for i,fact in enumerate(facts['facts'],1)
                      for error in citation_errors(fact,[passage])]
            if not errors:
                break
            repair.update(attempts=repair['attempts']+1,feedback=errors,previous=facts)
            work['extraction_repair']=repair
            checkpoint()
        else:
            # Invalid model content is a withheld editorial result, just like a
            # rejected draft. Transport/database errors still fail the worker.
            complete(db,job,token,'withheld','Extraction failed after two repairs',
                     report={'passed':False,'deterministic_passed':False,'issues':repair['feedback']},ai=ai)
            return 'withheld'
        work.pop('extraction_repair',None)
        extracted.append({'passage_id':passage['id'],**facts})
        work['extracted']=extracted
        checkpoint()
    feedback = work.get('feedback',[])
    last_draft, last_report = None,None
    for repair in range(work.get('repair',0),3):
        if deadline and time.monotonic()>deadline:
            raise TimeoutError('Run time budget reached')
        draft = work.get('draft') or ai.call('write',
            'Write a neutral, plain-English news brief: specific headline <=180 characters, one complete dek sentence <=300 '
            'characters, 3-5 standalone points <=900 characters each, optional short context, 1-3 topics. '
            'Every nonempty field needs supporting exact quotes and passage IDs from the extracted evidence. '
            'Context may be empty (text="", evidence=[]). Do not speculate about why it matters. '
            'Describe the actual change and affected parties where supported. Address repair feedback. '
            'When repairing, use the previous draft and fix the identified problems while preserving supported '
            'claims. Source excerpts are literal copying aids, not a substitute for evidence or validation. '
            + PLAIN_ENGLISH_STYLE,
            {'metadata':job['source_metadata'],'evidence':extracted,'feedback':feedback,
             'previous_draft':work.get('previous_draft'),
             'literal_source_hints':literal_source_hints(draft_claims(work['previous_draft']),packet['passages'])
                 if work.get('previous_draft') else {}},DRAFT)
        feedback = validate_draft(draft,packet)
        if feedback:
            work.pop('draft',None)
            work.update({'repair':repair+1,'feedback':feedback,'previous_draft':draft})
            checkpoint()
            last_draft,last_report = draft,{'passed':False,'deterministic_passed':False,'issues':feedback}
            continue
        # Reuse this exact validated draft after a timeout/provider failure. A new
        # draft would discard paid work and require a fresh verification anyway.
        work['draft'] = draft
        checkpoint()
        if deadline and time.monotonic()>deadline:
            raise TimeoutError('Run time budget reached before verification')
        # Each verifier sees original source text, independent of the extractor.
        # Full packet within the explicit cap avoids checking only writer-selected excerpts.
        report = ai.call('verify',
            'Independently audit this brief against ALL original source passages, not the writer reasoning. '
            'Check EVERY factual claim including headline, dek, context, dates, amounts, affected entities, '
            'legal status, majority vs dissent, effective dates and unsupported stakes. Identify material omissions '
            'or qualifications that change the meaning. '
            'This is a concise brief, not an exhaustive abstract. An omitted detail is material only if it makes '
            'a stated claim misleading about scope, legal effect, timing, affected parties, or exceptions. '
            'Do not demand unrelated procedural history, citations to authority, or every provision merely '
            'because it appears in the source. Explain how each material omission changes a specific claim. '
            'Reject access-blocking/error pages as evidence. Confirm the passages describe the document '
            'identified by the metadata and reject a brief about an unrelated topic. '
            'Return exactly one claims entry for each nonempty field '
            '(title, dek, point_1 ... point_N, context). Any unsupported claim or material omission fails publication. '
            'Do not accept a quote merely because it exists; verify that it entails the entire claim.',
            {'metadata':job['source_metadata'],'passages':packet['passages'],'claims':draft_claims(draft)},VERIFICATION,verify=True)
        report['passed'] = verification_passes(report,draft)
        report['deterministic_passed'] = True
        report['claim_evidence'] = draft_claims(draft)
        last_draft,last_report = draft,report
        if report['passed']:
            assembled = assemble(job,draft)
            validate_manifest([{**assembled,'primary_record':{'type':job['item_type']}}])
            complete(db,job,token,'verified',selection['reason'],draft=assembled,report=report,ai=ai)
            return 'verified'
        feedback = report.get('issues',[])+report.get('material_omissions',[])+[c['reason'] for c in report['claims'] if not c['supported']]
        work.pop('draft',None)
        work.update({'repair':repair+1,'feedback':feedback,'previous_draft':draft})
        checkpoint()
    complete(db,job,token,'withheld','Verification failed after two repairs',draft=last_draft,report=last_report,ai=ai)
    return 'withheld'


def publish_ready(db: Any, limit: int) -> int:
    overview = db.rpc('brief_pipeline_overview',{}).execute().data
    settings = overview['settings']
    log.info('brief_publication_status %s',json.dumps({'enabled':settings['publication_enabled'],
        'daily_limit':settings['daily_publication_limit'],'verified':overview['counts'].get('verified',0),
        'spending':overview['spending']}))
    if not settings['publication_enabled']:
        log.warning('Publication is paused; verified briefs remain queued')
        return 0
    jobs = db.rpc('publishable_brief_jobs',{'p_limit':limit}).execute().data or []
    published = 0
    for job in jobs:
        result = db.rpc('publish_verified_brief',{'p_job':job['id']}).execute().data
        if result:
            published += 1
            log.info('Published verified job %s as brief %s',job['id'],result)
        else:
            log.warning('Publication held for job %s: database gate (pause, daily cap, source change, or edited coverage)',job['id'])
    return published


def process_queue(db, limit, deadline, queue='current'):
    summary = {'failed':0, 'processed':0, 'claimed':0}
    for _ in range(limit):
        if time.monotonic()>deadline-180:
            break
        token = str(uuid4())
        rows = db.rpc('claim_brief_job',{'p_token':token,'p_queue':queue}).execute().data or []
        if not rows:
            break
        job = rows[0]
        summary['claimed'] += 1
        try:
            status = process(db,job,token,deadline=deadline-180)
            summary[status]=summary.get(status,0)+1
            summary['processed'] += 1
        except ResponseWithheld as exc:
            complete(db,job,token,'withheld',str(exc)[:1000])
            summary['withheld']=summary.get('withheld',0)+1
            summary['processed'] += 1
            log.warning('Job %s withheld for review: %s',job['id'],exc)
        except TimeoutError:
            db.rpc('defer_brief_budget',{'p_id':job['id'],'p_token':token,'p_budget':False}).execute()
            break
        except BudgetExhausted as exc:
            db.rpc('defer_brief_budget',{'p_id':job['id'],'p_token':token}).execute()
            log.info('%s',exc)
            break
        except Exception as exc:
            summary['failed']+=1
            complete(db,job,token,'retry',str(exc)[:1000])
            log.exception('Job %s failed',job['id'])
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit',type=int,default=10)
    parser.add_argument('--discovery-limit',type=int,default=100)
    parser.add_argument('--max-minutes',type=int,default=20)
    parser.add_argument('--workers',type=int,choices=(1,2),default=1)
    parser.add_argument('--queue',choices=('current','backfill'),default='current')
    parser.add_argument('--discover-only',action='store_true')
    parser.add_argument('--seed-days',type=int,help='Queue existing unbriefed records updated in the prior 1-90 days')
    parser.add_argument('--publish',action='store_true',help='Publish verified jobs only when DB publication switch is enabled')
    parser.add_argument('--publish-only',action='store_true',help='Drain verified results without discovery or model calls')
    args = parser.parse_args()
    if not 1<=args.limit<=100 or not 1<=args.discovery_limit<=1000 or not 1<=args.max_minutes<=20:
        parser.error('Limits: jobs 1-100, discovery 1-1000, minutes 1-20')
    load_dotenv()
    logging.basicConfig(level=logging.INFO)
    db = create_supabase_client()
    if args.publish_only:
        log.info('brief_pipeline_summary %s',json.dumps({'published':publish_ready(db,args.limit)}))
        return 0
    if args.seed_days is not None:
        if not 1<=args.seed_days<=90:
            parser.error('--seed-days must be 1-90')
        log.info('Seeded %s source changes',db.rpc('seed_brief_source_changes',{'p_days':args.seed_days}).execute().data)
    summary = discover(db,args.discovery_limit)
    deadline = time.monotonic()+args.max_minutes*60
    summary['failed'] = 0
    if not args.discover_only:
        # Each worker owns its HTTP client; database claims and budget reservations
        # remain atomic across workers. The combined job limit is unchanged.
        def worker(index):
            limit = args.limit//args.workers + int(index < args.limit%args.workers)
            return process_queue(create_supabase_client(),limit,deadline,args.queue)
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for result in pool.map(worker,range(args.workers)):
                for key,value in result.items():
                    summary[key]=summary.get(key,0)+value
    if args.publish:
        summary['published']=publish_ready(db,args.limit)
    summary['queue']=args.queue
    log.info('brief_pipeline_summary %s',json.dumps(summary))
    return 1 if summary['failed'] else 0


if __name__=='__main__':
    sys.exit(main())
