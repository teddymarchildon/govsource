from copy import deepcopy
from types import SimpleNamespace
import pytest
from brief_evidence import chunks, build_packet, EvidenceUnavailable, fingerprint
from process_briefs import citation_errors, validate_draft, verification_passes, draft_claims, process, publish_ready
from check_brief_pipeline import problems

TEXT='The proposed rule would require annual reporting for large operators. Comments close on October 1, 2026. Small operators are exempt.'
PASSAGE={'id':'s1','source_id':'source_1','text':TEXT}


def claim(text='The agency proposes annual reporting.'):
    return {'text':text,'evidence':[{'passage_id':'s1','quote':TEXT}]}


def draft():
    return {'title':claim('Agency proposes annual reporting'), 'dek':claim(), 'points':[claim(),claim('Comments close on October 1, 2026.'),claim('Small operators are exempt.')], 'context':{'text':'','evidence':[]},'policy_areas':['Government']}


def report(d):
    return {'passed':True,'status_correct':True,'material_omissions':[],'issues':[],
            'claims':[{'field':k,'supported':True,'reason':'Supported'} for k,v in draft_claims(d).items() if v['text']]}


def test_chunks_preserve_entire_source_including_final_exception():
    text=('A long section.\n'*4000)+'FINAL EXCEPTION: small operators are exempt.'
    assert ''.join(chunks(text))==text
    assert 'FINAL EXCEPTION' in chunks(text)[-1]


def test_exact_quotes_and_numbers_are_checked():
    assert citation_errors(claim(),[PASSAGE])==[]
    bad=claim('The rule costs 900 million dollars.')
    assert any('Unsupported number' in e for e in citation_errors(bad,[PASSAGE]))
    bad=claim();bad['evidence'][0]['quote']='Invented quotation.'
    assert citation_errors(bad,[PASSAGE])


def test_wrapped_quote_is_restored_to_literal_source_without_changing_words():
    text='The agency requires\n    annual reporting for large operators.'
    c=claim();c['evidence'][0]['quote']='The agency requires annual reporting for large operators.'
    assert citation_errors(c,[{**PASSAGE,'text':text}])==[]
    assert c['evidence'][0]['quote']==text
    c['evidence'][0]['quote']='The agency requires annual reporting for small operators.'
    assert citation_errors(c,[{**PASSAGE,'text':text}])
    c['evidence'][0]={'passage_id':'wrong','quote':text}
    assert citation_errors(c,[{**PASSAGE,'text':text}])


def test_all_prose_including_headline_needs_evidence():
    d=draft();assert validate_draft(d,{'passages':[PASSAGE]})==[]
    d['title']['evidence']=[]
    assert any(e.startswith('title:') for e in validate_draft(d,{'passages':[PASSAGE]}))


@pytest.mark.parametrize('mutation',[lambda r:r.update(status_correct=False),lambda r:r.update(material_omissions=['Missing exemption']),lambda r:r['claims'].pop(),lambda r:r['claims'].append(r['claims'][0]),lambda r:r['claims'][0].update(supported=False)])
def test_verifier_cannot_pass_with_missing_checks_or_contradictions(mutation):
    d=draft();r=report(d);assert verification_passes(r,d)
    mutation(r);assert not verification_passes(r,d)


def test_enacted_bill_requires_matching_text():
    with pytest.raises(EvidenceUnavailable,match='enrolled'):
        build_packet(None,'bill',{'law_enacted_date':'2026-09-01','texts':[{'type':'Introduced in House','date':'2026-01-01'}]})


def test_court_requires_lead_opinion():
    with pytest.raises(EvidenceUnavailable,match='Lead'):
        build_packet(None,'cluster',{'court':'scotus','opinions':[{'type':'040dissent'}]})


def test_fingerprint_is_order_independent_but_content_sensitive():
    assert fingerprint({'a':1,'b':2})==fingerprint({'b':2,'a':1})
    assert fingerprint({'a':1})!=fingerprint({'a':2})


class DB:
    def __init__(self): self.calls=[]
    def table(self,name): return self
    def select(self,*a): return self
    def eq(self,*a): return self
    def in_(self,*a): return self
    def order(self,*a,**kw): return self
    def limit(self,*a): return self
    def rpc(self,name,args): self.calls.append((name,deepcopy(args))); return self
    def execute(self): return SimpleNamespace(data=[])


class FakeAI:
    writer='writer';verifier='verifier'
    def __init__(self,db,job): self.stages=[]
    def call(self,stage,*args,**kwargs):
        self.stages.append(stage)
        if stage=='selection': return {'important':True,'new_development':True,'reason':'Consequential rule'}
        if stage=='extract': return {'facts':[claim()],'qualifications':['Small operators are exempt.']}
        if stage=='write': return draft()
        if stage=='verify': return report(draft())


def job():
    return {'id':1,'item_id':7,'item_type':'agency_document','source_type':'agency_document','source_metadata':{},'evidence':{'passages':[PASSAGE],'sources':[{'id':'source_1','label':'Federal Register','url':'https://www.federalregister.gov/d/example'}]}}


def test_complete_pipeline_verifies_without_publishing_and_persists_checkpoint():
    db=DB()
    assert process(db,job(),'lease',ai_factory=FakeAI)=='verified'
    assert any(name=='save_brief_work' and args['p_work'].get('extracted') for name,args in db.calls)
    finish=[args for name,args in db.calls if name=='finish_brief_job'][0]
    assert finish['p_verification']['passed'] and finish['p_verification']['deterministic_passed']
    assert finish['p_draft']['points'][0]['source_refs']==['source_1']
    assert not any(name=='publish_verified_brief' for name,args in db.calls)


def test_failed_independent_verification_repairs_twice_then_withholds():
    class RejectAI(FakeAI):
        def call(self,stage,*a,**kw):
            result=super().call(stage,*a,**kw)
            if stage=='verify': result.update(passed=False,material_omissions=['Scope was overstated'])
            return result
    ai=RejectAI(None,None);db=DB()
    assert process(db,job(),'lease',ai_factory=lambda *a:ai)=='withheld'
    assert ai.stages.count('write')==3
    assert ai.stages.count('verify')==3


def test_resume_reuses_completed_extractions():
    j=job();j['work']={'selection':{'important':True,'new_development':True,'reason':'Important'},'extracted':[{'passage_id':'s1','facts':[claim()],'qualifications':[]}]}
    ai=FakeAI(None,None)
    process(DB(),j,'lease',ai_factory=lambda *a:ai)
    assert 'selection' not in ai.stages and 'extract' not in ai.stages


def test_bad_extraction_gets_source_and_feedback_then_verifies():
    class RepairAI(FakeAI):
        def call(self,stage,instructions,payload,*a,**kw):
            result=super().call(stage,instructions,payload,*a,**kw)
            if stage=='extract':
                if self.stages.count('extract')==1:
                    result['facts'][0]['evidence'][0]['quote']='Invented quotation.'
                else:
                    assert payload['passage']==PASSAGE
                    assert 'does not match' in payload['feedback'][0]
                    assert payload['previous_extraction']['facts'][0]['evidence'][0]['quote']=='Invented quotation.'
            return result
    ai=RepairAI(None,None);db=DB()
    assert process(db,job(),'lease',ai_factory=lambda *a:ai)=='verified'
    assert ai.stages.count('extract')==2
    saved=[args['p_work'] for name,args in db.calls if name=='save_brief_work']
    assert 'extraction_repair' not in saved[-1]


def test_persistently_invalid_extraction_is_withheld_without_writing():
    class RejectAI(FakeAI):
        def call(self,stage,*a,**kw):
            result=super().call(stage,*a,**kw)
            if stage=='extract': result['facts'][0]['text']='It costs 999 dollars.'
            return result
    ai=RejectAI(None,None);db=DB()
    assert process(db,job(),'lease',ai_factory=lambda *a:ai)=='withheld'
    assert ai.stages.count('extract')==3
    assert 'write' not in ai.stages and 'verify' not in ai.stages
    finish=[args for name,args in db.calls if name=='finish_brief_job'][0]
    assert finish['p_status']=='withheld'
    assert not finish['p_verification']['deterministic_passed']


def test_extraction_repair_budget_survives_interruption():
    class InterruptedAI(FakeAI):
        def call(self,stage,*a,**kw):
            result=super().call(stage,*a,**kw)
            if stage=='extract':
                if self.stages.count('extract')==2: raise TimeoutError('interrupted')
                result['facts'][0]['evidence'][0]['quote']='Invented quotation.'
            return result
    db=DB();j=job()
    with pytest.raises(TimeoutError):
        process(db,j,'lease',ai_factory=InterruptedAI)
    j['work']=[args['p_work'] for name,args in db.calls if name=='save_brief_work'][-1]
    assert j['work']['extraction_repair']['attempts']==1
    ai=FakeAI(None,None)
    assert process(DB(),j,'new-lease',ai_factory=lambda *a:ai)=='verified'
    assert ai.stages.count('extract')==1


def test_extraction_transport_errors_still_fail_the_worker():
    class BrokenAI(FakeAI):
        def call(self,stage,*a,**kw):
            if stage=='extract': raise ConnectionError('upstream unavailable')
            return super().call(stage,*a,**kw)
    with pytest.raises(ConnectionError):
        process(DB(),job(),'lease',ai_factory=BrokenAI)


def test_health_alerts_when_sources_never_ran():
    overview={'sources':[{'source':'congress','last_success_at':None,'status':'idle'}],'source_errors':[],'oldest_waiting':None}
    assert 'congress' in problems(overview)[0]


def test_verification_interruption_resumes_exact_draft():
    class InterruptedAI(FakeAI):
        def call(self,stage,*a,**kw):
            if stage=='verify': raise ConnectionError('provider unavailable')
            return super().call(stage,*a,**kw)
    db=DB();j=job()
    with pytest.raises(ConnectionError): process(db,j,'lease',ai_factory=InterruptedAI)
    j['work']=[args['p_work'] for name,args in db.calls if name=='save_brief_work'][-1]
    assert j['work']['draft']==draft()
    ai=FakeAI(None,None)
    assert process(DB(),j,'lease',ai_factory=lambda *a:ai)=='verified'
    assert ai.stages==['verify']


def test_paused_publication_is_visible_in_health():
    overview={'sources':[],'settings':{'publication_enabled':False},'counts':{'verified':2}}
    assert any('Publication is paused' in p for p in problems(overview))


@pytest.mark.parametrize('enabled',[False,True])
def test_publication_drain_honors_pause_and_database_gates(enabled):
    calls=[]
    class Publisher:
        def rpc(self,name,args):
            calls.append(name)
            data={'brief_pipeline_overview':{'settings':{'publication_enabled':enabled,'daily_publication_limit':30},
                'counts':{'verified':2},'spending':{}},'publishable_brief_jobs':[{'id':1},{'id':2}],
                'publish_verified_brief':123 if args.get('p_job')==1 else None}[name]
            return SimpleNamespace(execute=lambda:SimpleNamespace(data=data))
    assert publish_ready(Publisher(),30)==(1 if enabled else 0)
    assert calls.count('publish_verified_brief')==(2 if enabled else 0)


def test_recovery_only_reuses_valid_next_passage_and_preserves_original():
    from recover_brief_extractions import recovered_work
    j=job()
    j['work']={'selection':{'important':True},'extraction_repair':{'passage_id':'s1','previous':{'facts':[claim()],'qualifications':[]}}}
    work=recovered_work(j)
    assert work['extracted'][0]['passage_id']=='s1'
    assert 'extraction_repair' not in work and 'extraction_repair' in j['work']
    j['work']['extraction_repair']['previous']['facts'][0]['evidence'][0]['quote']='Invented quotation.'
    assert recovered_work(j) is None
    j['work']['extraction_repair'].update(passage_id='wrong',previous={'facts':[claim()]})
    assert recovered_work(j) is None
