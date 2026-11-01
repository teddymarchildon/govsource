from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace
from datetime import datetime, timezone

import process_briefs
from brief_ai import ProviderPause, ProviderPaused


class Queue:
    def __init__(self):
        self.claims = 0
        self.updates = []
        self.filters = []

    def rpc(self, name, args):
        assert name == 'claim_brief_job'
        self.claims += 1
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=[{'id': self.claims, 'attempts': 2}]))

    def table(self, name):
        assert name == 'brief_job'
        return self

    def update(self, data):
        self.updates.append(data)
        return self

    def eq(self, *args):
        self.filters.append(args)
        return self

    def gt(self, *args):
        self.filters.append(args)
        return self

    def execute(self):
        return SimpleNamespace(data=[{'id': 1}])


def test_two_workers_stop_and_return_leases_without_consuming_attempts(monkeypatch):
    pause = ProviderPause()
    pause.retry_after_seconds = 3600
    barrier = Barrier(2)
    queues = [Queue(), Queue()]

    def process(db, job, token, **kwargs):
        assert kwargs['provider_pause'] is pause
        barrier.wait(timeout=5)
        pause.stopped.set()
        raise ProviderPaused('rate_limit_exceeded')

    monkeypatch.setattr(process_briefs, 'process', process)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda db: process_briefs.process_queue(db, 30, float('inf'), provider_pause=pause), queues))
    assert all(r == {'failed': 0, 'processed': 0, 'claimed': 1, 'provider_paused': 1} for r in results)
    for db in queues:
        assert db.claims == 1
        update = db.updates[0]
        assert update['attempts'] == 1
        assert update['status'] == 'retry'
        assert update['lease_token'] is None and update['lease_until'] is None
        assert 'work' not in update
        assert ('status', 'processing') in db.filters
        assert any(key == 'lease_token' for key, _ in db.filters)
        assert (datetime.fromisoformat(update['next_attempt_at'])-datetime.now(timezone.utc)).total_seconds() > 3500


def test_already_paused_run_never_claims(monkeypatch):
    pause = ProviderPause()
    pause.stopped.set()
    db = Queue()
    result = process_briefs.process_queue(db, 30, float('inf'), provider_pause=pause)
    assert result['claimed'] == 0 and db.claims == 0


def test_main_reports_provider_pause_as_unsuccessful(monkeypatch):
    monkeypatch.setattr('sys.argv', ['process_briefs'])
    monkeypatch.setattr(process_briefs, 'load_dotenv', lambda: None)
    monkeypatch.setattr(process_briefs, 'create_supabase_client', object)
    for name in ('discover_requests', 'discover', 'rank_queue', 'filter_queue'):
        monkeypatch.setattr(process_briefs, name, lambda *a, **k: {})
    monkeypatch.setattr(process_briefs, 'process_queue', lambda *a, **k: {'failed': 0, 'provider_paused': 1})
    assert process_briefs.main() == 1
