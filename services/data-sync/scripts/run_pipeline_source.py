#!/usr/bin/env python3
"""Run existing source adapters with durable locks, checkpoints and health records."""
from __future__ import annotations
import argparse
import logging
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from dotenv import load_dotenv

from sync_common import create_supabase_client, get_json, require_env, UpstreamAPIError

log = logging.getLogger(__name__)
SCRIPTS = Path(__file__).resolve().parent


def reference_due(row, now=None):
    now = now or datetime.now(timezone.utc)
    if row['status'] == 'running':
        return bool(row.get('lease_until') and datetime.fromisoformat(row['lease_until'].replace('Z','+00:00')) < now)
    stamp = row.get('last_success_at')
    return row['status'] != 'success' or not stamp or now-datetime.fromisoformat(stamp.replace('Z','+00:00')) >= timedelta(days=7)


def congress(db, checkpoint):
    from sync_bills_supabase import CongressClient, sync_bill, BASE_URL
    client = CongressClient(require_env('CONGRESS_API_KEY'))
    now = datetime.now(timezone.utc)
    start = checkpoint.get('since') or (now-timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ')
    until = checkpoint.get('until') or now.strftime('%Y-%m-%dT%H:%M:%SZ')
    offset = int(checkpoint.get('offset',0))
    # Freeze the update window across pages/runs. Advance only after each complete page.
    for _ in range(4):
        body = get_json(client.session,f'{BASE_URL}/bill/{os.getenv("CONGRESS_NUMBER","119")}',
            params={'format':'json','sort':'updateDate+asc','fromDateTime':start,'toDateTime':until,'offset':offset,'limit':50})
        rows = body.get('bills')
        if not isinstance(rows,list):
            raise UpstreamAPIError('Congress listing omitted bills')
        for row in rows:
            sync_bill(db,client,row['url'])
        offset += len(rows)
        if not body.get('pagination',{}).get('next'):
            since = (datetime.fromisoformat(until.replace('Z','+00:00'))-timedelta(hours=2)).strftime('%Y-%m-%dT%H:%M:%SZ')
            return {'since':since,'offset':0}
        # Persist within a run so a later page failure cannot erase earlier progress.
        checkpoint.update({'since':start,'until':until,'offset':offset})
        db.table('brief_source_run').update({'checkpoint':checkpoint}).eq('source','congress').execute()
    return {'since':start,'until':until,'offset':offset}


def federal_register(db, checkpoint, recovery=False, document_numbers=None):
    from sync_federal_register_docs import FederalRegisterClient, sync_documents_to_supabase
    client = FederalRegisterClient()
    if document_numbers:
        stats=sync_documents_to_supabase(db,client,document_numbers=document_numbers)
        if stats.failed:
            raise RuntimeError(f'{stats.failed} requested documents failed')
        return checkpoint
    failures=[]
    pages = dict(checkpoint.get('recovery_pages') or {})
    for kind in ('PRESDOCU','RULE','PRORULE','NOTICE'):
        start = int(pages.get(kind,1)) if recovery else 1
        stats = sync_documents_to_supabase(db,client,document_type=kind,per_page=25 if recovery else 100,max_pages=2,start_page=start,skip_complete=not recovery)
        if stats.failed:
            failures.append(f'{kind}: {stats.failed} documents failed')
        elif recovery:
            pages[kind]=1 if stats.fetched<50 else start+2
    # Keep independent recovery progress even if one category fails.
    checkpoint['recovery_pages']=pages
    db.table('brief_source_run').update({'checkpoint':checkpoint}).eq('source','federal_register').execute()
    if failures:
        raise RuntimeError('; '.join(failures))
    return checkpoint


def courtlistener(db, checkpoint, reference=False):
    from sync_court_opinions import CourtListenerClient, sync_opinions_to_supabase
    client = CourtListenerClient(require_env('COURT_LISTENER_API_KEY'),
        minimum_request_interval=float(os.getenv('COURT_LISTENER_MINIMUM_REQUEST_INTERVAL','72')),
        max_api_requests=int(os.getenv('COURT_LISTENER_MAX_API_REQUESTS','120')))
    # Reserve each actual HTTP attempt, including requests retried by urllib3, through
    # a shared daily ledger. Disable adapter retries to prevent invisible extra calls.
    from requests.adapters import HTTPAdapter
    client.session.mount('https://',HTTPAdapter(max_retries=0))
    original_send=client.session.send
    def send(request, **kwargs):
        if not db.rpc('reserve_brief_upstream_request',{'p_source':'courtlistener','p_limit':int(os.getenv('COURT_LISTENER_DAILY_REQUEST_LIMIT','125'))}).execute().data:
            raise UpstreamAPIError('Shared CourtListener daily request allowance exhausted')
        return original_send(request,**kwargs)
    client.session.send=send
    if reference:
        from sync_courts import fetch_all_courts, map_court_to_row
        rows=fetch_all_courts(client.session,per_page=100,page_limit=40,rate_limiter=client.rate_limiter)
        db.table('court').upsert([map_court_to_row(r) for r in rows if r.get('id')],on_conflict='remote_id').execute()
    else:
        stats=sync_opinions_to_supabase(db,client,court_remote_id='scotus',per_page=20,max_pages=5)
        if stats.failed:
            raise RuntimeError(f'{stats.failed} CourtListener records failed')
    return checkpoint


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',choices=['congress','federal_register','courtlistener','processor'])
    parser.add_argument('--recovery',action='store_true')
    parser.add_argument('--reference',action='store_true')
    parser.add_argument('--if-needed',action='store_true',help='Refresh court references only if stale, failed, or expired')
    parser.add_argument('--document-number',action='append')
    args, command=parser.parse_known_args()
    if args.if_needed and not (args.source=='courtlistener' and args.reference):
        parser.error('--if-needed requires courtlistener --reference')
    if command and args.source!='processor':
        parser.error('Unexpected arguments: '+ ' '.join(command))
    load_dotenv()
    os.environ['BRIEF_PIPELINE_TRACKING']='1'
    logging.basicConfig(level=logging.INFO)
    db=create_supabase_client()
    token=str(uuid4())
    run_source='courtlistener_reference' if args.source=='courtlistener' and args.reference else args.source
    if args.if_needed:
        state=db.table('brief_source_run').select('status,last_success_at,lease_until').eq('source',run_source).single().execute().data
        if not reference_due(state):
            log.info('Court references are fresh or have an active worker')
            return 0
    if not db.rpc('begin_brief_source_run',{'p_source':run_source,'p_token':token}).execute().data:
        log.info('Source already has an active run; work remains queued')
        return 0
    row=db.table('brief_source_run').select('checkpoint').eq('source',run_source).single().execute().data
    checkpoint=row['checkpoint']
    success=False
    error=None
    try:
        if args.source=='congress':
            checkpoint=congress(db,checkpoint)
        elif args.source=='federal_register':
            checkpoint=federal_register(db,checkpoint,args.recovery,args.document_number)
        elif args.source=='courtlistener':
            checkpoint=courtlistener(db,checkpoint,args.reference)
        else:
            command=command[1:] if command[:1]==['--'] else command
            result=subprocess.run([sys.executable,str(SCRIPTS/'process_briefs.py'),*command],check=False)
            if result.returncode:
                raise RuntimeError('Brief processor reported failures; see run logs')
        success=True
    except Exception as exc:
        error=str(exc)[:2000]
        log.exception('Source run failed')
    finally:
        # Checkpoint is saved by adapters only after successful pages; never overwrite
        # their progress after a later failure.
        db.rpc('end_brief_source_run',{'p_source':run_source,'p_token':token,'p_success':success,
            'p_error':error,'p_checkpoint':checkpoint if success else None}).execute()
    return 0 if success else 1


if __name__=='__main__':
    sys.exit(main())
