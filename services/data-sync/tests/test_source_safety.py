import sync_court_opinions
import sync_courts
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
    client.rate_limiter = object()
    client._people = {}
    assert client.clusters(
        "scotus",
        modified_since="2026-08-01T00:00:00+00:00",
        per_page=75,
        max_pages=2,
    ) == []
    assert captured["page_size"] == 75
    assert captured["date_modified__gte"] == "2026-08-01T00:00:00+00:00"
    assert captured["order_by"] == "date_modified,id"


def test_courtlistener_request_budget_stops_before_exceeding_daily_limit():
    limiter = sync_court_opinions.CourtListenerQuotaLimiter(0, 2)

    limiter.wait()
    limiter.wait()

    try:
        limiter.wait()
    except sync_court_opinions.UpstreamAPIError as exc:
        assert "request budget exhausted" in str(exc)
    else:
        raise AssertionError("Expected the request budget to stop a third call")


def test_courtlistener_reference_sync_uses_hourly_quota_pacing():
    assert sync_courts.DEFAULT_MINIMUM_REQUEST_INTERVAL == 72.0


def test_incremental_start_overlaps_the_stored_checkpoint():
    assert sync_court_opinions.incremental_start(
        "2026-08-20T12:00:00+00:00",
        initial_lookback_days=14,
        overlap_minutes=30,
    ) == "2026-08-20T11:30:00+00:00"


def test_courtlistener_prefers_local_storage_pdf():
    urls = sync_court_opinions._pdf_source_urls(
        {
            "local_path": "pdf/2026/example.pdf",
            "download_url": "https://court.example/example.pdf",
        }
    )

    assert urls == [
        "https://storage.courtlistener.com/pdf/2026/example.pdf",
        "https://court.example/example.pdf",
    ]


def test_unchanged_opinion_content_is_not_reuploaded():
    opinion = {
        "sha1": "abc123",
        "local_path": "pdf/2026/example.pdf",
        "html_with_citations": "<p>Opinion</p>",
        "plain_text": "Opinion",
    }
    previous = {
        "source_sha1": "abc123",
        "pdf_file_path": "opinion.pdf",
        "html_file_path": "opinion.html",
        "text_file_path": "opinion.txt",
    }

    assert sync_court_opinions.opinion_content_is_current(previous, opinion)


def test_matching_revision_without_stored_content_is_not_current():
    opinion = {
        "sha1": "abc123",
        "html_with_citations": "<p>Opinion</p>",
    }
    previous = {"source_sha1": "abc123", "html_file_path": None}

    assert not sync_court_opinions.opinion_content_is_current(previous, opinion)


def test_courtlistener_download_session_has_no_api_token(monkeypatch):
    headers_seen = []

    def fake_session(*, headers=None, **_kwargs):
        headers_seen.append(headers or {})
        return object()

    monkeypatch.setattr(sync_court_opinions, "build_http_session", fake_session)
    sync_court_opinions.CourtListenerClient(
        "secret", minimum_request_interval=0, max_api_requests=2
    )

    assert headers_seen[0]["Authorization"] == "Token secret"
    assert "Authorization" not in headers_seen[1]


def test_daily_sync_uses_overlapped_modified_checkpoints(monkeypatch):
    calls = []

    class Client:
        def clusters(self, court_id, **kwargs):
            calls.append(("clusters", court_id, kwargs["modified_since"]))
            return [{"id": 10}]

        def opinions(self, court_id, **kwargs):
            calls.append(("opinions", court_id, kwargs["modified_since"]))
            return [{"id": 20}]

    monkeypatch.setattr(
        sync_court_opinions,
        "court_id_for_remote_id",
        lambda _supabase, _remote_id: "local-court",
    )
    monkeypatch.setattr(
        sync_court_opinions,
        "newest_source_modified",
        lambda _supabase, _table: "2026-08-20T12:00:00+00:00",
    )
    monkeypatch.setattr(
        sync_court_opinions,
        "upsert_cluster",
        lambda *_args, **_kwargs: "local-cluster",
    )
    monkeypatch.setattr(
        sync_court_opinions,
        "sync_opinion",
        lambda *_args, **_kwargs: {"id": "local-opinion"},
    )

    stats = sync_court_opinions.sync_opinions_to_supabase(
        object(), Client(), overlap_minutes=30
    )

    assert calls == [
        ("clusters", "scotus", "2026-08-20T11:30:00+00:00"),
        ("opinions", "scotus", "2026-08-20T11:30:00+00:00"),
    ]
    assert stats.fetched == 2
    assert stats.written == 1
    assert stats.failed == 0
