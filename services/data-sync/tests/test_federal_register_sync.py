import sync_federal_register_docs


def test_stop_on_existing_does_not_fetch_an_older_page(monkeypatch):
    listing_calls = 0

    def fake_get_json(_session, url, **_kwargs):
        nonlocal listing_calls
        assert url.endswith("/documents.json")
        listing_calls += 1
        return {
            "results": [{"document_number": "2026-12345"}],
            "total_pages": 2,
        }

    class ExistingDocumentQuery:
        def select(self, column):
            assert column == "id"
            return self

        def eq(self, column, value):
            assert column == "remote_document_number"
            assert value == "2026-12345"
            return self

        def limit(self, count):
            assert count == 1
            return self

        def execute(self):
            self.data = [{"id": 42}]
            return self

    class Supabase:
        def table(self, name):
            assert name == "agency_document"
            return ExistingDocumentQuery()

    monkeypatch.setattr(sync_federal_register_docs, "get_json", fake_get_json)
    client = sync_federal_register_docs.FederalRegisterClient.__new__(
        sync_federal_register_docs.FederalRegisterClient
    )
    client.session = object()

    stats = sync_federal_register_docs.sync_documents_to_supabase(
        Supabase(),
        client,
        document_type="RULE",
        max_pages=2,
        skip_storage=True,
        stop_on_existing=True,
    )

    assert listing_calls == 1
    assert stats.fetched == 1
    assert stats.skipped == 1
    assert stats.written == 0
    assert stats.failed == 0
