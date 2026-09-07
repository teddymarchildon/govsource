#!/usr/bin/env python3
"""Import direct party/PAC contributions using OpenFEC's processed Schedule A.

Dry run by default. --write stages complete pages durably and publishes only
after both Form 3 contribution categories and candidate identities are complete.
"""
from __future__ import annotations

import argparse
import copy
import json
import logging
import os
import re
import time
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from uuid import uuid4

import requests
from dotenv import load_dotenv

from sync_common import RateLimiter, build_http_session, create_supabase_client, require_env

LOG = logging.getLogger(__name__)
BASE_URL = 'https://api.open.fec.gov/v1'
LINES = ('11B', '11C')
CURSOR_KEYS = {'last_index', 'last_contribution_receipt_date', 'sort_null_only'}


class FECError(RuntimeError):
    """A sanitized error: never include request URLs, API keys or response bodies."""


class RequestBudgetReached(FECError):
    pass


def identifier(value, pattern):
    if not isinstance(value, str) or not re.fullmatch(pattern, value):
        raise FECError('Invalid or missing FEC identifier')
    return value


def committee_id(value):
    return identifier(value, r'C[0-9]{8}')


def candidate_id(value):
    return identifier(value, r'[HS][0-9A-Z]{8}')


def required_text(value):
    if not isinstance(value, str) or not value.strip():
        raise FECError('Required FEC text is missing')
    return value.strip()


class FECClient:
    def __init__(self, key, max_requests=2200, minimum_interval=4, session=None):
        self.key = key
        self.max_requests = max_requests
        self.requests = 0
        # Retries are explicit so every HTTP attempt consumes the budget.
        self.session = session or build_http_session(retries=0)
        self.limiter = RateLimiter(minimum_interval)

    def get(self, path, params):
        for attempt in range(4):
            if self.requests >= self.max_requests:
                raise RequestBudgetReached('FEC request budget reached; import remains incomplete')
            self.limiter.wait()
            self.requests += 1
            response = None
            try:
                response = self.session.get(BASE_URL + path, params={**params, 'api_key': self.key}, timeout=(10, 60))
                status = response.status_code
                if status == 200:
                    try:
                        body = response.json()
                    except ValueError:
                        raise FECError('FEC returned invalid JSON') from None
                    if not isinstance(body, dict) or not isinstance(body.get('results'), list) or not isinstance(body.get('pagination'), dict):
                        raise FECError('FEC response omitted results or pagination')
                    if any(not isinstance(row, dict) for row in body['results']):
                        raise FECError('FEC response contains an invalid record')
                    return body
                if status not in (429, 500, 502, 503, 504):
                    raise FECError(f'FEC request failed (HTTP {status})')
                delay = response.headers.get('Retry-After', '')
                delay = float(delay) if delay.isdigit() else 2 ** (attempt + 1)
                # Long quota resets should yield the run, not hold a worker/lease.
                if delay > 60:
                    raise RequestBudgetReached('FEC quota cooldown; retry this import later')
            except requests.RequestException:
                delay = 2 ** (attempt + 1)
            finally:
                if response is not None:
                    response.close()
            if attempt < 3:
                time.sleep(delay)
        raise FECError('FEC request failed after four attempts')

    def receipts(self, cycle, line, cursor, scope):
        params = {
            'two_year_transaction_period': cycle, 'line_number': 'F3-' + line,
            'recipient_committee_type': ['H', 'S'],
            'recipient_committee_designation': ['P', 'A'],
            'per_page': 100, 'sort': 'contribution_receipt_date',
            'sort_nulls_last': 'true', **cursor,
        }
        if scope != 'all':
            params['committee_id'] = scope
        # Requests serializes Python True as "True", accepted by the FEC API.
        return self.get('/schedules/schedule_a/', params)

    def candidates(self, ids):
        result, page = {}, 1
        while True:
            body = self.get('/candidates/', {'candidate_id': ids, 'per_page': 100, 'page': page, 'sort': 'candidate_id'})
            for row in body['results']:
                cid = candidate_id(row.get('candidate_id'))
                if cid not in ids or cid in result:
                    raise FECError('Unexpected or repeated candidate in FEC response')
                result[cid] = {key: row.get(key) for key in ('candidate_id', 'name', 'office', 'state', 'district', 'party')}
                result[cid]['name'] = required_text(row.get('name'))
                if row.get('office') not in ('H', 'S'):
                    raise FECError('Candidate office is outside the supported scope')
            pages = body['pagination'].get('pages')
            if not isinstance(pages, int) or pages < 0:
                raise FECError('Candidate pagination omitted its page count')
            if page >= pages:
                break
            if not body['results']:
                raise FECError('Candidate pagination ended early')
            page += 1
        if set(result) != set(ids):
            raise FECError('FEC candidate identities remain unresolved')
        return list(result.values())


def next_cursor(body, previous):
    if not body['results']:
        return None
    cursor = body['pagination'].get('last_indexes')
    if not isinstance(cursor, dict) or not cursor.get('last_index') or not set(cursor).issubset(CURSOR_KEYS):
        raise FECError('FEC receipt pagination omitted a valid cursor')
    cursor = {k: v for k, v in cursor.items() if v is not None}
    if cursor == previous:
        raise FECError('FEC receipt pagination repeated its cursor')
    # Do not use approximate counts or a short page as a completion signal.
    return cursor


def record(kind, key, data):
    return {'kind': kind, 'key': key, 'data': data}


def committee_record(row, cid, fallback_name=None):
    row = row or {}
    if row.get('committee_id') and row['committee_id'] != cid:
        raise FECError('FEC nested committee identity mismatch')
    return record('committee', cid, {
        'committee_id': cid, 'name': required_text(row.get('name') or fallback_name),
        'committee_type': row.get('committee_type'), 'designation': row.get('designation'),
        'organization_type': row.get('organization_type'),
    })


def normalize_receipt(row, cycle, line, scope='all'):
    if row.get('two_year_transaction_period') != cycle or row.get('filing_form') != 'F3' or row.get('line_number') != line:
        raise FECError('FEC returned a receipt outside the requested reporting scope')
    recipient = committee_id(row.get('committee_id'))
    if scope != 'all' and recipient != scope:
        raise FECError('FEC returned a receipt for another committee')
    if row.get('recipient_committee_type') not in ('H', 'S') or row.get('recipient_committee_designation') not in ('P', 'A'):
        raise FECError('Receipt is not from an authorized congressional campaign')
    if row.get('memoed_subtotal') is True or row.get('memo_code') == 'X':
        return []
    if row.get('memoed_subtotal') not in (False, None) or row.get('memo_code') not in (None, ''):
        raise FECError('Unrecognized FEC memo flag')
    # Some legacy rows have no entity_type. The report line determines category;
    # explicit individual rows do not belong in the groups-only dataset.
    if row.get('entity_type') == 'IND' or row.get('is_individual') is True:
        return []
    nested = row.get('committee')
    if not isinstance(nested, dict) or nested.get('cycle') != cycle:
        raise FECError('Missing cycle-specific receiving committee metadata')
    ids = nested.get('candidate_ids')
    if ids is not None and not isinstance(ids, list):
        raise FECError('Invalid candidate mapping list')
    # This nullable upstream list can include self-referencing committee IDs or
    # presidential IDs. Only H/S IDs can identify our congressional recipients.
    # Keep receipts with no usable link; the totals view excludes unattributed
    # receipts rather than assigning their money to a guessed candidate.
    ids = [cid for cid in (ids or []) if isinstance(cid, str) and re.fullmatch(r'[HS][0-9A-Z]{8}', cid)]
    records = [committee_record(nested, recipient, row.get('committee_name'))]
    for cid in sorted(set(ids)):
        candidate_id(cid)
        records.append(record('link', cid + ':' + recipient, {
            'candidate_id': cid, 'committee_id': recipient,
            'designation': row['recipient_committee_designation'],
        }))
    giver = row.get('contributor_id') or None
    # OpenFEC preserves malformed filer-supplied donor IDs (for example
    # C0035675 on receipt 4042920251187912755). Keep the named contribution
    # as unresolved; never pad the ID or guess a different committee.
    if isinstance(giver, str) and not re.fullmatch(r'C[0-9]{8}', giver):
        giver = None
    name = required_text(row.get('contributor_name') or row.get('donor_committee_name'))
    if giver:
        committee_id(giver)
        records.append(committee_record(row.get('contributor'), giver, name))
    try:
        amount = Decimal(str(row.get('contribution_receipt_amount')))
        if not amount.is_finite() or amount != amount.quantize(Decimal('0.01')) or abs(amount) >= Decimal('1e16'):
            raise ValueError()
    except (InvalidOperation, ValueError):
        raise FECError('Invalid FEC contribution amount') from None
    receipt_date = row.get('contribution_receipt_date')
    if receipt_date:
        try:
            receipt_date = date.fromisoformat(receipt_date[:10]).isoformat()
        except (ValueError, TypeError):
            raise FECError('Invalid FEC receipt date') from None
    sub_id = identifier(str(row.get('sub_id') or ''), r'[0-9]+')
    source = row.get('pdf_url')
    if not isinstance(source, str) or not source.startswith('https://docquery.fec.gov/'):
        source = f'https://www.fec.gov/data/receipts/?data_type=processed&committee_id={recipient}&two_year_transaction_period={cycle}'
    data = {
        'sub_id': sub_id, 'giving_committee_id': giver, 'contributor_name': name,
        'receiving_committee_id': recipient, 'amount': format(amount, '.2f'),
        'receipt_date': receipt_date or None, 'line_number': line, 'source_url': source,
    }
    for key in ('transaction_id', 'file_number', 'image_number', 'receipt_type', 'amendment_indicator', 'election_type', 'fec_election_year'):
        data[key] = str(row[key]) if row.get(key) is not None else None
    records.append(record('contribution', sub_id, data))
    return records


class DatabaseStore:
    def __init__(self, db, cycle, scope, restart=False):
        self.db, self.cycle, self.token = db, cycle, str(uuid4())
        self.checkpoint = db.rpc('begin_fec_sync', {
            'p_cycle': cycle, 'p_token': self.token, 'p_scope': scope, 'p_restart': restart,
        }).execute().data

    def save(self, records, checkpoint):
        self.db.rpc('stage_fec_page', {'p_cycle': self.cycle, 'p_token': self.token,
            'p_expected': self.checkpoint, 'p_checkpoint': checkpoint, 'p_records': records}).execute()
        self.checkpoint = checkpoint

    def pending(self):
        return [r['candidate_id'] for r in self.db.rpc('fec_pending_candidates', {'p_cycle': self.cycle}).execute().data]

    def publish(self):
        return self.db.rpc('publish_fec_sync', {'p_cycle': self.cycle, 'p_token': self.token}).execute().data

    def finish(self, status, error):
        self.db.rpc('finish_fec_sync', {'p_cycle': self.cycle, 'p_token': self.token,
            'p_status': status, 'p_error': error}).execute()


class DryRunStore:
    def __init__(self, scope):
        self.checkpoint = {'version': 1, 'scope': scope, 'phase': 'receipts', 'line': 0, 'cursor': {}, 'fetched': 0, 'excluded': 0}
        self.records = {}

    def save(self, records, checkpoint):
        for r in records:
            key = (r['kind'], r['key'])
            if r['kind'] == 'contribution' and key in self.records and self.records[key] != r['data']:
                raise FECError('FEC record changed during pagination; restart required')
            self.records[key] = r['data']
        self.checkpoint = checkpoint

    def pending(self):
        return sorted({r['candidate_id'] for (kind, _), r in self.records.items() if kind == 'link'} -
            {key for kind, key in self.records if kind == 'candidate'})[:50]

    def publish(self):
        return sum(kind == 'contribution' for kind, _ in self.records)

    def finish(self, status, error):
        pass


def sync(client, store, cycle):
    checkpoint = store.checkpoint
    while checkpoint['phase'] == 'receipts':
        line = LINES[checkpoint['line']]
        body = client.receipts(cycle, line, checkpoint['cursor'], checkpoint['scope'])
        records, excluded = [], 0
        for row in body['results']:
            normalized = normalize_receipt(row, cycle, line, checkpoint['scope'])
            records.extend(normalized)
            excluded += not normalized
        cursor = next_cursor(body, checkpoint['cursor'])
        updated = copy.deepcopy(checkpoint)
        updated['fetched'] += len(body['results'])
        updated['excluded'] += excluded
        if cursor is None:
            updated['line'] += 1
            updated['cursor'] = {}
            if updated['line'] == len(LINES):
                updated['phase'] = 'candidates'
        else:
            updated['cursor'] = cursor
        store.save(records, updated)
        checkpoint = updated
        if client.requests % 20 == 0:
            LOG.info('FEC progress: %s source rows, %s HTTP attempts', checkpoint['fetched'], client.requests)
    while checkpoint['phase'] == 'candidates':
        ids = store.pending()
        if not ids:
            updated = {**checkpoint, 'phase': 'complete'}
            store.save([], updated)
            checkpoint = updated
            break
        candidates = client.candidates(ids)
        store.save([record('candidate', r['candidate_id'], r) for r in candidates], checkpoint)
    return store.publish()


def main(argv=None):
    # Explicit paths work both from the repo root and the scheduled working directory.
    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / '.env')
    load_dotenv(root.parent / '.env')
    parser = argparse.ArgumentParser(description=__doc__)
    year = datetime.now(timezone.utc).year
    parser.add_argument('--cycle', type=int, default=year + year % 2)
    parser.add_argument('--committee', help='Refresh only this receiving committee (pilot/recovery)')
    parser.add_argument('--max-requests', type=int, default=int(os.getenv('FEC_MAX_API_REQUESTS', '2200')))
    parser.add_argument('--minimum-interval', type=float, default=float(os.getenv('FEC_MINIMUM_REQUEST_INTERVAL', '4')))
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--restart', action='store_true', help='Discard incomplete staging and start a fresh scan')
    args = parser.parse_args(argv)
    if not (1980 <= args.cycle <= 2200 and args.cycle % 2 == 0) or args.max_requests < 1 or args.minimum_interval < 0:
        parser.error('Use an even reporting period, positive request budget, and nonnegative interval')
    scope = committee_id(args.committee) if args.committee else 'all'
    client, store = None, None
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    # HTTP libraries must not emit query-string credentials even under verbose parent logging.
    for name in ('urllib3', 'httpx', 'httpcore'):
        logging.getLogger(name).setLevel(logging.WARNING)
    try:
        client = FECClient(require_env('FEC_API_KEY'), args.max_requests, args.minimum_interval)
        store = DatabaseStore(create_supabase_client(), args.cycle, scope, args.restart) if args.write else DryRunStore(scope)
        count = sync(client, store, args.cycle)
        LOG.info('data_sync_summary=%s', json.dumps({'job': 'fec', 'status': 'success', 'write': args.write,
            'cycle': args.cycle, 'scope': scope, 'contributions': count, 'requests': client.requests,
            'fetched': store.checkpoint['fetched'], 'excluded': store.checkpoint['excluded']}))
        return 0
    except Exception as exc:
        partial = isinstance(exc, RequestBudgetReached)
        # Unknown client/transport exceptions may contain credentials; log only the type.
        message = str(exc) if isinstance(exc, FECError) else f'{type(exc).__name__}: import failed; previous data preserved'
        if store:
            try:
                store.finish('partial' if partial else 'failed', message)
            except Exception:
                LOG.error('Unable to release FEC lease; it expires automatically')
        LOG.error('data_sync_summary=%s', json.dumps({'job': 'fec', 'status': 'partial' if partial else 'failed',
            'requests': client.requests if client else 0, 'error': message}))
        return 2 if partial else 1


if __name__ == '__main__':
    raise SystemExit(main())
