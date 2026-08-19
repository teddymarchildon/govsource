from typing import Any, Dict, List, Optional

import pytest
import sync_common


def test_pagination_follows_next_and_only_sends_params_on_first_page(monkeypatch):
    calls: List[tuple[str, Optional[Dict[str, Any]]]] = []
    pages = {
        "first": {"items": [{"id": 1}], "pagination": {"next": "second"}},
        "second": {"items": [{"id": 2}], "pagination": {}},
    }

    def fake_get_json(session, url, *, params=None, **kwargs):
        calls.append((url, params))
        return pages[url]

    monkeypatch.setattr(sync_common, "get_json", fake_get_json)
    items = list(
        sync_common.iter_paginated_items(
            object(), "first", "items", params={"limit": 250}
        )
    )

    assert items == [{"id": 1}, {"id": 2}]
    assert calls == [("first", {"limit": 250}), ("second", None)]


def test_invalid_collection_shape_is_a_hard_failure(monkeypatch):
    monkeypatch.setattr(
        sync_common,
        "get_json",
        lambda *args, **kwargs: {"items": {}, "pagination": {}},
    )
    with pytest.raises(sync_common.UpstreamAPIError):
        list(sync_common.iter_paginated_items(object(), "url", "items"))


def test_service_role_key_is_preferred(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service")
    monkeypatch.setenv("SUPABASE_KEY", "legacy")
    assert (
        sync_common.require_env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY")
        == "service"
    )


def test_partial_upsert_patches_only_supplied_fields():
    class Result:
        def __init__(self, data):
            self.data = data

    class Query:
        def __init__(self, client, operation=None, payload=None):
            self.client = client
            self.operation = operation
            self.payload = payload

        def select(self, _column):
            self.operation = "select"
            return self

        def update(self, payload):
            self.operation = "update"
            self.payload = payload
            return self

        def insert(self, payload):
            self.operation = "insert"
            self.payload = payload
            return self

        def eq(self, _column, _value):
            return self

        def limit(self, _count):
            return self

        def execute(self):
            if self.operation == "select":
                return Result([{"id": 7}])
            self.client.write = (self.operation, self.payload)
            return Result([{"id": 7, **self.payload}])

    class Supabase:
        write = None

        def table(self, _name):
            return Query(self)

    supabase = Supabase()
    row = {"remote_id": "123", "title": "Updated"}
    sync_common.upsert_preserving_missing(supabase, "court_opinion", row, "remote_id")

    assert supabase.write == ("update", row)
    assert "pdf_file_path" not in supabase.write[1]
