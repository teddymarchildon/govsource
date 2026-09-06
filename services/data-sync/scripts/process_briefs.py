#!/usr/bin/env python3
"""Discover durable source changes and generate verified briefs. Publication is DB-gated."""
from __future__ import annotations
import argparse
import json
import logging
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from typing import Any
from dotenv import load_dotenv

from brief_ai import AI, BudgetExhausted, DRAFT, EXTRACTION, SELECTION, VERIFICATION, PROMPT_VERSION
from brief_style import PLAIN_ENGLISH_STYLE
from brief_evidence import EvidenceUnavailable, build_packet, fingerprint
from generate_briefs_batch import dek_is_complete, slugify
from import_briefs_supabase import validate_manifest
from sync_common import create_supabase_client

log = logging.getLogger(__name__)
SOURCE_NAMES = {'bill':'congress','agency_document':'federal_register','cluster':'courtlistener'}


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
    return {'title':draft['title']['text'].strip(), 'slug':f"{slugify(draft['title']['text'])[:140]}-brief-{job['id']}",
            'dek':draft['dek']['text'].strip(),'points':points,'context_markdown':draft['context']['text'].strip(),
            'policy_areas':draft['policy_areas'],'sources':packet['sources']}


def discover(db: Any, limit: int) -> dict:
    states = {s['source']:s for s in db.table('brief_source_run').select('source,status,last_success_at').execute().data}
    # Fetch only outstanding changes through a server-side filter; pagination never
    # repeatedly walks already processed rows.
    changes = db.rpc('pending_brief_source_changes',{'p_limit':limit}).execute().data or []
    counts = {'enqueued':0,'deferred':0}
    for change in changes:
        kind, item_id = change['item_type'],change['item_id']
        if states[SOURCE_NAMES[kind]]['status']!='success':
            continue
        try:
            row = db.rpc('brief_source_bundle',{'p_type':kind,'p_id':item_id}).execute().data
            if not row:
                raise EvidenceUnavailable('Source record was removed')
            packet = build_packet(db,kind,row)
            db.rpc('enqueue_brief_job',{'p_type':kind,'p_id':item_id,'p_revision':change['revision'],
                'p_fingerprint':fingerprint({'metadata':row,'packet':packet}),'p_development':packet['development_key'],
                'p_item_type':packet['item_type'],'p_metadata':row,'p_evidence':packet,'p_priority':packet['priority']}).execute()
            counts['enqueued']+=1
        except Exception as exc:
            # Compare revision so a new change cannot be delayed by an older failing read.
            delay = min(24,2**min(change['attempts'],5))
            db.table('brief_source_change').update({'attempts':change['attempts']+1,'error':str(exc)[:1000],
                'next_attempt_at':(datetime.now(timezone.utc)+timedelta(hours=delay)).isoformat()}).eq('item_type',kind).eq('item_id',item_id).eq('revision',change['revision']).execute()
            counts['deferred']+=1
            log.warning('Source %s/%s deferred: %s',kind,item_id,exc)
    return counts


def complete(db: Any, job: dict, token: str, status: str, reason: str, *, draft=None, report=None, ai=None):
    db.rpc('finish_brief_job',{'p_id':job['id'],'p_token':token,'p_status':status,'p_reason':reason,
        'p_draft':draft,'p_verification':report,'p_writer':ai.writer if ai else '',
        'p_verifier':ai.verifier if ai else '', 'p_prompt':PROMPT_VERSION}).execute()


def process(db: Any, job: dict, token: str, *, ai_factory=AI, deadline=None) -> str:
    ai = ai_factory(db,job['id'])
    packet = job['evidence']
    previous = db.table('brief').select('title,dek,published_at,generation_metadata').eq('primary_item_id',job['item_id']).in_('primary_item_type',[job['item_type'],job['source_type']]).order('published_at',desc=True).limit(5).execute().data or []
    work = job.get('work') or {}
    if work.get('prompt_version',PROMPT_VERSION) != PROMPT_VERSION:
        work={}
    work['prompt_version']=PROMPT_VERSION
    def checkpoint():
        db.rpc('save_brief_work',{'p_id':job['id'],'p_token':token,'p_work':work}).execute()
    selection = work.get('selection') or ai.call('selection',
        'Assess newsworthiness of this development. Prioritize enactment, chamber passage, substantive executive orders, '
        'Supreme Court merits decisions and consequential proposed/final agency rules. Routine notices, ceremonial actions '
        'and duplicate coverage are not important. Explain your decision. Compare previous coverage: new_development must '
        'be false if no meaningful change or source correction is established. Metadata is sufficient for triage only.',
        {'metadata':job['source_metadata'],'previous_coverage':previous}, SELECTION)
    work['selection']=selection
    checkpoint()
    if selection.get('important') is not True or selection.get('new_development') is not True:
        complete(db,job,token,'skipped',selection['reason'])
        return 'skipped'
    extracted = work.get('extracted',[])
    for passage in packet['passages'][len(extracted):]:
        if deadline and time.monotonic()>deadline:
            raise TimeoutError('Run time budget reached')
        facts = ai.call('extract',
            'Extract factual claims and all material qualifications from this passage. Each fact needs a verbatim supporting '
            'quote (at least 12 characters) and this passage_id. Preserve dates, scope, exceptions and opinion type. '
            'Do not require facts where the passage contains none.',passage,EXTRACTION)
        for fact in facts['facts']:
            errors = citation_errors(fact,[passage])
            if errors:
                raise ValueError('; '.join(errors))
        extracted.append({'passage_id':passage['id'],**facts})
        work['extracted']=extracted
        checkpoint()
    feedback = work.get('feedback',[])
    last_draft, last_report = None,None
    for repair in range(work.get('repair',0),3):
        if deadline and time.monotonic()>deadline:
            raise TimeoutError('Run time budget reached')
        draft = ai.call('write',
            'Write a neutral, plain-English news brief: specific headline <=180 characters, one complete dek sentence <=300 '
            'characters, 3-5 standalone points <=900 characters each, optional short context, 1-3 topics. '
            'Every nonempty field needs supporting exact quotes and passage IDs from the extracted evidence. '
            'Context may be empty (text="", evidence=[]). Do not speculate about why it matters. '
            'Describe the actual change and affected parties where supported. Address repair feedback. '
            + PLAIN_ENGLISH_STYLE,
            {'metadata':job['source_metadata'],'evidence':extracted,'feedback':feedback},DRAFT)
        feedback = validate_draft(draft,packet)
        if feedback:
            work.update({'repair':repair+1,'feedback':feedback})
            checkpoint()
            last_draft,last_report = draft,{'passed':False,'deterministic_passed':False,'issues':feedback}
            continue
        # Each verifier sees original source text, independent of the extractor.
        # Full packet within the explicit cap avoids checking only writer-selected excerpts.
        report = ai.call('verify',
            'Independently audit this brief against ALL original source passages, not the writer reasoning. '
            'Check EVERY factual claim including headline, dek, context, dates, amounts, affected entities, '
            'legal status, majority vs dissent, effective dates and unsupported stakes. Identify material omissions '
            'or qualifications that change the meaning. Return exactly one claims entry for each nonempty field '
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
        work.update({'repair':repair+1,'feedback':feedback})
        checkpoint()
    complete(db,job,token,'withheld','Verification failed after two repairs',draft=last_draft,report=last_report,ai=ai)
    return 'withheld'


def publish_ready(db: Any, limit: int) -> int:
    jobs = db.rpc('publishable_brief_jobs',{'p_limit':limit}).execute().data or []
    return sum(bool(db.rpc('publish_verified_brief',{'p_job':j['id']}).execute().data) for j in jobs)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit',type=int,default=10)
    parser.add_argument('--discovery-limit',type=int,default=100)
    parser.add_argument('--max-minutes',type=int,default=20)
    parser.add_argument('--discover-only',action='store_true')
    parser.add_argument('--seed-days',type=int,help='Queue existing unbriefed records updated in the prior 1-90 days')
    parser.add_argument('--publish',action='store_true',help='Publish verified jobs only when DB publication switch is enabled')
    args = parser.parse_args()
    if not 1<=args.limit<=100 or not 1<=args.discovery_limit<=1000 or not 1<=args.max_minutes<=20:
        parser.error('Limits: jobs 1-100, discovery 1-1000, minutes 1-20')
    load_dotenv()
    logging.basicConfig(level=logging.INFO)
    db = create_supabase_client()
    if args.seed_days is not None:
        if not 1<=args.seed_days<=90:
            parser.error('--seed-days must be 1-90')
        log.info('Seeded %s source changes',db.rpc('seed_brief_source_changes',{'p_days':args.seed_days}).execute().data)
    summary = discover(db,args.discovery_limit)
    deadline = time.monotonic()+args.max_minutes*60
    failures = 0
    if not args.discover_only:
        for _ in range(args.limit):
            if time.monotonic()>deadline-180:
                break
            token = str(uuid4())
            rows = db.rpc('claim_brief_job',{'p_token':token}).execute().data or []
            if not rows:
                break
            job = rows[0]
            try:
                status = process(db,job,token,deadline=deadline-180)
                summary[status]=summary.get(status,0)+1
            except TimeoutError:
                db.rpc('defer_brief_budget',{'p_id':job['id'],'p_token':token,'p_budget':False}).execute()
                break
            except BudgetExhausted as exc:
                # Budget deferral does not consume a failure attempt.
                db.rpc('defer_brief_budget',{'p_id':job['id'],'p_token':token}).execute()
                log.info('%s',exc)
                break
            except Exception as exc:
                failures+=1
                complete(db,job,token,'retry',str(exc)[:1000])
                log.exception('Job %s failed',job['id'])
    if args.publish:
        summary['published']=publish_ready(db,args.limit)
    log.info('brief_pipeline_summary %s',json.dumps(summary))
    return 1 if failures else 0


if __name__=='__main__':
    sys.exit(main())
