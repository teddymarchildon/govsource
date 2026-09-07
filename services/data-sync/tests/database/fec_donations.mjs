import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create table public.congressman(id bigint unique, bioguide_id text unique, primary key(id,bioguide_id));`);
await db.exec(readFileSync(new URL('../../../../apps/web/supabase/migrations/20260906235854_fec_committee_contributions.sql', import.meta.url), 'utf8'));
const scalar = async (sql, params=[]) => Object.values((await db.query(sql,params)).rows[0])[0];
const token='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const rec=(kind,key,data)=>({kind,key,data});
const candidate=rec('candidate','H8IN07184',{candidate_id:'H8IN07184',name:'Candidate',office:'H',state:'IN'});
const recipient=rec('committee','C00442921',{committee_id:'C00442921',name:'Campaign',committee_type:'H',designation:'P'});
const giver=rec('committee','C00108613',{committee_id:'C00108613',name:'Party',committee_type:'Y'});
const link=rec('link','H8IN07184:C00442921',{candidate_id:'H8IN07184',committee_id:'C00442921',designation:'P'});
const receipt=(id,amount,name='Reported party')=>rec('contribution',id,{sub_id:id,giving_committee_id:'C00108613',contributor_name:name,
  receiving_committee_id:'C00442921',amount,receipt_date:'2025-01-01',line_number:'11B',source_url:'https://docquery.fec.gov/example'});
const begin = (t=token, restart=false) => scalar("select begin_fec_sync(2026,$1,'all',$2)",[t,restart]);
const stage = (before,after,rows,t=token) => db.query('select stage_fec_page(2026,$1,$2,$3,$4)',[t,before,after,rows]);
const publish = () => scalar('select publish_fec_sync(2026,$1)',[token]);
let cp=await begin();
await assert.rejects(()=>begin(other),/already running/);
await stage(cp,cp,[candidate,recipient,giver,link,receipt('9999999999999999999','100.01')]);
assert.equal(await scalar('select count(*) from fec_committee_contribution'),0,'staging remains unpublished');
await assert.rejects(()=>publish(),/incomplete/);
await stage(cp,cp,[receipt('9999999999999999999','100.01')]);
await assert.rejects(()=>stage(cp,cp,[receipt('9999999999999999999','101.00')]),/changed during pagination/);
await assert.rejects(()=>stage({...cp,line:1},cp,[]),/checkpoint changed/);
await db.query("select finish_fec_sync(2026,$1,'partial')",[token]);
assert.deepEqual(await begin(),cp,'resume retains cursor and staging');
await stage(cp,{...cp,phase:'complete'},[receipt('2','-0.01','Alternate reported name')]);
assert.equal(await publish(),2);
assert.equal(await scalar('select total_amount from fec_group_candidate_totals'),'100.00','exact decimals, alias grouping and signed corrections');
assert.equal(await scalar('select count(*) from fec_group_candidate_totals'),1);
assert.ok(await scalar('select last_full_success_at from fec_sync_state'));

// A replacement removes obsolete rows instead of retaining deleted amendments.
cp=await begin();
await stage(cp,{...cp,phase:'complete'},[candidate,recipient,giver,link,receipt('3','50.00')]);
assert.equal(await publish(),1);
assert.equal(await scalar('select sub_id from fec_committee_contribution'),'3');
assert.equal(await scalar('select count(*) from private.fec_stage'),0);

// A broken replacement rolls back deletion and keeps the previous total visible.
cp=await begin();
await stage(cp,{...cp,phase:'complete'},[candidate,recipient,giver,link,rec('contribution','4',{...receipt('4','5.00').data,line_number:'12'})]);
await assert.rejects(()=>publish(),/check constraint/);
assert.equal(await scalar('select total_amount from fec_group_candidate_totals'),'50.00');
await db.query("select finish_fec_sync(2026,$1,'failed','validation')",[token]);
cp=await begin(token,true);
const second=rec('candidate','H2KS04099',{candidate_id:'H2KS04099',name:'Other candidate',office:'H'});
const otherLink=rec('link','H2KS04099:C00442921',{...link.data,candidate_id:'H2KS04099'});
await stage(cp,{...cp,phase:'complete'},[candidate,second,recipient,giver,link,otherLink,receipt('5','100')]);
await publish();
assert.equal(await scalar('select count(*) from fec_group_candidate_totals'),0,'ambiguous candidate mapping cannot double count');
assert.equal(await scalar('select count(*) from fec_committee_contribution'),1,'ambiguous receipt evidence retained');

// Missing candidates and expired workers cannot publish.
cp=await begin();
await stage(cp,{...cp,phase:'complete'},[recipient,giver,link,receipt('6','25')]);
assert.equal(await scalar('select candidate_id from fec_pending_candidates(2026)'),'H8IN07184');
await assert.rejects(()=>publish(),/Unresolved/);
await db.exec("update fec_sync_state set lease_until=now()-interval '1 minute'");
await begin(other);
await assert.rejects(()=>publish(),/lease lost/);
await assert.rejects(()=>stage(cp,cp,[]),/lease lost/);
await db.query("select finish_fec_sync(2026,$1,'partial')",[other]);
await assert.rejects(()=>scalar("select begin_fec_sync(2026,$1,'C00442921')",[token]),/another scope/);

// Public readers can inspect published contributions, but cannot import or see staging.
for (const role of ['anon','authenticated']) {
  assert.equal(await scalar("select has_function_privilege($1,'public.publish_fec_sync(integer,uuid)','execute')",[role]),false);
  assert.equal(await scalar("select has_table_privilege($1,'public.fec_sync_state','select')",[role]),false);
  assert.equal(await scalar("select has_table_privilege($1,'private.fec_stage','select')",[role]),false);
  await db.exec(`set role ${role}`);
  assert.equal(await scalar('select count(*) from fec_committee_contribution'),1);
  await assert.rejects(()=>db.exec('delete from fec_committee_contribution'),/permission denied/);
  await db.exec('reset role');
}
// Exercise import RPCs as the actual ETL role, not only the database owner.
await db.exec('set role service_role');
cp=await begin(token,true);
await stage(cp,{...cp,phase:'complete'},[]);
assert.equal(await publish(),0,'verified empty refresh can clear old data');
await db.exec('reset role');
await db.close();
console.log('FEC database checks passed');
