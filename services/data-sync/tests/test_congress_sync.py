import pytest
import sync_bill_actions_supabase
import sync_bills_supabase
from sync_common import UpstreamAPIError


def test_bill_listing_uses_congress_scoped_endpoint(monkeypatch):
    captured = {}

    def fake_iter(session, url, key, **kwargs):
        captured.update(url=url, key=key, params=kwargs["params"])
        yield {"url": "detail"}

    monkeypatch.setattr(sync_bills_supabase, "iter_paginated_items", fake_iter)
    client = sync_bills_supabase.CongressClient.__new__(
        sync_bills_supabase.CongressClient
    )
    client.session = object()

    result = client.bill_references(119, limit=20, offset=0, max_pages=None)

    assert result == [{"url": "detail"}]
    assert captured["url"].endswith("/bill/119")


def test_bill_actions_consume_every_page(monkeypatch):
    monkeypatch.setattr(
        sync_bills_supabase.CongressClient,
        "collection",
        lambda self, url, key: [
            {"actionDate": "2026-01-01", "text": "First"},
            {"actionDate": "2026-01-02", "text": "Second"},
        ],
    )
    client = sync_bills_supabase.CongressClient.__new__(
        sync_bills_supabase.CongressClient
    )
    actions = client.actions(119, "HR", 1)
    assert [action["text"] for action in actions] == ["First", "Second"]


def test_bill_action_refresh_selects_newest_bills_first():
    class Query:
        def __init__(self):
            self.order_args = None

        def table(self, name):
            assert name == "bill"
            return self

        def select(self, columns):
            return self

        def order(self, column, **kwargs):
            self.order_args = (column, kwargs)
            return self

        def range(self, start, end):
            assert (start, end) == (0, 19)
            return self

        def execute(self):
            self.data = []
            return self

    query = Query()
    assert sync_bill_actions_supabase.fetch_bills_from_supabase(query) == []
    assert query.order_args == ("id", {"desc": True})


def test_action_fetch_failure_never_calls_replacement(monkeypatch):
    class Supabase:
        called = False

        def rpc(self, *args, **kwargs):
            self.called = True
            return self

        def execute(self):
            return self

    supabase = Supabase()
    monkeypatch.setattr(
        sync_bill_actions_supabase,
        "fetch_bill_actions",
        lambda *args, **kwargs: (_ for _ in ()).throw(UpstreamAPIError("offline")),
    )

    with pytest.raises(UpstreamAPIError):
        sync_bill_actions_supabase.overwrite_bill_actions_for_bill(
            supabase,
            object(),
            {
                "id": 1,
                "congress": 119,
                "type": "HR",
                "number": 1,
                "bill_unique_id": "hr1-119",
            },
        )
    assert not supabase.called


def test_undated_bill_text_key_is_stable():
    item = {"type": "Introduced", "pdf_url": "https://example.test/a.pdf"}
    assert sync_bills_supabase._text_fallback_key(
        item
    ) == sync_bills_supabase._text_fallback_key(item)
