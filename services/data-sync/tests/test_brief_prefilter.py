from copy import deepcopy
from types import SimpleNamespace
import pytest
from brief_prefilter import prefilter_reason
from process_briefs import process


def notice(title, body, kind='Notice'):
    return {'id':1,'item_id':2,'source_type':'agency_document','item_type':'agency_document',
        'source_metadata':{'title':title,'type':kind},'work':{},
        'evidence':{'sources':[{'id':'source_1','label':title,'url':'https://example.gov/document'}],
            'passages':[{'id':'section_1','source_id':'source_1','text':body}]}}


def renewal(body='This is an extension, without change, of a currently approved collection of information.'):
    return notice('Agency Information Collection Activities',body)


def bill(actions=None):
    j=notice('A bill','The bill establishes a national grant program with annual reporting requirements.')
    j.update(source_type='bill',item_type='bill')
    j['source_metadata']={'actions':[{'text':a} for a in (actions or ['Introduced in Senate.','Read twice and referred to the Committee on Finance.'])],
        'texts':[{'type':'Introduced in Senate'}]}
    return j


def test_explicit_unchanged_paperwork_renewal():
    assert 'without change' in prefilter_reason(renewal())
    assert prefilter_reason(renewal('The agency proposes renewal, without change, of the existing information collection.'))


@pytest.mark.parametrize('body',[
    'The agency seeks comment on a new information collection.',
    'Extension without change of collection A and revision of collection B.',
    'A court vacated the rule. Extension without change of collection A is requested.',
    'The agency proposes reinstatement and extension of the prior collection.',
    'The agency proposes an extension of the comment deadline for new requirements.',
])
def test_keep_new_mixed_and_changed_paperwork(body):
    assert prefilter_reason(renewal(body)) is None


@pytest.mark.parametrize('kind',['Rule','Proposed Rule','Presidential Document'])
def test_never_filter_rules_or_presidential_documents(kind):
    j=renewal();j['source_metadata']['type']=kind
    assert prefilter_reason(j) is None


def test_closed_grant_review_only():
    j=notice('National Institutes of Health; Notice of Closed Meeting',
        'This meeting is closed to the public. The purpose is to review and evaluate grant applications.')
    assert prefilter_reason(j)
    j['evidence']['passages'][0]['text']+=' The committee will discuss a policy change to grant eligibility.'
    assert prefilter_reason(j) is None


@pytest.mark.parametrize('title,body',[
    ('Notice of Public Meeting','The committee will discuss new housing standards.'),
    ('Notice of Closed Meeting','The board will vote on a proposed regulation.'),
    ('Public Scoping Meetings','Comments are requested on the environmental impacts of a proposed launch site.'),
    ('Notice of Meeting','Public comments are requested on the new master plan.'),
    ('Changes in Flood Hazard Determinations','The agency issues new flood hazard maps.'),
    ('Notice of OFAC Sanctions Action','The agency designates blocked persons.'),
    ('Notice of Grant Awards','The agency awards funding to local communities.'),
])
def test_meaningful_notices_pass_through(title,body):
    assert prefilter_reason(notice(title,body)) is None


def test_introductions_only_and_entire_history():
    assert prefilter_reason(bill())
    for action in ['Passed House.','Committee hearings held.','Ordered to be reported with an amendment.','Discharged from committee.','Unknown legislative action.']:
        assert prefilter_reason(bill([action,'Referred to the Committee on Finance.'])) is None
    j=bill();j['source_metadata']['texts'].append({'type':'Engrossed in House'})
    assert prefilter_reason(j) is None
    j=bill();j['source_metadata']['law_number']='119-1'
    assert prefilter_reason(j) is None


@pytest.mark.parametrize('field,value',[('actions',[]),('texts',[]),('sync_pending',True),('sync_missing_fields',['actions'])])
def test_incomplete_bill_metadata_passes_through(field,value):
    j=bill();j['source_metadata'][field]=value
    assert prefilter_reason(j) is None


def test_saved_work_coverage_and_invalid_evidence_are_preserved():
    assert prefilter_reason(renewal(),has_previous=True) is None
    for field,value in [('work',{'selection':{'important':True}}),('brief_id',42),('draft',{'title':'Existing draft'}),('evidence',{})]:
        j=renewal();j[field]=value
        assert prefilter_reason(j) is None
    j=renewal();j['source_type']='cluster'
    assert prefilter_reason(j) is None


def test_filtered_item_never_initializes_ai_and_records_reason():
    calls=[]
    class DB:
        def table(self,*args): return self
        def select(self,*args): return self
        def eq(self,*args): return self
        def in_(self,*args): return self
        def order(self,*args,**kwargs): return self
        def limit(self,*args): return self
        def execute(self): return SimpleNamespace(data=[])
        def rpc(self,name,args):
            calls.append((name,args));return self
    def forbidden(*args): raise AssertionError('Filtered content must not spend AI budget')
    assert process(DB(),renewal(),'lease',ai_factory=forbidden)=='skipped'
    assert calls[-1][0]=='finish_brief_job'
    assert calls[-1][1]['p_reason'].startswith('Prefilter routine-v1:')
    assert calls[-1][1]['p_draft'] is None


@pytest.mark.parametrize('apply,conflict,expected',[(False,False,0),(True,False,1),(True,True,0)])
def test_queue_sweep_dry_run_and_concurrent_worker_protection(apply,conflict,expected):
    from brief_prefilter import filter_queue
    j=renewal();j.update(status='retry',source_revision=2,updated_at='2026-10-18T01:00:00Z')
    # First job needs AI; it must not block free filtering of later jobs.
    keep=notice('New safety standards','The agency proposes consequential safety requirements.')
    keep['id']=0
    class Query:
        def __init__(self,db,table): self.db,self.table,self.filters,self.payload=db,table,[],None
        def select(self,*a): return self
        def in_(self,*a): return self
        def gt(self,*a): return self
        def order(self,*a): return self
        def limit(self,*a): return self
        def or_(self,*a): return self
        def lt(self,*a): return self
        def eq(self,*a): self.filters.append(a);return self
        def update(self,payload): self.payload=payload;return self
        def execute(self):
            if self.table=='brief': return SimpleNamespace(data=[])
            if self.payload:
                self.db.writes.append(self)
                return SimpleNamespace(data=[] if conflict else [j])
            self.db.reads+=1
            return SimpleNamespace(data=[keep,j] if self.db.reads==1 else [])
    class DB:
        reads=0
        def __init__(self): self.writes=[]
        def table(self,name): return Query(self,name)
    db=DB();result=filter_queue(db,apply=apply)
    assert result['scanned']==2 and result['matched']==1 and result['skipped']==expected
    assert len(db.writes)==int(apply)
    if apply:
        assert ('status','retry') in db.writes[0].filters
        assert ('updated_at',j['updated_at']) in db.writes[0].filters
        assert ('source_revision',2) in db.writes[0].filters
        assert db.writes[0].payload['status']=='skipped'


def test_optional_missing_summaries_do_not_prevent_introduction_filter():
    j=bill();j['source_metadata']['sync_missing_fields']=['summaries','cosponsors']
    assert prefilter_reason(j)


def test_free_sweep_respects_run_deadline():
    from brief_prefilter import filter_queue
    assert filter_queue(None,deadline=0)['incomplete'] is True
