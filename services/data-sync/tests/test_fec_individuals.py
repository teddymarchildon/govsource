from unittest.mock import Mock

import pytest

from sync_fec_donations import FECError, RequestBudgetReached, normalize_receipt
from sync_fec_individuals import IndividualClient, IndividualDryRunStore, sync_individuals, read_queue


def receipt(**changes):
    return {'sub_id': '9999999999999999999', 'committee_id': 'C00442921', 'two_year_transaction_period': 2026,
        'filing_form': 'F3', 'line_number': '11AI', 'recipient_committee_type': 'H', 'recipient_committee_designation': 'P',
        'entity_type': 'IND', 'is_individual': True, 'memo_code': None, 'memoed_subtotal': False,
        'committee': {'committee_id': 'C00442921', 'name': 'Campaign', 'cycle': 2026, 'candidate_ids': ['H8IN07184']},
        'contributor_name': 'EXAMPLE, DONOR', 'contributor_employer': ' Example Co ', 'contributor_occupation': 'ENGINEER',
        'contributor_city': 'INDIANAPOLIS', 'contributor_state': 'IN', 'contributor_street_1': 'Never persist this',
        'contribution_receipt_amount': 100.01, 'contribution_receipt_date': '2025-01-01', **changes}


def test_individual_fields_are_allowlisted_and_decimal_and_source_identity_preserved():
    data = normalize_receipt(receipt(), 2026, '11AI', 'C00442921', individual=True)[-1]['data']
    assert data['amount'] == '100.01'
    assert data['sub_id'] == '9999999999999999999'
    assert data['employer'] == 'Example Co'
    assert data['occupation'] == 'ENGINEER'
    assert 'street' not in str(data)
    assert 'giving_committee_id' not in data


@pytest.mark.parametrize('changes', [{'memo_code': 'X'}, {'memoed_subtotal': True}])
def test_memo_receipts_are_excluded(changes):
    assert normalize_receipt(receipt(**changes), 2026, '11AI', individual=True) == []


@pytest.mark.parametrize('changes', [
    {'line_number': '11B'}, {'committee_id': 'C00546358'}, {'is_individual': False, 'entity_type': 'PAC'},
    {'contributor_employer': {}}, {'contribution_receipt_amount': 'NaN'}, {'memo_code': 'unexpected'},
])
def test_invalid_or_out_of_scope_individual_receipts_fail(changes):
    with pytest.raises(FECError):
        normalize_receipt(receipt(**changes), 2026, '11AI', 'C00442921', individual=True)


def test_missing_employment_and_signed_corrections_and_old_dates_are_preserved():
    data = normalize_receipt(receipt(contributor_employer=' ', contributor_occupation=None,
        contribution_receipt_amount=-0.01, contribution_receipt_date='2020-01-01'), 2026, '11AI', individual=True)[-1]['data']
    assert data['employer'] is None and data['occupation'] is None
    assert data['amount'] == '-0.01' and data['receipt_date'] == '2020-01-01'


def test_individual_api_filters():
    client = IndividualClient('unused', minimum_interval=0)
    client.get = Mock(return_value={})
    client.individual_receipts(2026, 'C00442921', {'last_index': '9999999999999999999'})
    path, params = client.get.call_args.args
    assert path == '/schedules/schedule_a/'
    assert params['line_number'] == 'F3-11AI' and params['is_individual'] == 'true'
    assert params['last_index'] == '9999999999999999999'


def page(rows, index='100'):
    return {'results': rows, 'pagination': {'last_indexes': {'last_index': index}}}


def test_resume_keeps_cursor_and_requires_empty_page_not_short_page():
    store = IndividualDryRunStore()
    client = Mock()
    client.individual_receipts.side_effect = [page([receipt()]), RequestBudgetReached('budget')]
    with pytest.raises(RequestBudgetReached):
        sync_individuals(client, store, 2026, 'C00442921', 'H8IN07184')
    assert store.checkpoint['phase'] == 'receipts'
    assert store.checkpoint['cursor'] == {'last_index': '100'}
    client.individual_receipts.side_effect = [page([])]
    assert sync_individuals(client, store, 2026, 'C00442921', 'H8IN07184') == 1
    assert store.checkpoint['phase'] == 'complete'


def test_changed_duplicate_and_changed_candidate_attribution_fail():
    store = IndividualDryRunStore()
    client = Mock()
    client.individual_receipts.side_effect = [page([receipt()]), page([receipt(contribution_receipt_amount=200)], '200')]
    with pytest.raises(FECError, match='changed during pagination'):
        sync_individuals(client, store, 2026, 'C00442921', 'H8IN07184')
    client.individual_receipts.side_effect = [page([receipt()])]
    with pytest.raises(FECError, match='attribution changed'):
        sync_individuals(client, IndividualDryRunStore(), 2026, 'C00442921', 'H4NC12100')


def test_queue_prioritizes_unpublished_then_oldest_snapshot():
    db = Mock()
    db.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value.data = [
        {'committee_id': 'C2', 'last_success_at': '2026-09-20'},
        {'committee_id': 'C3', 'last_success_at': '2026-09-01'},
        {'committee_id': 'C1', 'last_success_at': None},
    ]
    assert [r['committee_id'] for r in read_queue(db, 2026)] == ['C1', 'C3', 'C2']


@pytest.mark.parametrize('error,finish_error,expected', [
    (RequestBudgetReached('budget reached'), None, 0),
    (RequestBudgetReached('budget reached'), RuntimeError('lease lost'), 1),
    (FECError('invalid receipt'), None, 1),
    (ConnectionError('upstream unavailable'), None, 1),
])
def test_main_only_accepts_safely_persisted_budget_pause(monkeypatch, caplog, error, finish_error, expected):
    import sync_fec_individuals as mod
    monkeypatch.setattr(mod, 'load_dotenv', lambda *a: None)
    monkeypatch.setattr(mod, 'require_env', lambda *a: 'test-key')
    monkeypatch.setattr(mod, 'create_supabase_client', lambda **kw: Mock())
    client = Mock(requests=1, max_requests=10)
    store = Mock()
    store.finish.side_effect = finish_error
    monkeypatch.setattr(mod, 'IndividualClient', lambda *a: client)
    monkeypatch.setattr(mod, 'IndividualStore', lambda *a: store)
    monkeypatch.setattr(mod, 'read_queue', lambda *a: [{'committee_id': 'C00442921', 'candidate_id': 'H8IN07184'}])
    monkeypatch.setattr(mod, 'sync_individuals', Mock(side_effect=error))
    assert mod.main(['--write', '--cycle', '2026']) == expected
    store.finish.assert_called_once_with('partial' if isinstance(error, RequestBudgetReached) else 'failed',
        str(error) if isinstance(error, FECError) else 'ConnectionError: individual import failed; previous data preserved')
    if expected == 0:
        assert '"status": "partial"' in caplog.text
        assert all(record.levelname != 'ERROR' for record in caplog.records)
    else:
        assert '"status": "failed"' in caplog.text


def test_budget_pause_between_campaigns_does_not_open_another_lease(monkeypatch):
    import sync_fec_individuals as mod
    monkeypatch.setattr(mod, 'load_dotenv', lambda *a: None)
    monkeypatch.setattr(mod, 'require_env', lambda *a: 'test-key')
    monkeypatch.setattr(mod, 'create_supabase_client', lambda **kw: Mock())
    client = Mock(requests=1, max_requests=1)
    monkeypatch.setattr(mod, 'IndividualClient', lambda *a: client)
    store = Mock()
    monkeypatch.setattr(mod, 'IndividualStore', store)
    monkeypatch.setattr(mod, 'read_queue', lambda *a: [{'committee_id': 'C00442921', 'candidate_id': None}])
    assert mod.main(['--write']) == 0
    store.assert_not_called()


@pytest.mark.parametrize('status,delay,error_type', [
    (429, '120', RequestBudgetReached), (503, '120', FECError), (500, '120', FECError),
])
def test_only_quota_cooldown_is_a_budget_pause(status, delay, error_type):
    response = Mock(status_code=status, headers={'Retry-After': delay})
    client = IndividualClient('test-key', minimum_interval=0, session=Mock(get=Mock(return_value=response)))
    with pytest.raises(error_type) as exc:
        client.get('/example', {})
    assert type(exc.value) is error_type
    response.close.assert_called_once()


def test_network_error_at_budget_boundary_is_not_a_successful_pause(monkeypatch):
    import requests
    import sync_fec_donations
    monkeypatch.setattr(sync_fec_donations.time, 'sleep', lambda _: None)
    client = IndividualClient('test-key', max_requests=1, minimum_interval=0,
                              session=Mock(get=Mock(side_effect=requests.ConnectionError('offline'))))
    with pytest.raises(FECError, match='retry budget exhausted') as exc:
        client.get('/example', {})
    assert not isinstance(exc.value, RequestBudgetReached)
