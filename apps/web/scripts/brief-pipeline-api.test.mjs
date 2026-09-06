import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const source=readFileSync(new URL('../app/api/admin/brief-pipeline/route.ts',import.meta.url),'utf8');
function route(auth, db) {
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 const context={exports,console,URL,require:(name)=>name==='@/utils/adminAuth'?{getCurrentUserAndAdminStatus:async()=>auth}:name==='@/utils/supabase/admin'?{createAdminClient:()=>db}:require(name)};
 vm.runInNewContext(output,context);
 return exports;
}
for (const auth of [{user:null,isAdmin:false},{user:{id:'reader'},isAdmin:false}]) {
 test(`pipeline denies read and write to ${auth.user?'non-admin':'anonymous'}`,async()=>{
  const handlers=route(auth,null);
  assert.equal((await handlers.GET(new Request('https://example.com/api/admin/brief-pipeline'))).status,403);
  assert.equal((await handlers.PATCH(new Request('https://example.com/api/admin/brief-pipeline',{method:'PATCH',body:'{}'}))).status,403);
 });
}
test('admin receives uncached overview',async()=>{
 const handlers=route({user:{id:'admin'},isAdmin:true},{rpc:async()=>({data:{counts:{verified:2}},error:null})});
 const response=await handlers.GET(new Request('https://example.com/api/admin/brief-pipeline'));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal((await response.json()).counts.verified,2);
});
test('invalid settings never reach database',async()=>{
 const handlers=route({user:{id:'admin'},isAdmin:true},null);
 for(const value of ['broken',JSON.stringify({publication_enabled:true,daily_publication_limit:-1,daily_budget_usd:10}),JSON.stringify({publication_enabled:true,daily_publication_limit:30,daily_budget_usd:10,unexpected:true})]) {
  const response=await handlers.PATCH(new Request('https://example.com/api/admin/brief-pipeline',{method:'PATCH',body:value}));
  assert.equal(response.status,400);
 }
});
test('valid settings update only singleton row',async()=>{
 let saved;
 const handlers=route({user:{id:'admin'},isAdmin:true},{from:(table)=>{assert.equal(table,'brief_pipeline_settings');return {update:(value)=>{saved=value;return {eq:async(column,id)=>{assert.equal(column,'id');assert.equal(id,true);return {error:null}}}}}}});
 const response=await handlers.PATCH(new Request('https://example.com/api/admin/brief-pipeline',{method:'PATCH',body:JSON.stringify({publication_enabled:false,daily_publication_limit:20,daily_budget_usd:3})}));
 assert.equal(response.status,200);assert.equal(saved.publication_enabled,false);assert.equal(saved.daily_budget_usd,3);
});
