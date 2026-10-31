// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const root=fileURLToPath(new URL('../../../../',import.meta.url));
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create table public.bill(id bigint primary key,title text,congress int,number int,type text,law_enacted_date date,created_at timestamptz,updated_at timestamp);
create table public.bill_text(id bigint primary key,bill_id bigint,date date,type text,html_file_path text,created_at timestamptz,updated_at timestamp);
create table public.bill_action(id bigint primary key,bill_id bigint,date date,text text,created_at timestamptz,updated_at timestamp);
create table public.bill_summary(id bigint primary key,bill bigint,date date,text text,created_at timestamptz);
create table public.agency_document(id bigint primary key,title text,subtype text,created_at timestamptz,updated_at timestamp);
create table public.court(id bigint primary key,remote_id text);
create table public.cluster(id bigint primary key,court_id bigint,case_name text,created_at timestamptz,updated_at timestamp);
create table public.court_opinion(id bigint primary key,cluster_id bigint,type text,created_at timestamptz,updated_at timestamp);
`);
await db.exec(readFileSync(root+'apps/web/supabase/migrations/20260820192741_replace_articles_with_briefs.sql','utf8'));
await db.exec(readFileSync(root+'apps/web/supabase/migrations/20260906223838_continuous_brief_pipeline.sql','utf8'));
await db.exec(readFileSync(root+'apps/web/supabase/migrations/20260906224831_brief_source_refresh_tracking.sql','utf8'));
await db.exec(readFileSync(root+'apps/web/supabase/migrations/20260919165433_resilient_brief_processing.sql','utf8'));
await db.exec(readFileSync(root+'apps/web/supabase/migrations/20261011003652_actionable_brief_queue_health.sql','utf8'));
await db.exec(readFileSync(root+'apps/web/supabase/migrations/20261018203900_fair_brief_queue.sql','utf8'));
const scalar=async (sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
const token='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
await db.exec("insert into bill(id,title) values (1,'Example bill');");
assert.equal(await scalar('select revision from brief_source_change'),1);
await db.exec("update bill set updated_at=now() where id=1");
assert.equal(await scalar('select revision from brief_source_change'),1,'timestamps do not create developments');
assert.equal(await scalar("select begin_brief_source_run('congress',$1)",[token]),true);
assert.equal(await scalar("select begin_brief_source_run('congress',$1)",[other]),false);
await db.query("select end_brief_source_run('congress',$1,true)",[token]);
const meta=await scalar("select brief_source_bundle('bill',1)");
const packet={sources:[{id:'source_1',label:'Source',url:'https://example.gov/1'}],passages:[{id:'section_1',text:'Example source evidence.'}]};
const enqueue=async (fp='fp1',revision=1,metadata=meta,dev='development1')=>scalar("select enqueue_brief_job('bill',1,$1,$2,$3,'bill',$4,$5,90)",[revision,fp,dev,metadata,packet]);
const id=await enqueue();
assert.equal(await enqueue(),id,'idempotent discovery');
await db.query('select claim_brief_job($1)',[token]);
assert.equal((await db.query('select * from claim_brief_job($1)',[other])).rows.length,0,'exclusive claim');
await assert.rejects(()=>db.query("select finish_brief_job($1,$2,'verified','reason')",[id,token]),/Verification required/);
const draft={title:'Example headline',slug:'example-brief-1',dek:'A complete sentence.',points:[1,2,3].map(i=>({id:`point_${i}`,text:'Supported factual point.',source_refs:['source_1']})),context_markdown:'',policy_areas:['Government'],sources:packet.sources};
await db.query("select finish_brief_job($1,$2,'verified','Important',$3,$4,'writer','verifier','v1')",[id,token,draft,{passed:true,deterministic_passed:true}]);
assert.equal(await scalar('select publish_verified_brief($1)',[id]),null,'publication starts paused');
await db.exec('update brief_pipeline_settings set publication_enabled=true');
const published=await scalar('select publish_verified_brief($1)',[id]);
assert.ok(published);
assert.equal(await scalar('select publish_verified_brief($1)',[id]),published,'publication retry is idempotent');
await db.exec("update brief set title='Editor correction',auto_generated=false where id=1");
assert.equal(await scalar("select content->>'title' from brief_revision where brief_id=1"),'Example headline','revision history preserves old content');
await db.exec("update bill set title='A changed bill' where id=1");
const meta2=await scalar("select brief_source_bundle('bill',1)");
const id2=await enqueue('fp2',2,meta2);
await db.query('select claim_brief_job($1)',[token]);
await db.query("select finish_brief_job($1,$2,'verified','Important',$3,$4)",[id2,token,{...draft,slug:'example-brief-2'},{passed:true,deterministic_passed:true}]);
assert.equal(await scalar('select publish_verified_brief($1)',[id2]),null,'same development cannot duplicate existing coverage');
assert.equal(await scalar('select title from brief where id=1'),'Editor correction');
const id3=await enqueue('fp3',2,meta2,'development2');
await db.query('select claim_brief_job($1)',[token]);
await db.query("select finish_brief_job($1,$2,'verified','Important',$3,$4)",[id3,token,{...draft,slug:'example-brief-3'},{passed:true,deterministic_passed:true}]);
await db.exec("update bill set title='Changed during verification' where id=1");
assert.equal(await scalar('select publish_verified_brief($1)',[id3]),null,'source changes invalidate publication');
await db.query("select reserve_brief_api_call($1,'model','write',4)",[id]);
await assert.rejects(()=>db.query("select reserve_brief_api_call($1,'model','write',2)",[id]),/budget exhausted/);
assert.equal(await scalar("select reserve_brief_upstream_request('courtlistener',1)"),true);
assert.equal(await scalar("select reserve_brief_upstream_request('courtlistener',1)"),false);
assert.equal(await scalar("select has_function_privilege('anon','public.publish_verified_brief(bigint)','execute')"),false);
assert.equal(await scalar("select has_table_privilege('authenticated','public.brief_job','select')"),false);
assert.ok(await scalar('select brief_pipeline_overview()'));
// Expired workers can be reclaimed; a stale owner cannot finish the replacement's work.
await db.exec("insert into bill(id,title) values(2,'Second bill')");
const m2=await scalar("select brief_source_bundle('bill',2)");
const recover=await scalar("select enqueue_brief_job('bill',2,1,'recover','recover','bill',$1,$2,100)",[m2,packet]);
await db.query('select claim_brief_job($1)',[token]);
await db.exec("update brief_job set lease_until=now()-interval '1 minute' where id="+recover);
const reclaimed=(await db.query('select * from claim_brief_job($1)',[other])).rows[0];
assert.equal(reclaimed.id,recover);
await assert.rejects(()=>db.query("select finish_brief_job($1,$2,'skipped','stale worker')",[recover,token]),/lease lost/);
await db.query("select defer_brief_budget($1,$2,false)",[recover,other]);
assert.equal(await scalar('select attempts from brief_job where id=$1',[recover]),1);
// A clean automated correction keeps its URL and leaves a revision trail.
await db.exec("insert into bill(id,title) values(3,'Third bill')");
const m3=await scalar("select brief_source_bundle('bill',3)");
const first=await scalar("select enqueue_brief_job('bill',3,1,'third1','third','bill',$1,$2,100)",[m3,packet]);
await db.query('select claim_brief_job($1)',[token]);
await db.query("select finish_brief_job($1,$2,'verified','Important',$3,$4)",[first,token,{...draft,slug:'third-brief'},{passed:true,deterministic_passed:true}]);
const thirdBrief=await scalar('select publish_verified_brief($1)',[first]);
await db.exec("update bill set title='Third bill corrected' where id=3");
const m4=await scalar("select brief_source_bundle('bill',3)");
const correction=await scalar("select enqueue_brief_job('bill',3,2,'third2','third','bill',$1,$2,100)",[m4,packet]);
await db.query('select claim_brief_job($1)',[token]);
await db.query("select finish_brief_job($1,$2,'verified','Correction',$3,$4)",[correction,token,{...draft,title:'Corrected account',slug:'unused-new-slug'},{passed:true,deterministic_passed:true}]);
assert.equal(await scalar('select publish_verified_brief($1)',[correction]),thirdBrief);
assert.equal(await scalar('select slug from brief where id=$1',[thirdBrief]),'third-brief');
assert.equal(await scalar('select count(*) from brief_revision where brief_id=$1',[thirdBrief]),1);
await db.query("select note_brief_source_refresh('bill',3)");
assert.equal(await scalar("select revision from brief_source_change where item_type='bill' and item_id=3"),3);
// A failed or active unrelated source run no longer prevents valid packets.
await db.exec("update brief_source_run set status='failed' where source='congress'; insert into bill(id,title) values(4,'Independent bill')");
const m5=await scalar("select brief_source_bundle('bill',4)");
const independent=await scalar("select enqueue_brief_job('bill',4,1,'independent','independent','bill',$1,$2,100)",[m5,packet]);
await db.exec("update brief_job set status='withheld' where id<>"+independent+" and status in ('pending','retry','processing')");
assert.equal((await db.query('select * from claim_brief_job($1)',[token])).rows[0].id,independent);
await db.query("select finish_brief_job($1,$2,'verified','Important',$3,$4)",[independent,token,{...draft,slug:'independent-brief'},{passed:true,deterministic_passed:true}]);
assert.ok(await scalar('select publish_verified_brief($1)',[independent]));

// Historical work is retained but cannot take current-news slots.
await db.exec("insert into bill(id,title) values(5,'Historical bill'); update brief_source_run set status='running' where source='congress'");
const m6=await scalar("select brief_source_bundle('bill',5)");
const historical=await scalar("select enqueue_brief_job('bill',5,1,'old','old','bill',$1,$2,100)",[m6,packet]);
await db.exec("update brief_job set development_date=current_date-365 where id="+historical);
assert.equal((await db.query('select * from claim_brief_job($1)',[token])).rows.length,0);
assert.equal((await db.query("select * from claim_brief_job($1,'backfill')",[token])).rows[0].id,historical);
assert.equal(await scalar("select has_function_privilege('anon','public.claim_brief_job(uuid,text)','execute')"),false);

// Waiting/review items wake up only when their source changes.
await db.exec("insert into bill(id,title) values(6,'Oversized bill'); update brief_source_change set error_kind='review',error='oversized' where item_id=6 and item_type='bill'");
assert.equal(await scalar("select count(*) from pending_brief_source_changes(100) where item_id=6"),0);
await db.exec("update bill set title='Updated oversized bill' where id=6");
assert.equal(await scalar("select count(*) from pending_brief_source_changes(100) where item_id=6"),1);
assert.equal(await scalar("select brief_pipeline_overview()->>'backfill_waiting'"),'1');
console.log('PASS: migration, change tracking, source locks, duplicate discovery, exclusive claims, verification gate, pause, atomic/idempotent publication, revisions, editor protection, stale evidence, budgets, and permissions');

// Health and claiming agree, while total waiting counts remain available to the UI.
await db.exec(`
 update brief_job set status='withheld' where status in ('pending','retry','processing');
 alter table bill add column sync_pending boolean default false;
 insert into bill(id,title) values(100,'Queue health fixture');
`);
const healthMeta=await scalar("select brief_source_bundle('bill',100)");
const healthId=await scalar("select enqueue_brief_job('bill',100,1,'health','health','bill',$1,$2,100)",[healthMeta,packet]);
await db.query("update brief_job set created_at=now()-interval '2 days',development_date=current_date where id=$1",[healthId]);
for (const [label, mutation, blocker, eligible] of [
 ['ready', '', null, true],
 ['changed source', "update brief_source_change set revision=2 where item_type='bill' and item_id=100", 'source_changed', false],
 ['missing source', "delete from brief_source_change where item_type='bill' and item_id=100", 'missing_source', false],
 ['source incomplete', "update bill set sync_pending=true where id=100; update brief_source_change set revision=1 where item_type='bill' and item_id=100", 'source_not_ready', false],
 ['future retry', "update brief_job set status='retry',next_attempt_at=now()+interval '1 hour' where id="+healthId, 'retry_scheduled', false],
 ['active final attempt', "update brief_job set status='processing',attempts=3,lease_until=now()+interval '5 minutes' where id="+healthId, 'active_worker', false],
 ['expired lease', "update brief_job set status='processing',attempts=1,lease_until=now()-interval '1 minute' where id="+healthId, null, true],
 ['exhausted retry', "update brief_job set status='retry',attempts=3 where id="+healthId, 'attempts_exhausted', false],
 ['exhausted expired worker', "update brief_job set status='processing',attempts=3,lease_until=now()-interval '1 minute' where id="+healthId, 'attempts_exhausted', false],
 ['missing lease', "update brief_job set status='processing',attempts=1,lease_until=null where id="+healthId, 'missing_lease', false],
]) {
 await db.exec('begin');
 if (mutation) await db.exec(mutation);
 const health=await scalar('select brief_pipeline_overview()');
 assert.equal(health.current_waiting,1,label);
 assert.equal(health.eligible_current_waiting,eligible ? 1 : 0,label);
 assert.equal(health.oldest_eligible_current_job,eligible ? healthId : null,label);
 assert.equal(health.oldest_eligible_current_waiting!==null,eligible,label);
 if (blocker) {
   assert.equal(health.blocked_current_counts[blocker],1,label);
   assert.equal(health.blocked_current_jobs[0].id,healthId,label);
   assert.equal(health.blocked_current_jobs[0].blocker,blocker,label);
 }
 if (label.includes('expired')) assert.equal(health.expired_current_leases,1,label);
 const claimed=(await db.query("select * from claim_brief_job($1,'current')",[token])).rows;
 assert.equal(claimed.length,eligible ? 1 : 0,label);
 if (eligible) assert.equal(claimed[0].id,healthId,label);
 await db.exec('rollback');
}
await db.query('update brief_job set development_date=current_date-365 where id=$1',[healthId]);
assert.equal((await scalar('select brief_pipeline_overview()')).eligible_current_waiting,0,'backfill excluded');
assert.equal((await db.query("select * from claim_brief_job($1,'backfill')",[token])).rows[0].id,healthId);
assert.equal(await scalar("select has_function_privilege('anon','public.brief_job_blocker(public.brief_job,bigint,boolean)','execute')"),false);
assert.equal(await scalar("select has_function_privilege('authenticated','public.brief_job_blocker(public.brief_job,bigint,boolean)','execute')"),false);
assert.equal(await scalar("select has_function_privilege('service_role','public.brief_job_blocker(public.brief_job,bigint,boolean)','execute')"),true);
console.log('PASS: queue health matches worker eligibility, blocked diagnostics, expired/exhausted workers, backfill, and permissions');
// Overdue low-priority work cannot be overtaken by fresh urgent work.
await db.exec(`
 update brief_job set status='withheld' where status in ('pending','retry','processing');
 insert into bill(id,title) values(101,'Old notice'),(102,'Fresh urgent development'),(103,'Newer overdue development');
`);
const fairIds=[];
for (const [id,priority] of [[101,30],[102,95],[103,70]]) {
 const metadata=await scalar("select brief_source_bundle('bill',$1)",[id]);
 fairIds.push(await scalar("select enqueue_brief_job('bill',$1,1,$2,$2,'bill',$3,$4,$5)",[id,'fair-'+id,metadata,packet,priority]));
}
await db.query("update brief_job set created_at=now()-interval '3 days' where id=$1",[fairIds[0]]);
await db.query("update brief_job set created_at=now()-interval '2 days' where id=$1",[fairIds[2]]);
for (const expected of [fairIds[0],fairIds[2],fairIds[1]]) {
 const claimed=(await db.query("select * from claim_brief_job($1,'current')",[token])).rows[0];
 assert.equal(claimed.id,expected,'overdue FIFO before fresh priority');
}
// With no overdue work, urgency still wins; active leases stay exclusive.
await db.query("update brief_job set status='pending',created_at=now(),lease_until=null,lease_token=null where id=any($1)",[fairIds]);
assert.equal((await db.query("select * from claim_brief_job($1,'current')",[token])).rows[0].id,fairIds[1]);
assert.equal((await db.query("select * from claim_brief_job($1,'current')",[other])).rows[0].id,fairIds[2]);
assert.equal(await scalar("select has_function_privilege('anon','public.claim_brief_job(uuid,text)','execute')"),false);
await db.query('select defer_brief_budget($1,$2)',[fairIds[1],token]);
const budgetHealth=await scalar('select brief_pipeline_overview()');
assert.equal(budgetHealth.budget_deferred_current,1);
assert.ok(new Date(budgetHealth.budget_resets_at)>new Date());
assert.equal(budgetHealth.current_waiting,3,'budget deferrals remain visible');
console.log('PASS: overdue FIFO, fresh editorial priority, and exclusive leases');
// New editorial policy is tested after the legacy behavior checks above.
await db.exec(readFileSync(root+'apps/web/supabase/migrations/20261031182351_selective_editorial_briefs.sql','utf8'));
assert.equal(await scalar('select editorial_review_required from brief_pipeline_settings'),true);
assert.equal(await scalar('select daily_draft_limit from brief_pipeline_settings'),5);
await db.exec("update brief_job set status='withheld' where status in ('pending','retry','processing')");
await db.exec("insert into bill(id,title) values(201,'Reviewed development'),(202,'Another development')");
const reviewMeta=await scalar("select brief_source_bundle('bill',201)");
const reviewJob=await scalar("select enqueue_brief_job('bill',201,1,'review201','review201','bill',$1,$2,95)",[reviewMeta,packet]);
await db.query("select claim_brief_job($1,'current')",[token]);
await db.query("select finish_brief_job($1,$2,'verified','Consequential',$3,$4)",[reviewJob,token,{...draft,slug:'reviewed-development',context_markdown:'Source-supported context.'},{passed:true,deterministic_passed:true}]);
await db.exec('update brief_pipeline_settings set publication_enabled=true');
assert.equal(await scalar('select publish_verified_brief($1)',[reviewJob]),null,'automatic publication cannot bypass editorial review');
const reviewBrief=await scalar('select stage_verified_brief($1)',[reviewJob]);
assert.ok(reviewBrief);
assert.equal(await scalar('select status from brief where id=$1',[reviewBrief]),'review');
assert.equal(await scalar('select published_at from brief where id=$1',[reviewBrief]),null);
assert.equal(await scalar('select stage_verified_brief($1)',[reviewJob]),reviewBrief,'staging is retry-safe');
assert.equal(await scalar('select count(*) from publishable_brief_jobs(100) where id=$1',[reviewJob]),0,'staged jobs leave the delivery queue');
assert.equal(await scalar("select has_function_privilege('anon','public.stage_verified_brief(bigint)','execute')"),false);
assert.equal(await scalar("select has_function_privilege('service_role','public.stage_verified_brief(bigint)','execute')"),true);
await db.exec('delete from brief_api_call; update brief_pipeline_settings set daily_draft_limit=1,daily_budget_usd=100');
await db.query("select reserve_brief_api_call($1,'model','extract',0.01)",[reviewJob]);
await db.query("select reserve_brief_api_call($1,'model','verify',0.01)",[reviewJob]);
await db.query("select reserve_brief_api_call($1,'model','selection',0.01)",[id]);
await assert.rejects(()=>db.query("select reserve_brief_api_call($1,'model','extract',0.01)",[id]),/daily draft limit/);
await db.exec("update brief_api_call set budget_day=current_date-1");
await db.query("select reserve_brief_api_call($1,'model','extract',0.01)",[id]);
await db.query("update brief_job set status='pending',attempts=0,next_attempt_at=now(),lease_token=null,lease_until=null where id=any($1)",[fairIds]);
await db.query("update brief_job set created_at=now()-interval '30 days' where id=$1",[fairIds[0]]);
assert.equal((await db.query("select * from claim_brief_job($1,'current')",[token])).rows[0].id,fairIds[1],'important fresh work outranks old routine work');
console.log('PASS: editorial review, idempotent staging, permissions, daily draft reservations and importance ranking');
// Reader-value gating also applies to old verified results and future auto-publication.
await db.exec("update brief_job set status='withheld' where status in ('pending','retry','processing')");
await db.exec("insert into bill(id,title) values(301,'Legacy thin result')");
const qualityMeta=await scalar("select brief_source_bundle('bill',301)");
const qualityJob=await scalar("select enqueue_brief_job('bill',301,1,'quality301','quality301','bill',$1,$2,95)",[qualityMeta,packet]);
await db.query("select claim_brief_job($1,'current')",[token]);
await db.query("select finish_brief_job($1,$2,'verified','Old factual-only result',$3,$4)",[qualityJob,token,{...draft,slug:'quality-301'},{passed:true,deterministic_passed:true}]);
await db.exec(readFileSync(root+'apps/web/supabase/migrations/20261031192854_reader_value_brief_gate.sql','utf8'));
assert.equal(await scalar('select status from brief_job where id=$1',[qualityJob]),'retry','legacy verified work is re-screened');
assert.equal(await scalar('select stage_verified_brief($1)',[reviewJob]),reviewBrief,'existing editor drafts are preserved');
assert.equal(await scalar('select count(*) from brief_attempt where job_id=$1',[qualityJob]),1,'paid attempt remains available');
const quality={passed:true,reader_value:true,adds_explanation:true,context_not_metadata:true,paraphrases_sources:true,timing_clear:true,issues:[]};
for (const bad of [null,{}, {...quality, adds_explanation:false},{...quality,issues:['Only metadata']}]) {
 assert.equal(await scalar('select brief_editorial_quality_passes($1)',[bad]),false);
}
assert.equal(await scalar('select brief_editorial_quality_passes($1)',[quality]),true);
assert.equal(await scalar("select has_function_privilege('anon','public.brief_editorial_quality_passes(jsonb)','execute')"),false);
await db.query("select claim_brief_job($1,'current')",[token]);
await db.query("select finish_brief_job($1,$2,'verified','Thin but accurate',$3,$4)",[qualityJob,token,{...draft,slug:'quality-301'},{passed:true,deterministic_passed:true,editorial_quality:{...quality,adds_explanation:false}}]);
assert.equal(await scalar('select stage_verified_brief($1)',[qualityJob]),null,'thin drafts never reach editorial review');
await db.exec('update brief_pipeline_settings set editorial_review_required=false,publication_enabled=true');
await db.query("select claim_brief_job($1,'current')",[token]);
await db.query("select finish_brief_job($1,$2,'verified','Thin but accurate',$3,$4)",[qualityJob,token,{...draft,slug:'quality-301'},{passed:true,deterministic_passed:true}]);
assert.equal(await scalar('select publish_verified_brief($1)',[qualityJob]),null,'auto-publication cannot bypass the quality gate');
await db.exec('update brief_pipeline_settings set editorial_review_required=true,publication_enabled=false');
await db.query("select claim_brief_job($1,'current')",[token]);
await db.query("select finish_brief_job($1,$2,'verified','Useful explanation',$3,$4)",[qualityJob,token,{...draft,slug:'quality-301',context_markdown:'Supported explanation of practical scope and limits.'},{passed:true,deterministic_passed:true,editorial_quality:quality}]);
const qualityBrief=await scalar('select stage_verified_brief($1)',[qualityJob]);
assert.ok(qualityBrief);
assert.equal(await scalar('select author_name from brief where id=$1',[qualityBrief]),'GovSource Briefs');
assert.equal(await scalar('select status from brief where id=$1',[qualityBrief]),'review');
console.log('PASS: legacy re-screening, editorial-quality gates, preserved drafts, and no automatic publication');
await db.close();
