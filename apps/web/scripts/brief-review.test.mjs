import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('tsx/cjs');
const { publicationIssues, sourceHost } = require('../lib/briefReview.ts');
const ready = () => ({title:'A policy change',dek:'A concise takeaway.',context_markdown:'An explanation of who is affected.',author_name:'An editor',primary_item_id:'1',sources:[{id:'source_a',label:'Official source',url:'https://example.gov/document'}],points:[1,2,3].map(id=>({id:String(id),text:'Supported point.',source_refs:['source_a']}))});
test('complete content passes mechanical readiness',()=>assert.deepEqual(publicationIssues(ready()),[]));
test('removing a cited source blocks publication even if another source remains',()=>{
 const brief=ready(); brief.sources=[{id:'other',label:'Other',url:'https://example.gov/other'}];
 assert.ok(publicationIssues(brief).some(issue=>issue.includes('citations')));
});
test('empty points do not count toward publication',()=>{
 const brief=ready(); brief.points[0].text=' ';
 assert.ok(publicationIssues(brief).some(issue=>issue.includes('three to five')));
});
test('unfinished explanation and missing attribution are identified',()=>{
 const brief=ready(); brief.context_markdown=' '; brief.author_name='';
 assert.equal(publicationIssues(brief).length,2);
});
test('unsafe and malformed source links are rejected without crashing the preview',()=>{
 for (const url of ['https://','javascript:alert(1)','data:text/html,hello','not a link']) assert.equal(sourceHost(url),null);
 assert.equal(sourceHost('https://www.congress.gov/bill'),'www.congress.gov');
});
test('primary record citations remain valid and invalid IDs are rejected',()=>{
 const brief=ready(); brief.points.forEach(point=>point.source_refs=['primary']);
 assert.deepEqual(publicationIssues(brief),[]);
 brief.primary_item_id='NaN'; assert.ok(publicationIssues(brief).some(issue=>issue.includes('record')));
});
