import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create table public.congressman(id bigint primary key);`);
const migrate = file => db.exec(readFileSync(new URL(`../../../../apps/web/supabase/migrations/${file}`, import.meta.url), 'utf8'));
for (const file of ['20260906235854_fec_committee_contributions.sql', '20260920195644_fec_individual_contributions.sql']) await migrate(file);
await db.exec(`insert into congressman values(1);
insert into fec_candidate(candidate_id,congressman_id,name,office) values('H8IN07184',1,'Candidate','H');
insert into fec_committee(committee_id,name) values('C00442921','Campaign'),('C00546358','Second campaign');
insert into fec_candidate_committee values('H8IN07184','C00442921',2026,'P'),('H8IN07184','C00546358',2026,'A');`);
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];

// Full-history snapshots are trimmed in place to the $1,000 scope; partial staging restarts.
await db.exec(`insert into fec_individual_contribution(cycle,receiving_committee_id,sub_id,contributor_name,amount,line_number,source_url) values
  (2026,'C00442921','1','Small',999.99,'11AI','https://docquery.fec.gov/x'),(2026,'C00442921','2','Large',1000,'11AI','https://docquery.fec.gov/x'),
  (2026,'C00442921','3','Larger',3300,'11AI','https://docquery.fec.gov/x'),(2026,'C00546358','4','Small',25,'11AI','https://docquery.fec.gov/x');
insert into fec_individual_coverage values(2026,'C00442921','2026-11-09',3,5299.99),(2026,'C00546358','2026-11-10',1,25);
insert into private.fec_individual_sync(cycle,committee_id,status,checkpoint) values(2026,'C00442921','partial','{"fetched":5}');
insert into private.fec_individual_stage values(2026,'C00442921','9','{}');`);
await migrate('20261123120000_large_individual_contributions.sql');
assert.deepEqual((await db.query('select committee_id,receipt_count::int n,total_amount::text t,min_amount::text m,last_success_at::date::text d from fec_individual_coverage order by 1')).rows,
  [{ committee_id: 'C00442921', n: 2, t: '4300.00', m: '1000.00', d: '2026-11-09' }, { committee_id: 'C00546358', n: 0, t: '0.00', m: '1000.00', d: '2026-11-10' }]);
assert.equal(await scalar('select count(*) from private.fec_individual_stage'), 0);
assert.equal(await scalar("select status from private.fec_individual_sync"), 'idle');
assert.equal(await scalar("select min_amount::text from fec_individual_import_queue where committee_id='C00442921'"), '1000.00');
await db.exec('delete from fec_individual_contribution; delete from fec_individual_coverage; delete from private.fec_individual_sync;');
const token = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const begin = (t = token) => scalar("select begin_fec_individual_sync(2026,'C00442921',$1)", [t]);
const stage = (before, after, rows) => db.query("select stage_fec_individual_page(2026,'C00442921',$1,$2,$3,$4)", [token, before, after, rows]);
const publish = () => scalar("select publish_fec_individual_sync(2026,'C00442921',$1)", [token]);
const finish = () => db.query("select finish_fec_individual_sync(2026,'C00442921',$1,'partial','budget')", [token]);
const done = c => ({ ...c, phase: 'complete', min_amount: 1000 });
const receipt = (id, amount, employer = 'Example  Co', occupation = 'Engineer') => ({ sub_id: id, receiving_committee_id: 'C00442921',
  contributor_name: 'Example Donor', employer, occupation, amount, line_number: '11AI', receipt_date: '2025-01-01', source_url: 'https://docquery.fec.gov/example' });
let cp = await begin();
await assert.rejects(() => begin(other), /already running/);
await stage(cp, cp, [receipt('9999999999999999999', '1100.01')]);
assert.equal(await scalar('select count(*) from fec_individual_contribution'), 0);
await assert.rejects(publish, /incomplete/);
await assert.rejects(() => stage(cp, cp, [receipt('9999999999999999999', '1200')]), /changed during pagination/);
await assert.rejects(() => stage({ ...cp, fetched: 99 }, cp, []), /checkpoint changed/);
await finish();
assert.deepEqual(await begin(), cp);
await stage(cp, { ...cp, phase: 'complete' }, [receipt('2', '1000.00', ' example co '), receipt('3', '1005.00', null, null)]);
await assert.rejects(publish, /threshold missing/);
await finish();
cp = await begin();
await stage(cp, done(cp), [receipt('2', '1000.00', ' example co '), receipt('3', '1005.00', null, null)]);
assert.equal(await publish(), 3);
assert.equal(await publish(), 3, 'publication retry is idempotent');
assert.equal(await scalar("select total_amount from fec_individual_group_totals where kind='employer' and label='EXAMPLE CO'"), '2100.01');
assert.equal(await scalar("select total_amount from fec_individual_group_totals where kind='occupation' and label is null"), '1005.00');
assert.equal(await scalar('select total_amount from fec_individual_coverage'), '3105.01');
assert.equal(await scalar('select min_amount from fec_individual_coverage'), '1000.00');
assert.equal(await scalar('select count(*) from private.fec_individual_stage'), 0);

// A failed replacement rolls back its deletes and preserves coverage and summaries.
cp = await begin();
await stage(cp, done(cp), [{ ...receipt('4', '2000'), line_number: '11B' }]);
await assert.rejects(publish, /check constraint/);
assert.equal(await scalar('select receipt_count from fec_individual_coverage'), 3);
assert.equal(await scalar('select count(*) from fec_individual_contribution'), 3);
await finish();
cp = await scalar("select begin_fec_individual_sync(2026,'C00442921',$1,true)", [token]);
await stage(cp, done(cp), [receipt('5', '999.99')]);
await assert.rejects(publish, /below import threshold/);
await finish();
cp = await scalar("select begin_fec_individual_sync(2026,'C00442921',$1,true)", [token]);
await stage(cp, done(cp), [receipt('5', '1050')]);
assert.equal(await publish(), 1, 'replacement removes superseded receipts');
assert.equal(await scalar('select total_amount from fec_individual_coverage'), '1050.00');

// Empty publication is a completed zero-record scan, distinct from absent coverage.
await scalar("select begin_fec_individual_sync(2026,'C00546358',$1)", [other]);
const secondCp = await scalar("select checkpoint from private.fec_individual_sync where committee_id='C00546358'");
await db.query("select stage_fec_individual_page(2026,'C00546358',$1,$2,$3,'[]')", [other, secondCp, done(secondCp)]);
assert.equal(await scalar("select publish_fec_individual_sync(2026,'C00546358',$1)", [other]), 0);
assert.equal(await scalar('select count(*) from fec_individual_coverage'), 2);

for (const role of ['anon', 'authenticated']) {
  assert.equal(await scalar("select has_function_privilege($1,'public.begin_fec_individual_sync(integer,text,uuid,boolean)','execute')", [role]), false);
  assert.equal(await scalar("select has_table_privilege($1,'private.fec_individual_stage','select')", [role]), false);
  assert.equal(await scalar("select has_table_privilege($1,'public.fec_individual_import_queue','select')", [role]), false);
  await db.exec(`set role ${role}`);
  assert.equal(await scalar('select count(*) from fec_individual_group_totals'), 2);
  await assert.rejects(() => db.exec("delete from fec_individual_contribution"), /permission denied/);
  await db.exec('reset role');
}
cp = await begin();
await db.exec("update private.fec_individual_sync set lease_until=now()-interval '1 minute'");
await assert.rejects(publish, /lease lost/);
await begin(other);
await assert.rejects(() => stage(cp, cp, []), /lease lost/);
await db.close();
console.log('FEC individual database checks passed');
