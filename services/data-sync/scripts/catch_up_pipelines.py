"""Dispatch overdue workflows without duplicating active runs or tight retry loops."""
import json
import os
from datetime import datetime, timezone
from urllib.request import Request, urlopen


# Normal cadence, not the much longer health-alert thresholds.
CADENCES = {
    'sync-federal-register.yml': 60,
    'sync-congress.yml': 120,
    'brief-processing.yml': 30,
}
ACTIVE = {'queued', 'in_progress', 'waiting', 'pending', 'requested'}


def due(runs, minutes, now):
    # Include unsuccessful attempts in the cooldown to avoid a dispatch storm.
    if any(run['status'] in ACTIVE for run in runs):
        return False
    if not runs:
        return True
    latest = max(datetime.fromisoformat(run['created_at'].replace('Z', '+00:00')) for run in runs)
    return (now - latest).total_seconds() >= minutes * 60


def main():
    base = f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}/actions/workflows"
    headers = {'Authorization': f"Bearer {os.environ['GH_TOKEN']}",
               'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'}

    def api(path, payload=None):
        data = None if payload is None else json.dumps(payload).encode()
        with urlopen(Request(base + path, data=data, headers=headers), timeout=30) as response:
            body = response.read()
            return json.loads(body) if body else None

    now = datetime.now(timezone.utc)
    for workflow, minutes in CADENCES.items():
        # Separate active-run queries cover runs older than the recent history page.
        active = []
        for status in sorted(ACTIVE):
            active.extend(api(f'/{workflow}/runs?branch=main&status={status}&per_page=1')['workflow_runs'])
        runs = api(f'/{workflow}/runs?branch=main&per_page=30')['workflow_runs']
        if due(active + runs, minutes, now):
            api(f'/{workflow}/dispatches', {'ref': 'main'})
            print(f'Dispatched overdue workflow: {workflow}')
        else:
            print(f'Active or recently attempted: {workflow}')


if __name__ == '__main__':
    main()
