#!/usr/bin/env python3
"""Fail scheduled health checks only for actionable pipeline conditions."""
from datetime import datetime,timedelta,timezone
import json
from dotenv import load_dotenv
from sync_common import create_supabase_client


def problems(overview, now=None):
    now=now or datetime.now(timezone.utc)
    alerts=[]
    if overview.get('counts',{}).get('verified',0) and not overview.get('settings',{}).get('publication_enabled',True):
        alerts.append('Publication is paused with verified briefs waiting')
    for source in overview['sources']:
        allowance={'congress':8,'federal_register':6,'courtlistener':36,'courtlistener_reference':192,'processor':6}[source['source']]
        stamp=source.get('last_success_at')
        if not stamp or now-datetime.fromisoformat(stamp.replace('Z','+00:00'))>timedelta(hours=allowance):
            alerts.append(f"{source['source']}: no successful refresh within {allowance} hours")
        if source['status']=='running' and source.get('lease_until') and datetime.fromisoformat(source['lease_until'].replace('Z','+00:00'))<now:
            alerts.append(f"{source['source']}: worker lease expired")
    oldest=overview.get('oldest_eligible_current_waiting',overview.get('oldest_current_waiting',overview.get('oldest_waiting')))
    if oldest and now-datetime.fromisoformat(oldest.replace('Z','+00:00'))>timedelta(hours=24):
        alerts.append('Current-news brief backlog contains work older than 24 hours')
    progress=overview.get('last_current_progress_at',overview.get('last_progress_at'))
    if overview.get('eligible_current_waiting',overview.get('current_waiting',0)) and (not progress or now-datetime.fromisoformat(progress.replace('Z','+00:00'))>timedelta(hours=6)):
        alerts.append('Current briefs are waiting with no processing progress within 6 hours')
    blocked=overview.get('blocked_current_counts',{})
    if blocked.get('attempts_exhausted',0):
        alerts.append('Current brief jobs exhausted their retries; review required')
    if blocked.get('missing_source',0):
        alerts.append('Current brief jobs have missing source tracking; repair required')
    if blocked.get('missing_lease',0) or overview.get('expired_current_leases',0):
        alerts.append('Current brief worker leases are missing or expired')
    if any(e['attempts']>=3 and e.get('error_kind','temporary')=='temporary' for e in overview.get('source_errors',[])):
        alerts.append('Source evidence repeatedly unavailable; inspect pipeline source errors')
    return alerts


if __name__=='__main__':
    load_dotenv()
    data=create_supabase_client().rpc('brief_pipeline_overview').execute().data
    alerts=problems(data)
    for alert in alerts:
        print(f'::error::{alert}')
    blocked=data.get('source_error_counts',{})
    if blocked.get('review',0):
        print(f"::warning::{blocked['review']} sources need review; unchanged evidence will not be retried")
    queue_blocked=data.get('blocked_current_counts',{})
    if any(count for reason,count in queue_blocked.items() if reason not in ('active_worker','retry_scheduled')):
        print('::warning::Current brief jobs blocked: '+json.dumps(queue_blocked))
    print(json.dumps({'alerts':len(alerts),'counts':data['counts'],'spending':data['spending'],
        'current_waiting':data.get('current_waiting'),'backfill_waiting':data.get('backfill_waiting'),
        'last_progress_at':data.get('last_progress_at'),'source_error_counts':blocked,
        **{key:data.get(key) for key in ('eligible_current_waiting','oldest_eligible_current_waiting',
            'oldest_eligible_current_job','last_current_progress_at','blocked_current_counts',
            'blocked_current_jobs','expired_current_leases')}}))
    raise SystemExit(1 if alerts else 0)
