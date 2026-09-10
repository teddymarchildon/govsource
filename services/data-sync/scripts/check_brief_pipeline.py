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
        allowance={'congress':8,'federal_register':6,'courtlistener':36,'courtlistener_reference':192,'processor':3}[source['source']]
        stamp=source.get('last_success_at')
        if not stamp or now-datetime.fromisoformat(stamp.replace('Z','+00:00'))>timedelta(hours=allowance):
            alerts.append(f"{source['source']}: no successful refresh within {allowance} hours")
        if source['status']=='running' and source.get('lease_until') and datetime.fromisoformat(source['lease_until'].replace('Z','+00:00'))<now:
            alerts.append(f"{source['source']}: worker lease expired")
    oldest=overview.get('oldest_waiting')
    if oldest and now-datetime.fromisoformat(oldest.replace('Z','+00:00'))>timedelta(hours=24):
        alerts.append('Brief backlog contains work older than 24 hours')
    if any(e['attempts']>=3 for e in overview.get('source_errors',[])):
        alerts.append('Source evidence repeatedly unavailable; inspect pipeline source errors')
    return alerts


if __name__=='__main__':
    load_dotenv()
    data=create_supabase_client().rpc('brief_pipeline_overview').execute().data
    alerts=problems(data)
    for alert in alerts:
        print(f'::error::{alert}')
    print(json.dumps({'alerts':len(alerts),'counts':data['counts'],'spending':data['spending']}))
    raise SystemExit(1 if alerts else 0)
