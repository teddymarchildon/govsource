#!/usr/bin/env python3
"""Import itemized individual contributions for verified member campaign committees.

Publishes complete campaigns independently. Request exhaustion retains resumable
staging; the next run prioritizes campaigns that have never published, then oldest
snapshots. Employer/occupation summaries derive from the same published receipts.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from sync_common import create_supabase_client, require_env
from sync_fec_donations import FECClient, FECError, RequestBudgetReached, committee_id, next_cursor, normalize_receipt

LOG = logging.getLogger(__name__)


class IndividualClient(FECClient):
    def individual_receipts(self, cycle, committee, cursor):
        return self.get('/schedules/schedule_a/', {
            'committee_id': committee, 'two_year_transaction_period': cycle,
            'line_number': 'F3-11AI', 'is_individual': 'true',
            'recipient_committee_type': ['H', 'S'], 'recipient_committee_designation': ['P', 'A'],
            'per_page': 100, 'sort': 'contribution_receipt_date', 'sort_nulls_last': 'true', **cursor,
        })


class IndividualStore:
    def __init__(self, db, cycle, committee, restart=False):
        self.db = db
        self.args = {'p_cycle': cycle, 'p_committee': committee, 'p_token': str(uuid4())}
        self.checkpoint = db.rpc('begin_fec_individual_sync', {**self.args, 'p_restart': restart}).execute().data

    def save(self, records, checkpoint):
        self.db.rpc('stage_fec_individual_page', {**self.args, 'p_expected': self.checkpoint,
            'p_checkpoint': checkpoint, 'p_records': records}).execute()
        self.checkpoint = checkpoint

    def publish(self):
        return self.db.rpc('publish_fec_individual_sync', self.args).execute().data

    def finish(self, status, error):
        self.db.rpc('finish_fec_individual_sync', {**self.args, 'p_status': status, 'p_error': error}).execute()


class IndividualDryRunStore:
    def __init__(self):
        self.checkpoint = {'version': 1, 'phase': 'receipts', 'cursor': {}, 'fetched': 0, 'excluded': 0}
        self.records = {}

    def save(self, records, checkpoint):
        for row in records:
            previous = self.records.get(row['sub_id'])
            if previous is not None and previous != row:
                raise FECError('FEC record changed during pagination; restart required')
            self.records[row['sub_id']] = row
        self.checkpoint = checkpoint

    def publish(self):
        return len(self.records)


def sync_individuals(client, store, cycle, committee, expected_candidate=None):
    while store.checkpoint['phase'] == 'receipts':
        cp = store.checkpoint
        body = client.individual_receipts(cycle, committee, cp['cursor'])
        records, excluded = [], 0
        for row in body['results']:
            normalized = normalize_receipt(row, cycle, '11AI', committee, individual=True)
            if not normalized:
                excluded += 1
                continue
            candidates = {r['data']['candidate_id'] for r in normalized if r['kind'] == 'link'}
            if expected_candidate and candidates != {expected_candidate}:
                raise FECError('FEC campaign attribution changed; refresh candidate mappings first')
            records.extend(r['data'] for r in normalized if r['kind'] == 'contribution')
        cursor = next_cursor(body, cp['cursor'])
        updated = {**cp, 'cursor': cursor or {}, 'phase': 'complete' if cursor is None else 'receipts',
            'fetched': cp['fetched'] + len(body['results']), 'excluded': cp['excluded'] + excluded}
        store.save(records, updated)
    return store.publish()


def read_queue(db, cycle, committee=None):
    rows, offset = [], 0
    while True:
        query = db.table('fec_individual_import_queue').select('committee_id,candidate_id,last_success_at').eq('cycle', cycle)
        if committee:
            query = query.eq('committee_id', committee)
        page = query.order('committee_id').range(offset, offset + 499).execute().data
        rows.extend(page)
        if len(page) < 500:
            break
        offset += len(page)
    # Null first, oldest first; stable per-committee ordering resumes incomplete campaigns.
    return sorted(rows, key=lambda row: (row['last_success_at'] or '', row['committee_id']))


def main(argv=None):
    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / '.env')
    load_dotenv(root.parent / '.env')
    year = datetime.now(timezone.utc).year
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cycle', type=int, default=year + year % 2)
    parser.add_argument('--committee', help='Import one receiving campaign; required for a dry run')
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--restart', action='store_true', help='Discard this campaign’s incomplete staging')
    parser.add_argument('--max-requests', type=int, default=int(os.getenv('FEC_MAX_API_REQUESTS', '2200')))
    parser.add_argument('--minimum-interval', type=float, default=float(os.getenv('FEC_MINIMUM_REQUEST_INTERVAL', '4')))
    args = parser.parse_args(argv)
    if not 1980 <= args.cycle <= 2200 or args.cycle % 2 or args.max_requests < 1 or args.minimum_interval < 0:
        parser.error('Use an even reporting period, positive request budget and nonnegative interval')
    if (not args.write or args.restart) and not args.committee:
        parser.error('--committee is required for dry runs and explicit restarts')
    scope = committee_id(args.committee) if args.committee else None
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    for name in ('urllib3', 'httpx', 'httpcore'):
        logging.getLogger(name).setLevel(logging.WARNING)
    client, store, completed = None, None, 0
    try:
        client = IndividualClient(require_env('FEC_API_KEY'), args.max_requests, args.minimum_interval)
        db = create_supabase_client(postgrest_timeout=65) if args.write else None
        queue = read_queue(db, args.cycle, scope) if db else [{'committee_id': scope, 'candidate_id': None}]
        if not queue:
            raise FECError('No eligible campaigns: import and map candidates first')
        for item in queue:
            store = None
            if client.requests >= client.max_requests:
                raise RequestBudgetReached('Individual request budget reached; remaining campaigns await a later run')
            store = IndividualStore(db, args.cycle, item['committee_id'], args.restart) if db else IndividualDryRunStore()
            count = sync_individuals(client, store, args.cycle, item['committee_id'], item['candidate_id'])
            completed += 1
            LOG.info('Published individual campaign: committee=%s records=%s write=%s', item['committee_id'], count, args.write)
            store = None
        LOG.info('data_sync_summary=%s', json.dumps({'job': 'fec_individuals', 'status': 'success', 'campaigns': completed, 'requests': client.requests}))
        return 0
    except Exception as exc:
        partial = isinstance(exc, RequestBudgetReached)
        message = str(exc) if isinstance(exc, FECError) else f'{type(exc).__name__}: individual import failed; previous data preserved'
        if store and args.write:
            try:
                store.finish('partial' if partial else 'failed', message)
            except Exception:
                LOG.error('Unable to release individual import lease; it expires automatically')
        LOG.error('data_sync_summary=%s', json.dumps({'job': 'fec_individuals', 'status': 'partial' if partial else 'failed',
            'campaigns': completed, 'requests': client.requests if client else 0, 'error': message}))
        return 2 if partial else 1


if __name__ == '__main__':
    raise SystemExit(main())
