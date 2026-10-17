import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const reader = '00000000-0000-4000-8000-000000000002';
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
insert into auth.users values('${owner}','ted.marchildon@gmail.com',now()),('${reader}','reader@example.com',now());
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`);
const folder = new URL('../../../../apps/web/supabase/migrations/', import.meta.url);
const migration = readdirSync(folder).find(name => name.endsWith('_admin_users.sql'));
await db.exec(readFileSync(new URL(migration, folder), 'utf8'));
const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
assert.equal(await scalar('select count(*) from admin_user'), 1);
assert.equal(await scalar('select user_id from admin_user'), owner);
assert.equal(await scalar("select relrowsecurity from pg_class where oid='admin_user'::regclass"), true);
for (const role of ['anon', 'authenticated', 'service_role']) {
  await db.exec(`set role ${role}`);
  if (role === 'service_role') assert.equal(await scalar('select count(*) from admin_user'), 1);
  else await assert.rejects(() => db.exec('select * from admin_user'), /permission denied/);
  for (const sql of [`insert into admin_user(user_id) values('${reader}')`, `update admin_user set user_id='${reader}'`, 'delete from admin_user']) {
    await assert.rejects(() => db.exec(sql), /permission denied/);
  }
  await db.exec('reset role');
}
await db.exec(`insert into admin_user(user_id) values('${reader}')`);
assert.equal(await scalar('select count(*) from admin_user'), 2);
await db.exec(`delete from admin_user where user_id='${reader}'`);
assert.equal(await scalar('select count(*) from admin_user'), 1);
await db.exec(`delete from auth.users where id='${owner}'`);
assert.equal(await scalar('select count(*) from admin_user'), 0, 'deleting an account revokes membership');
await db.close();
console.log('Admin membership database checks passed.');
