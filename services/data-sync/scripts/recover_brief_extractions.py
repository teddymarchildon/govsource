#!/usr/bin/env python3
"""Requeue saved extractions that now pass validation. Dry run unless --apply."""
from copy import deepcopy
import argparse
import json
from dotenv import load_dotenv
from process_briefs import citation_errors
from sync_common import create_supabase_client


def recovered_work(job):
    work=deepcopy(job.get('work') or {})
    repair=work.get('extraction_repair') or {}
    previous=repair.get('previous')
    extracted=work.get('extracted',[])
    passages=job['evidence']['passages']
    if not previous or len(extracted)>=len(passages):
        return None
    passage=passages[len(extracted)]
    if passage['id']!=repair.get('passage_id') or any(
        citation_errors(f,[passage]) for f in previous.get('facts',[])
    ):
        return None
    work['extracted']=[*extracted,{'passage_id':passage['id'],**previous}]
    work.pop('extraction_repair',None)
    return work


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--limit',type=int,default=100)
    args=parser.parse_args()
    if not 1<=args.limit<=100: parser.error('Limit must be between 1 and 100')
    load_dotenv()
    db=create_supabase_client()
    jobs=db.table('brief_job').select('*').eq('status','withheld').eq('reason','Extraction failed after two repairs').order('id').limit(args.limit).execute().data
    eligible=[];requeued=[]
    for job in jobs:
        work=recovered_work(job)
        if work is None: continue
        change=db.table('brief_source_change').select('revision').eq('item_type',job['source_type']).eq('item_id',job['item_id']).single().execute().data
        metadata=db.rpc('brief_source_bundle',{'p_type':job['source_type'],'p_id':job['item_id']}).execute().data
        if change['revision']!=job['source_revision'] or metadata!=job['source_metadata']: continue
        eligible.append(job['id'])
        if args.apply:
            # Preserve completed work, attempt history, and every publication gate.
            # Compare the prior timestamp/status so a concurrent change wins.
            rows=db.table('brief_job').update({'work':work,'status':'pending','attempts':0,
                'last_error':None,'reason':'Recovered saved extraction after literal quote validation'}).eq('id',job['id']).eq('status','withheld').eq('updated_at',job['updated_at']).execute().data
            if rows: requeued.append(job['id'])
    print(json.dumps({'eligible':eligible,'requeued':requeued,'apply':args.apply}))


if __name__=='__main__':
    main()
