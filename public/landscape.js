// Story Landscape: every function of a Meaning Model story as terrain over time. Each person's life processes, periods,
// shocks and inner-state series, and the world's long developments, rise as ridges; Events stand as beams, decisions
// glow, and the Understanding graph floats above, threaded to the moments it is about. The construction replays as
// the terrain rising in the order the agent built it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const params = new URLSearchParams(location.search);
const dataName = params.get('data') ?? 'rabbit-hole';
const HUES = ['#3987e5', '#d95926', '#199e70'];
const WORLD = '#9085e9';
const NX = 420; const LENGTH = 96; const AMP = 8.5; const ROW = 2.1; const GAP = 4.2;
const clip = (text, n) => { const s = String(text ?? '').replace(/\s+/g, ' '); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
// A ridge's name: the head of a long label, before its dates and detail, cut at a word.
const short = (text, n = 40) => { const head = String(text ?? '').replace(/\s+/g, ' ').split(/[:;,]| from | since | built /)[0].trim(); if (head.length <= n) return head; const cut = head.slice(0, n - 1); const space = cut.lastIndexOf(' '); return `${space > n * 0.6 ? cut.slice(0, space) : cut}…`; };
const tip = document.getElementById('tip');

let data = await (await fetch(`data/${dataName}.json?ts=${Date.now()}`, { cache: 'no-store' })).json();

// ---- rows: every function over time --------------------------------------------------------------------------------------
function buildRows() {
  const byId = new Map(data.events.map((event) => [event.id, event]));
  const children = new Map();
  for (const event of data.events) if (event.parent) { if (!children.has(event.parent)) children.set(event.parent, []); children.get(event.parent).push(event.id); }
  const descendants = (id) => { const out = []; const stack = [...(children.get(id) ?? [])]; while (stack.length) { const next = stack.pop(); out.push(next); stack.push(...(children.get(next) ?? [])); } return out; };
  const people = data.people.filter((person) => person.principal);
  for (const person of data.people) if (people.length < 3 && !people.includes(person) && person.life) people.push(person);
  const principals = people.slice(0, 3);
  const lifeStarts = principals.map((person) => person.life?.start).filter((t) => Number.isFinite(t));
  const ends = data.events.map((event) => event.end ?? event.start).filter(Number.isFinite).sort((a, b) => a - b);
  const starts = data.events.map((event) => event.start).filter(Number.isFinite);
  const present = data.window?.end ?? ends[Math.floor((ends.length - 1) * 0.9)] ?? 1;
  const earliest = Math.min(...starts, ...lifeStarts, present - 1);
  const t0 = data.window ? Math.min(data.window.start, ...lifeStarts) : earliest;
  const pad = (present - t0) * 0.02;
  const domain = [t0 - pad, present + pad];
  // Deep time on a log scale of years before the present; a story within a few centuries on a linear one.
  const deep = present - earliest > 400;
  const uMax = Math.log10(1 + present - earliest);
  const P = deep ? (t) => Math.min(1.02, 1 - Math.log10(1 + Math.max(0, present - t)) / uMax) : (t) => (t - domain[0]) / (domain[1] - domain[0]);
  const T = deep ? (q) => present - (10 ** ((1 - q) * uMax) - 1) : (q) => domain[0] + q * (domain[1] - domain[0]);
  const sampleT = (i) => T(i / (NX - 1));
  const sigmaP = 1 / 170; const sigma = (domain[1] - domain[0]) / 160;
  const bump = (t, start, end) => {
    if (!Number.isFinite(start)) return 0;
    const [a, b, q] = [P(start), P(Number.isFinite(end) ? end : start), P(t)];
    if (q >= a && q <= b) return 1;
    const d = q < a ? a - q : q - b;
    return Math.exp(-(d * d) / (2 * sigmaP * sigmaP));
  };
  const born = (items) => Math.min(...items.map((item) => (item?.at ? Date.parse(item.at) : Infinity)));
  const rows = [];
  const addRow = (row) => { if (row.samples.some((value) => value > 0.001)) rows.push(row); };
  const density = (eventIds, cutWeight = 0.35) => {
    const samples = new Float32Array(NX);
    for (const id of eventIds) {
      const event = byId.get(id); if (!event || !Number.isFinite(event.start)) continue;
      const weight = 1 + cutWeight * (event.cuts ?? 0);
      for (let i = 0; i < NX; i += 1) samples[i] += weight * bump(sampleT(i), event.start, event.end);
    }
    const max = Math.max(...samples, 1e-6); for (let i = 0; i < NX; i += 1) samples[i] /= max;
    return samples;
  };
  principals.forEach((person, order) => {
    const hue = HUES[order];
    const group = { id: person.id, label: person.name, hue };
    // The life: periods as plateaus, shocks as peaks that fall away through the adaptation.
    const life = new Float32Array(NX);
    for (const period of person.periods) for (let i = 0; i < NX; i += 1) life[i] = Math.max(life[i], 0.28 * bump(sampleT(i), period.start, period.end));
    for (const arc of person.arcs) {
      if (!Number.isFinite(arc.focal)) continue;
      const fall = Math.max((arc.adaptationEnd ?? arc.focal) - arc.focal, sigma * 2);
      for (let i = 0; i < NX; i += 1) { const t = sampleT(i); const d = t - arc.focal; life[i] = Math.max(life[i], d >= 0 ? Math.exp(-d / fall) : Math.exp(-(d * d) / (2 * sigma * sigma))); }
    }
    addRow({ id: `${person.id}:life`, label: 'life, periods and shocks', group, hue, kind: 'life', samples: life,
      born: born([person.life?.born, ...person.periods.map((p) => p.born), ...person.arcs.map((a) => a.born)]) });
    // Each process the life runs through: the density of what happens in it.
    for (const process of person.processes) {
      const ids = descendants(process.eventId);
      if (!ids.length) continue;
      addRow({ id: process.eventId, label: clip(process.what.replace(/^.*?\bis\b\s*/i, ''), 34) || process.eventId.split('.').at(-1), group, hue, kind: 'process',
        samples: density(ids), born: born(ids.map((id) => byId.get(id)?.born)) });
    }
    // What they want, feel and expect: each Cut series as the share of its most frequent answer.
    for (const series of person.series) {
      const counts = new Map(); for (const point of series.points) { const key = point.answers[0]?.key; if (key) counts.set(key, (counts.get(key) ?? 0) + 1); }
      const key = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; if (!key) continue;
      const points = series.points.map((point) => ({ t: point.t, v: point.answers.find((answer) => answer.key === key)?.weight ?? 0 }));
      const samples = new Float32Array(NX);
      for (let i = 0; i < NX; i += 1) {
        const t = sampleT(i); let v = 0;
        if (points.length === 1) v = points[0].v * bump(t, points[0].t, points[0].t + sigma * 20);
        else if (t >= points[0].t) { const next = points.findIndex((p) => p.t > t); if (next < 0) v = points.at(-1).v; else { const a = points[next - 1]; const b = points[next]; const f = (t - a.t) / Math.max(1e-9, b.t - a.t); v = a.v + (b.v - a.v) * (0.5 - Math.cos(Math.PI * f) / 2); } }
        samples[i] = v;
      }
      addRow({ id: `${person.id}:${series.question}`, label: `${series.kind}: ${clip(key.replace(/[_.-]+/g, ' '), 22)}`, group, hue, kind: 'series', samples,
        born: born(series.points.map((point) => point.born)) });
    }
  });
  // The world's long developments: each top-level Event outside the lives, with what happens inside it.
  const owned = new Set(principals.flatMap((person) => [person.life?.eventId, ...person.periods.map((p) => p.eventId), ...person.arcs.map((a) => a.eventId), ...person.processes.map((p) => p.eventId)]).filter(Boolean));
  const inLives = new Set(principals.flatMap((person) => (person.life ? [person.life.eventId, ...descendants(person.life.eventId)] : [])));
  const worldGroup = { id: 'world', label: 'The world', hue: WORLD };
  const span = domain[1] - domain[0];
  // Long on the axis the page draws: on the deep-time scale a development of a few decades near the present counts.
  const tops = data.events.filter((event) => !owned.has(event.id) && !inLives.has(event.id) && Number.isFinite(event.start) && Number.isFinite(event.end)
      && P(event.end) - P(event.start) > 0.02 && (event.end - event.start) < span * 3)
    .map((event) => ({ event, ids: [event.id, ...descendants(event.id)] })).sort((a, b) => (b.event.end - b.event.start) - (a.event.end - a.event.start)).slice(0, 12);
  const worldRows = [];
  for (const { event, ids } of tops) {
    const inside = ids.slice(1); const samples = inside.length ? density(inside, 0.2) : new Float32Array(NX);
    for (let i = 0; i < NX; i += 1) samples[i] = Math.max(samples[i] * 0.9, 0.16 * bump(sampleT(i), event.start, event.end));
    if (samples.some((value) => value > 0.001)) worldRows.push({ id: event.id, label: clip(event.label, 34), name: short(event.label), group: worldGroup, hue: WORLD, kind: 'world', amp: 0.6, samples, born: born(ids.map((id) => byId.get(id)?.born)) });
  }
  rows.unshift(...worldRows); // the world behind the lives
  // Z positions, block by block.
  let z = 0; let last = null;
  for (const row of rows) { if (last && last !== row.group.id) z += GAP; row.z = z; z += ROW; last = row.group.id; }
  const depth = Math.max(z - ROW, 1);
  for (const row of rows) row.z -= depth / 2;
  return { rows, domain, principals, byId, depth, P, T, deep, present, earliest };
}

let model = buildRows();
const xOf = (t) => (Math.max(0, Math.min(1, model.P(t))) - 0.5) * LENGTH;

// ---- scene ----------------------------------------------------------------------------------------------------------------
const host = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
host.append(renderer.domElement);
const labels = new CSS2DRenderer(); labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' }); host.append(labels.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#050608'); scene.fog = new THREE.FogExp2('#050608', 0.0085);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 800);
camera.position.set(-LENGTH * 0.46, 52, model.depth * 0.62 + 58);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(9, 1, model.depth * 0.06); controls.enableDamping = true; controls.autoRotate = !params.has('still'); controls.autoRotateSpeed = 0.35;
scene.add(new THREE.AmbientLight('#8fa0c0', 0.55));
const sun = new THREE.DirectionalLight('#ffffff', 1.1); sun.position.set(-30, 60, 40); scene.add(sun);
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.95, 0.55, 0.12); composer.addPass(bloom); composer.addPass(new OutputPass());

const world = new THREE.Group(); scene.add(world);
function clearWorld() { for (const child of [...world.children]) { world.remove(child); child.traverse?.((node) => { node.geometry?.dispose?.(); if (node.material) [].concat(node.material).forEach((m) => m.dispose?.()); if (node.element) node.element.remove(); }); } }

// Terrain: one heightfield, every row a ridge.
let terrain; let ridges = []; let beams = []; let mindPoints = []; let ridgeNames = []; let sectionNames = []; let rowScale = new Map();
const NZ_PER = 5;
function build() {
  clearWorld(); ridges = []; beams = []; mindPoints = []; ridgeNames = []; sectionNames = [];
  const { rows, depth } = model;
  const zMin = -depth / 2 - ROW * 1.5; const zMax = depth / 2 + ROW * 1.5;
  const NZ = Math.max(8, Math.ceil((zMax - zMin) / ROW * NZ_PER));
  const geometry = new THREE.PlaneGeometry(LENGTH, zMax - zMin, NX - 1, NZ - 1); geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, (zMin + zMax) / 2);
  const colors = new Float32Array(NX * NZ * 3); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15, flatShading: false, emissive: new THREE.Color('#0a0c12') });
  terrain = new THREE.Mesh(geometry, material); world.add(terrain);
  // Each row's reach across z, precomputed.
  const zAt = (j) => zMin + (j / (NZ - 1)) * (zMax - zMin);
  for (const row of rows) {
    row.reach = [];
    for (let j = 0; j < NZ; j += 1) { const d = (zAt(j) - row.z) / (ROW * 0.42); const w = Math.exp(-d * d); if (w > 0.01) row.reach.push([j, w]); }
    row.color = new THREE.Color(row.hue);
    if (!rowScale.has(row.id)) rowScale.set(row.id, 0);
    // The ridge line: a crisp glowing contour along the row's crest.
    const line = new THREE.BufferGeometry(); line.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NX * 3), 3));
    const ridge = new THREE.Line(line, new THREE.LineBasicMaterial({ color: row.color, transparent: true, opacity: row.kind === 'world' ? 0.55 : 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    ridge.userData.row = row; world.add(ridge); ridges.push(ridge);
  }
  // Sections within each block: what the ridges are and what their height means.
  const SECTION = { life: ['life & shocks', 'plateaus are periods, peaks are shocks'], process: ['life processes', 'how much happens in each'],
    series: ['wants · feels · expects', 'share of the main answer'], world: ['long developments', 'how much happens inside each'] };
  const sections = new Map();
  for (const row of rows) { const key = `${row.group.id}|${row.kind}`; if (!sections.has(key)) sections.set(key, { kind: row.kind, hue: row.group.hue, zs: [] }); sections.get(key).zs.push(row.z); }
  for (const section of sections.values()) {
    const [name, meaning] = SECTION[section.kind] ?? [section.kind, ''];
    const label = document.createElement('div'); label.className = 'label section';
    const body = document.createElement('div'); body.className = 'body';
    const head = document.createElement('b'); head.textContent = `${section.zs.length > 1 ? `${section.zs.length} ` : ''}${name}`;
    const note = document.createElement('span'); note.textContent = meaning; body.append(head, note); label.append(body);
    const object = new CSS2DObject(label); object.position.set(LENGTH / 2 + 1.4, 0.3, (Math.min(...section.zs) + Math.max(...section.zs)) / 2); object.center.set(0, 0.5); world.add(object);
    sectionNames.push({ object, inner: body });
  }
  // A small model names each ridge where it begins; a large one leaves names to hover.
  if (rows.length <= 14) for (const row of rows) {
    const first = row.samples.findIndex((value) => value > 0.05); if (first < 0) continue;
    const label = document.createElement('div'); label.className = 'label ridge-name';
    const inner = document.createElement('span'); inner.textContent = row.name ?? row.label; label.append(inner);
    const object = new CSS2DObject(label); object.position.set(-LENGTH / 2 + (first / (NX - 1)) * LENGTH, 1.1, row.z); object.center.set(0, 1); world.add(object);
    ridgeNames.push({ object, inner, row, first });
  }
  // Group names.
  const groups = new Map(); for (const row of rows) { if (!groups.has(row.group.id)) groups.set(row.group.id, { ...row.group, zs: [] }); groups.get(row.group.id).zs.push(row.z); }
  for (const group of groups.values()) {
    const label = document.createElement('div'); label.className = 'label group'; label.textContent = group.label; label.style.color = group.hue;
    const object = new CSS2DObject(label); object.position.set(-LENGTH / 2 - 1.5, 0.5, (Math.min(...group.zs) + Math.max(...group.zs)) / 2); object.center.set(1, 0.5); world.add(object);
    const count = document.createElement('div'); count.className = 'label'; count.textContent = `${group.zs.length} functions`;
    const countObject = new CSS2DObject(count); countObject.position.set(-LENGTH / 2 - 1.5, -1.2, (Math.min(...group.zs) + Math.max(...group.zs)) / 2); countObject.center.set(1, 0.5); world.add(countObject);
  }
  // Time along the front edge.
  const marks = model.deep
    ? [300000, 100000, 30000, 10000, 3000, 1000, 300, 100, 30, 10, 1].filter((age) => age < model.present - model.earliest).map((age) => [model.present - age, age >= 1000 ? `${age / 1000}k years ago` : `${age} ${age === 1 ? 'year' : 'years'} ago`]).concat([[model.present, formatTime(model.present)]])
    : Array.from({ length: 9 }, (_, k) => { const t = model.domain[0] + (k / 8) * (model.domain[1] - model.domain[0]); return [t, formatTime(t)]; });
  for (const [t, text] of marks) {
    const label = document.createElement('div'); label.className = 'label time'; label.textContent = text;
    const object = new CSS2DObject(label); object.position.set(xOf(t), 0, zMax + 1.5); world.add(object);
  }
  const grid = new THREE.GridHelper(LENGTH * 1.3, 52, '#1c2230', '#10141c'); grid.position.y = -0.02; world.add(grid);
  // Events as beams of light, decisions as diamonds.
  const rowOfEvent = new Map();
  for (const row of rows) if (row.kind === 'process' || row.kind === 'world') for (const id of [row.id, ...(model.byId.has(row.id) ? [] : [])]) rowOfEvent.set(id, row);
  const children = new Map(); for (const event of data.events) if (event.parent) { if (!children.has(event.parent)) children.set(event.parent, []); children.get(event.parent).push(event.id); }
  for (const row of rows) if (row.kind === 'process' || row.kind === 'world') { const stack = [row.id]; while (stack.length) { const id = stack.pop(); if (!rowOfEvent.has(id)) rowOfEvent.set(id, row); stack.push(...(children.get(id) ?? [])); } }
  const beamGeometry = new THREE.CylinderGeometry(0.035, 0.035, 1, 6); beamGeometry.translate(0, 0.5, 0);
  for (const event of data.events) {
    const row = rowOfEvent.get(event.id); if (!row || !Number.isFinite(event.start) || model.P(event.start) < 0 || model.P(event.start) > 1) continue;
    if (Number.isFinite(event.end) && model.P(event.end) - model.P(event.start) > 0.2) continue;
    const beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ color: row.color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.set(xOf(event.start), 0, row.z); beam.scale.y = 0.8 + Math.min(4, (event.cuts ?? 0) * 0.9);
    beam.userData = { event, row, born: event.born?.at ? Date.parse(event.born.at) : -Infinity, base: 0 }; world.add(beam); beams.push(beam);
  }
  const diamond = new THREE.OctahedronGeometry(0.42);
  for (const [order, person] of model.principals.entries()) {
    const lifeRow = rows.find((row) => row.id === `${person.id}:life`); if (!lifeRow) continue;
    for (const decision of person.decisions) {
      if (!Number.isFinite(decision.t)) continue;
      const mesh = new THREE.Mesh(diamond, new THREE.MeshStandardMaterial({ color: HUES[order], emissive: new THREE.Color(HUES[order]), emissiveIntensity: decision.drawn ? 1.6 : 0.4, roughness: 0.3 }));
      mesh.position.set(xOf(decision.t), AMP + 1.2, lifeRow.z); mesh.userData = { decision, row: lifeRow, born: decision.born?.at ? Date.parse(decision.born.at) : -Infinity, float: true };
      world.add(mesh); beams.push(mesh);
    }
  }
  // The mind: understanding and prose above the world, threaded to what they concern.
  const sprite = circleTexture();
  const nodeHome = new Map(); const personRowZ = new Map();
  for (const person of model.principals) { const zs = rows.filter((row) => row.group.id === person.id).map((row) => row.z); if (zs.length) personRowZ.set(person.id, (Math.min(...zs) + Math.max(...zs)) / 2); }
  const ownerOf = (eventId) => { for (const person of model.principals) { if (person.life && (person.life.eventId === eventId)) return person.id; } const row = rowOfEvent.get(eventId); return row?.group.id ?? null; };
  for (const edge of data.graph.edges) {
    if (!edge.target.anchor) continue; const event = model.byId.get(edge.target.anchor);
    if (!nodeHome.has(edge.source) && event && Number.isFinite(event.start)) nodeHome.set(edge.source, { event, owner: ownerOf(event.id) });
  }
  const bornTimes = data.graph.nodes.map((node) => (node.born?.at ? Date.parse(node.born.at) : 0)); const minBorn = Math.min(...bornTimes); const maxBorn = Math.max(...bornTimes, minBorn + 1);
  const threads = [];
  for (const node of data.graph.nodes) {
    const home = nodeHome.get(node.id);
    const x = home ? xOf(Math.min(model.domain[1], Math.max(model.domain[0], home.event.start))) : ((((node.born?.at ? Date.parse(node.born.at) : minBorn) - minBorn) / (maxBorn - minBorn)) - 0.5) * LENGTH * 0.9;
    const z = home?.owner && personRowZ.has(home.owner) ? personRowZ.get(home.owner) : home?.owner === 'world' ? (Math.max(...rows.map((row) => row.z)) - 2) : 0;
    const hue = home?.owner && personRowZ.has(home.owner) ? HUES[model.principals.findIndex((person) => person.id === home.owner)] : node.category === 'passage' ? '#fff6e0' : '#c9d4ff';
    const size = node.category === 'passage' ? 1.6 : node.category === 'world' || node.category === 'director' ? 1.3 : 0.9;
    const material = new THREE.SpriteMaterial({ map: sprite, color: hue, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const point = new THREE.Sprite(material); point.scale.setScalar(size);
    point.position.set(x + (Math.random() - 0.5) * 1.2, AMP + 5 + Math.random() * 5 + (node.category === 'passage' ? 3 : 0), z + (Math.random() - 0.5) * 3);
    point.userData = { node, born: node.born?.at ? Date.parse(node.born.at) : -Infinity, float: true }; world.add(point); mindPoints.push(point);
    if (home) threads.push([point, new THREE.Vector3(xOf(home.event.start), 0.3, z)]);
  }
  const threadGeometry = new THREE.BufferGeometry(); const threadPositions = new Float32Array(threads.length * 6);
  threads.forEach(([point, target], i) => { threadPositions.set([point.position.x, point.position.y, point.position.z, target.x, target.y, target.z], i * 6); });
  threadGeometry.setAttribute('position', new THREE.BufferAttribute(threadPositions, 3));
  const threadLines = new THREE.LineSegments(threadGeometry, new THREE.LineBasicMaterial({ color: '#8ea2d8', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  threadLines.userData.threads = threads; world.add(threadLines);
  updateTerrain(true);
}
function circleTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(0.25, 'rgba(255,255,255,0.85)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function formatTime(t) {
  if (t < 0) return `${Math.round(-t).toLocaleString()} BCE`;
  const span = model.deep ? 1000 : model.domain[1] - model.domain[0];
  if (span > 6) return `${Math.floor(t)}`;
  const year = Math.floor(t); return new Date(Date.UTC(year, 0, 1) + (t - year) * 365.2425 * 86400000).toISOString().slice(0, 10);
}

// Heights from each row's scale: the terrain rises as the replay reaches what the agent built.
function updateTerrain(force = false) {
  const position = terrain.geometry.attributes.position; const color = terrain.geometry.attributes.color;
  const NZ = position.count / NX; const heights = new Float32Array(NX * NZ); const winner = new Int32Array(NX * NZ).fill(-1); const best = new Float32Array(NX * NZ);
  model.rows.forEach((row, r) => {
    const scale = (rowScale.get(row.id) ?? 0) * (row.amp ?? 1); if (scale <= 0.001) return;
    for (const [j, w] of row.reach) for (let i = 0; i < NX; i += 1) { const k = j * NX + i; const h = row.samples[i] * w * scale; heights[k] += h; if (h > best[k]) { best[k] = h; winner[k] = r; } }
  });
  const dark = new THREE.Color('#0b0e15'); const tmp = new THREE.Color();
  for (let k = 0; k < NX * NZ; k += 1) {
    const h = Math.min(1.25, heights[k]); position.setY(k, h * AMP);
    const r = winner[k]; if (r < 0) { color.setXYZ(k, dark.r, dark.g, dark.b); continue; }
    tmp.copy(dark).lerp(model.rows[r].color, Math.min(1, 0.18 + h * 0.9)); color.setXYZ(k, tmp.r, tmp.g, tmp.b);
  }
  position.needsUpdate = true; color.needsUpdate = true; terrain.geometry.computeVertexNormals();
  for (const ridge of ridges) {
    const row = ridge.userData.row; const scale = (rowScale.get(row.id) ?? 0) * (row.amp ?? 1); const positions = ridge.geometry.attributes.position;
    for (let i = 0; i < NX; i += 1) positions.setXYZ(i, -LENGTH / 2 + (i / (NX - 1)) * LENGTH, row.samples[i] * scale * AMP + 0.06, row.z);
    positions.needsUpdate = true; ridge.visible = scale > 0.01;
  }
}

// ---- clocks, replay, HUD --------------------------------------------------------------------------------------------------------
const stepTimes = data.steps.map((step) => Date.parse(step.at)).filter(Number.isFinite).sort((a, b) => a - b);
let T0 = stepTimes[0] ?? 0; let T1 = stepTimes.at(-1) ?? 1;
let tau = Infinity; let playing = false;
function activeClock(times) {
  const sorted = [...new Set(times)].sort((a, b) => a - b); const marks = [[sorted[0] ?? 0, 0]];
  for (let i = 1; i < sorted.length; i += 1) { const gap = sorted[i] - sorted[i - 1]; marks.push([sorted[i], marks[i - 1][1] + Math.min(gap, gap > 300000 ? 60000 : 300000)]); }
  const f = (t) => { if (t <= marks[0][0]) return 0; for (let i = 1; i < marks.length; i += 1) if (t <= marks[i][0]) { const [a, va] = marks[i - 1]; const [b, vb] = marks[i]; return va + ((t - a) / (b - a || 1)) * (vb - va); } return marks.at(-1)[1]; };
  f.invert = (v) => { if (v <= 0) return marks[0][0]; for (let i = 1; i < marks.length; i += 1) if (v <= marks[i][1]) { const [a, va] = marks[i - 1]; const [b, vb] = marks[i]; return a + ((v - va) / (vb - va || 1)) * (b - a); } return marks.at(-1)[0]; };
  return f;
}
let active = activeClock(stepTimes);
const visibleAt = (born) => born <= tau;
function hud() {
  document.getElementById('title').textContent = data.title ?? 'Story Landscape';
  document.getElementById('sub').textContent = `${model.principals.map((person) => person.name).join(', ')}. ${model.rows.length} functions over time, each the model's own record, rising in the order the agent built them.`;
  const bornOf = (item) => (item?.born?.at ? Date.parse(item.born.at) : -Infinity);
  const events = data.events.filter((event) => visibleAt(bornOf(event))).length;
  const nodes = data.graph.nodes.filter((node) => visibleAt(bornOf(node)));
  const cuts = data.people.flatMap((person) => [...person.series.flatMap((series) => series.points), ...person.decisions]).filter((item) => visibleAt(bornOf(item))).length;
  const tiles = [['Events', events], ['Cuts', cuts], ['Functions', model.rows.filter((row) => visibleAt(Number.isFinite(row.born) ? row.born : -Infinity)).length], ['Thoughts', nodes.filter((node) => node.category !== 'passage').length], ['Words of prose', nodes.reduce((sum, node) => sum + node.words, 0)]];
  document.getElementById('stats').replaceChildren(...tiles.map(([name, value]) => { const tile = document.createElement('div'); tile.className = 'stat'; const v = document.createElement('div'); v.className = 'value'; v.textContent = value.toLocaleString(); const n = document.createElement('div'); n.className = 'name'; n.textContent = name; tile.append(v, n); return tile; }));
  const key = document.getElementById('legend'); key.replaceChildren();
  const heading = document.createElement('div'); heading.className = 'key-head'; heading.textContent = 'How to read it'; key.append(heading);
  const glyph = (kind, hue) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', 30); svg.setAttribute('height', 16);
    const shape = document.createElementNS('http://www.w3.org/2000/svg', kind === 'ridge' ? 'path' : kind === 'beam' ? 'rect' : kind === 'diamond' ? 'path' : 'circle');
    if (kind === 'ridge') { shape.setAttribute('d', 'M1 14 C 7 14, 9 3, 14 5 S 22 12, 29 2'); shape.setAttribute('fill', 'none'); shape.setAttribute('stroke', hue); shape.setAttribute('stroke-width', 2); }
    if (kind === 'beam') { shape.setAttribute('x', 14); shape.setAttribute('y', 1); shape.setAttribute('width', 2); shape.setAttribute('height', 14); shape.setAttribute('fill', hue); }
    if (kind === 'diamond') { shape.setAttribute('d', 'M15 1 L21 8 L15 15 L9 8 Z'); shape.setAttribute('fill', hue); }
    if (kind === 'light') { shape.setAttribute('cx', 15); shape.setAttribute('cy', 8); shape.setAttribute('r', 5); shape.setAttribute('fill', hue); shape.setAttribute('opacity', 0.9); }
    svg.append(shape); return svg;
  };
  const line = (kind, hue, text) => { const row = document.createElement('div'); row.className = 'key-row'; row.append(glyph(kind, hue)); const span = document.createElement('span'); span.textContent = text; row.append(span); key.append(row); };
  line('ridge', '#c3c2b7', 'A ridge is one function of the model over time');
  line('beam', '#c3c2b7', 'A beam is an Event: something that happens');
  line('diamond', '#c3c2b7', 'A diamond is a decision; it glows once the model has drawn it');
  line('light', '#c9d4ff', 'Lights above are the agent\'s understanding and the prose, threaded to their moments');
  const people = document.createElement('div'); people.className = 'key-row key-people';
  for (const [name, hue] of [...model.principals.map((person, i) => [person.name, HUES[i]]), ['the world', WORLD]]) { const tag = document.createElement('span'); const dot = document.createElement('i'); dot.style.background = hue; tag.append(dot, document.createTextNode(name)); people.append(tag); }
  key.append(people);
  const cursor = Number.isFinite(tau) ? tau : T1;
  document.getElementById('fill').style.width = `${Math.max(0, Math.min(100, (active(cursor) / Math.max(1, active(T1))) * 100))}%`;
  document.getElementById('clock').textContent = `${new Date(cursor).toISOString().slice(11, 19)} UTC · ${Math.round(active(cursor) / 60000)} minutes of work`;
  const newest = data.graph.nodes.filter((node) => node.born?.at && Date.parse(node.born.at) <= cursor).sort((a, b) => Date.parse(b.born.at) - Date.parse(a.born.at))[0];
  const step = data.steps.filter((item) => item.kind === 'graph' && item.label && Date.parse(item.at) <= cursor).at(-1);
  const names = { passage: 'Prose', thought: 'Thought', world: 'World stage', director: 'Director', draw: 'Drawn decision', author: 'Author record', reference: 'Other model' };
  if (newest && (!step || Date.parse(newest.born.at) >= Date.parse(step.at)) && ['passage', 'thought', 'director', 'world'].includes(newest.category)) { document.getElementById('kind').textContent = names[newest.category]; document.getElementById('text').textContent = clip(newest.text, 480); }
  else if (step) { document.getElementById('kind').textContent = 'The agent'; document.getElementById('text').textContent = clip(step.label, 480); }
}
function applyTau() {
  for (const row of model.rows) row.target = visibleAt(Number.isFinite(row.born) ? row.born : -Infinity) ? 1 : 0;
  for (const item of [...beams, ...mindPoints]) item.visible = visibleAt(item.userData.born);
  hud();
}
let timer = null;
function stop() { playing = false; clearInterval(timer); document.getElementById('play').textContent = '▶'; }
function play() {
  if (!Number.isFinite(tau) || tau >= T1) { tau = T0; for (const row of model.rows) rowScale.set(row.id, 0); }
  playing = true; document.getElementById('play').textContent = '❚❚';
  const step = active(T1) / (48000 / 60);
  timer = setInterval(() => { if (tau >= T1) { stop(); tau = Infinity; applyTau(); return; } tau = Math.min(T1, active.invert(active(tau) + step)); applyTau(); }, 60);
}
document.getElementById('play').addEventListener('click', () => (playing ? stop() : play()));
document.getElementById('track').addEventListener('pointerdown', (e) => { stop(); const rect = e.currentTarget.getBoundingClientRect(); tau = active.invert(((e.clientX - rect.left) / rect.width) * active(T1)); applyTau(); });

// The hovered function stands out; the others step back.
let highlighted = null;
function highlight(rowId) {
  if (rowId === highlighted) return; highlighted = rowId;
  for (const ridge of ridges) { const own = ridge.userData.row.id === rowId; ridge.material.opacity = rowId === null ? (ridge.userData.row.kind === 'world' ? 0.55 : 0.9) : own ? 1 : 0.18; }
  terrain.material.opacity = rowId === null ? 1 : 0.55; terrain.material.transparent = rowId !== null;
}

// Hover: what a beam, diamond or thought is.
const ray = new THREE.Raycaster(); const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(pointer, camera);
  let hit = ray.intersectObjects([...beams, ...mindPoints].filter((item) => item.visible), false)[0];
  if (!hit && terrain) {
    const ground = ray.intersectObject(terrain, false)[0];
    if (ground) { const row = model.rows.reduce((best, r) => (Math.abs(r.z - ground.point.z) < Math.abs((best?.z ?? Infinity) - ground.point.z) ? r : best), null);
      if (row) { highlight(row.id); const t = model.T(ground.point.x / LENGTH + 0.5);
        tip.replaceChildren(...[[row.group.label, 'm'], [row.label, 'v'], [formatTime(t), 'm']].map(([text, cls]) => { const line = document.createElement('div'); line.className = cls; line.textContent = text; return line; }));
        tip.hidden = false; tip.style.left = `${Math.min(e.clientX + 14, innerWidth - 440)}px`; tip.style.top = `${Math.min(e.clientY + 14, innerHeight - 120)}px`; return; } }
  }
  if (!hit) { tip.hidden = true; highlight(null); return; }
  highlight(hit.object.userData.row?.id ?? null);
  const u = hit.object.userData; const rows = [];
  if (u.event) rows.push([u.event.label, 'v'], [formatTime(u.event.start), 'm'], [clip(u.event.description, 260), '']);
  else if (u.decision) rows.push([u.decision.question, 'v'], ...u.decision.answers.slice(0, 5).map((a) => [`${Math.round(a.weight * 100)}%  ${a.key.replace(/[_.-]+/g, ' ')}${u.decision.drawn?.realized === a.key ? '  ← drawn' : ''}`, '']));
  else if (u.node) rows.push([u.node.category, 'm'], [u.node.title || clip(u.node.text, 90), 'v'], [clip(u.node.text, 360), '']);
  tip.replaceChildren(...rows.map(([text, cls]) => { const line = document.createElement('div'); if (cls) line.className = cls; line.textContent = text; return line; }));
  tip.hidden = false; tip.style.left = `${Math.min(e.clientX + 14, innerWidth - 440)}px`; tip.style.top = `${Math.min(e.clientY + 14, innerHeight - 160)}px`;
});

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

// Section notes and ridge names that would cover the time marks or each other lift a little; the rest wait for hover.
function declutter() {
  const placed = [];
  for (const el of labels.domElement.querySelectorAll('.label.time, .label.group')) { const r = el.getBoundingClientRect(); if (r.width) placed.push(r); }
  for (const list of [sectionNames, ridgeNames]) {
    const items = [];
    for (const item of list) { if (!item.object.visible) continue; const r = item.object.element.getBoundingClientRect(); if (r.width) items.push([item, r]); }
    items.sort((a, b) => b[1].bottom - a[1].bottom);
    for (const [item, r] of items) {
      let lift = 0;
      const hit = () => placed.some((p) => r.left < p.right + 6 && r.right > p.left - 6 && r.top - lift < p.bottom + 1 && r.bottom - lift > p.top - 1);
      while (lift <= 64 && hit()) lift += 3;
      const fits = lift <= 64;
      item.inner.style.transform = `translateY(${-lift}px)`; item.inner.style.opacity = fits ? '' : '0';
      if (fits) placed.push({ left: r.left, right: r.right, top: r.top - lift, bottom: r.bottom - lift });
    }
  }
}
build(); for (const row of model.rows) rowScale.set(row.id, 1); updateTerrain(true); applyTau();
let clock = 0;
function frame() {
  clock += 0.016;
  let moving = false;
  for (const row of model.rows) { const now = rowScale.get(row.id) ?? 0; const target = row.target ?? 1; if (Math.abs(now - target) > 0.002) { rowScale.set(row.id, now + (target - now) * 0.12); moving = true; } }
  if (moving) updateTerrain();
  for (const item of mindPoints) if (item.visible) item.position.y += Math.sin(clock * 0.8 + item.id) * 0.004;
  for (const { object, row, first } of ridgeNames) { const scale = rowScale.get(row.id) ?? 0; object.visible = scale > 0.35; object.position.y = row.samples[first] * AMP * (row.amp ?? 1) * scale + 1.1; }
  controls.update(); composer.render(); labels.render(scene, camera); declutter();
  requestAnimationFrame(frame);
}
frame();
if (params.has('play')) setTimeout(play, 1200);

// Live: rebuild when the extractor refreshes the data file.
if (params.has('live')) setInterval(async () => {
  if (playing) return;
  try { const next = await (await fetch(`data/${dataName}.json?ts=${Date.now()}`, { cache: 'no-store' })).json(); if (next.lastCall === data.lastCall) return;
    data = next; model = buildRows(); const times = data.steps.map((step) => Date.parse(step.at)).filter(Number.isFinite).sort((a, b) => a - b); T0 = times[0] ?? 0; T1 = times.at(-1) ?? 1; active = activeClock(times);
    build(); for (const row of model.rows) if (!rowScale.has(row.id)) rowScale.set(row.id, 0); applyTau(); } catch { /* keep the last frame */ }
}, 15000);
