from types import SimpleNamespace
import pytest
import run_pipeline_source as runner
import sync_bills_supabase
import sync_federal_register_docs
from datetime import datetime, timezone


def test_reference_recovery_respects_live_lease_and_recovers_expired_worker():
    now=datetime(2026,9,10,tzinfo=timezone.utc)
    row={'status':'running','lease_until':'2026-09-11T00:00:00Z','last_success_at':None}
    assert not runner.reference_due(row,now)
    row['lease_until']='2026-09-09T00:00:00Z'
    assert runner.reference_due(row,now)
    row.update(status='success',last_success_at='2026-09-09T00:00:00Z')
    assert not runner.reference_due(row,now)
    row['last_success_at']='2026-09-01T00:00:00Z'
    assert runner.reference_due(row,now)


class DB:
    def __init__(self): self.updates=[]
    def table(self,*a):return self
    def update(self,data):self.updates.append(data.copy());return self
    def eq(self,*a):return self
    def execute(self):return SimpleNamespace(data=[])


def test_congress_checkpoint_is_frozen_and_saved_per_completed_page(monkeypatch):
    calls=[]
    pages=[{'bills':[{'url':'one'}],'pagination':{'next':'page2'}},{'bills':[{'url':'two'}],'pagination':{}}]
    monkeypatch.setattr(runner,'require_env',lambda name:'test')
    monkeypatch.setattr(sync_bills_supabase,'CongressClient',lambda key:SimpleNamespace(session=None))
    monkeypatch.setattr(sync_bills_supabase,'sync_bill',lambda *args:calls.append(args[-1]))
    monkeypatch.setattr(runner,'get_json',lambda *a,**kw:pages.pop(0))
    db=DB();cp={'since':'2026-09-01T00:00:00Z','until':'2026-09-02T00:00:00Z','offset':0}
    result=runner.congress(db,cp)
    assert calls==['one','two']
    assert result=={'since':'2026-09-01T22:00:00Z','offset':0}
    assert db.updates[0]['checkpoint']['offset']==1


def test_congress_failed_record_does_not_advance_checkpoint(monkeypatch):
    monkeypatch.setattr(runner,'require_env',lambda name:'test')
    monkeypatch.setattr(sync_bills_supabase,'CongressClient',lambda key:SimpleNamespace(session=None))
    monkeypatch.setattr(runner,'get_json',lambda *a,**kw:{'bills':[{'url':'broken'}],'pagination':{'next':'page2'}})
    def fail(*a):raise RuntimeError('incomplete source')
    monkeypatch.setattr(sync_bills_supabase,'sync_bill',fail)
    db=DB()
    with pytest.raises(RuntimeError):runner.congress(db,{})
    assert db.updates==[]


def test_federal_register_failure_does_not_skip_other_categories(monkeypatch):
    kinds=[]
    def sync(db,client,**kw):
        kinds.append(kw['document_type'])
        return SimpleNamespace(failed=int(kw['document_type']=='RULE'),fetched=200)
    monkeypatch.setattr(sync_federal_register_docs,'FederalRegisterClient',lambda:None)
    monkeypatch.setattr(sync_federal_register_docs,'sync_documents_to_supabase',sync)
    db=DB()
    with pytest.raises(RuntimeError):runner.federal_register(db,{},True)
    assert kinds==['PRESDOCU','RULE','PRORULE','NOTICE']
    pages=db.updates[-1]['checkpoint']['recovery_pages']
    assert pages['NOTICE']==3 and 'RULE' not in pages
