import json
from types import SimpleNamespace

import httpx
import pytest
import requests
from storage3.exceptions import StorageApiError

import sync_agencies
import sync_common
import sync_federal_register_docs as federal


def upstream_error(status):
    response = requests.Response()
    response.status_code = status
    error = sync_common.UpstreamAPIError("upstream failure")
    error.__cause__ = requests.HTTPError(response=response)
    return error


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(sync_common.time, "sleep", lambda _: None)


def test_interrupted_body_is_read_again_in_full():
    class Response:
        headers = {"content-type": "application/pdf"}
        closed = False

        def raise_for_status(self):
            pass

        @property
        def content(self):
            if not self.success:
                raise requests.exceptions.ChunkedEncodingError("IncompleteRead")
            return b"complete pdf"

        def close(self):
            self.closed = True

    responses = [Response(), Response()]
    responses[0].success = False
    responses[1].success = True
    pending = iter(responses)
    session = SimpleNamespace(get=lambda *a, **k: next(pending))
    assert sync_common.download_bytes(session, "https://example.test/file") == (
        b"complete pdf",
        "application/pdf",
    )
    assert all(response.closed for response in responses)


@pytest.mark.parametrize("status", [403, 404])
def test_permanent_download_failure_is_not_retried(status):
    calls = []

    def get(*args, **kwargs):
        calls.append(1)
        raise upstream_error(status).__cause__

    with pytest.raises(sync_common.UpstreamAPIError):
        sync_common.download_bytes(
            SimpleNamespace(get=get), "https://example.test/file"
        )
    assert len(calls) == 1


def test_download_retries_are_bounded():
    calls = []

    def get(*args, **kwargs):
        calls.append(1)
        raise requests.exceptions.ChunkedEncodingError("IncompleteRead")

    with pytest.raises(sync_common.UpstreamAPIError):
        sync_common.download_bytes(
            SimpleNamespace(get=get), "https://example.test/file"
        )
    assert len(calls) == 3


def masked_storage_error(status):
    try:
        response = httpx.Response(
            status, request=httpx.Request("POST", "https://example.test/storage")
        )
        response.raise_for_status()
    except httpx.HTTPStatusError:
        try:
            json.loads("<html>gateway error</html>")
        except json.JSONDecodeError as error:
            return error


@pytest.mark.parametrize(
    "error",
    [
        masked_storage_error(520),
        StorageApiError("Unavailable", "Unavailable", 503),
        httpx.ReadTimeout("timeout"),
    ],
)
def test_storage_retry_reuses_same_object_and_bytes(error):
    calls = []

    def upload(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            raise error

    client = SimpleNamespace(
        storage=SimpleNamespace(from_=lambda _: SimpleNamespace(upload=upload))
    )
    assert (
        sync_common.upload_bytes(
            client, "bucket", "file.pdf", b"pdf", "application/pdf"
        )
        == "file.pdf"
    )
    assert len(calls) == 2
    assert calls[0] == calls[1]
    assert calls[0]["file_options"]["upsert"] == "true"


@pytest.mark.parametrize(
    "error,expected_calls",
    [
        (masked_storage_error(520), 3),
        (masked_storage_error(403), 1),
        (ValueError("bad input"), 1),
    ],
)
def test_storage_failure_stays_visible(error, expected_calls):
    calls = []

    def upload(**kwargs):
        calls.append(kwargs)
        raise error

    client = SimpleNamespace(
        storage=SimpleNamespace(from_=lambda _: SimpleNamespace(upload=upload))
    )
    with pytest.raises(type(error)):
        sync_common.upload_bytes(
            client, "bucket", "file.pdf", b"pdf", "application/pdf"
        )
    assert len(calls) == expected_calls


def test_agency_cooldown_recovers_exhausted_429(monkeypatch):
    calls, waits = [], []

    def get(*args, **kwargs):
        calls.append(kwargs)
        if len(calls) < 3:
            raise upstream_error(429)
        return {"id": 380}

    monkeypatch.setattr(sync_agencies, "get_json", get)
    monkeypatch.setattr(sync_agencies.time, "sleep", waits.append)
    assert sync_agencies.fetch_agency_detail(object(), "380") == {"id": 380}
    assert waits == [60, 120]
    assert calls[0]["rate_limiter"].minimum_interval_seconds == 3.6


@pytest.mark.parametrize("status,expected_calls", [(429, 3), (403, 1)])
def test_agency_cooldown_is_bounded(monkeypatch, status, expected_calls):
    calls = []

    def get(*args, **kwargs):
        calls.append(1)
        raise upstream_error(status)

    monkeypatch.setattr(sync_agencies, "get_json", get)
    with pytest.raises(sync_common.UpstreamAPIError):
        sync_agencies.fetch_agency_detail(object(), "380")
    assert len(calls) == expected_calls


def test_missing_alternate_format_preserves_available_content(monkeypatch):
    def download(url):
        if url == "html":
            raise upstream_error(404)
        return b"pdf", "application/pdf"

    monkeypatch.setattr(federal, "upload_bytes", lambda _s, _b, path, *_: path)
    paths = federal.upload_document_files(
        object(),
        SimpleNamespace(download=download),
        {"document_number": "X26-20831", "pdf_url": "pdf", "body_html_url": "html"},
    )
    assert paths == {"pdf_file_path": "pdfs/X26-20831.pdf"}
    assert not federal.stored_content_complete(
        {"pdf_url": "pdf", "html_url": "html", **paths}
    )


@pytest.mark.parametrize("status", [404, 403, 503])
def test_no_available_content_or_non_missing_errors_fail(monkeypatch, status):
    def download(url):
        raise upstream_error(status)

    with pytest.raises(sync_common.UpstreamAPIError):
        federal.upload_document_files(
            object(),
            SimpleNamespace(download=download),
            {"document_number": "missing", "pdf_url": "pdf"},
        )


def test_recovery_only_downloads_missing_format(monkeypatch):
    downloads = []

    def download(url):
        downloads.append(url)
        return b"html", "text/html"

    monkeypatch.setattr(federal, "upload_bytes", lambda _s, _b, path, *_: path)
    paths = federal.upload_document_files(
        object(),
        SimpleNamespace(download=download),
        {"document_number": "partial", "pdf_url": "pdf", "body_html_url": "html"},
        {"pdf_url": "pdf", "pdf_file_path": "old.pdf"},
    )
    assert downloads == ["html"]
    assert paths == {"pdf_file_path": "old.pdf", "html_file_path": "html/partial.html"}


def test_scan_continues_past_complete_record_and_recovers_older_gap(monkeypatch):
    writes = []
    client = SimpleNamespace(
        documents=lambda **kwargs: iter(
            [{"document_number": "complete"}, {"document_number": "missing"}]
        ),
        detail=lambda number: {"document_number": number, "type": "Rule"},
    )
    monkeypatch.setattr(
        federal,
        "stored_document",
        lambda _s, number: {"id": 1, "pdf_url": "pdf", "pdf_file_path": "stored.pdf"}
        if number == "complete"
        else None,
    )
    monkeypatch.setattr(
        federal,
        "upsert_preserving_missing",
        lambda _s, _t, row, _c: writes.append(row) or SimpleNamespace(data=[{"id": 2}]),
    )
    supabase = SimpleNamespace(rpc=lambda *a: SimpleNamespace(execute=lambda: None))
    stats = federal.sync_documents_to_supabase(
        supabase, client, skip_complete=True, skip_storage=True
    )
    assert stats.skipped == 1
    assert stats.written == 1
    assert stats.failed == 0
    assert writes[0]["remote_document_number"] == "missing"


def test_targeted_recovery_bypasses_listing(monkeypatch):
    client = SimpleNamespace(
        detail=lambda number: {"document_number": number, "type": "Rule"}
    )
    writes = []
    monkeypatch.setattr(
        federal,
        "upsert_preserving_missing",
        lambda _s, _t, row, _c: writes.append(row) or SimpleNamespace(data=[{"id": 2}]),
    )
    supabase = SimpleNamespace(rpc=lambda *a: SimpleNamespace(execute=lambda: None))
    stats = federal.sync_documents_to_supabase(
        supabase, client, document_numbers=["X26-20831", "X26-10831"], skip_storage=True
    )
    assert stats.written == 2
    assert stats.failed == 0
