// The explorer: a story's world model across scales. Time runs left to right on an axis that zooms from a single
// moment out to the model's deep past: linear across the story and a life, and in years before the present on a log
// scale at the scale of world history, blending continuously between them. Layers stacks the Event tree level by level,
// parents above their children and threaded to them; Together lays everything in one field, as the processes view does.
// Detail is added kind by kind: processes, subsidiary processes, events, decisions, each lens's readings, notes, causal
// links and prose, down to the depth of the tree the viewer asks for.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadData, fillLinks, processLabel, holderText } from './common.js';

const params = new URLSearchParams(location.search);
const { name: dataName, data } = await loadData(params);
fillLinks(document.getElementById('repos'), data);
const HUES = ['#3987e5', '#d95926', '#199e70']; const WORLD = '#9085e9'; const THINGS = '#c9a45c';
const KIND = { causes: '#ff8a4c', enables: '#3fd3c0', realizes_forecast: '#b793ff', constrains: '#ff4d6d', other: '#9a9a9a' };
const NOTE = { thought: ['Thought', '#c9d4ff'], author: ['Author record', '#ffd49a'], draw: ['Draw', '#ffffff'], world: ['World stage', '#b9aefc'], reference: ['Model reference', '#8fe3c9'], director: ['Director', '#ffb3c7'], review: ['Review', '#ffe08a'] };
const ANSWER = ['#ffb057', '#58b4ff', '#5fd39a', '#c69bff', '#ff7aa8', '#e8e27a', '#7fe0e6']; const REMAINDER = '#4a4945';
const LENGTH = 120; const BAR = 0.3;
// Spacing across the lanes; it grows when the tree shown is shallow, so the view fills the screen.
let LANE = 0.8; let ROW = 2.2; let AMP = 3.4; let GROUP_GAP = 1.4; let spread = 1;
const setSpread = (k) => { spread = k; LANE = 0.8 * k; ROW = 2.2 * k; AMP = ROW * 1.55; GROUP_GAP = 1.4 * k; };
// A curtain's full height: a little over its row in Layers, twice its row in Together, as in the processes view.
const ampAt = (m) => AMP * (1 + 0.3 * m);
const clip = (text, n) => { const s = String(text ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
// A name cut at a word, for labels.
const words = (text, n) => { const s = String(text ?? '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const cut = s.slice(0, n - 1); const space = cut.lastIndexOf(' '); return `${(space > n * 0.55 ? cut.slice(0, space) : cut).replace(/[,;:]$/, '')}…`; };
const push = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
const smooth = (x) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
const COLORS = new Map(); const color = (hex) => { let c = COLORS.get(hex); if (!c) { c = new THREE.Color(hex); COLORS.set(hex, c); } return c; }; // shared: clone before changing one

// ---- the model: the Event tree, whose each Event is, and the processes in it ---------------------------------------------
// The tree is the world's and each person's inner process; readings (and any holder's understanding) are shown as readings
// of their records, never as parts of the world.
const WORLDLY = new Set(['accepted_world', 'inner', 'unrooted', undefined]);
const events = data.events.filter((event) => Array.isArray(event.reach) && event.role !== 'reading' && WORLDLY.has(event.context));
if (!events.length || !data.processes) {
  document.getElementById('sub').textContent = 'This data file has no Event tree yet: make it again with node extract.mjs.';
  throw new Error('no tree in the data file');
}
const byId = new Map(events.map((event) => [event.id, event]));
const childrenOf = new Map(); for (const event of events) if (event.parent && byId.has(event.parent)) push(childrenOf, event.parent, event.id);
const principals = data.people.filter((person) => person.principal).sort((a, b) => a.order - b.order);
const referents = new Map((data.referents ?? []).map((referent) => [referent.id, referent]));
const people = new Map(principals.map((person, i) => [person.id, { person, hue: HUES[i % HUES.length], first: person.name.split(' ')[0] }]));
// Groups, top to bottom: each principal, the places and institutions, the world.
const groupOf = (owner) => (people.has(owner) ? owner : owner && referents.has(owner) ? 'things' : 'world');
const GROUPS = [...principals.map((person) => ({ key: person.id, name: person.name, hue: people.get(person.id).hue })),
  { key: 'things', name: 'Places and institutions', hue: THINGS }, { key: 'world', name: 'The world', hue: WORLD }];
const groupIndex = new Map(GROUPS.map((group, i) => [group.key, i]));
const hueOf = (owner) => GROUPS[groupIndex.get(groupOf(owner))].hue;
const processName = (process) => processLabel(data, process.id);
// An Event's name: its boundary without the date it opens with, or the name of whose life or process it is.
const DATEY = /\b(1\d{3}|20\d{2}|\d{3,6} (years|BC)|January|February|March|April|May|June|July|August|September|October|November|December|spring|summer|autumn|winter|night|evening|morning|week|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|onward|Late|Early|Mid)\b/i;
function eventName(event) {
  if (event.role === 'world') return 'The world';
  if (event.role === 'life') { const who = [...referents.values()].find((referent) => referent.life === event.id); if (who?.person) return `${who.name.split(' ')[0]}'s life`; }
  if (event.role === 'inner') { const who = people.get(event.owner); return who ? `${who.first}'s inner life` : 'An inner life'; }
  if (event.role === 'slow') return `${event.id.split('.').at(-1)}`;
  let text = String(event.label ?? event.id).replace(/\s+/g, ' ').trim();
  const head = text.match(/^([^:]{3,70}):\s+(.+)$/); if (head && DATEY.test(head[1])) text = head[2];
  text = text.replace(/\s*\((invented|real[^)]*|[^)]{0,40})\)/g, '');
  const lead = text.match(/^([^:]{8,}?):\s+(.+)$/); if (lead && lead[1].split(' ').length >= 3 && event.depth <= 2) text = lead[1];
  if (event.role === 'phase') text = `${event.phase.replace('_', ' ')}: ${text}`;
  return text.replace(/,? \d{4}\s?[-–]\s?\d{4}\.?$/, '').replace(/\.$/, '');
}
const thingName = (referent) => { const life = byId.get(referent.life); const text = String(life?.label ?? referent.name).split(/:| \(|, a |; /)[0]; return clip(text, 34); };
for (const event of events) { event.name = eventName(event); event.children = childrenOf.get(event.id) ?? []; }
for (const referent of referents.values()) if (!referent.person) referent.short = thingName(referent);
const named = data.processes.filter((process) => process.kind === 'named');
const scaffoldOf = new Map(data.processes.filter((process) => process.kind === 'scaffold').map((process) => [process.home, process]));
const processById = new Map(data.processes.map((process) => [process.id, process]));

// Each thing the view can draw is a node: an Event (of the tree, or a subsidiary process on its Event) or a named process.
// A node's time is its reach; a named process's is its authored path, held a little before and after.
const nodes = [];
for (const event of events) {
  const sub = event.role === 'slow' || event.role === 'phase';
  nodes.push({ kind: sub ? 'sub' : 'event', id: event.id, event, depth: event.depth, owner: event.owner, group: groupOf(event.owner), t0: event.reach[0], t1: event.reach[1],
    trunk: event.depth <= 1, parent: event.parent });
}
for (const process of named) {
  const home = byId.get(process.home); const points = process.points ?? [];
  let t0 = points.length ? points[0].t - 0.25 : home?.reach[0]; let t1 = points.length ? points.at(-1).t + 0.25 : home?.reach[1];
  if (home) { t0 = Math.max(t0, home.reach[0]); t1 = Math.min(t1, home.reach[1] + 0.02); }
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue;
  const values = points.map((p) => p.v); const unit = String(process.unit ?? ''); const hi = Math.max(...values, 0); const lo = Math.min(...values, 0);
  const range = /0-10/.test(unit) ? [0, 10] : /0-1|share/.test(unit) ? [0, Math.max(1, hi)] : [Math.min(0, lo), hi || 1];
  nodes.push({ kind: 'process', id: process.id, process, depth: process.depth, owner: process.owner, group: groupOf(process.owner), t0, t1, parent: process.home, points, range });
}
const nodeById = new Map(nodes.map((node) => [node.id, node]));
const valueAt = (points, t) => { if (!points.length) return 0; if (t <= points[0].t) return points[0].v; if (t >= points.at(-1).t) return points.at(-1).v; const k = points.findIndex((p) => p.t > t); const a = points[k - 1]; const b = points[k]; return a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t || 1)); };
const levelOf = (node) => node.depth;
const MAX_DEPTH = Math.max(...nodes.map(levelOf));

// Decisions, lens readings, notes, causal links and prose, each at the Event it is about.
const decisions = principals.flatMap((person) => person.decisions.map((decision) => ({ ...decision, owner: person.id }))).filter((decision) => byId.has(decision.eventId));
const lenses = (data.lenses ?? []).filter((lens) => lens.readings.length);
for (const lens of lenses) {
  // The built-in lens once asked in the modeler's own words: its older answers are fears and loves by name.
  const keys = lens.answers?.map((answer) => answer.key) ?? (lens.id === 'fear-love' ? ['fear', 'love']
    : [...new Set(lens.readings.flatMap((reading) => reading.answers.map((answer) => answer.key)).filter((key) => key !== 'remainder'))].sort());
  lens.palette = new Map(keys.map((key, i) => [key, ANSWER[i % ANSWER.length]]));
  if (lens.id === 'fear-love') { lens.palette.set('love', '#ffb057'); lens.palette.set('fear', '#58b4ff'); }
  lens.keyOf = (key) => (lens.palette.has(key) ? key : lens.id === 'fear-love' ? (/^love/.test(key) ? 'love' : /^fear/.test(key) ? 'fear' : 'remainder') : key);
  lens.colorOf = (key) => lens.palette.get(lens.keyOf(key)) ?? REMAINDER;
}
const relations = data.relations.filter((relation) => byId.has(relation.source) && byId.has(relation.target));
const graphNodes = new Map(data.graph.nodes.map((node) => [node.id, node]));
const noteEvents = new Map();
for (const edge of data.graph.edges) { const at = edge.target?.event ?? edge.target?.home; if (at && byId.has(at) && graphNodes.get(edge.source)?.category !== 'passage') { if (!noteEvents.has(edge.source)) noteEvents.set(edge.source, new Set()); noteEvents.get(edge.source).add(at); } }
const notes = [...noteEvents].map(([id, set]) => ({ id, node: graphNodes.get(id), events: [...set] })).filter((note) => note.node);
for (const note of notes) { const ts = note.events.map((id) => byId.get(id)).map((event) => (Number.isFinite(event.start) ? event.start : event.reach[0])).sort((a, b) => a - b); note.t = ts[Math.floor(ts.length / 2)]; }
notes.sort((a, b) => a.t - b.t);
const prose = (data.story?.units ?? []).filter((unit) => Number.isFinite(unit.t));

// ---- time: an axis from a moment to deep time ----------------------------------------------------------------------------
// A view is a window [a, b] of years. Its mapping to the screen blends a linear scale with a log scale of years before the
// present, by how wide the window is: linear across a few centuries, logarithmic across millennia.
const PRESENT = Math.max(data.extent?.end ?? 2026, ...events.map((event) => event.reach[1]));
const EARLIEST = Math.min(data.extent?.start ?? PRESENT - 100, ...events.map((event) => event.reach[0]));
const KNEE = 3; const BOUNDS = [EARLIEST - (PRESENT - EARLIEST) * 0.015, PRESENT]; const MIN_SPAN = 0.004;
const G = (t) => -Math.log(KNEE + PRESENT - Math.min(t, PRESENT + KNEE * 0.999));
const Ginv = (g) => PRESENT + KNEE - Math.exp(-g);
const warpOf = (span) => smooth((Math.log10(span) - 2.45) / 1.15);
const frameOf = (a, b) => ({ a, b, s: b - a, w: warpOf(b - a), ga: G(a), gb: G(b) });
const fracOf = (F, t) => (1 - F.w) * ((t - F.a) / F.s) + (F.w ? F.w * ((G(t) - F.ga) / (F.gb - F.ga)) : 0);
function timeAt(F, u) { let lo = F.a - F.s * 4; let hi = Math.min(F.b + F.s * 4, PRESENT + KNEE * 0.99); for (let i = 0; i < 64; i += 1) { const mid = (lo + hi) / 2; if (fracOf(F, mid) < u) lo = mid; else hi = mid; } return (lo + hi) / 2; }
// The window of a given width that keeps time t at screen fraction u.
function windowAt(t, u, span) {
  span = Math.max(MIN_SPAN, Math.min(span, BOUNDS[1] - BOUNDS[0]));
  let lo = t - span; let hi = t;
  for (let i = 0; i < 64; i += 1) { const mid = (lo + hi) / 2; if (fracOf(frameOf(mid, mid + span), t) > u) lo = mid; else hi = mid; }
  const a = Math.max(BOUNDS[0], Math.min((lo + hi) / 2, BOUNDS[1] - span)); return [a, a + span];
}
let F = frameOf(2019, 2024);
// The time at each screen fraction, tabulated once per view, for drawing the curtains.
let table = null;
function tabulate() { const n = 720; const ts = new Float64Array(n + 1); for (let i = 0; i <= n; i += 1) ts[i] = timeAt(F, -0.05 + (1.1 * i) / n); table = { n, ts }; }
const timeAtX = (x) => { const u = x / LENGTH + 0.5; const k = ((u + 0.05) / 1.1) * table.n; const i = Math.max(0, Math.min(table.n - 1, Math.floor(k))); return table.ts[i] + (table.ts[i + 1] - table.ts[i]) * (k - i); };
const X = (t) => { const x = (fracOf(F, t) - 0.5) * LENGTH; return x < -3 * LENGTH ? -3 * LENGTH : x > 3 * LENGTH ? 3 * LENGTH : x; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateOf = (t) => { const year = Math.floor(t); const ms = Date.UTC(year, 0, 1) + (t - year) * 365.2425 * 86400000; return new Date(ms); };
const grouped = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const yearText = (year) => (year < 0 ? `${grouped(-year)} BCE` : year === 0 ? '1 CE' : `${year}`);
function timeText(t, span = F.s) {
  if (PRESENT - t >= 5000) { const ago = PRESENT - t; const round = ago >= 100000 ? 10000 : ago >= 20000 ? 1000 : 100; return `${grouped(Math.round(ago / round) * round)} years ago`; }
  if (span > 30 || t < 1) return yearText(Math.round(t));
  const d = dateOf(t);
  if (span > 1.5) return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
const spanText = (a, b) => {
  const years = b - a;
  if (years >= 2) return `${grouped(years)} years`;
  if (years >= 2 / 12) return `${Math.round(years * 12)} months`;
  return `${Math.max(1, Math.round(years * 365.2425))} days`;
};

// ---- scene ------------------------------------------------------------------------------------------------------------------
const host = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); host.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#050608');
const camera = new THREE.PerspectiveCamera(17, innerWidth / innerHeight, 1, 6000);
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.4, 0.22); composer.addPass(bloom); composer.addPass(new OutputPass());
const glowTexture = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.22, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();

// Growable buffers, refilled whenever the view changes: line segments, triangles and glowing points.
class Lines {
  constructor(opacity = 1) { this.max = 0; this.geometry = new THREE.BufferGeometry(); this.object = new THREE.LineSegments(this.geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })); this.object.frustumCulled = false; scene.add(this.object); this.grow(1024); }
  grow(n) { const pos = new Float32Array(n * 6); const col = new Float32Array(n * 8); if (this.pos) { pos.set(this.pos); col.set(this.col); } this.pos = pos; this.col = col; this.max = n; this.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3)); this.geometry.setAttribute('color', new THREE.BufferAttribute(col, 4)); }
  begin() { this.n = 0; }
  add(x0, y0, z0, x1, y1, z1, c, a0, a1 = a0, c1 = c) { if (this.n >= this.max) this.grow(this.max * 2); const i = this.n * 6; const j = this.n * 8; this.pos[i] = x0; this.pos[i + 1] = y0; this.pos[i + 2] = z0; this.pos[i + 3] = x1; this.pos[i + 4] = y1; this.pos[i + 5] = z1;
    this.col[j] = c.r; this.col[j + 1] = c.g; this.col[j + 2] = c.b; this.col[j + 3] = a0; this.col[j + 4] = c1.r; this.col[j + 5] = c1.g; this.col[j + 6] = c1.b; this.col[j + 7] = a1; this.n += 1; }
  end() { this.geometry.setDrawRange(0, this.n * 2); this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.color.needsUpdate = true; }
}
class Tris {
  constructor(solid = false) { this.max = 0; this.geometry = new THREE.BufferGeometry(); this.object = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: solid ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, depthTest: !solid, side: THREE.DoubleSide })); this.object.frustumCulled = false; if (solid) this.object.renderOrder = 5; scene.add(this.object); this.grow(4096); }
  grow(n) { const pos = new Float32Array(n * 3); const col = new Float32Array(n * 4); if (this.pos) { pos.set(this.pos); col.set(this.col); } this.pos = pos; this.col = col; this.max = n; this.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3)); this.geometry.setAttribute('color', new THREE.BufferAttribute(col, 4)); }
  begin() { this.n = 0; }
  vertex(x, y, z, c, a) { if (this.n >= this.max) this.grow(this.max * 2); const i = this.n * 3; const j = this.n * 4; this.pos[i] = x; this.pos[i + 1] = y; this.pos[i + 2] = z; this.col[j] = c.r; this.col[j + 1] = c.g; this.col[j + 2] = c.b; this.col[j + 3] = a; this.n += 1; }
  // A quad from (x0..x1) at its bottom y0 and top y1, both at depth z, with a colour and alpha at the bottom and top.
  quad(x0, x1, yb0, yt0, yb1, yt1, z, c, ab, at) { this.vertex(x0, yb0, z, c, ab); this.vertex(x1, yb1, z, c, ab); this.vertex(x0, yt0, z, c, at); this.vertex(x0, yt0, z, c, at); this.vertex(x1, yb1, z, c, ab); this.vertex(x1, yt1, z, c, at); }
  end() { this.geometry.setDrawRange(0, this.n); this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.color.needsUpdate = true; }
}
class Glows {
  constructor() {
    this.max = 0; this.geometry = new THREE.BufferGeometry();
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { map: { value: glowTexture }, scale: { value: renderer.getPixelRatio() } },
      vertexShader: 'attribute float size; attribute vec4 tint; varying vec4 vTint; uniform float scale; void main() { vTint = tint; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale; }',
      fragmentShader: 'uniform sampler2D map; varying vec4 vTint; void main() { float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vTint.rgb, vTint.a * a); }' });
    this.object = new THREE.Points(this.geometry, material); this.object.frustumCulled = false; scene.add(this.object); this.grow(1024);
  }
  grow(n) { const pos = new Float32Array(n * 3); const tint = new Float32Array(n * 4); const size = new Float32Array(n); if (this.pos) { pos.set(this.pos); tint.set(this.tint); size.set(this.size); } this.pos = pos; this.tint = tint; this.size = size; this.max = n;
    this.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3)); this.geometry.setAttribute('tint', new THREE.BufferAttribute(tint, 4)); this.geometry.setAttribute('size', new THREE.BufferAttribute(size, 1)); }
  begin() { this.n = 0; }
  add(x, y, z, c, a, px) { if (this.n >= this.max) this.grow(this.max * 2); const i = this.n; this.pos.set([x, y, z], i * 3); this.tint.set([c.r, c.g, c.b, a], i * 4); this.size[i] = px; this.n += 1; }
  end() { this.geometry.setDrawRange(0, this.n); for (const name of ['position', 'tint', 'size']) this.geometry.attributes[name].needsUpdate = true; }
}
const grid = new Lines(); const connectors = new Lines(); const threads = new Lines(); const arcs = new Lines(); const noteLines = new Lines(); const crests = new Lines();
const walls = new Tris(); const chips = new Tris(true); const glows = new Glows();
const diamond = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }), Math.max(1, decisions.length));
diamond.frustumCulled = false; scene.add(diamond);

// ---- state --------------------------------------------------------------------------------------------------------------------
const KINDS = [
  ['processes', 'Named processes', '#9fc3ff', () => nodes.filter((node) => node.kind === 'process').length],
  ['subsidiary', 'Subsidiary processes', '#b9aefc', () => nodes.filter((node) => node.kind === 'sub').length],
  ['events', 'Events', '#ffffff', () => nodes.filter((node) => node.kind === 'event').length],
  ['decisions', 'Decisions', '#ffffff', () => decisions.length],
  ['causal', 'Causal links', '#ff8a4c', () => relations.length],
  ['notes', "The agent's notes", '#c9d4ff', () => notes.length],
  ['prose', 'Prose', '#fff0d0', () => prose.length],
];
const state = { mode: params.get('view') === 'together' ? 1 : 0, blend: 0, depth: Math.min(MAX_DEPTH, Number(params.get('depth') ?? 2)), show: new Set(['processes']), lenses: new Set() };
if (params.has('show')) state.show = new Set(params.get('show').split(',').filter(Boolean));
if (params.has('lenses')) state.lenses = new Set(params.get('lenses') === 'all' ? lenses.map((lens) => lens.id) : params.get('lenses').split(',').filter(Boolean));
state.blend = state.mode;
// blend=0..1 holds the view between the two representations, for a capture of the morph.
const frozenBlend = params.has('blend') ? Math.max(0, Math.min(1, Number(params.get('blend')) || 0)) : null;
if (frozenBlend !== null) { state.blend = frozenBlend; state.mode = frozenBlend >= 0.5 ? 1 : 0; }
let dirty = true; let relayout = true;

// ---- layout: lanes for each representation --------------------------------------------------------------------------------------
// Layers: level k of the tree is floor k, below the one before; on each floor the groups keep their order front to back, the
// named processes first, then the Events packed into lanes by time. Together: one field, each group's processes as rows
// with its Events in lanes in front of them. The tree's trunk (the world, its developments, lives and things) holds up the
// Layers even without Events; Together, like the processes view, leaves it out until Events are asked for.
const visible = (node, mode) => {
  if (node.depth > state.depth) return false;
  if (node.kind === 'process') return state.show.has('processes');
  if (node.kind === 'sub') return state.show.has('subsidiary');
  return (node.trunk && mode === 0) || state.show.has('events');
};
// How much of a node the blend between the representations shows, and whether it counts in the one that is on.
const shownNow = (node) => (smooth(state.blend) < 0.5 ? node.inL : node.inT);
const presence = (node, m) => (1 - m) * (node.inL ? 1 : 0) + m * (node.inT ? 1 : 0);
const MIN_DUR = 0.02;
function pack(items) {
  const ends = [];
  for (const item of items.sort((a, b) => a.t0 - b.t0 || (b.t1 - b.t0) - (a.t1 - a.t0))) {
    let lane = ends.findIndex((end) => end <= item.t0); if (lane < 0) { lane = ends.length; ends.push(-Infinity); }
    ends[lane] = Math.max(item.t1, item.t0 + MIN_DUR); item.lane = lane;
  }
  return ends.length;
}
const ELEVATION = 0.8; // camera pitch, radians
let floors = []; let rows = [];
// Layers are terraces: each level of the tree a floor, lower than the one above it and nearer the viewer, so no floor hides
// another and every child hangs below and in front of what holds it.
function computeLayout() {
  setSpread(1); layoutAt();
  for (let i = 0; i < 3; i += 1) {
    const room = freeRect(); const fit = cameraFor[state.mode]; const height = fit.height ?? 0; if (!height) break;
    const k = Math.max(0.62, Math.min(2.6, spread * Math.max(0.6, Math.min(2.2, ((room.bottom - room.top) * 0.94) / height)))); if (Math.abs(k - spread) < 0.04) break;
    setSpread(k); layoutAt();
  }
}
function layoutAt() {
  for (const node of nodes) { node.inL = visible(node, 0); node.inT = visible(node, 1); node.shown = node.inL || node.inT; }
  const shown = nodes.filter((node) => node.inL); const together = nodes.filter((node) => node.inT);
  floors = [];
  let y = 0; let z = 0;
  for (let level = 0; level <= state.depth; level += 1) {
    const here = shown.filter((node) => node.depth === level); if (!here.length && level > 0) continue;
    const amp = here.some((node) => node.kind === 'process') ? AMP : 0;
    if (floors.length) { y -= (2.2 + amp * 0.45) * Math.sqrt(spread); z += 2.2 * spread + amp * 0.55; }
    const z0 = z; const blocks = [];
    for (const group of GROUPS) {
      const mine = here.filter((node) => node.group === group.key); if (!mine.length) continue;
      const start = z;
      for (const node of mine.filter((item) => item.kind === 'process')) { node.zL = z + ROW * 0.55; z += ROW; }
      const slow = mine.filter((node) => node.event?.role === 'slow'); const slowLanes = pack(slow);
      for (const node of slow) node.zL = z + node.lane * LANE * 0.42 + LANE * 0.3; z += slowLanes ? slowLanes * LANE * 0.42 + LANE * 0.3 : 0;
      const rest = mine.filter((node) => node.kind !== 'process' && node.event?.role !== 'slow'); const lanes = pack(rest);
      for (const node of rest) node.zL = z + node.lane * LANE + LANE * 0.5;
      z += lanes * LANE; blocks.push({ group, z0: start, z1: z }); z += GROUP_GAP;
    }
    z -= GROUP_GAP; if (z <= z0) z = z0 + LANE;
    for (const node of here) node.yL = y;
    floors.push({ level, y, z0, z1: z, depth: z - z0, blocks, count: here.length, roles: here, amp });
  }
  // Together: one field, each group's processes as rows with its Events in lanes in front of them.
  rows = []; z = 0;
  for (const group of GROUPS) {
    const mine = together.filter((node) => node.group === group.key); if (!mine.length) continue;
    const start = z;
    for (const node of mine.filter((item) => item.kind === 'process').sort((a, b) => a.depth - b.depth)) { node.zT = z + ROW * 0.75; z += ROW; }
    const slow = mine.filter((node) => node.event?.role === 'slow'); const slowLanes = pack(slow);
    for (const node of slow) node.zT = z + node.lane * LANE * 0.36 + LANE * 0.3; z += slowLanes ? slowLanes * LANE * 0.36 + LANE * 0.3 : 0;
    const rest = mine.filter((node) => node.kind !== 'process' && node.event?.role !== 'slow'); const lanes = pack(rest);
    for (const node of rest) node.zT = z + node.lane * LANE * 0.8 + LANE * 0.5;
    z += lanes * LANE * 0.8;
    rows.push({ group, z0: start, z1: z }); z += GROUP_GAP * 1.4;
  }
  for (const node of together) node.yT = 0;
  // A node in one representation only fades where it stands in that one.
  for (const node of nodes) { if (node.inL && !node.inT) { node.yT = node.yL; node.zT = node.zL; } if (node.inT && !node.inL) { node.yL = node.yT; node.zL = node.zT; } }
  fitCamera();
}

// The camera frames whichever representation is on, within the space the panels leave free.
const cameraFor = [null, null];
function freeRect() {
  const panel = document.getElementById('panel').getBoundingClientRect(); const title = document.querySelector('.hud.title').getBoundingClientRect();
  const top = Math.min(title.bottom + 20, innerHeight * 0.3);
  // A folded panel ends above the scene, which can then take the whole width.
  const right = panel.width && panel.left > innerWidth * 0.5 && panel.bottom > top - 10 ? panel.left - 16 : innerWidth - 24;
  return { left: 24, right, top, bottom: innerHeight - 96 };
}
function boxOf(mode) {
  const shown = nodes.filter((node) => node.shown); const ys = []; const zs = [];
  if (mode === 0) { for (const floor of floors) { ys.push(floor.y, floor.y + (floor.amp || 1)); zs.push(floor.z0, floor.z1); } }
  else { ys.push(0, ampAt(1)); zs.push(0, rows.length ? rows.at(-1).z1 : 1); }
  if (!shown.length) { ys.push(0, 1); zs.push(0, 1); }
  const mind = (state.show.has('notes') ? 7.5 : 0) + (state.show.has('prose') ? 3.2 : 0);
  return { x0: -LENGTH / 2 - 16, x1: LENGTH / 2 + 2, y0: Math.min(...ys) - 1.5, y1: Math.max(...ys) + 2 + mind, z0: Math.min(...zs) - (mind ? 7 : 0), z1: Math.max(...zs) + 5 };
}
function fitCamera() {
  const rect = freeRect(); camera.aspect = innerWidth / innerHeight;
  for (const mode of [0, 1]) {
    const box = boxOf(mode); const center = new THREE.Vector3((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2);
    const dir = new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
    const corners = []; for (const x of [box.x0, box.x1]) for (const y of [box.y0, box.y1]) for (const z of [box.z0, box.z1]) corners.push(new THREE.Vector3(x, y, z));
    // The distance that fills the free width; a box taller than the free height scrolls.
    let lo = 20; let hi = 5000; let fit = null;
    const measure = (d) => { camera.position.copy(center).addScaledVector(dir, d); camera.lookAt(center); camera.updateMatrixWorld(); camera.clearViewOffset(); camera.updateProjectionMatrix();
      const pts = corners.map((p) => p.clone().project(camera)); const sx = pts.map((p) => (p.x + 1) / 2 * innerWidth); const sy = pts.map((p) => (1 - p.y) / 2 * innerHeight);
      return { d, l: Math.min(...sx), r: Math.max(...sx), t: Math.min(...sy), b: Math.max(...sy) }; };
    for (let i = 0; i < 40; i += 1) { const d = (lo + hi) / 2; const m = measure(d); if (m.r - m.l <= rect.right - rect.left) { hi = d; fit = m; } else lo = d; }
    fit ??= measure(hi);
    const height = fit.b - fit.t; const room = rect.bottom - rect.top;
    const oy = height <= room ? (fit.t + fit.b) / 2 - (rect.top + rect.bottom) / 2 : fit.t - rect.top;
    cameraFor[mode] = { center, d: fit.d, ox: (fit.l + fit.r) / 2 - (rect.left + rect.right) / 2, oy, overflow: Math.max(0, height - room), height };
  }
  scroll = Math.min(scroll, cameraFor[state.mode].overflow);
  placeCamera();
}
let scroll = 0;
function placeCamera() {
  const m = smooth(state.blend); const a = cameraFor[0]; const b = cameraFor[1];
  const center = a.center.clone().lerp(b.center, m); const d = a.d + (b.d - a.d) * m;
  camera.position.copy(center).add(new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION)).multiplyScalar(d)); camera.lookAt(center);
  camera.aspect = innerWidth / innerHeight; camera.setViewOffset(innerWidth, innerHeight, a.ox + (b.ox - a.ox) * m, a.oy + (b.oy - a.oy) * m + scroll, innerWidth, innerHeight);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
const scrollBy = (dy) => { const max = Math.max(cameraFor[0].overflow, cameraFor[1].overflow) ? cameraFor[state.mode].overflow : 0; const next = Math.max(0, Math.min(max, scroll + dy)); if (next !== scroll) { scroll = next; dirty = true; } };

// ---- drawing -----------------------------------------------------------------------------------------------------------------------
// Where a node is drawn now: its lane in each representation, blended.
const at = (node) => { const m = smooth(state.blend); return { y: node.yL + (node.yT - node.yL) * m, z: node.zL + (node.zT - node.zL) * m }; };
const nearestShown = (id) => { for (let current = id, hops = 0; current && hops < 16; current = byId.get(current)?.parent, hops += 1) { const node = nodeById.get(current); if (node?.shown && shownNow(node)) return node; } return null; };
// The point an Event's threads, readings and links start from: the top of its bar at time t, or of the nearest shown Event
// that holds it.
function anchor(eventId, t) {
  const node = nearestShown(eventId);
  if (!node) {
    // Together without Events: over the front of the group whose moment it is, as the processes view places its decisions.
    const row = smooth(state.blend) >= 0.5 ? rows.find((item) => item.group.key === groupOf(byId.get(eventId)?.owner)) : null;
    return row && Number.isFinite(t) ? { x: X(t), y: ampAt(1) * 0.8, z: row.z1 + 0.3, node: null, own: false } : null;
  }
  const p = at(node);
  const time = Math.max(node.t0, Math.min(node.t1, t ?? node.t0));
  return { x: X(time), y: p.y + (node.kind === 'sub' ? BAR * 1.6 : BAR) + 0.02, z: p.z, node, own: node.id === eventId };
}
const WHITE = color('#ffffff'); const RIM = color('#101114');
// Prose and the agent's notes float over the top of the tree (Layers) or behind the field (Together), prose lowest.
const mindBase = (m) => ({ y: (1 - m) * ((floors[0]?.y ?? 0) + (floors[0]?.amp ?? 0)) + m * ampAt(1) + 1.6, z: (1 - m) * (floors[0]?.z0 ?? 0) - 1.6 });
let hoverTargets = []; let lit = null; let litChain = new Set(); let profile = null; let drawCount = 0; let threadTops = [];
const scratch = new THREE.Vector3();
const screen = (x, y, z) => { const v = scratch.set(x, y, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, ok: v.z < 1 }; };
// Hover targets keep world positions; they are projected only when the pointer looks for one.
const W = (x, y, z) => [x, y, z];
function draw() {
  const m = smooth(state.blend); const left = -LENGTH / 2; const right = LENGTH / 2; const clampX = (x) => Math.max(left - 0.5, Math.min(right + 0.5, x));
  const mark = [performance.now()]; drawCount += 1; tabulate(); mark.push(performance.now());
  for (const buffer of [grid, connectors, threads, arcs, noteLines, crests, walls, chips, glows]) buffer.begin();
  hoverTargets = [];
  const layerAlpha = 1 - m; const fieldAlpha = m;
  // Floors and the time grid: faint planes of light with the ticks' lines across them.
  const ticks = tickMarks();
  const planes = [];
  if (layerAlpha > 0.01) for (const floor of floors) planes.push({ y: floor.y * (1 - m), z0: floor.z0 - 0.4, z1: floor.z1 + 0.4, a: layerAlpha });
  if (fieldAlpha > 0.01) planes.push({ y: 0, z0: -0.4, z1: (rows.at(-1)?.z1 ?? 1) + 0.4, a: fieldAlpha });
  const edge = color('#27324a'); const line = color('#1b2233');
  for (const plane of planes) {
    grid.add(left, plane.y, plane.z1, right, plane.y, plane.z1, edge, 0.9 * plane.a); grid.add(left, plane.y, plane.z0, right, plane.y, plane.z0, line, 0.7 * plane.a);
    for (const tick of ticks) grid.add(tick.x, plane.y, plane.z0, tick.x, plane.y, plane.z1, tick.major ? edge : line, (tick.major ? 0.9 : 0.55) * plane.a);
  }
  // Nodes.
  for (const node of nodes) {
    if (!node.shown) continue; const vis = presence(node, m); if (vis < 0.01) continue;
    const p = at(node); const hue = color(hueOf(node.owner)); const chain = litChain.has(node.id); const live = shownNow(node);
    const x0 = X(node.t0); const x1 = X(node.t1); if (x1 < left - 1 || x0 > right + 1) continue;
    const a = clampX(x0); const b = clampX(x1); const wide = b - a;
    if (node.kind === 'process') {
      const amp = ampAt(m); const n = Math.max(2, Math.min(260, Math.ceil(wide / 0.4)));
      const light = hue.clone().lerp(WHITE, 0.35); let px = null; let py = null; const samples = [];
      for (let i = 0; i < n; i += 1) {
        const x = a + (wide * i) / (n - 1); const t = timeAtX(x); const v = valueAt(node.points, t);
        const h = ((v - node.range[0]) / (node.range[1] - node.range[0] || 1)) * amp; const y = p.y + Math.max(0.04, h);
        if (px !== null) { walls.quad(px, x, p.y, py, p.y, y, p.z, hue, 0, (chain ? 0.42 : 0.28) * vis); crests.add(px, py, p.z, x, y, p.z, light, (chain ? 1 : 0.9) * vis); }
        px = x; py = y; samples.push([x, y]);
      }
      node.crest = samples;
      if (live) hoverTargets.push({ kind: 'process', node, xs: samples.map(([x]) => x), wpts: samples.map(([x, y]) => W(x, y, p.z)) });
      continue;
    }
    const event = node.event; const sub = node.kind === 'sub';
    const top = p.y + (sub ? BAR * 1.6 : BAR); const tint = hue.clone().lerp(WHITE, sub ? 0.15 : 0.3);
    const alpha = (sub ? 0.05 : node.depth <= 1 ? 0.1 : 0.2) * (chain ? 2.5 : 1) * vis; const own = event.context === 'inner';
    if (wide > 0.12) {
      const crestAlpha = (chain ? 1 : sub ? 0.4 : node.depth <= 1 ? 0.5 : 0.75) * vis;
      if (own) { for (let x = a; x < b; x += 0.9) crests.add(x, top, p.z, Math.min(b, x + 0.5), top, p.z, tint, crestAlpha); }
      else { walls.quad(a, b, p.y, top, p.y, top, p.z, tint, sub ? alpha : 0.0, alpha * (sub ? 1 : 1.2)); crests.add(a, top, p.z, b, top, p.z, tint, crestAlpha); }
      if (sub) crests.add(a, p.y, p.z, b, p.y, p.z, tint, 0.2 * vis);
      if (x0 >= left) crests.add(a, p.y, p.z, a, top, p.z, tint, 0.8 * vis);
      if (live) hoverTargets.push({ kind: sub ? 'sub' : 'event', node, wseg: [W(a, top, p.z), W(b, top, p.z)] });
    }
    if (wide <= 1.2) { glows.add((a + b) / 2, top, p.z, tint.clone().lerp(WHITE, 0.4), (chain ? 1 : 0.95) * vis, wide <= 0.12 ? 15 : 11); if (live) hoverTargets.push({ kind: sub ? 'sub' : 'event', node, wpt: W((a + b) / 2, top, p.z) }); }
    // The tree: a thread from each node up to the nearest shown node that holds it.
    const parent = node.parent && node.inL ? nearestShown(node.parent) : null;
    if (parent && layerAlpha > 0.01) {
      const q = at(parent); const x = Math.max(x0, X(parent.t0)); const holds = chain && litChain.has(parent.id);
      if ((x >= left && x <= right) || holds) connectors.add(clampX(x), top, p.z, clampX(x), q.y + (parent.kind === 'sub' ? 0 : 0.02), q.z, holds ? WHITE : tint, (holds ? 0.85 : 0.16) * layerAlpha, (holds ? 0.85 : 0.05) * layerAlpha);
    }
  }
  // Named processes hang from their home: a thread from the curtain's start to the Event that holds it.
  for (const node of nodes) if (node.inL && node.kind === 'process' && layerAlpha > 0.01) {
    const home = nearestShown(node.parent); if (!home) continue; const p = at(node); const q = at(home); const x = X(Math.max(node.t0, home.t0)); const holds = litChain.has(node.id) && litChain.has(home.id);
    if ((x < left || x > right) && !holds) continue;
    connectors.add(clampX(x), p.y, p.z, clampX(x), q.y, q.z, holds ? WHITE : color(hueOf(node.owner)), (holds ? 0.8 : 0.2) * layerAlpha, (holds ? 0.8 : 0.06) * layerAlpha);
  }
  // Events that move a named process, at the moment each begins: from a shown Event a thread to the crest of every process
  // it moves; from one that is not shown, a thread through those crests, as in the processes view.
  threadTops = [];
  if (state.show.has('processes')) for (const event of events) {
    if (!event.processIds?.length || !Number.isFinite(event.start)) continue; const x = X(event.start); if (x < left || x > right) continue;
    const lights = event.processIds.map((id) => nodeById.get(id)).filter((node) => node?.shown && shownNow(node) && event.start >= node.t0 && event.start <= node.t1);
    if (!lights.length) continue; const from = anchor(event.id, event.start); const own = Boolean(from?.own);
    const on = litChain.has(event.id) || lights.some((node) => node === lit?.node) || lit?.event === event;
    const tops = lights.map((node) => { const p = at(node); const v = valueAt(node.points, event.start); return { y: p.y + Math.max(0.04, ((v - node.range[0]) / (node.range[1] - node.range[0] || 1)) * ampAt(m)), base: p.y, z: p.z }; }).sort((a, b) => a.z - b.z);
    if (own) for (const top of tops) threads.add(from.x, from.y, from.z, x, top.y, top.z, WHITE, on ? 0.9 : 0.22, on ? 0.9 : 0.45);
    else {
      for (const top of tops) threads.add(x, top.base, top.z, x, top.y, top.z, WHITE, on ? 0.6 : 0.12, on ? 0.9 : 0.35);
      for (let i = 1; i < tops.length; i += 1) threads.add(x, tops[i - 1].y, tops[i - 1].z, x, tops[i].y, tops[i].z, WHITE, on ? 0.95 : 0.5);
      threadTops.push({ event, x, top: tops.reduce((a, b) => (b.y > a.y ? b : a)), weight: tops.length });
    }
    for (const top of tops) { glows.add(x, top.y, top.z, WHITE, on ? 1 : 0.75, own ? 10 : 13); if (!own) hoverTargets.push({ kind: 'thread', event, wpt: W(x, top.y, top.z) }); }
  }
  // Decisions: a diamond over the moment, white once the model has drawn it.
  let d = 0; const matrix = new THREE.Matrix4(); const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const decision of decisions) {
    const place = state.show.has('decisions') ? anchor(decision.eventId, decision.t) : null;
    if (!place || place.x < left || place.x > right) { diamond.setMatrixAt(d, hidden); d += 1; continue; }
    const y = place.y + 0.95; matrix.makeTranslation(place.x, y, place.z); diamond.setMatrixAt(d, matrix);
    diamond.setColorAt(d, decision.drawn ? WHITE : color(hueOf(decision.owner)).clone().lerp(WHITE, 0.2)); d += 1;
    if (decision.drawn) glows.add(place.x, y, place.z, color(hueOf(decision.owner)), 0.9, 34);
    hoverTargets.push({ kind: 'decision', decision, wpt: W(place.x, y, place.z) });
  }
  diamond.count = d; diamond.instanceMatrix.needsUpdate = true; if (diamond.instanceColor) diamond.instanceColor.needsUpdate = true;
  // Lens readings: a small bar of each reading's answers over its moment, one row per lens.
  const onLenses = lenses.filter((lens) => state.lenses.has(lens.id));
  onLenses.forEach((lens, row) => {
    for (const reading of lens.readings) {
      const place = anchor(reading.eventId, reading.t); if (!place || place.x < left || place.x > right) continue;
      const w = 3.1; const h = 0.62; const y = place.y + (state.show.has('decisions') ? 2.2 : 0.9) + row * 0.95; let x = place.x - w / 2;
      const alpha = reading.earlier ? 0.4 : 1; const on = lit?.reading === reading;
      chips.quad(x - 0.12, x + w + 0.12, y - 0.12, y + h + 0.12, y - 0.12, y + h + 0.12, place.z, on ? WHITE : RIM, 0.95, 0.95);
      for (const answer of reading.answers.filter((item) => item.weight > 0).sort((a, b) => (a.key === 'remainder') - (b.key === 'remainder'))) {
        const width = w * answer.weight; chips.quad(x, x + width, y, y + h, y, y + h, place.z, color(lens.colorOf(answer.key)), alpha, alpha); x += width;
      }
      hoverTargets.push({ kind: 'lens', lens, reading, wpt: W(place.x, y + h / 2, place.z), r: 20 });
    }
  });
  // Causal links: arcs between the Events they join.
  if (state.show.has('causal')) for (const relation of relations) {
    const source = byId.get(relation.source); const target = byId.get(relation.target);
    const a = anchor(source.id, Number.isFinite(source.start) ? source.start : source.reach[0]); const b = anchor(target.id, Number.isFinite(target.start) ? target.start : target.reach[0]);
    if (!a || !b || a.x < left - 1 || b.x < left - 1 || a.x > right + 1 || b.x > right + 1 || (a.node === b.node && Math.abs(a.x - b.x) < 0.05)) continue;
    const lift = 0.8 + Math.min(12, Math.abs(b.x - a.x) * 0.22 + Math.abs(b.y - a.y) * 0.3); const mid = new THREE.Vector3((a.x + b.x) / 2, Math.max(a.y, b.y) + lift, (a.z + b.z) / 2);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(a.x, a.y, a.z), mid, new THREE.Vector3(b.x, b.y, b.z)); const pts = curve.getPoints(28); const c = color(KIND[relation.kind] ?? KIND.other);
    const on = litChain.has(source.id) || litChain.has(target.id);
    for (let i = 1; i < pts.length; i += 1) arcs.add(pts[i - 1].x, pts[i - 1].y, pts[i - 1].z, pts[i].x, pts[i].y, pts[i].z, c, (on ? 1 : 0.55) * (0.35 + 0.65 * (i / pts.length)));
    hoverTargets.push({ kind: 'causal', relation, wpt: W(mid.x * 0.5 + (a.x + b.x) / 4, (mid.y + Math.max(a.y, b.y)) / 2, mid.z), r: 10 });
  }
  // The agent's notes: lights above and behind, threaded to the moments they are about.
  if (state.show.has('notes')) {
    const base = mindBase(m); const top = base.y + (state.show.has('prose') ? 3.2 : 1.2); const zBack = base.z - 1.4;
    const slots = new Map();
    for (const note of notes) {
      const x = X(note.t); if (x < left - 2 || x > right + 2) continue;
      const slot = Math.round(x / 1.6); const k = slots.get(slot) ?? 0; slots.set(slot, k + 1);
      const y = top + (k % 5) * 1.05; const z = zBack - Math.floor(k / 5) * 1.2; const [kind, hex] = NOTE[note.node.category] ?? ['Note', '#dddddd']; const c = color(hex);
      const on = lit?.note === note; glows.add(x, y, z, c, on ? 1 : 0.85, on ? 22 : 15);
      for (const id of note.events) { const place = anchor(id, Number.isFinite(byId.get(id).start) ? byId.get(id).start : byId.get(id).reach[0]); if (place && place.x >= left - 1 && place.x <= right + 1) noteLines.add(x, y, z, place.x, place.y, place.z, c, on ? 0.9 : 0.12, on ? 0.8 : 0.05); }
      hoverTargets.push({ kind: 'note', note, noteKind: kind, wpt: W(x, y, z) });
    }
  }
  // Prose: each part of the story over the moments it tells, threaded down to them.
  if (state.show.has('prose')) {
    const base = mindBase(m); const front = base.z; const y = base.y; const c = color('#fff0d0');
    for (const unit of prose) {
      const x = X(unit.t); if (x < left - 1 || x > right + 1) continue; const on = lit?.unit === unit;
      chips.quad(x - 0.35, x + 0.35, y, y + 0.9, y, y + 0.9, front, c, on ? 0.9 : 0.55, on ? 0.9 : 0.55);
      for (const tell of unit.tells ?? []) { const place = anchor(tell.eventId, byId.get(tell.eventId)?.start); if (place) threads.add(x, y + 0.9, front, place.x, place.y, place.z, c, on ? 0.9 : 0.16, on ? 0.7 : 0.05); }
      hoverTargets.push({ kind: 'prose', unit, wpt: W(x, y + 0.45, front), r: 14 });
    }
  }
  for (const buffer of [grid, connectors, threads, arcs, noteLines, crests, walls, chips, glows]) buffer.end();
  mark.push(performance.now()); labels.update(ticks); mark.push(performance.now());
  profile = { tabulate: mark[1] - mark[0], geometry: mark[2] - mark[1], labels: mark[3] - mark[2] };
  document.getElementById('span').innerHTML = `<b>${timeText(F.a)} – ${timeText(F.b)}</b> · ${spanText(F.a, F.b)}${F.w > 0.5 ? ' · years before the present, on a log scale' : ''}`;
}

// Ticks: coarse ones first, finer ones where they fit, so the axis reads at every scale and on a log scale too.
function tickMarks() {
  const out = []; const left = -LENGTH / 2; const right = LENGTH / 2; const width = rect().right - rect().left;
  const pxPer = width / LENGTH; const gap = 92;
  const taken = []; const room = (x) => taken.every((other) => Math.abs(other - x) * pxPer >= gap);
  // A tick at a step shows only where its neighbours at that step are far enough apart to read, and nothing is near it.
  const legible = (t, before, after) => Math.min(Math.abs(X(t) - X(before)), Math.abs(X(after) - X(t))) * pxPer >= gap * 0.9;
  const tryAdd = (t, text, major, before, after) => { if (!(t >= F.a && t <= F.b)) return; const x = X(t); if (x < left || x > right || !room(x) || !legible(t, before, after)) return; taken.push(x); out.push({ t, x, text: typeof text === 'function' ? text() : text, major }); };
  const ages = [300000, 100000, 30000, 10000, 5000];
  ages.forEach((age, i) => tryAdd(PRESENT - age, () => `${grouped(age)} years ago`, true, PRESENT - (ages[i - 1] ?? age * 3), PRESENT - (ages[i + 1] ?? age / 3)));
  for (const step of [1000, 500, 100, 50, 10, 5, 1]) {
    const from = Math.ceil(Math.max(F.a, PRESENT - 5000) / step) * step;
    for (let year = from; year <= F.b && out.length < 400; year += step) if (year !== 0) tryAdd(year, () => yearText(year), step >= 100 || year % 100 === 0, year - step, year + step);
  }
  if (F.s < 12) for (const every of [6, 3, 1]) {
    for (let year = Math.floor(F.a); year <= Math.ceil(F.b); year += 1) for (let month = 0; month < 12; month += every) {
      const t = year + month / 12; tryAdd(t, () => (month === 0 ? `${year}` : F.s < 2 ? `${MONTHS[month]} ${year}` : MONTHS[month]), month === 0, t - every / 12, t + every / 12);
    }
  }
  if (F.s < 0.4) for (const every of [7, 1]) {
    const start = dateOf(F.a); const day0 = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()); const day = 1 / 365.2425;
    for (let ms = day0; ms <= day0 + F.s * 365.2425 * 86400000 + 86400000; ms += 86400000) {
      const date = new Date(ms); if (every === 7 && date.getUTCDay() !== 1) continue;
      const t = date.getUTCFullYear() + (ms - Date.UTC(date.getUTCFullYear(), 0, 1)) / (365.2425 * 86400000);
      tryAdd(t, () => `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`, date.getUTCDate() === 1, t - every * day, t + every * day);
    }
  }
  return out.sort((a, b) => a.x - b.x);
}
const rect = () => freeRect();

// ---- labels: placed by priority, never over each other or the panels ------------------------------------------------------------
const labels = (() => {
  const layer = document.getElementById('labels'); const pool = new Map();
  const element = (key, className, html) => {
    let item = pool.get(key);
    if (!item) { const el = document.createElement('div'); el.className = `lbl ${className}`; layer.append(el); item = { el, html: null, w: 0, h: 0 }; pool.set(key, item); }
    if (item.html !== html) { item.el.innerHTML = html; item.html = html; item.w = 0; }
    if (item.el.className !== `lbl ${className}`) { item.el.className = `lbl ${className}`; item.w = 0; }
    return item;
  };
  function update(ticks) {
    const wanted = []; const m = smooth(state.blend); const left = -LENGTH / 2; const right = LENGTH / 2;
    const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    // The time axis, under the front of the nearest floor.
    // The time axis, pinned above the bar and aligned with whatever floor is at the bottom of the free area.
    const room = freeRect(); const ref = groundAt((room.left + room.right) / 2, room.bottom - 6) ?? { y: 0, z: 0 };
    const axisY = Math.min(room.bottom + 4, Math.max(room.top + 40, screen(0, ref.y, ref.z).y + 8));
    for (const tick of ticks) { const s = screen(tick.x, ref.y, ref.z); wanted.push({ key: `tick:${tick.t.toFixed(6)}`, cls: `tick${tick.major ? ' major' : ''}`, html: esc(tick.text), sp: [s.x, axisY], ax: 0.5, ay: 0, pri: 1000 }); }
    // Floors (Layers) and groups (Together), at the left edge.
    if (m < 0.5) for (const floor of floors) {
      const counts = new Map(); for (const node of floor.roles) { const key = node.kind === 'process' ? 'processes' : node.event.role; counts.set(key, (counts.get(key) ?? 0) + 1); }
      const words = { world: 'the world', development: 'developments', life: 'lives', inner: 'inner lives', period: 'periods', arc: 'change arcs', part: 'parts', moment: 'moments', slow: 'slow processes', phase: 'phases', processes: 'processes' };
      const text = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, n]) => (key === 'world' ? words[key] : `${n} ${words[key] ?? key}`)).join(' · ');
      wanted.push({ key: `floor:${floor.level}`, cls: 'floor', html: `Level ${floor.level}<span>${esc(text)}</span>`, p: [left - 1.2, floor.y, (floor.z0 + floor.z1) / 2], ax: 1, ay: 0.5, pri: 950 });
    } else for (const row of rows) wanted.push({ key: `group:${row.group.key}`, cls: 'group', html: `<b style="color:${row.group.hue}">${esc(row.group.name)}</b>`, p: [left - 1.2, 0, (row.z0 + row.z1) / 2], ax: 1, ay: 0.5, pri: 950 });
    // Processes, at the left of what is on screen of them.
    for (const node of nodes) {
      if (!node.shown || !shownNow(node) || !node.crest?.length) continue; const p = at(node); const [x, y] = node.crest[0]; if (x > right - 4) continue;
      const hue = hueOf(node.owner); const who = people.get(node.owner)?.first;
      wanted.push({ key: `proc:${node.id}`, cls: 'process', html: `<span style="color:color-mix(in srgb, ${hue} 45%, #fff)">${esc(processName(node.process))}</span>${who && m > 0.5 ? '' : ''}`, p: [x + 0.3, Math.max(y, p.y + 0.3) + 0.25, p.z], ax: 0, ay: 1, pri: 700 + node.points.length });
    }
    // Events: the widest on screen first, then the ones the model says most about.
    for (const node of nodes) {
      if (!node.shown || !shownNow(node) || node.kind === 'process') continue; const p = at(node);
      const x0 = Math.max(left, X(node.t0)); const x1 = Math.min(right, X(node.t1)); if (x1 < left || x0 > right) continue;
      const wide = x1 - x0; const top = p.y + (node.kind === 'sub' ? BAR * 1.6 : BAR);
      const big = node.depth <= 1 || wide > LENGTH * 0.25;
      const pri = 400 + Math.min(200, wide * 3) - node.depth * 20 + (node.event.cuts ?? 0) * 4 + (litChain.has(node.id) ? 400 : 0);
      const x = wide > 1.2 ? x0 + 0.25 : (x0 + x1) / 2;
      wanted.push({ key: `ev:${node.id}`, cls: `event${big ? ' big' : ''}${node.kind === 'sub' ? ' sub' : ''}${node.event.context === 'inner' ? ' inner' : ''}`, html: esc(words(node.event.name, big ? 52 : 40)), p: [x, top + 0.12, p.z], ax: wide > 1.2 ? 0 : 0.5, ay: 1, pri });
    }
    for (const thread of threadTops) if (thread.weight >= 2) wanted.push({ key: `thr:${thread.event.id}`, cls: 'event', html: esc(words(thread.event.name, 40)), p: [thread.x, thread.top.y + 0.5, thread.top.z], ax: 0.5, ay: 1, pri: 300 + thread.weight * 25 + (litChain.has(thread.event.id) ? 400 : 0) });
    if (state.show.has('prose')) {
      const base = mindBase(m); const front = base.z; const y = base.y + 1.15;
      for (const unit of prose) { const x = X(unit.t); if (x >= left && x <= right) wanted.push({ key: `prose:${unit.id}`, cls: 'prose', html: esc(unit.title ?? ''), p: [x, y, front], ax: 0.5, ay: 1, pri: 800 }); }
    }
    // Place: highest priority first, each where it overlaps nothing already placed. The page is read first (panels and
    // any label not yet measured), then written, so the layout is computed once.
    const panels = [...document.querySelectorAll('.hud.panel, .hud.bar, .hud.title')].map((el) => el.getBoundingClientRect()).filter((r) => r.width);
    const placed = [...panels.map((r) => ({ l: r.left - 6, r: r.right + 6, t: r.top - 4, b: r.bottom + 4 }))];
    wanted.sort((a, b) => b.pri - a.pri);
    const items = wanted.map((want) => element(want.key, want.cls, want.html));
    const fresh = items.filter((item) => !item.w); for (const item of fresh) item.el.style.transform = 'translate(-9999px,0)';
    for (const item of fresh) { item.w = item.el.offsetWidth; item.h = item.el.offsetHeight; }
    const next = new Map();
    wanted.forEach((want, i) => {
      const item = items[i]; const s = want.sp ? { x: want.sp[0], y: want.sp[1], ok: true } : screen(...want.p);
      if (!s.ok || s.x < -200 || s.x > innerWidth + 200) return;
      const l = s.x - item.w * want.ax; const t = s.y - item.h * want.ay; const box = { l, r: l + item.w, t, b: t + item.h };
      if (box.l < 2 || box.r > innerWidth - 2 || box.t < 2 || box.b > innerHeight - 2) return;
      if (placed.some((o) => box.l < o.r + 3 && box.r > o.l - 3 && box.t < o.b + 1 && box.b > o.t - 1)) return;
      placed.push(box); next.set(want.key, [item, Math.round(l), Math.round(t)]);
    });
    for (const [item, l, t] of next.values()) { const transform = `translate(${l}px, ${t}px)`; if (item.transform !== transform) { item.el.style.transform = transform; item.transform = transform; } if (item.hidden !== false) { item.el.classList.remove('hide'); item.hidden = false; } }
    for (const [key, item] of pool) if (!next.has(key) && item.hidden !== true) { item.el.classList.add('hide'); item.hidden = true; }
  }
  return { update };
})();

// ---- interaction: zoom and pan in time, presets, hover ----------------------------------------------------------------------------
function groundAt(clientX, clientY) {
  const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1); const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
  const m = smooth(state.blend); const planes = [];
  if (m < 0.99) for (const floor of floors) planes.push({ y: floor.y * (1 - m), z0: floor.z0 * (1 - m) - 1.2, z1: floor.z1 * (1 - m) + (rows.at(-1)?.z1 ?? 0) * m + 1.2 });
  else planes.push({ y: 0, z0: -1, z1: (rows.at(-1)?.z1 ?? 1) + 1 });
  let best = null;
  for (const plane of planes) { const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -plane.y), new THREE.Vector3()); if (hit && hit.z >= plane.z0 && hit.z <= plane.z1) { best = hit; break; } }
  if (!best && planes.length) { const last = planes.at(-1); const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -last.y), new THREE.Vector3()); if (hit) best = new THREE.Vector3(hit.x, last.y, Math.min(hit.z, last.z1)); }
  return best;
}
const pointerTime = (clientX, clientY) => {
  // The time under the pointer: where its ray meets the floor (or field) beneath it, else the plane through the middle.
  const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1); const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
  const m = smooth(state.blend); let best = null;
  const planes = m < 0.5 ? floors.map((floor) => ({ y: floor.y, z0: floor.z0 - 1.2, z1: floor.z1 + 1.2 })) : [{ y: 0, z0: -1, z1: (rows.at(-1)?.z1 ?? 1) + 1 }];
  for (const plane of planes) { const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -plane.y), new THREE.Vector3()); if (hit && hit.z >= plane.z0 && hit.z <= plane.z1) { best = hit; break; } }
  if (!best) best = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -(cameraFor[state.mode]?.center.z ?? 0)), new THREE.Vector3()) ?? new THREE.Vector3();
  const u = best.x / LENGTH + 0.5; return { u, t: timeAt(F, u) };
};
let animation = null;
function setView(a, b) { F = frameOf(a, b); dirty = true; }
function zoomAt(clientX, clientY, factor) { animation = null; clearPreset(); const { u, t } = pointerTime(clientX, clientY); const [a, b] = windowAt(t, u, F.s / factor); setView(a, b); hideHint(); }
function animateTo(a, b, ms = 1400) {
  const from = [G(F.a), G(F.b)]; const to = [G(a), G(b)]; const t0 = performance.now();
  animation = (now) => { const k = smooth(Math.min(1, (now - t0) / ms)); const ga = from[0] + (to[0] - from[0]) * k; const gb = from[1] + (to[1] - from[1]) * k; setView(Ginv(ga), Math.min(PRESENT, Ginv(gb))); if (k >= 1) animation = null; };
}
const lives = principals.filter((person) => person.life).map((person) => ({ name: person.name.split(' ')[0], start: person.life.start, end: person.life.end }));
let lifeTurn = 0;
const storyWindow = data.storyWindow ?? data.window ?? { start: PRESENT - 5, end: PRESENT };
const centuries = (() => { const starts = events.filter((event) => event.depth === 1 && event.reach[0] >= 1000).map((event) => event.reach[0]); return starts.length ? Math.min(...starts) : PRESENT - 600; })();
const PRESETS = {
  story: () => { const pad = (storyWindow.end - storyWindow.start) * 0.06 + 0.1; return [storyWindow.start - pad, Math.min(PRESENT, storyWindow.end + pad)]; },
  life: () => { const life = lives[lifeTurn % lives.length] ?? { start: PRESENT - 80, end: PRESENT }; const pad = (life.end - life.start) * 0.04; return [life.start - pad, Math.min(PRESENT, life.end + pad)]; },
  centuries: () => [centuries - (PRESENT - centuries) * 0.04, PRESENT],
  world: () => [BOUNDS[0], BOUNDS[1]],
};
let currentPreset = null;
function preset(name, animate = true) {
  if (name === 'life' && animate && currentPreset === 'life') lifeTurn += 1;
  currentPreset = name;
  const [a, b] = PRESETS[name](); if (animate) animateTo(a, b); else setView(a, b);
  for (const button of document.querySelectorAll('#presets button')) button.classList.toggle('on', button.dataset.preset === name);
  const life = document.querySelector('#presets [data-preset="life"]'); if (lives.length) life.textContent = name === 'life' ? `${lives[lifeTurn % lives.length].name}'s life` : 'A life';
}
for (const button of document.querySelectorAll('#presets button')) button.addEventListener('click', () => preset(button.dataset.preset));
const clearPreset = () => { currentPreset = null; for (const button of document.querySelectorAll('#presets button')) button.classList.remove('on'); document.querySelector('#presets [data-preset="life"]').textContent = 'A life'; };

const canvas = renderer.domElement; let drag = null; const touches = new Map();
canvas.addEventListener('wheel', (event) => {
  event.preventDefault(); clearPreset();
  const dx = event.deltaX; const dy = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
  if (event.shiftKey && !event.ctrlKey) { scrollBy(dy || dx); return; }
  if (Math.abs(dx) > Math.abs(dy) && !event.ctrlKey) { const width = rect().right - rect().left; const { u, t } = pointerTime(event.clientX, event.clientY); const [a, b] = windowAt(t, u + dx / width, F.s); animation = null; setView(a, b); return; }
  zoomAt(event.clientX, event.clientY, Math.exp(-dy * (event.ctrlKey ? 0.012 : 0.0016)));
}, { passive: false });
canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId); touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touches.size === 1) { const { u, t } = pointerTime(event.clientX, event.clientY); drag = { t, u, x: event.clientX, y: event.clientY, scroll, moved: false }; }
  else { drag = null; const [p, q] = [...touches.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2 }; }
});
let pinch = null;
canvas.addEventListener('pointermove', (event) => {
  pointer = { x: event.clientX, y: event.clientY }; hoverDirty = true;
  if (touches.has(event.pointerId)) touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pinch && touches.size === 2) { const [p, q] = [...touches.values()]; const d = Math.hypot(p.x - q.x, p.y - q.y); if (d > 10) { zoomAt(pinch.cx, pinch.cy, d / pinch.d); pinch.d = d; clearPreset(); } return; }
  if (!drag) return;
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3) { drag.moved = true; canvas.classList.add('dragging'); }
  if (drag.moved) {
    const width = rect().right - rect().left; const u = drag.u + (event.clientX - drag.x) / width;
    if (Math.abs(event.clientX - drag.x) > 1) { animation = null; const [a, b] = windowAt(drag.t, u, F.s); setView(a, b); clearPreset(); }
    scrollBy(drag.scroll - (event.clientY - drag.y) - scroll); hideHint();
  }
});
const release = (event) => { touches.delete(event.pointerId); if (touches.size < 2) pinch = null; if (drag && !drag.moved && event.type === 'pointerup') click(); drag = null; canvas.classList.remove('dragging'); };
canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { pointer = null; hoverDirty = true; });
let hintShown = true; const hideHint = () => { if (hintShown) { hintShown = false; document.getElementById('hint').style.opacity = '0'; } };

// Hover: the nearest thing on screen within a few pixels, and what it is.
let pointer = null; let hoverDirty = false;
const tip = document.getElementById('tip');
const distToSeg = (p, a, b) => { const dx = b.x - a.x; const dy = b.y - a.y; const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - a.x - k * dx, p.y - a.y - k * dy); };
function hover() {
  hoverDirty = false; let best = null; let bestD = Infinity;
  if (pointer && !drag?.moved) for (const target of hoverTargets) {
    if (target.drawn !== drawCount) { target.drawn = drawCount; if (target.wpt) target.pt = screen(...target.wpt); if (target.wseg) target.seg = target.wseg.map((w) => screen(...w)); if (target.wpts) target.pts = target.wpts.map((w) => screen(...w)); }
    let d = Infinity;
    if (target.pt) d = Math.hypot(target.pt.x - pointer.x, target.pt.y - pointer.y) - (target.r ?? 11) + 11;
    else if (target.seg) d = distToSeg(pointer, target.seg[0], target.seg[1]) + 2;
    else if (target.pts) for (let i = 1; i < target.pts.length; i += 1) { const e = distToSeg(pointer, target.pts[i - 1], target.pts[i]) + 1; if (e < d) { d = e; target.near = i; } }
    const priority = { decision: -4, lens: -3, note: -2, prose: -3, thread: -1, causal: 0, process: 0, event: 1, sub: 2 }[target.kind] ?? 0;
    if (d < 11 && d + priority < bestD) { bestD = d + priority; best = target; }
  }
  const same = best && lit && (best.node ?? best.event ?? best.decision ?? best.reading ?? best.note ?? best.unit ?? best.relation) === (lit.node ?? lit.event ?? lit.decision ?? lit.reading ?? lit.note ?? lit.unit ?? lit.relation);
  if (!same) {
    lit = best; litChain = new Set();
    if (best?.node) { for (let id = best.node.id, hops = 0; id && hops < 16; id = (nodeById.get(id)?.parent) ?? null, hops += 1) litChain.add(id); }
    for (const id of [best?.event?.id, best?.decision?.eventId, best?.reading?.eventId, ...(best?.note?.events ?? []), ...(best?.unit?.tells ?? []).map((tell) => tell.eventId), best?.relation?.source, best?.relation?.target]) if (id) for (let at = id, hops = 0; at && hops < 16; at = byId.get(at)?.parent, hops += 1) litChain.add(at);
    dirty = true;
  }
  if (!best) { tip.hidden = true; canvas.style.cursor = ''; return; }
  canvas.style.cursor = best.kind === 'prose' ? 'pointer' : 'help';
  showTip(best);
}
const line = (cls, text) => { const el = document.createElement('div'); el.className = cls; el.textContent = text; return el; };
const range = (t0, t1) => (Math.abs(t1 - t0) < 0.003 ? timeText(t0, 0.1) : `${timeText(t0, Math.min(40, t1 - t0))} – ${timeText(t1, Math.min(40, t1 - t0))}`);
const weights = (answers, colorOf, drawn) => { const box = document.createElement('div'); box.className = 'w';
  for (const answer of answers.slice(0, 6)) { const b = document.createElement('b'); b.textContent = `${Math.round(answer.weight * 100)}%`; if (colorOf) b.style.color = colorOf(answer.key); const i = document.createElement('i'); i.textContent = `${answer.key.replace(/[_.-]+/g, ' ')}${drawn === answer.key ? '  ← drawn' : ''}`; if (drawn === answer.key) i.className = 'd'; box.append(b, i); }
  return box; };
function showTip(target) {
  tip.replaceChildren();
  if (target.kind === 'event' || target.kind === 'sub' || target.kind === 'thread') {
    const event = target.event ?? target.node.event; const holder = event.parent ? byId.get(event.parent) : null; const who = people.get(event.owner)?.person.name ?? referents.get(event.owner)?.short ?? 'The world';
    const scaffold = scaffoldOf.get(event.id);
    const roles = { world: 'The world', development: 'A long development', life: 'A life', inner: 'An inner life', period: 'A period of a life', arc: 'A change arc', phase: 'A phase of a change arc', slow: 'A slow process of a life', part: 'A part', moment: 'A moment' };
    const own = event.context === 'inner';
    tip.append(line('k', own ? `${who}'s own · ${event.role === 'inner' ? 'their inner process' : 'a record of their inner process'} · level ${event.depth}` : `${roles[event.role] ?? 'An Event'} · level ${event.depth} · ${who}`), line('v', clip(event.label, 200)));
    if (own) tip.append(line('a', `Held in ${who.split(' ')[0]}'s inner process: their own view, not a fact of the world. Where it differs from the world, it is how they see it.`));
    tip.append(line('m', `${range(event.reach[0], event.reach[1])}${Number.isFinite(event.start) ? '' : event.children.length ? ' (no interval of its own: the span of what it holds)' : ' (no interval of its own: the span of what holds it)'}`));
    if (event.description) tip.append(line('m', clip(event.description, 360)));
    if (scaffold) { const above = processById.get(scaffold.parent); const home = above ? byId.get(above.home) : null;
      const kinds = { person_lifecycle_index: 'the process of a life', person_is_process: 'one of the slow processes a life runs through', change_arc_process: 'the process of a change', change_arc_phase_process: 'a phase of a change' };
      tip.append(line('a', `A process of the model: ${kinds[scaffold.role] ?? 'a scaffold process'}${home ? `, within ${clip(home.name, 60)}` : ''}`)); }
    const moves = (event.processIds ?? []).map((id) => processById.get(id)).filter((process) => process?.kind === 'named').map(processName);
    if (moves.length) tip.append(line('a', `Moves: ${moves.join(' · ')}`));
    if (event.children.length) tip.append(line('a', `Holds ${event.children.length} Event${event.children.length === 1 ? '' : 's'}`));
    if (holder) tip.append(line('a', `Within: ${clip(holder.name, 80)}`));
    const read = lenses.flatMap((lens) => lens.readings.filter((reading) => reading.eventId === event.id).map((reading) => `${lens.name}: ${reading.answers.find((answer) => answer.key !== 'remainder')?.key.replace(/_/g, ' ')}`));
    if (read.length) tip.append(line('a', read.slice(0, 5).join(' · ')));
  } else if (target.kind === 'process') {
    const { process, points } = target.node; const who = people.get(process.owner)?.person.name ?? referents.get(process.owner)?.short ?? 'The world';
    const t = target.xs ? timeAtX(target.xs[Math.min(target.xs.length - 1, target.near ?? 0)]) : points[0]?.t; const v = valueAt(points, t);
    tip.append(line('k', `A named process · ${who} · level ${process.depth}`), line('v', processName(process)));
    if (process.what) tip.append(line('m', process.what));
    tip.append(line('m', `${timeText(t, 3)}: ${Number.isInteger(v) || Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-GB') : v.toFixed(2)} ${process.unit ?? ''}`));
    tip.append(line('a', process.support));
    const holder = byId.get(process.home); if (holder) tip.append(line('a', `Within: ${holder.name} · moved by ${process.events.length} Event${process.events.length === 1 ? '' : 's'}`));
  } else if (target.kind === 'decision') {
    const { decision } = target; const event = byId.get(decision.eventId);
    tip.append(line('k', `A decision · ${people.get(decision.owner)?.person.name ?? ''} · ${timeText(decision.t, 1)}`), line('v', decision.question));
    tip.append(weights(decision.answers.filter((answer) => answer.key !== 'remainder'), null, decision.drawn?.realized));
    tip.append(line('a', decision.drawn ? 'The model drew it from these weights.' : 'Not drawn yet.'));
    if (event) tip.append(line('a', `At: ${clip(event.name, 90)}`));
  } else if (target.kind === 'lens') {
    const { lens, reading } = target; const event = byId.get(reading.eventId);
    tip.append(line('k', `A reading · ${lens.name}${reading.earlier ? ' · asked of an earlier version' : ''}`), line('v', `${holderText(reading, data.people).replace(/^\w/, (c) => c.toUpperCase())}, of: ${clip(event?.name ?? reading.eventId, 110)}`),
      line('m', reading.question ?? lens.question ?? ''));
    // A signed unit names the lens version the reading answers: lens:<id>@<signature>.
    if (reading.unit) { const signed = reading.unit.match(/^lens:([^@]+)@(\w+)$/); tip.append(line('a', `Unit: ${signed ? `a share of this lens's reading, answering its version ${signed[2].slice(0, 8)}` : reading.unit}`)); }
    const split = document.createElement('div'); split.className = 'split';
    for (const answer of reading.answers.filter((item) => item.weight > 0).sort((a, b) => (a.key === 'remainder') - (b.key === 'remainder'))) { const i = document.createElement('i'); i.style.width = `${answer.weight * 100}%`; i.style.background = lens.colorOf(answer.key); split.append(i); }
    tip.append(split, weights(reading.answers, (key) => lens.colorOf(key)));
    tip.append(line('a', `At the record's time, ${timeText(reading.t, 1)}${reading.confidence ? ` · confidence ${reading.confidence.toFixed(2)}` : ''}${reading.estimated ? ' · estimated' : ' · authored'} · evidence cutoff not recorded`));
    if (!reading.placed && !reading.older) tip.append(line('a', 'It sits on the record it reads, as models before placement kept readings.'));
  } else if (target.kind === 'note') {
    const { note } = target; tip.append(line('k', target.noteKind));
    if (note.node.title) tip.append(line('v', note.node.title)); tip.append(line('m', clip(note.node.text, 600)));
    tip.append(line('a', `About: ${note.events.slice(0, 5).map((id) => clip(byId.get(id)?.name, 50)).join(' · ')}`));
  } else if (target.kind === 'prose') {
    const { unit } = target; const text = unit.text.replace(/^#+\s+.*$/m, '').trim();
    tip.append(line('k', `Prose · ${timeText(unit.t, 2)}`), line('v', unit.title ?? ''), line('m', clip(text, 420)));
    tip.append(line('a', `Tells: ${(unit.tells ?? []).map((tell) => clip(byId.get(tell.eventId)?.name, 44)).join(' · ')}`));
    tip.append(line('a', 'Placed among the moments it shares the most words with, in story order. Click to read it.'));
  } else if (target.kind === 'causal') {
    const { relation } = target; tip.append(line('k', `A causal link · ${relation.kind.replace(/_/g, ' ')}`), line('v', `${clip(byId.get(relation.source)?.name, 70)} → ${clip(byId.get(relation.target)?.name, 70)}`));
  }
  tip.hidden = false; const w = tip.offsetWidth; const h = tip.offsetHeight;
  tip.style.left = `${Math.min(innerWidth - w - 12, pointer.x + 16)}px`; tip.style.top = `${Math.min(innerHeight - h - 12, Math.max(12, pointer.y + 16))}px`;
}
function click() { if (lit?.kind === 'prose') openReader(lit.unit.id); }
// Double-click an Event or a process to zoom to it; elsewhere, to zoom in there.
canvas.addEventListener('dblclick', (event) => {
  const item = lit?.node ?? (lit?.event ? nodeById.get(lit.event.id) : null) ?? (lit?.decision ? nodeById.get(lit.decision.eventId) : null) ?? (lit?.reading ? nodeById.get(lit.reading.eventId) : null);
  clearPreset(); hideHint();
  if (!item) { zoomAt(event.clientX, event.clientY, 2.5); return; }
  const span = Math.max(0.012, (item.t1 - item.t0) * 1.25); const [a, b] = windowAt((item.t0 + item.t1) / 2, 0.5, span); animateTo(a, b, 1100);
});

// ---- the panel -------------------------------------------------------------------------------------------------------------------------
const depthNote = { 0: 'The world alone.', 1: 'The world and what it holds: long developments, lives, places and institutions.', 2: 'With the periods, change arcs and parts of each.', 3: 'With the phases of each change and the moments in them.', 4: 'With the moments within moments.', 5: 'Deeper still.', 6: 'The whole tree.' };
function buildPanel() {
  const whose = document.getElementById('whose'); whose.replaceChildren();
  for (const group of GROUPS) { const item = document.createElement('span'); const dot = document.createElement('i'); dot.style.background = group.hue; item.append(dot, document.createTextNode(group.name)); whose.append(item); }
  const depths = document.getElementById('depths'); depths.replaceChildren();
  for (let level = 0; level <= MAX_DEPTH; level += 1) { const button = document.createElement('button'); button.textContent = String(level); button.addEventListener('click', () => { state.depth = level; changed(); }); depths.append(button); }
  const kinds = document.getElementById('kinds'); kinds.replaceChildren();
  for (const [key, name, swatch, count] of KINDS) {
    const n = count(); if (!n) continue; const row = document.createElement('div'); row.className = 'toggle'; row.dataset.key = key; row.style.setProperty('--swatch', swatch);
    row.innerHTML = '<span class="box"></span><span class="name"></span><span class="n"></span>'; row.querySelector('.name').textContent = name; row.querySelector('.n').textContent = n;
    row.addEventListener('click', () => { if (state.show.has(key)) state.show.delete(key); else state.show.add(key); changed(); }); kinds.append(row);
  }
  const box = document.getElementById('lenses'); box.replaceChildren();
  for (const lens of lenses) {
    const row = document.createElement('div'); row.className = 'toggle'; row.dataset.lens = lens.id; row.style.setProperty('--swatch', [...lens.palette.values()][0]);
    row.innerHTML = '<span class="box"></span><span class="name"></span><span class="keys"></span><span class="n"></span>';
    row.querySelector('.name').textContent = lens.name; row.querySelector('.n').textContent = lens.readings.length; row.title = `${lens.question ?? ''}${lens.why ? `\n\n${lens.why}` : ''}`;
    for (const hex of [...lens.palette.values()].slice(0, 5)) { const i = document.createElement('i'); i.style.background = hex; row.querySelector('.keys').append(i); }
    row.addEventListener('click', () => { if (state.lenses.has(lens.id)) state.lenses.delete(lens.id); else state.lenses.add(lens.id); changed(); }); box.append(row);
    const key = document.createElement('div'); key.className = 'lens-key'; key.dataset.lens = lens.id;
    for (const [answer, hex] of [...lens.palette, ['remainder', REMAINDER]]) { const item = document.createElement('span'); const dot = document.createElement('i'); dot.style.background = hex; item.append(dot, document.createTextNode(answer.replace(/_/g, ' '))); key.append(item); }
    box.append(key);
  }
  if (!lenses.length) box.closest('section').hidden = true;
  for (const button of document.querySelectorAll('#modes button')) button.addEventListener('click', () => { state.mode = button.dataset.mode === 'together' ? 1 : 0; changed(false); });
  document.getElementById('all').addEventListener('click', () => { const all = KINDS.every(([key]) => state.show.has(key)); state.show = all ? new Set(['processes']) : new Set(KINDS.map(([key]) => key)); changed(); });
  document.getElementById('lenses-all').addEventListener('click', () => { state.lenses = state.lenses.size === lenses.length ? new Set() : new Set(lenses.map((lens) => lens.id)); changed(); });
  const fold = (on) => { const panel = document.getElementById('panel'); panel.classList.toggle('folded', on); document.getElementById('fold').textContent = on ? 'Unfold' : 'Fold'; fitCamera(); dirty = true; };
  document.getElementById('fold').addEventListener('click', () => fold(!document.getElementById('panel').classList.contains('folded')));
  if (params.has('fold')) fold(true);
}
function syncPanel() {
  for (const [i, button] of [...document.querySelectorAll('#depths button')].entries()) button.classList.toggle('on', i === state.depth);
  document.getElementById('depth-note').textContent = depthNote[state.depth] ?? '';
  for (const row of document.querySelectorAll('#kinds .toggle')) row.classList.toggle('on', state.show.has(row.dataset.key));
  for (const row of document.querySelectorAll('#lenses .toggle')) row.classList.toggle('on', state.lenses.has(row.dataset.lens));
  for (const key of document.querySelectorAll('#lenses .lens-key')) key.hidden = !state.lenses.has(key.dataset.lens);
  for (const button of document.querySelectorAll('#modes button')) button.classList.toggle('on', (button.dataset.mode === 'together') === (state.mode === 1));
}
function changed(layout = true) { if (layout) relayout = true; dirty = true; syncPanel(); }
buildPanel();

// ---- the story, as the tool renders it from the graph --------------------------------------------------------------------------------------
const titleText = params.get('title') ?? data.title ?? 'Explorer';
document.getElementById('title').textContent = titleText;
document.getElementById('sub').textContent = `${events.length} Events in a tree ${MAX_DEPTH + 1} levels deep, from ${timeText(EARLIEST, 1e6)} to ${Math.round(PRESENT)}, with ${named.length} named processes, `
  + `${nodes.filter((node) => node.kind === 'sub').length} subsidiary ones and ${lenses.length} ${lenses.length === 1 ? 'lens' : 'lenses'}. Zoom from a moment to world history; add detail on the right.`;
const inline = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
function openReader(unitId = null) {
  const reader = document.getElementById('reader'); const body = document.getElementById('reader-body'); body.replaceChildren(); reader.hidden = false; let target = null;
  for (const unit of data.story?.units ?? []) {
    const blocks = unit.text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    blocks.forEach((block, i) => {
      const heading = block.match(/^(#{1,4})\s+([\s\S]*)$/); const element = document.createElement(heading ? `h${heading[1].length}` : 'p');
      element.innerHTML = inline(heading && heading[1].length === 1 && unit.role === 'document_root' ? titleText : heading ? heading[2] : block).replace(/\n/g, '<br>');
      if (unit.id === unitId) { element.classList.add('lit'); if (i === 0) target = element; } body.append(element);
    });
  }
  if (target) target.scrollIntoView({ block: 'start' });
}
document.getElementById('read').addEventListener('click', () => { const reader = document.getElementById('reader'); if (reader.hidden) openReader(); else reader.hidden = true; });
document.getElementById('reader-close').addEventListener('click', () => { document.getElementById('reader').hidden = true; });
addEventListener('keydown', (event) => {
  if (event.key === 'Escape') document.getElementById('reader').hidden = true;
  if (event.target.closest?.('input, textarea')) return;
  const keys = { 1: 'story', 2: 'life', 3: 'centuries', 4: 'world' }; if (keys[event.key]) preset(keys[event.key]);
  if (event.key === 'l') { state.mode = 0; changed(false); } if (event.key === 't') { state.mode = 1; changed(false); }
  if (event.key === 'ArrowDown') scrollBy(120); if (event.key === 'ArrowUp') scrollBy(-120);
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { const [a, b] = windowAt(timeAt(F, 0.5), event.key === 'ArrowLeft' ? 0.65 : 0.35, F.s); animateTo(a, b, 350); clearPreset(); }
  if (event.key === '+' || event.key === '=') zoomAt(innerWidth / 2, innerHeight / 2, 1.6); if (event.key === '-') zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.6);
  if (/^[0-6]$/.test(event.key) && event.altKey) { state.depth = Math.min(MAX_DEPTH, Number(event.key)); changed(); }
});
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloom.setSize(innerWidth, innerHeight); fitCamera(); dirty = true; });

// ---- the start: the URL sets the zoom, the representation and the detail -----------------------------------------------------------------------
syncPanel(); computeLayout(); relayout = false;
if (params.has('t0') && params.has('t1')) { setView(Math.max(BOUNDS[0], Number(params.get('t0'))), Math.min(BOUNDS[1], Number(params.get('t1')))); }
else if (params.has('focus') && byId.has(params.get('focus'))) { const event = byId.get(params.get('focus')); const span = Math.max(0.02, (event.reach[1] - event.reach[0]) * 1.6); const [a, b] = windowAt((event.reach[0] + event.reach[1]) / 2, 0.5, span); setView(a, b); }
else { if (params.get('life')) lifeTurn = Math.max(0, lives.findIndex((life) => life.name.toLowerCase() === params.get('life').toLowerCase())); preset(params.get('zoom') ?? 'story', false); }
if (params.has('read')) openReader();
// The URL follows the view, so any view can be copied and captured; live reloads onto it when the data file changes.
let urlTimer = null;
function syncURL() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const next = new URLSearchParams(); for (const key of ['data', 'title', 'live']) if (params.has(key)) next.set(key, params.get(key));
    if (document.getElementById('panel').classList.contains('folded')) next.set('fold', '');
    const digits = Math.max(0, Math.min(6, Math.ceil(-Math.log10(F.s)) + 3));
    if (state.mode === 1) next.set('view', 'together');
    if (currentPreset) { next.set('zoom', currentPreset); if (currentPreset === 'life' && lives.length) next.set('life', lives[lifeTurn % lives.length].name.toLowerCase()); }
    else { next.set('t0', F.a.toFixed(digits)); next.set('t1', F.b.toFixed(digits)); }
    next.set('depth', String(state.depth));
    next.set('show', [...state.show].join(',')); if (state.lenses.size) next.set('lenses', state.lenses.size === lenses.length ? 'all' : [...state.lenses].join(','));
    history.replaceState(null, '', `${location.pathname}?${next.toString().replace(/%2C/g, ',')}`);
  }, 400);
}
if (params.has('live')) setInterval(async () => {
  try { const next = await (await fetch(`data/${encodeURIComponent(dataName)}.json?ts=${Date.now()}`, { cache: 'no-store' })).json(); if (next.lastCall !== data.lastCall || next.generatedAt !== data.generatedAt) location.reload(); } catch { /* keep the last view */ }
}, 20000);
let last = performance.now(); let lastHover = 0; const drawTimes = [];
// For captures and tests: the window on screen, the time under a point, and what each redraw costs.
window.explorer = { view: () => ({ a: F.a, b: F.b, warp: F.w, mode: state.mode, depth: state.depth, scroll }), timeAt: (x, y) => pointerTime(x, y).t, drawTimes: () => [...drawTimes],
  zoom: (x, y, factor) => zoomAt(x, y, factor), profile: () => profile, hover: () => hover(),
  targets: (kind) => hoverTargets.filter((target) => target.kind === kind).slice(0, 40).map((target) => { const w = target.wpt ?? target.wseg?.[0] ?? target.wpts?.[Math.floor(target.wpts.length / 2)]; const p = screen(...w); return [Math.round(p.x), Math.round(p.y)]; }), redraw: () => { const began = performance.now(); if (relayout) { relayout = false; computeLayout(); } placeCamera(); draw(); composer.render(); syncURL(); return performance.now() - began; } };
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (animation) animation(now);
  const target = frozenBlend ?? state.mode; if (Math.abs(state.blend - target) > 0.001) { state.blend += Math.sign(target - state.blend) * Math.min(Math.abs(target - state.blend), dt / 0.9); dirty = true; } else state.blend = target;
  if (relayout) { relayout = false; computeLayout(); dirty = true; }
  if (dirty) { dirty = false; const began = performance.now(); placeCamera(); draw(); if (!animation) syncURL(); drawTimes.push(performance.now() - began); if (drawTimes.length > 120) drawTimes.shift(); if (pointer) hoverDirty = true; }
  if (hoverDirty && (!pointer || now - lastHover > (animation || drag?.moved ? 90 : 0))) { lastHover = now; hover(); }
  composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
