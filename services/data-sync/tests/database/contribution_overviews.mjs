import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create table public.congressman(id bigint primary key);`);
for (const file of ['20260820192741_replace_articles_with_briefs.sql', '20260906235854_fec_committee_contributions.sql', '20260920195644_fec_individual_contributions.sql', '20261011005959_contribution_overviews.sql', '20261011010041_contribution_views_read_only.sql']) {
  await db.exec(readFileSync(new URL(`../../../../apps/web/supabase/migrations/${file}`, import.meta.url), 'utf8'));
}
await db.exec(`insert into congressman values(1);
insert into fec_candidate(candidate_id,congressman_id,name,office) values('H8IN07184',1,'Candidate','H');
insert into fec_committee(committee_id,name) values('C00442921','Campaign');
insert into fec_candidate_committee values('H8IN07184','C00442921',2026,'P');
insert into fec_committee_contribution(cycle,sub_id,contributor_name,receiving_committee_id,amount,receipt_date,line_number,source_url)
values(2026,'1','PAC','C00442921',100.01,'2026-01-01','11B','https://www.fec.gov/'),
(2026,'2','PAC','C00442921',-0.01,'2026-01-02','11B','https://www.fec.gov/'),
(2026,'3','PAC','C00442921',25,null,'11C','https://www.fec.gov/');
insert into fec_individual_contribution(cycle,sub_id,contributor_name,receiving_committee_id,employer,amount,receipt_date,line_number,source_url)
values(2026,'1','Person','C00442921',' Example  Co ',3.25,'2026-01-01','11AI','https://www.fec.gov/');`);
const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
for (const view of ['fec_contribution_month_totals', 'fec_individual_receipts_normalized']) {
  assert.equal(await scalar(`select has_table_privilege('anon','public.${view}','INSERT')`), false);
  assert.equal(await scalar(`select has_table_privilege('authenticated','public.${view}','UPDATE')`), false);
}
assert.equal(await scalar("select total_amount from fec_contribution_month_totals where kind='committees' and month='2026-01-01'"), '100.00');
assert.equal(await scalar("select contribution_count from fec_contribution_month_totals where kind='committees' and month='2026-01-01'"), 2);
assert.equal(await scalar("select total_amount from fec_contribution_month_totals where month is null"), '25.00');
assert.equal(await scalar("select employer_normalized from fec_individual_receipts_normalized"), 'EXAMPLE CO');
await db.exec("set role anon");
assert.equal(await scalar("select total_amount from fec_contribution_month_totals where kind='individuals'"), '3.25');
await assert.rejects(() => db.exec("insert into brief(title,primary_item_type,primary_item_id,contribution_cycle) values('Unauthorized','campaign_finance',1,2026)"), /permission denied/);
await db.exec("reset role");
// Invoker views must respect removal of public access to underlying records.
await db.exec('drop policy public_read on fec_individual_contribution; set role anon');
assert.equal(await scalar("select count(*) from fec_contribution_month_totals where kind='individuals'"), 0);
assert.equal(await scalar('select count(*) from fec_individual_receipts_normalized'), 0);
await db.exec('reset role');
await db.exec("insert into brief(title,primary_item_type,primary_item_id,contribution_cycle) values('Overview','campaign_finance',1,2026)");
await assert.rejects(() => db.exec("insert into brief(title,primary_item_type,primary_item_id,contribution_cycle) values('Duplicate','campaign_finance',1,2026)"), /unique/);
for (const cycle of ['null','2025','1978']) await assert.rejects(() => db.exec(`insert into brief(title,primary_item_type,primary_item_id,contribution_cycle) values('Invalid','campaign_finance',2,${cycle})`), /check constraint/);
await db.exec('set role anon');
assert.equal(await scalar('select count(*) from brief'), 0, 'drafts remain private');
await db.exec('reset role');
await db.exec(`update brief set status='published',slug='overview',dek='Overview.',published_at=now(),points='[{"text":"A"},{"text":"B"},{"text":"C"}]'; set role anon;`);
assert.equal(await scalar('select count(*) from brief'), 1, 'published overview uses existing public policy');
await db.close();
console.log('Contribution overview database checks passed.');
