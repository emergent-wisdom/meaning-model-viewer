#!/usr/bin/env node
// The Meaning Model viewer: open runs in one view, at the server's root.
//
//   node serve.mjs --run <run folder> [--run <another> ...] [--live] [--port 8765]
//   node serve.mjs --data <folder of data files>
//
// Each run is read with extract.mjs into a data file kept in memory; the run is never written to and its own server is
// never called (the extractor takes an online backup of its engine state). After a --run, --name, --title, --config,
// --log, --graph and --state apply to that run (see extract.mjs), and --label names it in the view's choice of runs.
// --live reads every run again each minute, and a view opened with &live follows it. PORT, or --port, sets the port.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, normalize, resolve } from 'node:path';

const here = import.meta.dirname;
const root = join(here, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

// ---- what to serve: runs, and folders of data files -----------------------------------------------------------------------
const argv = process.argv.slice(2);
const global = { port: Number(process.env.PORT ?? 8765), live: false, data: [] };
const runs = []; let current = null;
const RUN_FLAGS = new Set(['--name', '--title', '--config', '--log', '--graph', '--state', '--scopes']);
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--run') { current = { folder: resolve(argv[i += 1]), flags: [] }; runs.push(current); }
  else if (RUN_FLAGS.has(arg)) { if (!current) throw new Error(`${arg} belongs after the --run it is for.`); current.flags.push(arg, argv[i += 1]); }
  else if (arg === '--label') { if (!current) throw new Error('--label belongs after the --run it is for.'); current.label = argv[i += 1]; }
  else if (arg === '--live') global.live = true;
  else if (arg === '--port') global.port = Number(argv[i += 1]);
  else if (arg === '--data') global.data.push(resolve(argv[i += 1]));
  else if (arg === '--help' || arg === '-h') { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 10).map((line) => line.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
  else if (!arg.startsWith('--') && !runs.length) { current = { folder: resolve(arg), flags: [] }; runs.push(current); }
  else throw new Error(`Unknown argument ${arg}: node serve.mjs --help`);
}
if (!global.data.length && !runs.length) for (const folder of [join(root, 'data'), join(here, 'data')]) if (existsSync(folder)) global.data.push(folder);

// Data sets by name: each run's extraction, and every .json in the data folders.
const sets = new Map();
const scratch = mkdtempSync(join(tmpdir(), 'meaning-model-viewer-'));
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(0));
const extract = (run) => new Promise((done) => {
  const out = join(scratch, `${run.key}.json`);
  execFile(process.execPath, [join(here, 'extract.mjs'), '--run', run.folder, '--out', out, ...(run.flags.includes('--name') ? [] : ['--name', run.key]), ...run.flags],
    { maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { console.error(`${run.folder}: could not read the run.\n${String(stderr || error.message).trim().split('\n').slice(-6).join('\n')}`); done(false); return; }
      const body = readFileSync(out); const data = JSON.parse(body);
      const changed = sets.get(run.key)?.lastCall !== data.lastCall || sets.get(run.key)?.headGraphHash !== data.headGraphHash;
      sets.set(run.key, { body, title: data.title, run: run.folder, generatedAt: data.generatedAt, lastCall: data.lastCall, headGraphHash: data.headGraphHash, events: data.events?.length ?? 0 });
      if (changed) console.log(`${run.key}: ${String(stdout).trim().split('\n').at(-1).replace(out, 'read')}`);
      done(true);
    });
});
const keys = new Set();
for (const run of runs) {
  const named = run.flags[run.flags.indexOf('--name') + 1];
  let key = (run.flags.includes('--name') ? named : basename(run.folder)).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'run';
  if (/^(work|novel|run|story|state)$/.test(key)) key = `${basename(resolve(run.folder, '..')).toLowerCase().replace(/[^a-z0-9._-]+/g, '-')}-${key}`;
  for (let n = 2; keys.has(key); n += 1) key = `${key.replace(/-\d+$/, '')}-${n}`;
  keys.add(key); run.key = key;
}
const loadFolders = () => { for (const folder of global.data) for (const file of readdirSync(folder).filter((name) => name.endsWith('.json') && name !== 'index.json')) {
  const key = file.replace(/\.json$/, ''); if (sets.has(key) && sets.get(key).run) continue;
  try { const body = readFileSync(join(folder, file)); const data = JSON.parse(body); if (!data.events) continue; sets.set(key, { body, title: data.title, run: null, generatedAt: data.generatedAt, lastCall: data.lastCall, events: data.events.length }); } catch { /* not a data file */ }
} };
loadFolders();
if (runs.length) console.log(`Reading ${runs.length === 1 ? 'the run' : `${runs.length} runs`} with the Meaning Model${process.env.MEANING_MODEL_DIR ? ' in MEANING_MODEL_DIR' : ''}…`);
const results = await Promise.all(runs.map(extract));
if (runs.length && !results.some(Boolean)) { console.error('No run could be read.'); process.exit(1); }
if (global.live && runs.length) setInterval(() => { for (const run of runs) extract(run); }, 60000).unref?.();
// The runs the view can choose between, each by its label (else its title, told apart by its name when titles repeat).
const index = () => {
  const list = [...sets].map(([name, set]) => ({ name, title: set.title, label: runs.find((run) => run.key === name)?.label ?? null, generatedAt: set.generatedAt, lastCall: set.lastCall, events: set.events, live: Boolean(set.run && global.live) }));
  for (const item of list) if (!item.label) item.label = list.filter((other) => other.title === item.title).length > 1 ? `${item.title ?? item.name} (${item.name})` : item.title ?? item.name;
  return JSON.stringify({ default: runs.find((run) => sets.has(run.key))?.key ?? list[0]?.name ?? null, runs: list });
};

// QR codes for the links a view shows, when the qrcode package is installed.
const qrcode = await import('qrcode').then((module) => module.default ?? module).catch(() => null);

// ---- the server -------------------------------------------------------------------------------------------------------------------
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type = 'text/plain; charset=utf-8') => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
  if (url.pathname === '/data/index.json') return send(200, index(), types['.json']);
  const set = url.pathname.match(/^\/data\/([^/]+)\.json$/);
  if (set) return sets.has(decodeURIComponent(set[1])) ? send(200, sets.get(decodeURIComponent(set[1])).body, types['.json']) : send(404, 'no such data set');
  if (url.pathname === '/qr.svg') {
    const target = url.searchParams.get('url') ?? '';
    if (!qrcode || !/^https?:\/\/[^\s]{1,300}$/.test(target)) return send(404, 'no QR code');
    return send(200, await qrcode.toString(target, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } }), types['.svg']);
  }
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  const file = path || 'index.html';
  if (file.split(/[/\\]/).includes('..')) return send(403, 'forbidden');
  try { send(200, await readFile(join(root, file)), types[extname(file)] ?? 'application/octet-stream'); }
  catch { send(404, 'not found'); }
}).on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? `Port ${global.port} is in use: pass --port <another> or set PORT.` : error.message); process.exit(1); })
  .listen(global.port, '127.0.0.1', () => {
    const base = `http://localhost:${global.port}`;
    console.log(`\n${base}/  ${sets.size ? [...sets.keys()].join(', ') : 'no data yet: pass --run <run folder>'}`);
  });
