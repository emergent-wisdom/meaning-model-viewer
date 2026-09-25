// Turns a Meaning Model story run into one data file for the stage view.
//
//   node extract.mjs --run <run folder containing novel/> --out data/<name>.json [--title "..."]
//   node extract.mjs --static <model.json> <narrative-graph.json> --out data/<name>.json [--title "..."]
//
// Relay mode reads the run's relay call log (never the agent's transcript) and never calls the run's own server: it
// takes an online SQLite backup of the run's engine database, opens that snapshot with a private engine, and exports
// the story graph's construction (every model revision it was bound to, every graph revision as a change) in process.
// Each record's birth is the first revision that holds it; each revision's time is the first logged call whose result
// names its hash.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// The Meaning Model: a checkout or the installed npm package (@emergent-wisdom/meaning-model-mcp), with its engine.
const PUBLISH = resolve(process.env.MEANING_MODEL_DIR ?? 'node_modules/@emergent-wisdom/meaning-model-mcp');
const ENGINE = process.env.LIFE_SIM_ENGINE_BIN ?? `${PUBLISH}/rust-engine/target/release/life-sim-engine`;
const MQ = `${PUBLISH}/mcp-server/src/model-questions.mjs`;
const { indexModel, modeledPeople, readPerson, cutKind, eventDescendants } = await import(MQ);

const argv = process.argv.slice(2);
const flag = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : null; };
const out = flag('--out') ?? 'public/data/story.json';
const HASH = /\b[0-9a-f]{64}\b/g;
const parseBody = (result) => { try { return JSON.parse(result?.content?.[0]?.text ?? 'null'); } catch { return null; } };

// ---- sources -----------------------------------------------------------------------------------------------------
let calls = []; let history = null; let staticModel = null; let staticGraph = null; let runName = null; let rendered = null;
if (flag('--run')) {
  const run = resolve(flag('--run'));
  const novel = existsSync(join(run, 'novel')) ? join(run, 'novel') : run;
  runName = run.split('/').filter(Boolean).at(-1);
  const log = readFileSync(join(novel, 'mcp-transcript.jsonl'), 'utf8').trim().split('\n').map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  calls = log.filter((entry) => entry.command?.op === 'call' && entry.event === 'result');
  // The story graph's head: the newest graph a write produced.
  let head = flag('--graph');
  // The scopes the agent wrote under: from its results and its call inputs, or --scopes.
  const scopes = new Set((flag('--scopes') ?? '').split(',').filter(Boolean));
  const collect = (text) => { for (const match of text.matchAll(/"access_?[sS]copes"\s*:\s*\[([^\]]*)\]/g)) for (const scope of match[1].matchAll(/"([^"]+)"/g)) scopes.add(scope[1]); };
  for (const entry of calls) collect(JSON.stringify(entry.result ?? {}));
  const inputs = join(novel, 'inputs');
  if (existsSync(inputs)) for (const name of readdirSync(inputs).filter((file) => file.endsWith('.json'))) { try { collect(readFileSync(join(inputs, name), 'utf8')); } catch { /* unreadable input */ } }
  if (!head) {
    for (const entry of [...calls].reverse()) {
      if (entry.result?.isError) continue;
      const body = parseBody(entry.result);
      if (body?.graphHash && (body.previousGraphHash || entry.command.name === 'life_narrative_register')) { head = body.graphHash; break; }
    }
  }
  if (!head) throw new Error('No story graph has been written in this run yet.');
  // A consistent snapshot of the live database, opened by a private engine: the run's own server is never called.
  const snapshot = join(tmpdir(), `meaning-model-viz-${process.pid}.sqlite`);
  execFileSync('sqlite3', [join(novel, 'engine-state.sqlite'), `.backup '${snapshot}'`]);
  process.env.LIFE_SIM_STATE_FILE = snapshot;
  process.env.LIFE_SIM_ENGINE_BIN = ENGINE;
  const { LifeSimulationService } = await import(`${PUBLISH}/mcp-server/src/service.mjs`);
  const { exportConstructionHistory } = await import(`${PUBLISH}/mcp-server/src/construction-record.mjs`);
  const service = new LifeSimulationService();
  try {
    await service.initialize();
    history = await exportConstructionHistory(service, { graphHash: head, accessScopes: [...scopes].sort() });
    // The story as a reader has it: the tool's own render of the graph's narrative nodes, in story order.
    rendered = await service.renderNarrativeGraph({ graphHash: head, accessScopes: [...scopes].sort() }).catch((error) => ({ error: String(error?.message ?? error) }));
  } finally {
    await service.close?.();
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${snapshot}${suffix}`, { force: true });
  }
  if (!history?.revisions) throw new Error('The export returned no revisions.');
} else if (flag('--static')) {
  const index = argv.indexOf('--static');
  const [modelPath, graphPath] = [argv[index + 1], argv[index + 2]];
  const loaded = JSON.parse(readFileSync(modelPath, 'utf8')); staticModel = loaded.model ?? loaded;
  const graphFile = JSON.parse(readFileSync(graphPath, 'utf8')); staticGraph = graphFile.narrative_graph ?? graphFile.narrativeGraph ?? graphFile;
  runName = staticModel.id;
  history = { models: [{ modelHash: 'static', definition: staticModel }], revisions: [{ graphHash: 'static', definition: staticGraph }] };
} else {
  throw new Error('Pass --run <folder> or --static <model.json> <graph.json>.');
}

// When each hash first appeared in a logged result: the call that made it.
const hashAt = new Map();
for (const entry of calls) {
  if (entry.result?.isError) continue;
  for (const hash of JSON.stringify(entry.result ?? {}).match(HASH) ?? []) if (!hashAt.has(hash)) hashAt.set(hash, { at: entry.at, seq: entry.seq, tool: entry.command.name });
}
const firstCall = calls[0]?.at ?? null;

// ---- time ----------------------------------------------------------------------------------------------------------
const finalModelEntry = history.models.at(-1);
const unit = String(finalModelEntry.definition.time_unit ?? 'year');
// Everything the page draws is in decimal years; the model's own clock is kept beside it.
const toYear = (t) => (t === null || t === undefined ? null : unit.startsWith('civil_day_since_1970') ? 1970 + t / 365.2425 : unit.startsWith('year') ? t : t);

// ---- model births ---------------------------------------------------------------------------------------------------
const born = new Map(); // record key -> { rev, at }
const modelSteps = [];
let previous = { events: new Set(), cuts: new Set(), referents: new Set(), relations: new Set(), processes: new Set() };
history.models.forEach((entry, rev) => {
  const mm = entry.definition.meaning_model ?? {};
  const now = {
    events: new Set((mm.events ?? []).map((item) => item.id)), cuts: new Set((mm.normalized_cuts ?? []).map((item) => item.id)),
    referents: new Set((mm.referents ?? []).map((item) => item.id)), processes: new Set((entry.definition.processes ?? []).map((item) => item.id)),
    relations: new Set((mm.event_relations ?? []).map((item) => item.id ?? `${item.source_event_id}>${item.kind}>${item.target_event_id}`)),
  };
  const at = hashAt.get(entry.modelHash)?.at ?? null;
  const added = {};
  for (const [collection, ids] of Object.entries(now)) {
    added[collection] = [...ids].filter((id) => !previous[collection].has(id));
    for (const id of added[collection]) if (!born.has(`${collection}:${id}`)) born.set(`${collection}:${id}`, { rev, at });
  }
  modelSteps.push({ rev, modelHash: entry.modelHash, at, reason: String(entry.definition.revision?.reason ?? '').slice(0, 280),
    added: Object.fromEntries(Object.entries(added).map(([key, ids]) => [key, ids.length])),
    totals: Object.fromEntries(Object.entries(now).map(([key, ids]) => [key, ids.size])) });
  previous = now;
});

// ---- graph replay ------------------------------------------------------------------------------------------------------
const nodes = new Map(); const edges = new Map(); const graphSteps = [];
const nodeBorn = new Map(); const edgeBorn = new Map();
let boundModel = null;
history.revisions.forEach((revision, rev) => {
  const at = hashAt.get(revision.graphHash)?.at ?? null;
  const added = [];
  if (revision.definition) {
    for (const node of revision.definition.nodes ?? []) { nodes.set(node.id, node); added.push(node.id); }
    for (const edge of revision.definition.edges ?? []) edges.set(edge.id, edge);
    boundModel = revision.definition.source?.model_hash ?? boundModel;
  } else {
    const delta = revision.delta;
    for (const id of delta.removeNodeIds ?? []) nodes.delete(id);
    for (const id of delta.removeEdgeIds ?? []) edges.delete(id);
    for (const node of delta.upsertNodes ?? []) { if (!nodes.has(node.id)) added.push(node.id); nodes.set(node.id, node); }
    for (const edge of delta.upsertEdges ?? []) edges.set(edge.id, edge);
    if (delta.source?.model_hash) boundModel = delta.source.model_hash;
  }
  for (const id of added) if (!nodeBorn.has(id)) nodeBorn.set(id, { rev, at });
  for (const id of edges.keys()) if (!edgeBorn.has(id)) edgeBorn.set(id, { rev, at });
  const reason = revision.definition?.revision?.reason ?? revision.delta?.revision?.reason ?? '';
  graphSteps.push({ rev, graphHash: revision.graphHash, at, reason: String(reason).slice(0, 280), added: added.length, boundModel });
});

// The model the story graph is bound to at its head, else the newest one.
const model = (history.models.find((entry) => entry.modelHash === boundModel) ?? finalModelEntry).definition;
const index = indexModel(model);
const mm = model.meaning_model ?? {};
const birthOf = (collection, id) => born.get(`${collection}:${id}`) ?? null;
const start = (event) => event?.interval?.start ?? null;
const end = (event) => event?.interval?.end ?? null;
const clip = (text, length) => { const value = String(text ?? '').replace(/\s+/g, ' ').trim(); return value.length > length ? `${value.slice(0, length - 1)}…` : value; };

// ---- people --------------------------------------------------------------------------------------------------------------
const nameOf = (referent) => {
  const boundary = String(referent?.boundary ?? '');
  const lead = boundary.split(/[,;(]| - | — /)[0].trim();
  if (lead && lead.split(/\s+/).length <= 4 && /^[A-ZÅÄÖÉ]/u.test(lead)) return lead.replace(/^(the|a) /i, '');
  const tail = String(referent?.id ?? '').split(/\.person\.|\./).filter(Boolean).at(-1) ?? '';
  return tail.replace(/[_-]+/g, ' ').replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
};
const draws = [...nodes.values()].filter((node) => node.node_type === 'direction_draw').map((node) => {
  try { const data = JSON.parse(node.text); const draw = data?.data ?? data; return { nodeId: node.id, cutId: draw.cutId, realized: draw.realized, remainder: Boolean(draw.realizedIsRemainder), seed: draw.seed ?? null, u: draw.u ?? null }; } catch { return null; }
}).filter(Boolean);
const drawOf = new Map(draws.map((draw) => [draw.cutId, draw]));
const allCuts = mm.normalized_cuts ?? [];
const withdrawn = new Set(allCuts.filter((cut) => cut.withdrawn).map((cut) => cut.id));

const listed = modeledPeople(index);
const people = listed.map((person, order) => {
  const read = readPerson(index, person.id);
  const series = new Map();
  for (const item of read.cuts) {
    const kind = cutKind(item.cut);
    if (kind === 'decision' || start(item.event) === null) continue;
    const key = `${kind}|${String(item.cut.question ?? '').toLowerCase().trim()}|${item.cut.unit ?? ''}`;
    if (!series.has(key)) series.set(key, { kind, question: String(item.cut.question ?? item.cut.id), unit: item.cut.unit ?? '', points: [] });
    series.get(key).points.push({ t: toYear(start(item.event)), end: toYear(end(item.event)), eventId: item.event.id, cutId: item.cut.id,
      answers: (item.cut.answers ?? []).slice().sort((a, b) => b.weight - a.weight).map((answer) => ({ key: answer.key, weight: +answer.weight.toFixed(4) })),
      born: birthOf('cuts', item.cut.id) });
  }
  const decisions = read.cuts.filter((item) => cutKind(item.cut) === 'decision').map((item) => ({
    cutId: item.cut.id, question: clip(item.cut.question, 220), t: toYear(start(item.event)), eventId: item.event.id,
    answers: (item.cut.answers ?? []).slice().sort((a, b) => b.weight - a.weight).map((answer) => ({ key: answer.key, weight: +answer.weight.toFixed(4) })),
    drawn: drawOf.get(item.cut.id) ?? null, born: birthOf('cuts', item.cut.id) }));
  const lifeStart = toYear(start(read.life)); const lifeEnd = toYear(end(read.life));
  return {
    id: person.id, name: nameOf(read.referent), principal: person.principal, order,
    who: clip(read.referent?.boundary, 320), born: birthOf('referents', person.id),
    life: read.life ? { eventId: read.life.id, start: lifeStart, end: lifeEnd, born: birthOf('events', read.life.id) } : null,
    processes: read.processes.map((item) => ({ eventId: item.eventId, what: clip(item.what, 120), opened: item.opened })),
    periods: read.periods.map((event) => ({ eventId: event.id, what: clip(event.description ?? event.boundary, 160), start: toYear(start(event)), end: toYear(end(event)), born: birthOf('events', event.id) })),
    arcs: read.arcs.map((item) => ({ eventId: item.arcEventId, what: clip(item.arc?.description ?? item.arc?.boundary ?? item.arcEventId, 180),
      start: toYear(start(item.arc)), end: toYear(end(item.arc)), focal: toYear(start(item.focal ?? item.arc)), focalEnd: toYear(end(item.focal ?? item.arc)),
      adaptationEnd: toYear(end(item.adaptation ?? item.arc)), born: birthOf('events', item.arcEventId) })),
    series: [...series.values()].map((entry) => ({ ...entry, points: entry.points.sort((a, b) => a.t - b.t) })).sort((a, b) => b.points.length - a.points.length),
    decisions: decisions.filter((item) => !withdrawn.has(item.cutId)).sort((a, b) => (a.t ?? 0) - (b.t ?? 0)),
  };
});

// ---- events ---------------------------------------------------------------------------------------------------------------
const lifeEvents = new Set(people.map((person) => person.life?.eventId).filter(Boolean));
const periodEvents = new Set(people.flatMap((person) => person.periods.map((period) => period.eventId)));
const arcEvents = new Set([...index.arcsOf.values()].flat().flatMap((id) => [id, ...eventDescendants(index, id)]));
const parentOf = (id) => [...(index.parents.get(id) ?? [])][0] ?? null;
const events = (mm.events ?? []).map((event) => {
  const span = start(event) !== null && end(event) !== null ? end(event) - start(event) : null;
  const participants = [...new Set(Object.values(event.participants ?? {}).flat().map(String))];
  const kind = lifeEvents.has(event.id) ? 'life' : periodEvents.has(event.id) ? 'period' : arcEvents.has(event.id) ? 'arc'
    : (index.cutsByEvent.get(event.id) ?? []).some((cut) => cutKind(cut) === 'decision') ? 'decision' : 'event';
  return { id: event.id, label: clip(event.boundary ?? event.id, 90), description: clip(event.description, 360), start: toYear(start(event)), end: toYear(end(event)),
    span: span === null ? null : toYear(end(event)) - toYear(start(event)), parent: parentOf(event.id), region: event.region ?? null, participants, kind,
    cuts: (index.cutsByEvent.get(event.id) ?? []).length, born: birthOf('events', event.id) };
});
const relations = (mm.event_relations ?? []).filter((relation) => relation.kind !== 'contains').map((relation) => ({
  source: relation.source_event_id, target: relation.target_event_id, kind: relation.kind,
  born: birthOf('relations', relation.id ?? `${relation.source_event_id}>${relation.kind}>${relation.target_event_id}`) }));

// ---- the mind: graph nodes ------------------------------------------------------------------------------------------------------
const category = (node) => {
  const type = String(node.node_type ?? '');
  if (type.startsWith('understanding.')) return 'thought';
  if (type === 'storytelling.world') return 'world';
  if (type === 'storytelling.direction') return 'director';
  if (type === 'direction_draw') return 'draw';
  if (node.role === 'story_passage' || /passage|scene|chapter/.test(type)) return 'passage';
  if (type === 'model_reference') return 'reference';
  if (/root|document|story$/.test(type) || node.role === 'document_root') return 'root';
  if (type.startsWith('storytelling.') || type.startsWith('story.')) return 'author';
  if (/review|assessment|depth/.test(type)) return 'review';
  return 'other';
};
const textOf = (node) => {
  const raw = String(node.text ?? '');
  try {
    const payload = JSON.parse(raw); const data = payload?.data ?? payload;
    if (data?.stage) return clip(`${data.stage}: ${node.title ?? ''} ${payload.text ?? data.summary ?? ''}`, 900);
    return clip(payload?.text ?? data?.text ?? data?.summary ?? data?.question ?? node.title ?? raw, 900);
  } catch { return clip(raw, 1400); }
};
const graphNodes = [...nodes.values()].map((node) => ({
  id: node.id, type: node.node_type, category: category(node), role: node.role ?? null, title: clip(node.title ?? '', 140), text: textOf(node),
  holder: node.holder ?? null, words: category(node) === 'passage' ? String(node.text ?? '').split(/\s+/).filter(Boolean).length : 0,
  born: nodeBorn.get(node.id) ?? null, valueTime: node.value_time ?? null })).filter((node) => node.category !== 'root');
const keep = new Set(graphNodes.map((node) => node.id));
const eventIds = new Set(events.map((event) => event.id));
const personIds = new Set(people.map((person) => person.id));
const graphEdges = [...edges.values()].map((edge) => {
  const source = edge.source?.kind === 'node' ? edge.source.node_id : null;
  const target = edge.target?.kind === 'node' ? { node: edge.target.node_id } : edge.target?.kind === 'anchor' ? { anchor: edge.target.anchor_id, anchorKind: edge.target.anchor_kind } : null;
  return { id: edge.id, source, target, relation: edge.relation ?? edge.family ?? null, born: edgeBorn.get(edge.id) ?? null };
}).filter((edge) => edge.source && keep.has(edge.source) && edge.target && ((edge.target.node && keep.has(edge.target.node))
  || (edge.target.anchor && (eventIds.has(edge.target.anchor) || personIds.has(edge.target.anchor)))));

// ---- construction timeline -------------------------------------------------------------------------------------------------------
const steps = [
  ...modelSteps.map((step) => ({ kind: 'model', at: step.at, rev: step.rev, label: step.reason, added: step.added, totals: step.totals })),
  ...graphSteps.map((step) => ({ kind: 'graph', at: step.at, rev: step.rev, label: step.reason, added: step.added })),
].filter((step) => step.at).sort((a, b) => a.at.localeCompare(b.at));
const toolCalls = calls.map((entry) => ({ at: entry.at, tool: entry.command.name, error: Boolean(entry.result?.isError) }));

// ---- story window and deep time -----------------------------------------------------------------------------------------------------
const lives = people.filter((person) => person.principal && person.life);
const storyTimes = events.filter((event) => event.kind === 'decision' || (event.span !== null && event.span < 1.5)).map((event) => event.start).filter((t) => t !== null).sort((a, b) => a - b);
// The story's present: from the route's first part's moment to its last one's (each part's shortest Event), else the
// span of its short, decision-bearing Events.
let window = null;
const routeNode = [...nodes.values()].filter((node) => node.node_type === 'storytelling.world' && /"stage":"route"/.test(String(node.text))).at(-1);
if (routeNode) {
  try {
    const route = JSON.parse(routeNode.text).data; const byId = new Map(events.map((event) => [event.id, event]));
    const moments = route.parts.map((part) => part.eventIds.map((id) => byId.get(id)).filter((event) => event && event.start !== null && !arcEvents.has(event.id))
      .sort((a, b) => ((a.end ?? a.start) - a.start) - ((b.end ?? b.start) - b.start))[0]).filter(Boolean);
    if (moments.length) window = { start: Math.min(...moments.map((event) => event.start)), end: Math.max(...moments.map((event) => event.end ?? event.start)) };
  } catch { window = null; }
}
if (!window && storyTimes.length >= 2) window = { start: storyTimes[Math.floor(storyTimes.length * 0.05)], end: storyTimes[Math.ceil(storyTimes.length * 0.95) - 1] };
const allStarts = events.map((event) => event.start).filter((t) => t !== null);
const extent = allStarts.length ? { start: Math.min(...allStarts), end: Math.max(...events.map((event) => event.end ?? event.start).filter((t) => t !== null)) } : null;

const titled = [...nodes.values()].find((node) => node.node_type === 'storytelling.world' && /candidates/.test(String(node.text)));
let title = flag('--title');
if (!title && titled) { try { const data = JSON.parse(titled.text).data; title = data.candidates.find((item) => item.id === data.selection.chosenId)?.title ?? null; } catch { title = null; } }

// ---- the story's text, from the render ------------------------------------------------------------------------------------------
const story = rendered && !rendered.error ? { projectionHash: rendered.projection_hash ?? null,
  units: (rendered.units ?? []).map((unit) => ({ id: unit.node_id, type: unit.node_type ?? null, role: unit.role ?? null, title: unit.title ?? null, text: String(unit.text ?? ''), born: nodeBorn.get(unit.node_id) ?? null })) } : null;
const storyTitle = story?.units.map((unit) => unit.text.match(/^#\s+(.+)$/m)?.[1]?.trim()).find(Boolean) ?? null;
const storyWords = story ? story.units.reduce((sum, unit) => sum + unit.text.split('\n').filter((line) => !/^\s*#/.test(line)).join(' ').split(/\s+/).filter(Boolean).length, 0) : null;
const data = {
  // The story's own title, from its document in the graph; else the chosen world's.
  schema: 'meaning-model-stage-view/v1', generatedAt: new Date().toISOString(), run: runName, title: flag('--title') ?? storyTitle ?? title ?? runName,
  timeUnit: unit, firstCall, lastCall: calls.at(-1)?.at ?? null, headGraphHash: history.headGraphHash ?? null, modelHash: boundModel,
  window, extent, people, events, relations, draws,
  graph: { nodes: graphNodes, edges: graphEdges }, story, steps, toolCalls,
  totals: { events: events.length, cuts: allCuts.length - withdrawn.size, people: people.length, lives: lives.length, thoughts: graphNodes.filter((node) => node.category === 'thought').length,
    passages: graphNodes.filter((node) => node.category === 'passage').length, words: storyWords ?? graphNodes.reduce((sum, node) => sum + node.words, 0), modelRevisions: history.models.length, graphRevisions: history.revisions.length },
};
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, JSON.stringify(data));
console.log(`${out}: ${events.length} events, ${people.length} people (${lives.length} principal lives), ${graphNodes.length} graph nodes, ${graphEdges.length} edges, ${steps.length} construction steps, ${(JSON.stringify(data).length / 1e6).toFixed(2)} MB`);
