// Turns a Meaning Model run into one data file for the viewer.
//
//   node extract.mjs --run <run folder> --out <file.json> [--title "..."] [--config viewer.json] [--log earlier.jsonl ...]
//   node extract.mjs --static <model.json> <narrative-graph.json> --out <file.json> [--title "..."]
//
// A run folder (format meaning-model-run/1, described in the README) holds the relay's call log, mcp-transcript.jsonl,
// and the engine's SQLite state, in the folder itself or in its novel/ folder. The extractor reads the call log (never
// the agent's transcript) and never calls the run's own server: it takes an online SQLite backup of the engine state,
// opens that snapshot with a private engine, and exports the story graph's construction (every model revision it was
// bound to, every graph revision as a change) in process. It writes nothing into the run. Each record's birth is the
// first revision that holds it; each revision's time is the first logged call whose result names its hash.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { meaningModelRoot, loadMeaningModel } from './meaning-model.mjs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
const PUBLISH = meaningModelRoot();
const { buildViewerData } = await loadMeaningModel('src/viewer-data.mjs');
const { renderViewerDocument } = await loadMeaningModel('src/viewer-snapshot.mjs');
const meaningModelVersion = JSON.parse(readFileSync(join(PUBLISH, existsSync(join(PUBLISH, 'package.json')) ? 'package.json' : 'mcp-server/package.json'), 'utf8')).version;

const argv = process.argv.slice(2);
const flag = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : null; };
const flags = (name) => argv.flatMap((value, index) => (value === name && argv[index + 1] ? [argv[index + 1]] : []));
const out = flag('--out') ?? '.local-work/run.json';
const parseBody = (result) => { try { return JSON.parse(result?.content?.[0]?.text ?? 'null'); } catch { return null; } };
const readLog = (file) => readFileSync(file, 'utf8').trim().split('\n').map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
// Where a run keeps its call log and its engine state: the folder itself or its novel/ folder.
export const RUN_FORMAT = 'meaning-model-run/1';
function runFiles(folder) {
  const at = [join(folder, 'novel'), folder].find((dir) => existsSync(join(dir, 'mcp-transcript.jsonl')));
  if (!at) throw new Error(`${folder} is not a run folder (${RUN_FORMAT}): it has no mcp-transcript.jsonl, in itself or in novel/.`);
  const sqlite = readdirSync(at).filter((file) => file.endsWith('.sqlite'));
  const state = flag('--state') ? resolve(flag('--state')) : ['engine-state.sqlite', 'story-state.sqlite'].map((file) => join(at, file)).find(existsSync) ?? (sqlite.length === 1 ? join(at, sqlite[0]) : null);
  if (!state) throw new Error(`${at} holds ${sqlite.length ? `${sqlite.length} SQLite files` : 'no SQLite file'}: name the engine state with --state <file>.`);
  return { dir: at, log: join(at, 'mcp-transcript.jsonl'), state, inputs: join(at, 'inputs') };
}
// A run's name: its folder's, or with its parent's when the folder has a generic name such as work or novel.
const nameOfRun = (folder) => { const name = basename(folder); return /^(work|novel|run|story|state)$/i.test(name) ? `${basename(dirname(folder))}-${name}` : name; };

// ---- sources -----------------------------------------------------------------------------------------------------
let calls = []; let history = null; let staticModel = null; let staticGraph = null; let runName = null; let rendered = null; let documentRendered = null; let display = null;
if (flag('--run')) {
  const run = resolve(flag('--run'));
  const files = runFiles(run);
  runName = flag('--name') ?? nameOfRun(run);
  // How the run wants to be shown, if it says: names for its processes and links (viewer.json beside it, or --config).
  const configFile = flag('--config') ? resolve(flag('--config')) : [join(run, 'viewer.json'), join(files.dir, 'viewer.json')].find(existsSync);
  if (configFile) display = JSON.parse(readFileSync(configFile, 'utf8'));
  // Earlier logs (--log) come first: a fork's own log does not hold the calls that built what it was forked from.
  const log = [...flags('--log').map((file) => readLog(resolve(file))).flat(), ...readLog(files.log)];
  calls = log.filter((entry) => entry.command?.op === 'call' && entry.event === 'result');
  // The story graph's head: the newest graph a write produced.
  let head = flag('--graph');
  // The scopes the agent wrote under: from its results and its call inputs, or --scopes.
  const scopes = new Set((flag('--scopes') ?? '').split(',').filter(Boolean));
  const collect = (text) => { for (const match of text.matchAll(/"access_?[sS]copes"\s*:\s*\[([^\]]*)\]/g)) for (const scope of match[1].matchAll(/"([^"]+)"/g)) scopes.add(scope[1]); };
  for (const entry of calls) collect(JSON.stringify(entry.result ?? {}));
  const inputs = files.inputs;
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
  const snapshot = join(tmpdir(), `meaning-model-viewer-${process.pid}.sqlite`);
  { const { DatabaseSync, backup } = await import('node:sqlite'); const source = new DatabaseSync(files.state, { readOnly: true }); await backup(source, snapshot); source.close(); }
  process.env.LIFE_SIM_STATE_FILE = snapshot;
  const { LifeSimulationService } = await import(`${PUBLISH}/mcp-server/src/service.mjs`);
  const { exportConstructionHistory } = await import(`${PUBLISH}/mcp-server/src/construction-record.mjs`);
  const service = new LifeSimulationService();
  try {
    await service.initialize();
    history = await exportConstructionHistory(service, { graphHash: head, accessScopes: [...scopes].sort() });
    // The story as a reader has it: the tool's own render of the graph's narrative nodes, in story order.
    rendered = await service.renderNarrativeGraph({ graphHash: head, accessScopes: [...scopes].sort() }).catch((error) => ({ error: String(error?.message ?? error) }));
    documentRendered = await renderViewerDocument(service, { graphHash: head, accessScopes: [...scopes].sort() }, rendered);
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
  history = { models: [{ modelHash: staticGraph.source?.model_hash ?? 'static', definition: staticModel }], revisions: [{ graphHash: 'static', definition: staticGraph }] };
} else {
  throw new Error('Pass --run <folder> or --static <model.json> <graph.json>.');
}

// The MCP owns interpretation, graph construction and every representation.
// An optional exact render lets static callers retain document ordering.
if (flag('--render')) rendered = JSON.parse(readFileSync(flag('--render'), 'utf8'));
if (flag('--document-render')) documentRendered = JSON.parse(readFileSync(flag('--document-render'), 'utf8'));
if (documentRendered && rendered && documentRendered.graph_hash !== rendered.graph_hash) {
  throw new Error('The document render and complete render must belong to the same graph revision.');
}
const data = await buildViewerData({ history, rendered, documentRendered, calls, name: runName,
  title: flag('--title'), display, meaningModelVersion });
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, JSON.stringify(data));
console.log(`${out}: ${data.events.length} events, ${data.totals.people} people, ${data.totals.passages} passages`);
