from types import SimpleNamespace
import pytest
import brief_ai
from brief_ai import AI, BudgetExhausted, IncompleteResponse


class DB:
    def __init__(self):
        self.reservations=[]
        self.updates=[]
    def rpc(self,name,args):
        self.reservations.append(args)
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=str(len(self.reservations))))
    def table(self,name): return self
    def update(self,data): self.updates.append(data); return self
    def eq(self,*args): return self
    def execute(self): return SimpleNamespace(data=[])


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','test-secret')
    monkeypatch.setenv('BRIEF_INPUT_USD_PER_MILLION','0.25')
    monkeypatch.setenv('BRIEF_OUTPUT_USD_PER_MILLION','2')
    db=DB()
    return db,AI(db,1)


def responses(monkeypatch,bodies):
    requests=[]
    def post(*args,**kwargs):
        requests.append(kwargs['json'])
        body=bodies.pop(0)
        return SimpleNamespace(raise_for_status=lambda:None,json=lambda:body)
    monkeypatch.setattr(brief_ai.requests,'post',post)
    return requests


def success():
    return {'status':'completed','id':'response-ok','usage':{'input_tokens':100,'output_tokens':50},
            'output':[{'type':'message','content':[{'type':'output_text','text':'{"ok":true}'}]}]}


def test_token_limit_retry_reserves_and_accounts_each_request(setup,monkeypatch):
    db,ai=setup
    calls=responses(monkeypatch,[{'status':'incomplete','id':'response-short',
        'incomplete_details':{'reason':'max_output_tokens'},'usage':{'input_tokens':100,'output_tokens':8000}},success()])
    assert ai.call('extract','instructions',{},brief_ai.obj(ok=brief_ai.BOOL))=={'ok':True}
    assert [c['max_output_tokens'] for c in calls]==[8000,16000]
    assert len(db.reservations)==len(db.updates)==2
    assert db.reservations[1]['p_amount']>db.reservations[0]['p_amount']
    assert db.updates[0]['usage']['response_diagnostics']['reason']=='max_output_tokens'


def test_unknown_failure_records_details_without_blind_retry(setup,monkeypatch):
    db,ai=setup
    calls=responses(monkeypatch,[{'status':'failed','id':'response-failed','error':{'code':'server_error','message':'sensitive payload'}}])
    with pytest.raises(IncompleteResponse,match='server_error') as exc:
        ai.call('extract','instructions',{}, {})
    assert len(calls)==1 and 'sensitive payload' not in str(exc.value)
    assert 'actual_usd' not in db.updates[0]  # uncertain usage retains its reservation


def test_retry_stops_at_two_calls(setup,monkeypatch):
    db,ai=setup
    calls=responses(monkeypatch,[{'status':'incomplete','incomplete_details':{'reason':'max_output_tokens'}}]*2)
    with pytest.raises(IncompleteResponse,match='16000'):
        ai.call('extract','instructions',{}, {})
    assert len(calls)==2


def test_retry_requires_budget(setup,monkeypatch):
    db,ai=setup
    reserve=db.rpc
    def rpc(name,args):
        if db.reservations: raise RuntimeError('budget exhausted')
        return reserve(name,args)
    db.rpc=rpc
    calls=responses(monkeypatch,[{'status':'incomplete','incomplete_details':{'reason':'max_output_tokens'}}])
    with pytest.raises(BudgetExhausted): ai.call('extract','instructions',{}, {})
    assert len(calls)==1


def test_expired_deadline_prevents_call(setup,monkeypatch):
    db,ai=setup
    monkeypatch.setattr(brief_ai.time,'monotonic',lambda:2)
    responses(monkeypatch,[])
    ai.deadline=1
    with pytest.raises(TimeoutError): ai.call('extract','instructions',{}, {})
    assert not db.reservations


@pytest.mark.parametrize('body',[
    {'status':'incomplete','incomplete_details':{'reason':'content_filter'}},
    {'status':'completed','output':[{'content':[{'type':'refusal'}]}]},
])
def test_provider_filter_and_refusal_are_not_retried(setup,monkeypatch,body):
    db,ai=setup
    calls=responses(monkeypatch,[body])
    with pytest.raises(brief_ai.ResponseWithheld): ai.call('extract','instructions',{}, {})
    assert len(calls)==1


def test_transport_retry_reserves_again_and_keeps_unknown_usage(setup,monkeypatch):
    db,ai=setup
    calls=[]
    monkeypatch.setattr(brief_ai.time,'sleep',lambda _:None)
    def post(*a,**kw):
        calls.append(kw)
        if len(calls)==1: raise brief_ai.requests.ReadTimeout('timeout')
        return SimpleNamespace(raise_for_status=lambda:None,json=success)
    monkeypatch.setattr(brief_ai.requests,'post',post)
    assert ai.call('extract','instructions',{}, {})=={'ok':True}
    assert len(db.reservations)==2 and len(db.updates)==1


def test_deadline_bounds_network_timeout(setup,monkeypatch):
    db,ai=setup
    monkeypatch.setattr(brief_ai.time,'monotonic',lambda:100)
    ai.deadline=150
    calls=[]
    def post(*a,**kw):
        calls.append(kw)
        return SimpleNamespace(raise_for_status=lambda:None,json=success)
    monkeypatch.setattr(brief_ai.requests,'post',post)
    ai.call('extract','instructions',{}, {})
    assert calls[0]['timeout']==(15,35)


@pytest.mark.parametrize('payload', [
    {'nested': [{'text': 'unsafe\x00text'}]}, {'bad\x00key': True},
])
def test_null_output_is_accounted_then_withheld_without_retry(setup, monkeypatch, payload):
    import json
    db, ai = setup
    body = success()
    body['output'][0]['content'][0]['text'] = json.dumps(payload)
    calls = responses(monkeypatch, [body])
    with pytest.raises(brief_ai.ResponseWithheld, match='null character'):
        ai.call('extract', 'instructions', {}, {})
    assert len(calls) == len(db.updates) == 1
    assert db.updates[0]['status'] == 'completed'


def test_json_validation_preserves_literal_escape_and_unicode():
    value = {'quote': r'An example of \u0000, with café and 日本語.'}
    brief_ai.validate_json_text(value)
    assert value['quote'] == r'An example of \u0000, with café and 日本語.'


@pytest.mark.parametrize('code,kind,category', [
    ('rate_limit_exceeded', 'tokens', 'rate_limit'),
    ('slow_down', 'rate_limit_error', 'rate_limit'),
    ('insufficient_quota', 'insufficient_quota', 'quota'),
    ('credit_balance_exhausted', 'insufficient_quota', 'quota'),
    ('project_spend_limit_exceeded', 'insufficient_quota', 'quota'),
    (None, None, 'unknown_429'),
])
def test_429_stops_peer_before_reserving_and_releases_budget(setup, monkeypatch, caplog, code, kind, category):
    db, ai = setup
    calls = []
    def post(*args, **kwargs):
        calls.append(1)
        return SimpleNamespace(status_code=429, headers={'x-request-id': 'req-123', 'retry-after': '120'},
            json=lambda: {'error': {'code': code, 'type': kind, 'message': 'test-secret sensitive input'}})
    monkeypatch.setattr(brief_ai.requests, 'post', post)
    with pytest.raises(brief_ai.ProviderPaused):
        ai.call('selection', 'private prompt', {}, {})
    peer = AI(db, 2)
    peer.provider_pause = ai.provider_pause
    with pytest.raises(brief_ai.ProviderPaused):
        peer.call('write', 'private prompt', {}, {})
    assert len(calls) == len(db.reservations) == 1
    assert db.updates[0]['actual_usd'] == 0
    diagnostic = db.updates[0]['usage']['response_diagnostics']
    assert diagnostic['category'] == category
    assert diagnostic['request_id'] == 'req-123'
    assert diagnostic['retry_after_seconds'] == 120
    assert 'test-secret' not in caplog.text and 'private prompt' not in caplog.text


def test_non_json_429_still_stops_when_accounting_fails(setup, monkeypatch, caplog):
    db, ai = setup
    def invalid_json(): raise ValueError('private body')
    def failed_update(_): raise ConnectionError('private database error')
    db.update = failed_update
    monkeypatch.setattr(brief_ai.requests, 'post', lambda *a, **k:
        SimpleNamespace(status_code=429, headers={}, json=invalid_json))
    with pytest.raises(brief_ai.ProviderPaused, match='unknown_429'):
        ai.call('selection', '', {}, {})
    assert ai.provider_pause.stopped.is_set()
    assert 'private' not in caplog.text
    assert 'reservation retained' in caplog.text


def test_500_keeps_reservation_and_original_error(setup, monkeypatch):
    db, ai = setup
    def fail(): raise brief_ai.requests.HTTPError('500 server error')
    monkeypatch.setattr(brief_ai.requests, 'post', lambda *a, **k:
        SimpleNamespace(status_code=500, raise_for_status=fail))
    with pytest.raises(brief_ai.requests.HTTPError): ai.call('selection', '', {}, {})
    assert len(db.reservations) == 1 and not db.updates


def test_peer_pause_during_reservation_prevents_http_request(setup, monkeypatch):
    db, ai = setup
    reserve = db.rpc
    def rpc(*args):
        ai.provider_pause.stopped.set()
        return reserve(*args)
    db.rpc = rpc
    monkeypatch.setattr(brief_ai.requests, 'post', lambda *a, **k: pytest.fail('Request sent after pause'))
    with pytest.raises(brief_ai.ProviderPaused): ai.call('selection', '', {}, {})
    assert db.updates[0]['actual_usd'] == 0
    assert db.updates[0]['usage']['response_diagnostics']['status'] == 'not_sent'


@pytest.mark.parametrize('raw', ['garbage', 'NaN', 'Infinity', '-1'])
def test_invalid_retry_after_is_safe(raw):
    response = SimpleNamespace(headers={'retry-after': raw}, json=lambda: [])
    assert brief_ai.rejection_diagnostics(response, 'selection', 'model')['retry_after_seconds'] is None


def test_retry_after_http_date():
    from datetime import datetime, timedelta, timezone
    from email.utils import format_datetime
    response = SimpleNamespace(headers={'retry-after': format_datetime(datetime.now(timezone.utc)+timedelta(hours=1))}, json=lambda: {})
    delay = brief_ai.rejection_diagnostics(response, 'selection', 'model')['retry_after_seconds']
    assert 3590 < delay <= 3600
