from datetime import datetime, timezone

import pytest
from catch_up_pipelines import due, ACTIVE

NOW = datetime(2026, 10, 19, 12, tzinfo=timezone.utc)


def run(stamp='2026-10-19T10:00:00Z', status='completed'):
    return {'created_at': stamp, 'status': status}


def test_overdue_and_empty():
    assert due([], 30, NOW)
    assert due([run()], 60, NOW)


@pytest.mark.parametrize('status', sorted(ACTIVE))
def test_active_run_prevents_duplicate_even_when_old(status):
    assert not due([run(status=status)], 30, NOW)


def test_recent_attempt_cools_down_even_after_failure():
    assert not due([run('2026-10-19T11:45:00Z')], 30, NOW)


def test_uses_latest_attempt_not_list_order():
    assert not due([run(), run('2026-10-19T11:59:00Z')], 30, NOW)


def test_exact_cadence_is_due():
    assert due([run('2026-10-19T11:30:00Z')], 30, NOW)
