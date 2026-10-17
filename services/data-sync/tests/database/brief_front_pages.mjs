import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);`);
for (const file of ['20260820192741_replace_articles_with_briefs.sql', '20261017205830_brief_front_pages.sql']) {
  await db.exec(readFileSync(new URL(`../../../../apps/web/supabase/migrations/${file}`, import.meta.url), 'utf8'));
}
const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
assert.equal(await scalar('select count(*) from brief_front_page'), 6);
assert.equal(await scalar("select relrowsecurity from pg_class where oid='brief_front_page'::regclass"), true);
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(() => db.exec('select * from brief_front_page'), /permission denied/);
  await assert.rejects(() => db.exec("update brief_front_page set version=2 where section='home'"), /permission denied/);
  await db.exec('reset role');
}
await db.exec("insert into brief(id,title,primary_item_type,primary_item_id) values (1,'First','bill',1),(2,'Second','bill',2),(3,'Third','bill',3)");
await db.exec('set role service_role');
await db.exec("update brief_front_page set lead_brief_id=1,supporting_brief_id=2,secondary_brief_id=3,version=2 where section='home' and version=1");
assert.equal(await scalar("select lead_brief_id from brief_front_page where section='home'"), 1);
assert.equal(await scalar("select lead_brief_id from brief_front_page where section='courts'"), null);
await db.exec("update brief_front_page set lead_brief_id=3,secondary_brief_id=1,version=3 where section='home' and version=2");
assert.equal(await scalar("select lead_brief_id from brief_front_page where section='home'"), 3, 'reorder is atomic');
const stale = await db.query("update brief_front_page set lead_brief_id=null where section='home' and version=2 returning section");
assert.equal(stale.rows.length, 0, 'stale editor cannot overwrite changes');
await assert.rejects(() => db.exec("update brief_front_page set supporting_brief_id=3 where section='home'"), /check constraint/);
await assert.rejects(() => db.exec("update brief_front_page set lead_brief_id=999 where section='courts'"), /foreign key/);
await db.exec("update brief_front_page set lead_brief_id=3 where section='courts'");
await db.exec('reset role; delete from brief where id=3');
assert.equal(await scalar("select lead_brief_id from brief_front_page where section='home'"), null, 'deleted selections clear safely');
assert.equal(await scalar("select lead_brief_id from brief_front_page where section='courts'"), null);
await db.close();
console.log('Front-page database checks passed.');
