import copy
from unittest.mock import Mock

import pytest

from sync_fec_donations import FECClient, FECError, FECQueryTimeout, RequestBudgetReached, next_cursor, DryRunStore, sync


def catalog(ids, pages=1):
    return {'results': [{'committee_id': cid} for cid in ids], 'pagination': {'pages': pages}}


def receipts(rows=(), index=None):
    return {'results': list(rows), 'pagination': {'last_indexes': {'last_index': index} if index else None}}


def test_catalog_and_all_batches_are_checkpointed_before_completion():
    ids = [f'C{i:08d}' for i in range(1, 12)]
    client = FECClient('unused', minimum_interval=0)
    client.get = Mock(side_effect=[catalog(ids, 2), receipts(), receipts(), catalog(['C00000012'], 2), receipts()])
    cursor = {'sort_null_only': True, 'last_index': 'old-nationwide-position'}
    for _ in range(4):
        cursor = next_cursor(client.receipts(2026, '11C', cursor, 'all'), cursor)
        assert cursor is not None
    assert next_cursor(client.receipts(2026, '11C', cursor, 'all'), cursor) is None
    calls = client.get.call_args_list
    assert calls[0].args == ('/committees/', {'cycle': 2026, 'page': 1, 'per_page': 100, 'sort': 'committee_id'})
    assert calls[1].args[1]['committee_id'] == ids[:10]
    assert calls[2].args[1]['committee_id'] == ids[10:]
    assert calls[3].args[1]['page'] == 2
    assert calls[4].args[1]['committee_id'] == ['C00000012']
    assert 'last_index' not in calls[1].args[1]
    assert calls[1].args[1]['recipient_committee_type'] == ['H', 'S']


def test_nonempty_undated_pages_resume_same_batch_and_do_not_use_count():
    client = FECClient('unused', minimum_interval=0)
    row = {'committee_id': 'C00000001', 'contribution_receipt_date': None}
    client.get = Mock(side_effect=[catalog(['C00000001']), receipts([row], '123'), receipts()])
    cursor = {'sort_null_only': True}
    cursor = next_cursor(client.receipts(2026, '11C', cursor, 'all'), cursor)
    cursor = next_cursor(client.receipts(2026, '11C', cursor, 'all'), cursor)
    assert cursor['last_index'] == '123'
    assert cursor['undated_committees'] == ['C00000001']
    assert next_cursor(client.receipts(2026, '11C', cursor, 'all'), cursor) is None
    assert client.get.call_args.args[1]['last_index'] == '123'


def test_request_budget_cannot_advance_checkpoint_or_publish():
    store = DryRunStore('all')
    store.checkpoint.update(line=1, cursor={'sort_null_only': True}, fetched=182505)
    client = FECClient('unused', minimum_interval=0)
    client.get = Mock(side_effect=[catalog(['C00000001']), RequestBudgetReached('pause')])
    store.publish = Mock()
    with pytest.raises(RequestBudgetReached):
        sync(client, store, 2026)
    assert store.checkpoint['fetched'] == 182505
    assert store.checkpoint['phase'] == 'receipts'
    assert store.checkpoint['cursor']['undated_committees'] == ['C00000001']
    store.publish.assert_not_called()


def test_timeout_splits_batch_without_skipping_committees():
    client = FECClient('unused', minimum_interval=0)
    cursor = {'sort_null_only': True, 'undated_page': 1, 'undated_last_page': True,
              'undated_committees': [f'C{i:08d}' for i in range(1, 11)], 'last_index': '123'}
    client.get = Mock(side_effect=FECQueryTimeout('timeout'))
    original = copy.deepcopy(cursor)
    for size in [5, 2, 1]:
        cursor = next_cursor(client.receipts(2026, '11C', cursor, 'all'), cursor)
        assert cursor['undated_batch_size'] == size
        assert cursor['undated_committees'] == original['undated_committees']
        assert cursor['last_index'] is None
    with pytest.raises(FECQueryTimeout):
        client.receipts(2026, '11C', cursor, 'all')


@pytest.mark.parametrize('body', [catalog([], 2), {'results': [], 'pagination': {}}, catalog(['bad'])])
def test_invalid_or_incomplete_catalog_fails(body):
    client = FECClient('unused', minimum_interval=0)
    client.get = Mock(return_value=body)
    with pytest.raises(FECError):
        client.receipts(2026, '11C', {'sort_null_only': True}, 'all')


def test_out_of_scope_receipts_fail():
    client = FECClient('unused', minimum_interval=0)
    client.get = Mock(return_value=receipts([{'committee_id': 'C00000002'}], '123'))
    with pytest.raises(FECError, match='outside its scope'):
        client.receipts(2026, '11C', {'sort_null_only': True, 'undated_page': 1,
            'undated_last_page': True, 'undated_committees': ['C00000001']}, 'all')
