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


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("HR6644", ("HR", 6644)),
        ("hr-6633", ("HR", 6633)),
        ("S 98", ("S", 98)),
    ],
)
def test_parse_bill_reference(value, expected):
    assert sync_bills_supabase.parse_bill_reference(value) == expected


def test_parse_bill_reference_rejects_invalid_value():
    with pytest.raises(Exception):
        sync_bills_supabase.parse_bill_reference("119-HR-6644")


def test_targeted_bill_sync_builds_exact_detail_url(monkeypatch):
    captured = {}

    def fake_sync(supabase, client, detail_url):
        captured["detail_url"] = detail_url
        return {"bill_unique_id": "hr6644-119"}

    monkeypatch.setattr(sync_bills_supabase, "sync_bill", fake_sync)
    result = sync_bills_supabase.sync_bill_by_reference(
        object(), object(), 119, "HR", 6644
    )

    assert result["bill_unique_id"] == "hr6644-119"
    assert captured["detail_url"].endswith("/bill/119/hr/6644")


def test_partial_cosponsor_failure_preserves_collection_and_saves_others(monkeypatch):
    from types import SimpleNamespace
    calls=[]
    monkeypatch.setattr(sync_bills_supabase,'upsert_preserving_missing',lambda *a:SimpleNamespace(data=[{'id':9}]))
    monkeypatch.setattr(sync_bills_supabase,'ensure_congressmen',lambda db,people:[1] if people else [])
    def collection(url,key):
        if key=='cosponsors': raise UpstreamAPIError('500')
        return []
    client=SimpleNamespace(bill_detail=lambda u:{'bill':{'congress':119,'type':'S','number':537,'title':'Title',
        'sponsors':[{'bioguideId':'X'}],'cosponsors':{'url':'cosponsors'},'textVersions':{'url':'texts'},'summaries':{'url':'summaries'}}},
        collection=collection,actions=lambda *a:[{'date':'2026-09-01','text':'Introduced'}])
    db=SimpleNamespace(rpc=lambda name,args:calls.append((name,args)) or SimpleNamespace(execute=lambda:None))
    result=sync_bills_supabase.sync_bill(db,client,'detail')
    name,params=calls[-1]
    assert name=='complete_bill_sync'
    assert params['p_cosponsor_ids'] is None
    assert params['p_sponsor_ids']==[1] and params['p_actions']
    assert params['p_texts']==[]  # a successful empty response, not a failed fetch
    assert result['_missing_fields']==['cosponsors']


def test_missing_pdf_does_not_prevent_html_upload(monkeypatch):
    from types import SimpleNamespace
    def download(url):
        if url=='pdf': raise UpstreamAPIError('404')
        return b'complete html','text/html'
    monkeypatch.setattr(sync_bills_supabase,'upload_bytes',lambda db,bucket,path,*args:path)
    texts=sync_bills_supabase.upload_bill_texts(None,SimpleNamespace(download=download),
        {'congress':119,'type':'S','number':537,'bill_unique_id':'s537-119'},
        [{'date':'2026-09-01','pdf_url':'pdf','html_url':'html'}])
    assert texts[0]['pdf_file_path'] is None
    assert texts[0]['html_file_path'].endswith('bill.html')
