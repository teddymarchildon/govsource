import copy
import json
from pathlib import Path

import pytest
import requests

from sync_fec_donations import (
    FECClient, FECError, RequestBudgetReached, DryRunStore,
    normalize_receipt, next_cursor, record, sync,
)

FIXTURES = Path(__file__).parent / 'fixtures'
ROWS = json.loads((FIXTURES / 'fec_receipts.json').read_text())


def test_schema_contract_uses_real_openfec_fields_and_filters():
    schema = json.loads((FIXTURES / 'openfec_schema.json').read_text())
    params = {p['name']: p for p in schema['paths']['/v1/schedules/schedule_a/']['get']['parameters']}
    assert {'line_number', 'two_year_transaction_period', 'committee_id', 'last_index',
        'last_contribution_receipt_date', 'sort_null_only', 'recipient_committee_type',
        'recipient_committee_designation'} <= params.keys()
    for row in ROWS:
        assert row.keys() <= schema['definitions']['ScheduleA']['properties'].keys()
        for field in ('committee', 'contributor'):
            if row[field]:
                assert row[field].keys() <= schema['definitions']['CommitteeHistory']['properties'].keys()
    assert schema['definitions']['ScheduleA']['properties']['sub_id']['type'] == 'string'
    assert schema['definitions']['ScheduleA']['properties']['contribution_receipt_amount']['type'] == 'number'


@pytest.mark.parametrize('row', ROWS)
def test_real_rows_normalize_without_using_donor_candidate_as_recipient(row):
    data = normalize_receipt(row, 2026, row['line_number'])
    receipt = next(r['data'] for r in data if r['kind'] == 'contribution')
    assert receipt['sub_id'] == row['sub_id']
    assert receipt['giving_committee_id'] == row['contributor_id']
    assert receipt['receiving_committee_id'] == row['committee_id']
    links = [r['data']['candidate_id'] for r in data if r['kind'] == 'link']
    assert links == sorted(row['committee']['candidate_ids'])
    assert not any('street' in k or 'employer' in k for k in receipt)


@pytest.mark.parametrize('change', [{'memo_code': 'X'}, {'memoed_subtotal': True}])
def test_memos_not_added_to_group_totals(change):
    assert normalize_receipt({**ROWS[0], **change}, 2026, '11B') == []


def test_signed_money_null_dates_and_unresolved_group_ids_are_preserved():
    row = {**ROWS[0], 'contribution_receipt_amount': -12.34, 'contribution_receipt_date': None, 'contributor_id': None}
    result = normalize_receipt(row, 2026, '11B')[-1]['data']
    assert result['amount'] == '-12.34'
    assert result['receipt_date'] is None and result['giving_committee_id'] is None


def test_malformed_filer_donor_id_preserves_receipt_without_guessing_identity():
    row = {**ROWS[0], 'contributor_id': 'C0035675', 'sub_id': '4042920251187912755'}
    result = normalize_receipt(row, 2026, '11B')
    receipt = result[-1]['data']
    assert receipt['giving_committee_id'] is None
    assert receipt['contributor_name'] == row['contributor_name']
    assert receipt['sub_id'] == row['sub_id']
    assert not any(r['kind'] == 'committee' and r['key'] != row['committee_id'] for r in result)
    # Required recipient IDs remain strict, since they determine attribution.
    with pytest.raises(FECError):
        normalize_receipt({**row, 'committee_id': 'C0035675'}, 2026, '11B')


@pytest.mark.parametrize('change', [
    {'contribution_receipt_amount': None}, {'contribution_receipt_amount': 'NaN'},
    {'contribution_receipt_amount': '1.234'}, {'sub_id': None},
    {'two_year_transaction_period': 2024}, {'filing_form': 'F3X'},
    {'line_number': '12'}, {'recipient_committee_designation': 'J'},
    {'committee': None}, {'memo_code': 'unexpected'},
])
def test_invalid_or_out_of_scope_records_fail_the_refresh(change):
    with pytest.raises(FECError):
        normalize_receipt({**ROWS[0], **change}, 2026, '11B')


def test_receipt_date_can_precede_reporting_period():
    # A real 2026 source record carries an old date: don't manufacture date bounds.
    row = ROWS[2]
    assert normalize_receipt(row, 2026, '11C')[-1]['data']['receipt_date'] == row['contribution_receipt_date'][:10]
    assert row['contribution_receipt_date'][:4] < '2025'


def test_pagination_uses_returned_cursor_not_reported_count_or_row_id():
    body = {'results': [ROWS[0]], 'pagination': {'count': 1, 'pages': 1,
        'last_indexes': {'last_index': '9999999999999999999', 'sort_null_only': True}}}
    assert next_cursor(body, {}) == body['pagination']['last_indexes']
    with pytest.raises(FECError):
        next_cursor(body, body['pagination']['last_indexes'])
    assert next_cursor({'results': [], 'pagination': {}}, {}) is None
    with pytest.raises(FECError):
        next_cursor({'results': [ROWS[0]], 'pagination': {}}, {})


class Response:
    status_code = 200
    headers = {}
    def __init__(self, body=None, status=200):
        self.body, self.status_code = body, status
    def json(self):
        return self.body
    def close(self):
        pass


class Session:
    def __init__(self, replies):
        self.replies = iter(replies)
    def get(self, *args, **kwargs):
        r = next(self.replies)
        if isinstance(r, Exception):
            raise r
        return r


def test_attempt_budget_includes_retries_and_never_leaks_key(monkeypatch):
    monkeypatch.setattr('sync_fec_donations.time.sleep', lambda _: None)
    client = FECClient('secret-key', 2, 0, Session([requests.ConnectionError('url?api_key=secret-key'), Response(status=503)]))
    with pytest.raises(FECError, match='retry budget exhausted') as error:
        client.get('/candidates/', {})
    assert not isinstance(error.value, RequestBudgetReached)
    assert client.requests == 2
    assert 'secret-key' not in str(error.value)


@pytest.mark.parametrize('body', [{}, {'results': None, 'pagination': {}}, {'results': [None], 'pagination': {}}])
def test_malformed_success_is_not_an_empty_result(body):
    client = FECClient('secret', 1, 0, Session([Response(body)]))
    with pytest.raises(FECError):
        client.get('/candidates/', {})


def test_complete_refresh_resumes_without_publishing_partial_pages():
    row = ROWS[0]
    class Client:
        requests = 1
        fail = True
        def receipts(self, cycle, line, cursor, scope):
            if line == '11B' and not cursor:
                return {'results': [row], 'pagination': {'last_indexes': {'last_index': '1'}}}
            if self.fail:
                raise RequestBudgetReached('budget')
            return {'results': [], 'pagination': {}}
        def candidates(self, ids):
            return [{'candidate_id': cid, 'name': 'Candidate', 'office': 'H'} for cid in ids]
    store, client = DryRunStore('all'), Client()
    with pytest.raises(RequestBudgetReached):
        sync(client, store, 2026)
    assert store.checkpoint['phase'] == 'receipts'
    assert store.checkpoint['cursor'] == {'last_index': '1'}
    client.fail = False
    assert sync(client, store, 2026) == 1
    assert store.checkpoint['phase'] == 'complete'


def test_duplicate_source_rows_are_idempotent_but_changed_duplicates_fail():
    store = DryRunStore('all')
    rows = normalize_receipt(ROWS[0], 2026, '11B')
    store.save(rows + rows, store.checkpoint)
    assert store.publish() == 1
    altered = copy.deepcopy(rows)
    altered[-1]['data']['amount'] = '99.00'
    with pytest.raises(FECError):
        store.save(altered, store.checkpoint)


def test_multi_candidate_links_retained_for_explicit_ambiguity_handling():
    row = copy.deepcopy(ROWS[0])
    row['committee']['candidate_ids'] = ['H2KS04099', 'H8IN07184']
    assert sum(r['kind'] == 'link' for r in normalize_receipt(row, 2026, '11B')) == 2


def test_fec_candidate_list_can_contain_the_receiving_committee_itself():
    # Live nationwide record 4060820261520438377 has this upstream anomaly.
    row = copy.deepcopy(ROWS[0])
    row['committee']['candidate_ids'].insert(0, row['committee_id'])
    result = normalize_receipt(row, 2026, '11B')
    assert [r['data']['candidate_id'] for r in result if r['kind'] == 'link'] == ROWS[0]['committee']['candidate_ids']
    row['committee']['candidate_ids'] = [row['committee_id']]
    result = normalize_receipt(row, 2026, '11B')
    assert not any(r['kind'] == 'link' for r in result)
    assert any(r['kind'] == 'contribution' for r in result)


@pytest.mark.parametrize('ids', [None, [], ['P40019937'], ['H4NH02399', 'P40019937']])
def test_nullable_and_out_of_scope_candidate_links_do_not_drop_receipts(ids):
    row = copy.deepcopy(ROWS[0])
    row['committee']['candidate_ids'] = ids
    result = normalize_receipt(row, 2026, '11B')
    assert any(r['kind'] == 'contribution' for r in result)
    assert [r['data']['candidate_id'] for r in result if r['kind'] == 'link'] == (
        ['H4NH02399'] if ids and 'H4NH02399' in ids else [])


def test_tribal_receipt_uses_report_line_not_individual_flag():
    row = {**ROWS[0], 'entity_type': 'COM', 'is_individual': True}
    assert normalize_receipt(row, 2026, row['line_number'])[-1]['data']['amount']


def test_old_committee_staging_restarts_for_report_line_scope():
    from types import SimpleNamespace
    from unittest.mock import Mock
    from sync_fec_donations import DatabaseStore
    db = Mock()
    old = {'version': 1, 'phase': 'receipts', 'fetched': 100, 'scope': 'all'}
    fresh = {'version': 1, 'phase': 'receipts', 'fetched': 0, 'scope': 'all'}
    db.rpc.return_value.execute.side_effect = [SimpleNamespace(data=old), SimpleNamespace(data=None), SimpleNamespace(data=fresh)]
    assert DatabaseStore(db, 2026, 'all').checkpoint == fresh
    assert db.rpc.call_args_list[-1].args[1]['p_restart'] is True
    assert db.rpc.call_args_list[-1].args[1]['p_scope'] == 'all'


def test_exhausted_request_reports_safe_cause_and_resume(monkeypatch):
    monkeypatch.setattr('sync_fec_donations.time.sleep', lambda _: None)
    client = FECClient('secret-key', 10, 0, Session([Response(status=503) for _ in range(4)]))
    with pytest.raises(FECError, match='HTTP 503.*saved pages'):
        client.get('/schedules/schedule_a/', {})
    assert client.requests == 4


def test_gateway_timeout_shrinks_pages_without_changing_cursor_or_filters(monkeypatch):
    sleeps, calls = [], []
    monkeypatch.setattr('sync_fec_donations.time.sleep', sleeps.append)
    body = {'results': [], 'pagination': {}}
    class RecordingSession(Session):
        def get(self, *args, **kwargs):
            calls.append(dict(kwargs['params']))
            return super().get(*args, **kwargs)
    session = RecordingSession([Response(status=504), Response(status=504), Response(body), Response(body)])
    client = FECClient('secret', 10, 0, session)
    params = {'per_page': 100, 'last_index': '1234567890123456789', 'committee_id': 'C00543983', 'line_number': 'F3-11AI'}
    assert client.get('/schedules/schedule_a/', params) == body
    assert client.get('/schedules/schedule_a/', params) == body
    assert [call['per_page'] for call in calls] == [100, 50, 25, 25]
    assert sleeps == [10, 20]
    assert params['per_page'] == 100
    assert all({k: call[k] for k in params if k != 'per_page'} == {k: v for k, v in params.items() if k != 'per_page'} for call in calls)
    assert client.requests == 4


def test_retries_respect_upstream_retry_after(monkeypatch):
    sleeps = []
    monkeypatch.setattr('sync_fec_donations.time.sleep', sleeps.append)
    response = Response(status=429)
    response.headers = {'Retry-After': '45'}
    client = FECClient('secret', 10, 0, Session([response, Response({'results': [], 'pagination': {}})]))
    client.get('/candidates/', {})
    assert sleeps == [45]


def test_receipt_scan_bounds_saved_dates_and_visits_undated_partition():
    from unittest.mock import Mock
    client = FECClient('unused', minimum_interval=0)
    client.get = Mock(side_effect=[
        {'results': [ROWS[0]], 'pagination': {'last_indexes': {'last_index': '2', 'last_contribution_receipt_date': '2025-09-15'}}},
        {'results': [], 'pagination': {}},
        {'results': [ROWS[0]], 'pagination': {'last_indexes': {'last_index': '3'}}},
        {'results': [], 'pagination': {}},
    ])
    old = {'last_index': '1', 'last_contribution_receipt_date': '2025-09-15'}
    body = client.receipts(2026, '11C', old, 'all')
    params = client.get.call_args.args[1]
    assert params['min_date'] == params['last_contribution_receipt_date'] == '2025-09-15'
    assert params['sort_hide_null'] == 'true' and 'sort_nulls_last' not in params
    assert params['last_index'] == '1' and params['line_number'] == 'F3-11C'
    cursor = next_cursor(body, old)
    assert cursor['last_index'] == '2'  # Same-date ties remain reachable.
    cursor = next_cursor(client.receipts(2026, '11C', cursor, 'all'), cursor)
    assert cursor == {'sort_null_only': True}
    body = client.receipts(2026, '11C', cursor, 'all')
    params = client.get.call_args.args[1]
    assert params['sort_null_only'] == 'true'
    assert 'min_date' not in params and 'sort_hide_null' not in params
    cursor = next_cursor(body, cursor)
    assert cursor == {'last_index': '3', 'sort_null_only': True}
    assert next_cursor(client.receipts(2026, '11C', cursor, 'all'), cursor) is None


def test_fresh_scan_does_not_exclude_older_receipt_dates():
    from unittest.mock import Mock
    client = FECClient('unused', minimum_interval=0)
    client.get = Mock(return_value={'results': [], 'pagination': {}})
    client.receipts(2026, '11B', {}, 'C00543983')
    params = client.get.call_args.args[1]
    assert 'min_date' not in params
    assert params['committee_id'] == 'C00543983'
