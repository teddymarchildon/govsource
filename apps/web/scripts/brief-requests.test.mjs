import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const source=readFileSync(new URL('../app/api/admin/brief-requests/route.ts',import.meta.url),'utf8');
function route(auth, db) {
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 vm.runInNewContext(output,{exports,console,URL,require:(name)=>name==='@/utils/adminAuth'?{getCurrentUserAndAdminStatus:async()=>auth}:name==='@/utils/supabase/admin'?{createAdminClient:()=>db}:require(name)});
 return exports;
}
const post=(input)=>new Request('https://www.govsrc.com/api/admin/brief-requests',{method:'POST',body:JSON.stringify(input)});
for (const auth of [{user:null,isAdmin:false},{user:{id:'reader'},isAdmin:false}]) {
 test('generation requires an administrator',async()=>{
  const h=route(auth,null);
  assert.equal((await h.GET()).status,403);
  assert.equal((await h.POST(post({briefId:1}))).status,403);
 });
}
test('invalid and external URLs cannot queue work',async()=>{
 const h=route({user:{id:'admin'},isAdmin:true},null);
 for(const url of ['https://evil.com/bills/1','https://www.govsrc.com.evil.com/bills/1','file:///bills/1','https://govsrc.com:3000/bills/1','https://govsrc.com/bills/9007199254740992','https://govsrc.com/briefs/test','https://govsrc.com/bills/-1']) assert.equal((await h.POST(post({url}))).status,400,url);
 assert.equal((await h.POST(post({briefId:1,p_user:'someone-else'}))).status,400);
});
test('source links normalize aliases and use the signed-in actor',async()=>{
 const calls=[];
 const h=route({user:{id:'admin'},isAdmin:true},{rpc:async(name,p)=>{calls.push([name,p]);return {data:7,error:null}}});
 for(const path of ['laws','executive-orders','supreme-court-cases']) {
  const response=await h.POST(post({url:`https://www.govsrc.com/${path}/12?utm_source=x`}));
  assert.equal(response.status,202);
 }
 assert.deepEqual(calls.map(c=>c[1].p_type),['bill','agency_document','cluster']);
 assert.ok(calls.every(c=>c[1].p_user==='admin' && c[1].p_id===12));
});
test('regeneration resolves the saved source rather than trusting client fields',async()=>{
 let args;
 const h=route({user:{id:'admin'},isAdmin:true},{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:8,primary_item_type:'law',primary_item_id:42},error:null})})})}),rpc:async(name,p)=>{args=p;return {data:9,error:null}}});
 assert.equal((await h.POST(post({briefId:8}))).status,202);
 assert.equal(args.p_type,'bill');assert.equal(args.p_id,42);assert.equal(args.p_brief,8);
});
