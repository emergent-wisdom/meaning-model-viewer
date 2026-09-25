// The processes of a story's world model over the story's years: every named process the agent modeled as a curtain
// of light on its own scale, the events that move them as threads, the decisions the model drew, the love-or-fear
// split behind the acts, and the causal links between events. Play sweeps through the years.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const params = new URLSearchParams(location.search);
const data = await (await fetch(`data/${params.get('data') ?? 'rabbit-hole'}.json?ts=${Date.now()}`, { cache: 'no-store' })).json();
const HUES = ['#3987e5', '#d95926', '#199e70']; const WORLD = '#9085e9';
const KIND = { causes: '#ff8a4c', enables: '#3fd3c0', realizes_forecast: '#b793ff', constrains: '#ff4d6d' };
const LENGTH = 116; const AMP = 5.6; const ROW = 2.7; const GAP = 4.4; const NX = 400;
const clip = (text, n) => { const s = String(text ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

// ---- the rows: every measure with a path, grouped by whose it is -------------------------------------------------------
const NAMES = {
  'kieran.sharehouse_belonging': 'belonging to the Sharehouse', 'kieran.fear_left_behind': 'fear of being left behind', 'kieran.honesty_with_laura': 'honesty with Laura',
  'kieran.screen_hours': 'screen hours a day', 'kieran.sleep_hours': 'sleep a night', 'kieran.stake_gbp': 'his stake in crypto',
  'laura.exhaustion': 'exhaustion', 'laura.spoken_share': 'how much of her hurt she says', 'laura.trust_in_kieran_money': 'trust in Kieran with money',
  'barbara.care_for_kieran': 'care for Kieran', 'barbara.guilt': 'guilt', 'barbara.purism': 'purism',
  'btc.price_gbp': 'bitcoin price', 'stablecoin.price_usd': 'the stablecoin', 'sharehouse.messages_per_day': 'Sharehouse messages a day', 'sharehouse.members': 'Sharehouse members',
  'household.deposit_gbp': 'the house deposit', 'house_price.wroughton_gbp': 'house prices in Wroughton', 'hart.crypto_block': "the Hart's block on crypto", 'icu.occupancy_share': 'intensive care, share of capacity',
};
const principals = data.people.filter((person) => person.principal).sort((a, b) => a.order - b.order);
const first = (person) => person.name.split(' ')[0].toLowerCase();
const ownerOf = (measure) => principals.find((person) => measure.id.split('.')[0] === first(person) || measure.frame === `person:${first(person)}`) ?? null;
const order = Object.keys(NAMES);
const measures = data.measures.filter((measure) => measure.points.length >= 2)
  .sort((a, b) => ((order.indexOf(a.id) + 1) || 99) - ((order.indexOf(b.id) + 1) || 99));
const groups = [...principals.map((person, i) => ({ id: person.id, label: person.name, hue: HUES[i % HUES.length], rows: measures.filter((m) => ownerOf(m) === person) })),
  { id: 'world', label: 'The world', hue: WORLD, rows: measures.filter((m) => !ownerOf(m)) }].filter((group) => group.rows.length);
const times = measures.flatMap((m) => m.points.map((p) => p.t));
const T0 = Math.max(Math.min(...times), 2019.4); const T1 = Math.max(...times) + 0.12;
const xOf = (t) => ((Math.max(T0, Math.min(T1, t)) - T0) / (T1 - T0) - 0.5) * LENGTH;
const tOf = (i) => T0 + (i / (NX - 1)) * (T1 - T0);
const rows = []; let z = 0;
for (const group of groups) { for (const measure of group.rows) { rows.push({ measure, group, z }); z += ROW; } z += GAP - ROW; }
const depth = z - GAP; for (const row of rows) row.z -= depth / 2;
const zFront = Math.max(...rows.map((row) => row.z)); const zBack = Math.min(...rows.map((row) => row.z));
const rowOf = new Map(rows.map((row) => [row.measure.id, row]));

// Values: linear between the authored points, held before the first and after the last. Each row on its own scale.
const valueAt = (points, t) => {
  if (t <= points[0].t) return points[0].v; if (t >= points.at(-1).t) return points.at(-1).v;
  const k = points.findIndex((p) => p.t > t); const a = points[k - 1]; const b = points[k]; return a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t));
};
for (const row of rows) {
  const values = row.measure.points.map((p) => p.v); const unit = String(row.measure.unit ?? '');
  const hi = Math.max(...values); const lo = Math.min(...values);
  row.range = /0-10/.test(unit) ? [0, 10] : /0-1|share/.test(unit) ? [0, Math.max(1, hi)] : [Math.min(0, lo), hi];
  row.height = (t) => { const v = valueAt(row.measure.points, t); return ((v - row.range[0]) / (row.range[1] - row.range[0] || 1)) * AMP; };
}
const money = (v, sign) => `${sign}${v >= 100 ? Math.round(v).toLocaleString('en-GB') : v.toFixed(2)}`;
const format = (row, v) => {
  const unit = String(row.measure.unit ?? '');
  if (/GBP/.test(unit)) return money(v, '£'); if (/USD/.test(unit)) return money(v, '$');
  if (/hours/.test(unit)) return `${v.toFixed(1)} h`; if (/0-10/.test(unit)) return `${v.toFixed(1)} of 10`;
  if (/share of normal/.test(unit)) return `${Math.round(v * 100)}%`; if (/0-1|share/.test(unit)) return v.toFixed(2);
  return Math.round(v).toLocaleString('en-GB');
};

// ---- scene --------------------------------------------------------------------------------------------------------------
const host = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); host.append(renderer.domElement);
const labels = new CSS2DRenderer(); labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' }); host.append(labels.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#050608'); scene.fog = new THREE.FogExp2('#050608', 0.0048);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 900);
camera.position.set(-LENGTH * 0.12, 96, zFront + 78);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-2, 0, 5); controls.enableDamping = true; controls.autoRotate = !params.has('still'); controls.autoRotateSpeed = 0.3;
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.42, 0.2)); composer.addPass(new OutputPass());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight); });
const grid = new THREE.GridHelper(LENGTH * 1.4, 56, '#1a2030', '#0e121a'); grid.position.y = -0.02; scene.add(grid);
const label = (className, text, position, center = [0.5, 0.5]) => {
  const element = document.createElement('div'); element.className = `label ${className}`; if (text !== null) element.textContent = text;
  const object = new CSS2DObject(element); object.position.copy(position); object.center.set(...center); scene.add(object); return object;
};
const additive = (color, opacity = 1) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

// Curtains: each process a wall of light, bright at its value, fading to the ground.
for (const row of rows) {
  const color = new THREE.Color(row.group.hue);
  const positions = new Float32Array(NX * 2 * 3); const colors = new Float32Array(NX * 2 * 4); const index = [];
  const crest = new Float32Array(NX * 3);
  for (let i = 0; i < NX; i += 1) {
    const x = xOf(tOf(i)); const h = row.height(tOf(i));
    positions.set([x, 0, row.z, x, h, row.z], i * 6); crest.set([x, h + 0.02, row.z], i * 3);
    colors.set([color.r, color.g, color.b, 0.0, color.r, color.g, color.b, 0.3], i * 8);
    if (i) index.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, i * 2, (i - 1) * 2 + 1, i * 2 + 1);
  }
  const wall = new THREE.BufferGeometry(); wall.setAttribute('position', new THREE.BufferAttribute(positions, 3)); wall.setAttribute('color', new THREE.BufferAttribute(colors, 4)); wall.setIndex(index);
  row.wall = new THREE.Mesh(wall, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  const line = new THREE.BufferGeometry(); line.setAttribute('position', new THREE.BufferAttribute(crest, 3));
  row.crest = new THREE.Line(line, additive(color.clone().lerp(new THREE.Color('#ffffff'), 0.35), 1));
  scene.add(row.wall, row.crest);
  const name = label('row', NAMES[row.measure.id] ?? row.measure.id.split('.').slice(-1)[0].replace(/_/g, ' '), new THREE.Vector3(-LENGTH / 2 - 1.2, 0.8, row.z), [1, 0.5]);
  name.element.title = `${row.measure.role ?? ''}\n\n${row.measure.support}`.trim(); name.element.style.color = `color-mix(in srgb, ${row.group.hue} 45%, #ffffff)`;
  row.value = label('value', '', new THREE.Vector3(LENGTH / 2 + 1.2, 0.8, row.z), [0, 0.5]);
}
for (const group of groups) {
  const zs = rows.filter((row) => row.group === group).map((row) => row.z);
  const object = label('group', group.label, new THREE.Vector3(-LENGTH / 2 - 1.2, 0.3, Math.min(...zs) - GAP * 0.62), [1, 0.5]); object.element.style.color = group.hue;
}
for (let year = Math.ceil(T0); year <= Math.floor(T1); year += 1) {
  label('year', String(year), new THREE.Vector3(xOf(year), 0, zFront + 2.2));
  const tick = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xOf(year), 0.01, zBack - 2), new THREE.Vector3(xOf(year), 0.01, zFront + 1.4)]);
  scene.add(new THREE.Line(tick, additive('#2a3246', 0.8)));
}

// Events that move processes: a thread through the crests they touch, at the moment they begin.
const glow = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const spark = (color, size) => { const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sprite.scale.setScalar(size); return sprite; };
const byId = new Map(data.events.map((event) => [event.id, event]));
const threads = [];
for (const event of data.events) {
  const touched = (event.processIds ?? []).map((id) => rowOf.get(id)).filter(Boolean);
  if (!touched.length || !Number.isFinite(event.start) || event.start < T0 - 0.2 || event.start > T1) continue;
  const t = Math.max(event.start, T0); const x = xOf(t); const group = new THREE.Group(); group.userData = { t, event };
  const tops = touched.sort((a, b) => a.z - b.z).map((row) => new THREE.Vector3(x, row.height(t) + 0.05, row.z));
  for (const top of tops) { group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, top.z), top]), additive('#ffffff', 0.35))); const s = spark('#ffffff', 1.5); s.position.copy(top); group.add(s); }
  if (tops.length > 1) group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(tops), additive('#fff3d6', 0.9)));
  scene.add(group); threads.push(group);
  if (touched.length >= 2) {
    const high = tops.reduce((a, b) => (b.y > a.y ? b : a));
    const tag = label('event', clip(event.label, 70), new THREE.Vector3(x, high.y + 1.3, high.z), [0.5, 1]); tag.userData = { t, weight: touched.length }; group.userData.tag = tag;
  }
}

// Decisions the model drew, and the love-or-fear split behind the acts, on each person's front row.
const decisions = []; const lenses = [];
principals.forEach((person) => {
  const own = rows.filter((row) => ownerOf(row.measure) === person); if (!own.length) return;
  const front = own.reduce((a, b) => (b.z > a.z ? b : a)); const hue = HUES[principals.indexOf(person) % HUES.length];
  for (const decision of person.decisions) {
    if (!Number.isFinite(decision.t) || decision.t < T0 || decision.t > T1) continue;
    const top = Math.max(...own.map((row) => row.height(decision.t)));
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), new THREE.MeshBasicMaterial({ color: decision.drawn ? '#ffffff' : hue }));
    gem.position.set(xOf(decision.t), top + 2.2, front.z + 0.8); gem.userData = { t: decision.t }; scene.add(gem); decisions.push(gem);
    const halo = spark(hue, 3.2); halo.position.copy(gem.position); gem.add(halo); halo.position.set(0, 0, 0);
  }
  for (const series of person.series.filter((item) => /love or (of )?fear/i.test(item.question))) {
    const point = series.points[0]; if (!point || !Number.isFinite(point.t)) continue;
    const shared = lenses.find((lens) => lens.userData.cutId === point.cutId); if (shared) { shared.userData.names.push(person.name.split(' ')[0]); shared.element.querySelector('.act').textContent = `${shared.userData.names.join(' and ')}: ${shared.userData.act}`; continue; }
    const share = (pattern) => point.answers.filter((answer) => pattern.test(answer.key)).reduce((sum, answer) => sum + answer.weight, 0);
    const love = share(/^love/); const fear = share(/^fear/); const rest = Math.max(0, 1 - love - fear);
    const act = (series.question.match(/^Is (.+?) an act of/i)?.[1] ?? series.question).replace(/^(\w)/, (c) => c.toUpperCase());
    const element = document.createElement('div'); element.className = 'label lens-host';
    element.innerHTML = `<div class="lens"><div class="act"></div><div class="split"><i class="love" style="width:${love * 100}%"></i><i class="fear" style="width:${fear * 100}%"></i><i class="rest" style="width:${rest * 100}%"></i></div><div class="words"><span><b>love</b> ${Math.round(love * 100)}%</span><span><b>fear</b> ${Math.round(fear * 100)}%</span></div></div>`;
    element.querySelector('.act').textContent = `${person.name.split(' ')[0]}: ${act}`;
    element.title = point.answers.map((answer) => `${answer.key.replace(/_/g, ' ')}: ${Math.round(answer.weight * 100)}%`).join('\n');
    const top = Math.max(...own.map((row) => row.height(point.t)));
    const object = new CSS2DObject(element); object.position.set(xOf(point.t), top + 4.2, front.z + 0.8); object.center.set(0.5, 1); object.userData = { t: point.t, cutId: point.cutId, act, names: [person.name.split(' ')[0]] }; scene.add(object); lenses.push(object);
  }
});

// Causal links between the story's events, as arcs in a lane before the processes.
const lane = zFront + 6.5; const arcs = [];
const inWindow = (event) => event && Number.isFinite(event.start) && event.start >= T0 - 0.05 && event.start <= T1;
const causal = data.relations.filter((relation) => inWindow(byId.get(relation.source)) && inWindow(byId.get(relation.target)));
for (const relation of causal) {
  const a = xOf(byId.get(relation.source).start); const b = xOf(byId.get(relation.target).start); const lift = 0.6 + Math.abs(b - a) * 0.28;
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(a, 0.15, lane), new THREE.Vector3((a + b) / 2, lift, lane), new THREE.Vector3(b, 0.15, lane));
  const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), additive(KIND[relation.kind] ?? '#9a9a9a', 0.85));
  arc.userData = { t: Math.max(byId.get(relation.source).start, byId.get(relation.target).start) }; scene.add(arc); arcs.push(arc);
  for (const x of [a, b]) { const s = spark(KIND[relation.kind] ?? '#9a9a9a', 1.1); s.position.set(x, 0.15, lane); arc.add(s); }
}
const counts = causal.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] ?? 0) + 1 }), {});
const laneTag = label('lane', `${causal.length} causal links`, new THREE.Vector3(-LENGTH / 2 - 1.2, 0.6, lane), [1, 0.5]);
const sub = document.createElement('span'); sub.textContent = Object.entries(counts).map(([k, n]) => `${n} ${k.replace(/_/g, ' ').replace('realizes forecast', 'fulfil a forecast')}`).join(' · '); laneTag.element.append(sub);

// The sweep: a plane of light at the story's moment.
const sweep = new THREE.Mesh(new THREE.PlaneGeometry(zFront - zBack + 12, AMP + 6), new THREE.MeshBasicMaterial({ color: '#9fb8ff', transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
sweep.rotation.y = Math.PI / 2; sweep.position.set(0, (AMP + 6) / 2 - 0.5, (zFront + zBack) / 2 + 2); scene.add(sweep);

// ---- HUD ------------------------------------------------------------------------------------------------------------------
const titleText = params.get('title') ?? data.title ?? 'Story Processes';
document.getElementById('title').textContent = titleText;
document.getElementById('sub').textContent = `${measures.length} processes the agent modeled for the story, each on its own scale, `
  + `and the ${threads.length} events that move them. The heights follow each process's authored path in the model.`;
const tile = (name, value) => `<div class="stat"><div class="value">${value}</div><div class="name">${name}</div></div>`;
document.getElementById('stats').innerHTML = tile('Processes', measures.length) + tile('Events moving them', threads.length) + tile('Causal links', causal.length)
  + tile('Decisions drawn', decisions.length) + tile('Love or fear', lenses.length);
const keyRow = (glyph, text) => `<div class="key-row"><span class="glyph">${glyph}</span><span>${text}</span></div>`;
document.getElementById('legend').innerHTML = '<div class="key-head">How to read it</div>'
  + keyRow('<svg width="28" height="14"><path d="M1 12 C8 12 9 3 15 4 S23 9 27 2" stroke="#9fc3ff" stroke-width="2" fill="none"/></svg>', 'A curtain is one process over the years, on its own scale; the value is on the right')
  + keyRow('<svg width="10" height="16"><line x1="5" y1="1" x2="5" y2="15" stroke="#fff" stroke-width="2"/></svg>', 'A thread is an event, through every process it moves')
  + keyRow('<svg width="14" height="14"><path d="M7 1 L13 7 L7 13 L1 7Z" fill="#fff"/></svg>', 'A diamond is a decision the model drew from its weights')
  + keyRow('<svg width="28" height="8"><rect width="15" height="8" rx="3" fill="#ffb057"/><rect x="15" width="10" height="8" fill="#58b4ff"/></svg>', 'How much of an act comes from love and how much from fear')
  + keyRow('<svg width="28" height="12"><path d="M1 11 Q14 -4 27 11" stroke="#ff8a4c" stroke-width="2" fill="none"/></svg>', 'An arc is a causal link: causes, enables, fulfils a forecast')
  + `<div class="key-row" style="gap:12px;flex-wrap:wrap">${groups.map((g) => `<span style="display:inline-flex;align-items:center;gap:6px"><i style="width:10px;height:10px;border-radius:50%;background:${g.hue};display:inline-block"></i>${g.label}</span>`).join('')}</div>`;

// ---- the story, as the tool renders it from the graph ------------------------------------------------------------------------
const inline = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
function renderReader() {
  const body = document.getElementById('reader-body'); body.replaceChildren();
  for (const unit of data.story?.units ?? []) for (const block of unit.text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)) {
    const heading = block.match(/^(#{1,4})\s+([\s\S]*)$/);
    const element = document.createElement(heading ? `h${heading[1].length}` : 'p');
    element.innerHTML = inline(heading && heading[1].length === 1 && unit.role === 'document_root' ? titleText : heading ? heading[2] : block).replace(/\n/g, '<br>'); body.append(element);
  }
}
document.getElementById('read').addEventListener('click', () => { const reader = document.getElementById('reader'); reader.hidden = !reader.hidden; if (!reader.hidden) renderReader(); });
document.getElementById('reader-close').addEventListener('click', () => { document.getElementById('reader').hidden = true; });
addEventListener('keydown', (event) => { if (event.key === 'Escape') document.getElementById('reader').hidden = true; });
if (params.has('read')) document.getElementById('read').click();

// ---- time -----------------------------------------------------------------------------------------------------------------
let now = T1; let playing = false;
const month = (t) => new Date(Date.UTC(Math.floor(t), Math.floor((t % 1) * 12), 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
function apply() {
  const upto = Math.max(0, Math.min(NX, Math.floor(((now - T0) / (T1 - T0)) * (NX - 1)) + 1));
  for (const row of rows) { row.wall.geometry.setDrawRange(0, Math.max(0, (upto - 1) * 6)); row.crest.geometry.setDrawRange(0, upto); row.value.element.textContent = format(row, valueAt(row.measure.points, Math.min(now, T1))); }
  for (const thread of threads) { thread.visible = thread.userData.t <= now; if (thread.userData.tag) thread.userData.tag.visible = thread.visible; }
  for (const item of [...decisions, ...lenses, ...arcs]) item.visible = item.userData.t <= now;
  sweep.position.x = xOf(now); sweep.visible = playing;
  document.getElementById('fill').style.width = `${((now - T0) / (T1 - T0)) * 100}%`;
  document.getElementById('clock').textContent = month(Math.min(now, T1 - 0.01));
  const latest = threads.filter((thread) => thread.userData.t <= now).sort((a, b) => b.userData.t - a.userData.t)[0];
  document.getElementById('kind').textContent = latest ? month(latest.userData.t) : 'The story';
  document.getElementById('text').textContent = latest ? clip(`${latest.userData.event.label} ${latest.userData.event.description ?? ''}`, 330) : '';
}
let timer = null;
function stop() { playing = false; clearInterval(timer); document.getElementById('play').textContent = '▶'; apply(); }
function play() {
  if (now >= T1) now = T0; playing = true; document.getElementById('play').textContent = '❚❚';
  const step = (T1 - T0) / (45000 / 50);
  timer = setInterval(() => { now = Math.min(T1, now + step); apply(); if (now >= T1) stop(); }, 50);
}
document.getElementById('play').addEventListener('click', () => (playing ? stop() : play()));
document.getElementById('track').addEventListener('pointerdown', (e) => { stop(); const r = e.currentTarget.getBoundingClientRect(); now = T0 + ((e.clientX - r.left) / r.width) * (T1 - T0); apply(); });
apply();

// Love-or-fear chips lift clear of each other; values and event names that would cover something wait for their turn.
function declutter() {
  const panels = [...document.querySelectorAll('.hud.caption, .hud.bar, .hud.legend, .hud.title, .hud.stats')].map((el) => el.getBoundingClientRect());
  const placed = [...panels];
  for (const el of labels.domElement.querySelectorAll('.label.row, .label.group, .label.year, .label.lane')) { const r = el.getBoundingClientRect(); if (r.width) placed.push(r); }
  const hits = (r, lift = 0) => placed.some((p) => r.left < p.right + 4 && r.right > p.left - 4 && r.top - lift < p.bottom + 2 && r.bottom - lift > p.top - 2);
  for (const lens of lenses.filter((item) => item.visible).sort((a, b) => a.userData.t - b.userData.t)) {
    const inner = lens.element.firstElementChild; const r = lens.element.getBoundingClientRect(); if (!r.width) continue;
    let lift = 0; while (lift <= 150 && hits(r, lift)) lift += 6;
    inner.style.transform = `translateY(${-lift}px)`; placed.push({ left: r.left, right: r.right, top: r.top - lift, bottom: r.bottom - lift });
  }
  for (const row of rows) { const el = row.value.element; el.style.opacity = ''; const r = el.getBoundingClientRect(); if (!r.width) continue; if (hits(r)) el.style.opacity = '0'; else placed.push(r); }
  const tags = threads.map((thread) => thread.userData.tag).filter((tag) => tag?.visible).sort((a, b) => b.userData.weight - a.userData.weight || b.userData.t - a.userData.t);
  for (const tag of tags) {
    const r = tag.element.getBoundingClientRect(); if (!r.width) continue;
    const free = !hits(r); tag.element.style.opacity = free ? '' : '0'; if (free) placed.push(r);
  }
}
function frame() { controls.update(); composer.render(); labels.render(scene, camera); declutter(); requestAnimationFrame(frame); }
frame();
if (params.has('play')) setTimeout(play, 1000);
