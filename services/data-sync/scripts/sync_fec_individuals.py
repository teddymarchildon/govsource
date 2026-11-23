#!/usr/bin/env python3
"""Import itemized individual contributions for verified member campaign committees.

Only receipts at or above a minimum amount (default $1,000) are imported: briefs
cover large checks, and a full-history scan of a large campaign can exceed the
FEC request budget many times over. Publishes complete campaigns independently. Request exhaustion retains resumable
staging; the next run prioritizes campaigns that have never published, then oldest
snapshots. Employer/occupation summaries derive from the same published receipts.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import logging
import os
import time
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from sync_common import create_supabase_client, require_env, retryable_transfer_error
from sync_fec_donations import FECClient, FECError, RequestBudgetReached, committee_id, next_cursor, normalize_receipt

LOG = logging.getLogger(__name__)
# Coverage records this threshold; changing it restarts and republishes campaigns.
LARGE_RECEIPT_MIN = 1000


class IndividualClient(FECClient):
    def individual_receipts(self, cycle, committee, cursor, min_amount=LARGE_RECEIPT_MIN):
        return self.receipt_page({
            'committee_id': committee, 'two_year_transaction_period': cycle,
            'line_number': 'F3-11AI', 'min_amount': min_amount,
            # Exact eligible campaign; avoid redundant FEC metadata joins.
            # normalize_receipt still checks type/designation before staging.
            'per_page': 100,
        }, cursor)


class IndividualStore:
    def __init__(self, db, cycle, committee, restart=False, min_amount=LARGE_RECEIPT_MIN):
        self.db = db
        self.args = {'p_cycle': cycle, 'p_committee': committee, 'p_token': str(uuid4())}
        self.checkpoint = db.rpc('begin_fec_individual_sync', {**self.args, 'p_restart': restart}).execute().data

        if self.checkpoint.get('fetched', 0) and (self.checkpoint.get('report_line_scope') != 2
                or self.checkpoint.get('min_amount') != min_amount):
            db.rpc('finish_fec_individual_sync', {**self.args, 'p_status': 'partial',
                'p_error': 'Restarting staged data for a changed import scope'}).execute()
            self.checkpoint = db.rpc('begin_fec_individual_sync', {**self.args, 'p_restart': True}).execute().data

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


def sync_individuals(client, store, cycle, committee, expected_candidate=None, min_amount=LARGE_RECEIPT_MIN):
    while store.checkpoint['phase'] == 'receipts':
        cp = store.checkpoint
        if cp['fetched'] and cp.get('min_amount') != min_amount:
            raise FECError('Staged receipts use a different minimum amount; restart required')
        body = client.individual_receipts(cycle, committee, cp['cursor'], min_amount)
        records, excluded = [], 0
        for row in body['results']:
            amount = row.get('contribution_receipt_amount')
            if not isinstance(amount, (int, float)) or isinstance(amount, bool) or amount < min_amount:
                raise FECError('FEC returned a receipt below the requested minimum amount')
            normalized = normalize_receipt(row, cycle, '11AI', committee, individual=True)
            if not normalized:
                excluded += 1
                continue
            candidates = {r['data']['candidate_id'] for r in normalized if r['kind'] == 'link'}
            if expected_candidate and candidates != {expected_candidate}:
                raise FECError('FEC campaign attribution changed; refresh candidate mappings first')
            records.extend(r['data'] for r in normalized if r['kind'] == 'contribution')
        cursor = next_cursor(body, cp['cursor'])
        updated = {**cp, 'report_line_scope': 2, 'min_amount': min_amount, 'cursor': cursor or {}, 'phase': 'complete' if cursor is None else 'receipts',
            'fetched': cp['fetched'] + len(body['results']), 'excluded': cp['excluded'] + excluded}
        store.save(records, updated)
    return store.publish()


def read_queue(db, cycle, committee=None, min_amount=LARGE_RECEIPT_MIN):
    rows, offset = [], 0
    def page_query():
        # postgrest builders mutate in place: build a fresh request per attempt so
        # a retry does not repeat order/offset/limit parameters.
        query = db.table('fec_individual_import_queue').select('committee_id,candidate_id,last_success_at,min_amount').eq('cycle', cycle)
        if committee:
            query = query.eq('committee_id', committee)
        return query.order('committee_id').range(offset, offset + 499)

    while True:
        # This is a read-only request: retry the same page without duplicating
        # rows. Do not blindly retry lease or publication writes after a timeout.
        for attempt in range(3):
            try:
                page = page_query().execute().data
                break
            except Exception as exc:
                if attempt == 2 or not retryable_transfer_error(exc):
                    raise
                LOG.warning('Retrying individual import queue page at offset %s (attempt %s/3)', offset, attempt + 2)
                time.sleep(2 ** (attempt + 1))
        rows.extend(page)
        if len(page) < 500:
            break
        offset += len(page)
    # Never published (or published under another threshold) first, then oldest;
    # stable per-committee ordering resumes incomplete campaigns.
    def current(row):
        return row['last_success_at'] and row.get('min_amount') is not None and float(row['min_amount']) == min_amount
    return sorted(rows, key=lambda row: (row['last_success_at'] if current(row) else '', row['committee_id']))


def main(argv=None):
    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / '.env')
    load_dotenv(root.parent / '.env')
    year = datetime.now(timezone.utc).year
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cycle', type=int, default=year + year % 2)
    parser.add_argument('--committee', help='Receiving committee ID or comma-separated IDs; required for a dry run')
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--restart', action='store_true', help='Discard this campaign’s incomplete staging')
    parser.add_argument('--min-amount', type=int, default=int(os.getenv('FEC_INDIVIDUAL_MIN_AMOUNT', str(LARGE_RECEIPT_MIN))),
        help='Import only itemized receipts of at least this many dollars')
    parser.add_argument('--max-requests', type=int, default=int(os.getenv('FEC_MAX_API_REQUESTS', '2200')))
    parser.add_argument('--minimum-interval', type=float, default=float(os.getenv('FEC_MINIMUM_REQUEST_INTERVAL', '4')))
    args = parser.parse_args(argv)
    if not 1980 <= args.cycle <= 2200 or args.cycle % 2 or args.max_requests < 1 or args.minimum_interval < 0 or args.min_amount < 1:
        parser.error('Use an even reporting period, positive request budget and minimum amount, and nonnegative interval')
    if (not args.write or args.restart) and not args.committee:
        parser.error('--committee is required for dry runs and explicit restarts')
    scopes = list(dict.fromkeys(committee_id(value.strip()) for value in args.committee.split(','))) if args.committee else []
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    for name in ('urllib3', 'httpx', 'httpcore'):
        logging.getLogger(name).setLevel(logging.WARNING)
    client, store, completed, failed = None, None, 0, []
    phase = 'setup'
    try:
        client = IndividualClient(require_env('FEC_API_KEY'), args.max_requests, args.minimum_interval)
        db = create_supabase_client(postgrest_timeout=65) if args.write else None
        phase = 'read_queue'
        if not db:
            queue = [{'committee_id': scope, 'candidate_id': None} for scope in scopes]
        elif scopes:
            queue = [item for scope in scopes for item in read_queue(db, args.cycle, scope, args.min_amount)]
        else:
            queue = read_queue(db, args.cycle, None, args.min_amount)
        if scopes and set(scopes) != {row['committee_id'] for row in queue}:
            raise FECError('One or more requested campaigns has no eligible mapping')
        if not queue:
            raise FECError('No eligible campaigns: import and map candidates first')
        for item in queue:
            store = None
            if client.requests >= client.max_requests:
                raise RequestBudgetReached('Individual request budget reached; remaining campaigns await a later run')
            phase = 'begin_campaign'
            store = IndividualStore(db, args.cycle, item['committee_id'], args.restart, args.min_amount) if db else IndividualDryRunStore()
            phase = 'sync_campaign'
            try:
                count = sync_individuals(client, store, args.cycle, item['committee_id'], item['candidate_id'], args.min_amount)
            except FECError as exc:
                if isinstance(exc, RequestBudgetReached):
                    raise
                # An upstream/validation failure in one campaign must not
                # starve the rest of the queue: record it and move on. Its
                # checkpoint is preserved, and the run still exits nonzero.
                if args.write:
                    store.finish('failed', str(exc))
                failed.append({'committee_id': item['committee_id'], 'error': str(exc)})
                LOG.error('Individual campaign failed: committee=%s error=%s', item['committee_id'], exc)
                store = None
                continue
            completed += 1
            LOG.info('Published individual campaign: committee=%s records=%s write=%s', item['committee_id'], count, args.write)
            store = None
        status = 'failed' if failed else 'success'
        (LOG.error if failed else LOG.info)('data_sync_summary=%s', json.dumps({'job': 'fec_individuals', 'status': status,
            'campaigns': completed, 'requests': client.requests, 'failed': failed}))
        return 1 if failed else 0
    except Exception as exc:
        partial = isinstance(exc, RequestBudgetReached)
        checkpoint_ok = True
        message = str(exc) if isinstance(exc, FECError) else f'{type(exc).__name__}: individual import failed; previous data preserved'
        if store and args.write:
            try:
                store.finish('partial' if partial else 'failed', message)
            except Exception:
                checkpoint_ok = False
                LOG.error('Unable to release individual import lease; it expires automatically')
        paused = partial and checkpoint_ok
        logger = LOG.warning if paused else LOG.error
        logger('data_sync_summary=%s', json.dumps({'job': 'fec_individuals', 'status': 'partial' if paused else 'failed',
            'campaigns': completed, 'requests': client.requests if client else 0, 'phase': phase, 'error': message,
            'failed': failed}))
        if paused and failed:
            return 1
        # Only the deliberate request cap/quota cooldown is a resumable pause.
        # API, validation, persistence and lease failures remain failures.
        return 0 if paused else 1


if __name__ == '__main__':
    raise SystemExit(main())
