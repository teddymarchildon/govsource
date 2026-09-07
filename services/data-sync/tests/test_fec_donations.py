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


@pytest.mark.parametrize('change', [{'memo_code': 'X'}, {'memoed_subtotal': True}, {'entity_type': 'IND'}, {'is_individual': True}])
def test_memos_and_individuals_not_added_to_group_totals(change):
    assert normalize_receipt({**ROWS[0], **change}, 2026, '11B') == []


def test_signed_money_null_dates_and_unresolved_group_ids_are_preserved():
    row = {**ROWS[0], 'contribution_receipt_amount': -12.34, 'contribution_receipt_date': None, 'contributor_id': None}
    result = normalize_receipt(row, 2026, '11B')[-1]['data']
    assert result['amount'] == '-12.34'
    assert result['receipt_date'] is None and result['giving_committee_id'] is None


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
    with pytest.raises(RequestBudgetReached) as error:
        client.get('/candidates/', {})
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
