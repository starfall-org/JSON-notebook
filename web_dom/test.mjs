import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVault,serializeVault,addEntry,editEntry,deleteEntry,reorderEntry,moveEntry,matchesEntry,validateFileName
} from './model.mjs';
import {markdownToJson,convertMarkdown,convertFolder} from './migrate.mjs';
import {DriveStore,DriveAccessExpired,FOLDER_MIME} from './drive.mjs';

test('validates JSON vaults without changing string secrets',()=>{
  assert.deepEqual(parseVault('{"A":{"x":["a","b"]}}'),{A:{x:['a','b']}});
  assert.throws(()=>parseVault('[1]'),/root/);
  assert.throws(()=>parseVault('{"a":null}'),/Only string/);
  assert.throws(()=>parseVault('{"a":23}'),/Only string/);
  assert.equal(serializeVault({x:'a\nb'}),'{\n  "x": "a\\nb"\n}\n');
});
test('adds child under empty key, edits value fields, preserves order on rename',()=>{
  let doc={alpha:'',beta:'second'};
  doc=addEntry(doc,['alpha'],'token',['a','b']);
  assert.deepEqual(doc,{alpha:{token:['a','b']},beta:'second'});
  doc=editEntry(doc,['alpha','token'],'SECRET',['abc']);
  assert.deepEqual(doc,{alpha:{SECRET:'abc'},beta:'second'});
  doc=editEntry(doc,['alpha'],'renamed',[]);
  assert.deepEqual(Object.keys(doc),['renamed','beta']);
  doc=deleteEntry(doc,['renamed','SECRET']);
  assert.deepEqual(doc,{renamed:{},beta:'second'});
  assert.throws(()=>addEntry(doc,[],'beta',[]),/already exists/);
});
test('special JSON keys are preserved without prototype mutation',()=>{
  const initial=parseVault('{"__proto__":"original","constructor":{"toString":"safe"},"normal":""}');
  const changed=addEntry(initial,['normal'],'__proto__',['secret']);
  assert.equal(changed.normal['__proto__'],'secret');
  assert.equal(Object.hasOwn(changed.normal,'__proto__'),true);
  assert.equal(serializeVault(changed).includes('"__proto__": "secret"'),true);
  const renamed=editEntry(changed,['normal','__proto__'],'toString',['other']);
  assert.equal(renamed.normal.toString,'other');
  assert.deepEqual(parseVault(serializeVault(renamed)),renamed);
});
test('reorders and safely moves intact subtrees',()=>{
  const base={first:{a:'1'},second:'',third:{b:['x','y']}};
  assert.deepEqual(Object.keys(reorderEntry(base,['third'],-1)),['first','third','second']);
  const moved=moveEntry(base,['first'],['second'],'inside');
  assert.deepEqual(moved.second,{first:{a:'1'}});
  assert.equal(Object.hasOwn(moved,'first'),false);
  const sibling=moveEntry(base,['third'],['first'],'before');
  assert.deepEqual(Object.keys(sibling),['third','first','second']);
  assert.throws(()=>moveEntry(base,['first'],['first','a'],'inside'),/Invalid key move/);
  assert.deepEqual(base.first,{a:'1'});
});
test('search, names and case-insensitive rules',()=>{
  assert.equal(matchesEntry('A',{nested:['token-X']},'TOKEN-x'),true);
  assert.equal(matchesEntry('A',{nested:['token-X']},'missing'),false);
  assert.throws(()=>validateFileName('../test.json'),/Invalid file/);
  assert.throws(()=>validateFileName('note.md',{original:'note.json'}),/Keep .json/);
});
test('converts Markdown headings/items/inline and fenced code into pure JSON',()=>{
  const md='# Services\n\n## Production\n\n- **API Token**\n\n    ```env\n    x=value\n    ```\n';
  assert.deepEqual(markdownToJson(md),{Services:{Production:{'API Token':['x=value']}}});
  assert.deepEqual(markdownToJson('```abc```'),{content:['abc']});
  assert.throws(()=>markdownToJson('# Broken\n```\nnot closed'),/Unclosed/);
});
test('Drive client carries only Google OAuth access token and rejects 401',async()=>{
  let requestHeaders;
  const response=await new DriveStore(()=> 'oauth-access-token',async(_url,options)=>{
    requestHeaders=options.headers;return new Response('hello',{status:200});
  }).read('id');
  assert.equal(response,'hello');
  assert.equal(requestHeaders.get('Authorization'),'Bearer oauth-access-token');
  await assert.rejects(new DriveStore(()=>null,async()=>{throw new Error('Must not call')} ).read('id'),DriveAccessExpired);
  await assert.rejects(new DriveStore(()=> 'expired',async()=>new Response('expired',{status:401})).read('id'),DriveAccessExpired);
});
test('Markdown conversion creates and verifies a copy, never modifies source',async()=>{
  const nodes=[{id:'root',name:'secrets',mimeType:FOLDER_MIME},{id:'md',name:'note.md',mimeType:'text/markdown',content:'# Key\n\n```\nsecret\n```'}];
  const store={
    async children(id){return id==='root'?nodes.slice(1):[]},
    async read(id){return nodes.find(n=>n.id===id).content},
    async create(_parent,name){const n={id:'json',name,mimeType:'application/json',content:''};nodes.push(n);return n},
    async write(id,content){nodes.find(n=>n.id===id).content=content},
    async remove(id){nodes.splice(nodes.findIndex(n=>n.id===id),1)}
  };
  assert.equal(await convertMarkdown(store,nodes[1],'root'),'created');
  assert.equal(await convertMarkdown(store,nodes[1],'root'),'skipped');
  assert.equal(nodes[1].content,'# Key\n\n```\nsecret\n```');
  assert.deepEqual(JSON.parse(nodes[2].content),{Key:['secret']});
  nodes[2].content='{"Key":"wrong"}\n';
  await assert.rejects(convertMarkdown(store,nodes[1],'root'),/Existing JSON differs/);
});
