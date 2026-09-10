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
