import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { request } from 'node:http';
import { createViewerServer } from '../serve.mjs';
import { viewerDirectory, loadMeaningModel } from '../meaning-model.mjs';

const data = (name) => ({ title: name, modelHash: name.repeat(64).slice(0,64), inspection: { model: { id: name } } });
async function listening(t, sets, options) {
  const server = createViewerServer(sets, options); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((done) => { server.close(done); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('two models use exact bundled UI, separate immutable URLs and the same model picker', async (t) => {
  const first=data('Book'), second=data('Twelve');
  const base = await listening(t, new Map([['book',first],['twelve',second]]));
  const response = await fetch(`${base}/?view=space`); assert.match(response.url,/\/[a-f0-9]{48}\//);
  assert.equal(new URL(response.url).searchParams.get('view'),'space');
  assert.equal(await response.text(), await readFile(join(viewerDirectory(),'index.html'),'utf8'));
  const root = new URL('.',response.url);
  const views = await (await fetch(new URL('data/views.json',root))).json();
  assert.deepEqual(views.map((v)=>v.title),['Book','Twelve']); assert.equal(views[0].selected,true);
  assert.deepEqual(await (await fetch(new URL('data/model.json',root))).json(),first);
  assert.deepEqual(await (await fetch(`${base}${views[1].url}data/model.json`)).json(),second);
  const { modelSwitchURL }=await import(pathToFileURL(join(viewerDirectory(),'model-picker.js')).href);
  assert.equal(new URL(modelSwitchURL(response.url,views[1].url)).searchParams.get('view'),'space');
});

test('legacy public and QR URLs retain representation intent and data choice',async(t)=>{
  const base=await listening(t,new Map([['book',data('Book')],['twelve',data('Twelve')]]));
  for(const [page,view]of[['processes.html','together'],['landscape.html','terrain'],['explorer.html','graph']]) {
    const response=await fetch(`${base}/${page}?data=twelve&reading=off`,{redirect:'manual'});
    assert.equal(response.status,302);const next=new URL(response.headers.get('location'),base);
    assert.equal(next.searchParams.get('view'),view);assert.equal(next.searchParams.get('reading'),'off');
    assert.equal((await(await fetch(new URL('data/model.json',next))).json()).title,'Twelve');
  }
});

test('server does not serve data folders, private files or write requests',async(t)=>{
  const dir=await mkdtemp(join(tmpdir(),'shared-viewer-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await writeFile(join(dir,'index.html'),'fixture');await writeFile(join(dir,'private.sqlite'),'secret');
  const base=await listening(t,new Map([['book',data('Book')]]),{publicDirectory:dir});
  const response=await fetch(base);const root=new URL('.',response.url);
  assert.equal((await fetch(new URL('private.sqlite',root))).status,404);
  assert.equal((await fetch(new URL('data/model.json',root),{method:'POST'})).status,405);
  assert.equal((await fetch(`${base}/%XX`)).status,400);
  const foreignHostStatus = await new Promise((done, fail) => { const req = request(base,{headers:{Host:'attacker.example'}},res=>{res.resume();done(res.statusCode);}); req.on('error',fail);req.end(); });
  assert.equal(foreignHostStatus,403);
  assert.equal((await fetch(base,{headers:{Origin:'https://attacker.example'}})).status,403);
  assert.throws(()=>createViewerServer(new Map([['old',{events:[]}]]),{publicDirectory:dir}),/Extract it again/);
});

test('shared data builder uses graph-bound model rather than appended author dependency',async()=>{
  const {buildViewerData}=await loadMeaningModel('src/viewer-data.mjs');
  const model=(id)=>({id,time_unit:'year',processes:[],meaning_model:{events:[],referents:[],normalized_cuts:[]}});
  const result=await buildViewerData({history:{headGraphHash:'g',models:[{modelHash:'story',definition:model('story')},{modelHash:'author',definition:model('author')}],revisions:[{graphHash:'g',definition:{id:'graph',source:{kind:'model',model_hash:'story'},nodes:[],edges:[]}}]}});
  assert.equal(result.modelHash,'story');assert.equal(result.inspection.model.id,'story');
});

test('live run refreshes replace displayed data only in explicit live mode',async(t)=>{
  const sets=new Map([['story',data('Before')]]);
  const live=await listening(t,sets,{live:true});
  const fixed=await listening(t,sets,{});
  const liveResponse=await fetch(live), fixedResponse=await fetch(fixed);
  assert.equal(new URL(liveResponse.url).searchParams.has('live'),false);
  const liveHTML=await liveResponse.text(), fixedHTML=await fixedResponse.text();
  assert.match(liveHTML,/src="live-reload.js"/); assert.doesNotMatch(fixedHTML,/live-reload.js/);
  const before=await(await fetch(new URL('data/live.json',liveResponse.url))).json();
  sets.set('story',data('After'));
  assert.equal((await(await fetch(new URL('data/model.json',liveResponse.url))).json()).title,'After');
  assert.equal((await(await fetch(new URL('data/model.json',fixedResponse.url))).json()).title,'Before');
  assert.notEqual((await(await fetch(new URL('data/live.json',liveResponse.url))).json()).revision,before.revision);
  assert.equal((await fetch(new URL('data/live.json',fixedResponse.url))).status,404);
});

test('live following stays enabled after the shared picker changes models without a live parameter',async(t)=>{
  const sets=new Map([['first',data('First')],['second',data('Second')]]);
  const base=await listening(t,sets,{live:true});
  const first=await fetch(`${base}/?view=space&live`);
  const views=await(await fetch(new URL('data/views.json',first.url))).json();
  const {modelSwitchURL}=await import(pathToFileURL(join(viewerDirectory(),'model-picker.js')).href);
  const secondURL=modelSwitchURL(first.url,views[1].url);
  assert.equal(new URL(secondURL).searchParams.has('live'),false);
  const html=await(await fetch(secondURL)).text();
  assert.match(html,/<head>\s*<script src="live-reload.js" data-revision="[a-f0-9]{64}"><\/script>/);
  assert.ok(html.indexOf('live-reload.js')<html.indexOf('src="start.js"'));
  assert.equal((await fetch(new URL('live-reload.js',secondURL))).status,200);
  const revision=await(await fetch(new URL('data/live.json',secondURL))).json();
  sets.set('second',{...sets.get('second'),generatedAt:'a later export time'});
  assert.equal((await(await fetch(new URL('data/live.json',secondURL))).json()).revision,revision.revision);
  sets.set('second',{...sets.get('second'),headGraphHash:'new graph'});
  assert.notEqual((await(await fetch(new URL('data/live.json',secondURL))).json()).revision,revision.revision);
});
