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
