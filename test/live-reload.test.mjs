import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source=await readFile(new URL('../live-reload.js',import.meta.url),'utf8');
function browser({view='graph',playing=false,revision='next',ok=true}={}) {
  const state={view,playing,revision,ok,checks:0,cleared:0,listeners:{},reloads:[],timeouts:[],href:`http://localhost:8765/${'a'.repeat(48)}/?view=${view}&at=1852&record=event%3Aone&live=`};
  const location={get href(){return state.href;},reload(){state.reloads.push(state.href);}};
  const document={currentScript:{dataset:{revision:'initial'}},readyState:'complete',body:{dataset:{get representation(){return state.view;}}},getElementById(){return {get textContent(){return state.playing?'❚❚':'▶';}};}};
  const history={state:{retained:true},replaceState(saved,_title,url){assert.equal(saved.retained,true);state.href=url;}};
  runInNewContext(source,{document,location,history,URL,fetch:async()=>{state.checks++;return {ok:state.ok,json:async()=>({revision:state.revision})};},setInterval(fn){state.poll=fn;return 1;},clearInterval(){state.cleared++;},setTimeout(fn){state.timeouts.push(fn);},addEventListener(name,fn){state.listeners[name]=fn;}});
  state.flush=()=>{const pending=state.timeouts.splice(0);pending.forEach(fn=>fn());};
  return state;
}

test('all representations follow revisions without mounting temporal controls, retaining the current URL',async()=>{
  for(const view of ['graph','structure','space','temporal']) {
    const b=browser({view});
    assert.equal(new URL(b.href).searchParams.has('live'),false);
    assert.equal(new URL(b.href).searchParams.get('view'),view);
    await b.poll();assert.equal(b.checks,1);
    // A record/time change while the UI finishes its own URL debounce remains.
    const current=new URL(b.href);current.searchParams.set('at','1854');current.searchParams.set('record','event:two');b.href=current.href;
    b.flush();assert.deepEqual(b.reloads,[current.href]);
  }
});

test('Space and time playback defer updates, including playback begun after a revision check',async()=>{
  for(const view of ['space','temporal']) {
    const b=browser({view,playing:true});await b.poll();assert.equal(b.checks,0);
    b.playing=false;await b.poll();assert.equal(b.checks,1);
    b.playing=true;b.flush();assert.equal(b.reloads.length,0);
    b.playing=false;await b.poll();b.flush();assert.equal(b.reloads.length,1);
  }
});

test('an unchanged revision or an unavailable refresh retains the displayed model',async()=>{
  const b=browser({revision:'initial'});await b.poll();b.flush();assert.equal(b.reloads.length,0);
  b.revision='next';b.ok=false;await b.poll();b.flush();assert.equal(b.reloads.length,0);
  b.ok=true;await b.poll();b.flush();assert.equal(b.reloads.length,1);
});

test('hidden playback state does not block Graph after switching from Space',async()=>{
  const b=browser({view:'graph',playing:true});await b.poll();b.flush();assert.equal(b.reloads.length,1);
});


test('back-forward cache suspension keeps the live watcher for restoration',()=>{
  const b=browser();b.listeners.pagehide({persisted:true});assert.equal(b.cleared,0);
  b.listeners.pagehide({persisted:false});assert.equal(b.cleared,1);
});
