import test from 'node:test';
import assert from 'node:assert/strict';
import { assignReaderHeadingIds,readerFragmentHash } from '../src/lib/readerHeadings.js';

test('API comment headings cannot take fixed reference sections or external document anchors',()=>{
  const assigned=assignReaderHeadingIds([
    {sourceId:'api-parameters',label:'API parameters',fragment:0,prose:true},
    {sourceId:'content',label:'Content',fragment:0,prose:true},
    {sourceId:'api-parameters',label:'Parameters',fragment:-1,prose:false},
  ],['content','published-docs-nav']);
  assert.deepEqual(assigned.map(heading=>heading.id),['api-parameters-2','content-2','api-parameters']);
  assert.equal(readerFragmentHash('#api-parameters',0,assigned),'#api-parameters-2');
  assert.equal(readerFragmentHash('#api-parameters',1,assigned),'#api-parameters');
});

test('separate comment fragments keep local links while duplicate headings get unique permalinks',()=>{
  const assigned=assignReaderHeadingIds([
    {sourceId:'example',label:'Example',fragment:0,prose:true},
    {sourceId:'example',label:'Example',fragment:1,prose:true},
    {sourceId:'example-2',label:'A canonical suffixed anchor',fragment:1,prose:true},
  ]);
  assert.deepEqual(assigned.map(heading=>heading.id),['example','example-3','example-2']);
  assert.equal(readerFragmentHash('#example',0,assigned),'#example');
  assert.equal(readerFragmentHash('#example',1,assigned),'#example-3');
  assert.equal(readerFragmentHash('#example-2',1,assigned),'#example-2');
  assert.equal(new Set(assigned.map(heading=>heading.id)).size,assigned.length);
});

test('unique guide anchors and encoded fragments remain canonical across repeated collection',()=>{
  const headings=[
    {sourceId:'example',label:'Example',fragment:0,prose:true},
    {sourceId:'example-1',label:'Example again',fragment:0,prose:true},
    {sourceId:'routé',label:'Routé',fragment:0,prose:true},
    {sourceId:'',label:'Untitled section',fragment:-1,prose:false},
  ];
  const first=assignReaderHeadingIds(headings,['content']);
  const next=assignReaderHeadingIds(first,['content']);
  assert.deepEqual(first.map(heading=>heading.id),['example','example-1','routé','untitled-section']);
  assert.deepEqual(next,first);
  assert.equal(readerFragmentHash('#rout%C3%A9',0,first),'#rout%C3%A9');
  assert.equal(readerFragmentHash('#%invalid',0,first),'#%invalid');
  assert.equal(readerFragmentHash('/docs/relay#example',0,first),'/docs/relay#example');
});
