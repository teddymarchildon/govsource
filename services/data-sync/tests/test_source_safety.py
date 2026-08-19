import sync_court_opinions
import sync_federal_register_docs


def test_federal_register_rate_limit_is_1000_per_hour():
    assert sync_federal_register_docs.RATE_LIMITER.minimum_interval_seconds == 3.6


def test_federal_document_base_row_does_not_clear_storage_paths():
    row = sync_federal_register_docs.document_row(
        {
            "document_number": "2026-00001",
            "title": "Example",
            "type": "Rule",
        }
    )
    assert "pdf_file_path" not in row
    assert "html_file_path" not in row
    assert "xml_file_path" not in row


def test_courtlistener_per_page_is_sent_to_api(monkeypatch):
    captured = {}

    def fake_iter(session, url, key, **kwargs):
        captured.update(kwargs["params"])
        return iter([])

    monkeypatch.setattr(sync_court_opinions, "iter_next_paginated_items", fake_iter)
    client = sync_court_opinions.CourtListenerClient.__new__(
        sync_court_opinions.CourtListenerClient
    )
    client.session = object()
    client._people = {}
    assert client.clusters("scotus", per_page=75, max_pages=2) == []
    assert captured["page_size"] == 75
