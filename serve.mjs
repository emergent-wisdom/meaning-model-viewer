#!/usr/bin/env node
// Serve saved runs and reviewed snapshots with the viewer bundled in the MCP.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { viewerDirectory } from './meaning-model.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const liveRevision = (data) => createHash('sha256').update(JSON.stringify([data.modelHash ?? null, data.headGraphHash ?? null, data.lastCall ?? null])).digest('hex');
const legacyViews = { 'processes.html': 'together', 'landscape.html': 'terrain', 'explorer.html': 'graph' };

export function createViewerServer(sets, { publicDirectory = viewerDirectory(), live = false } = {}) {
  const root = resolve(publicDirectory);
  if (!sets.size) throw new Error('No models to open. Pass --run <folder> or --data <folder>.');
  const entries = [...sets].map(([name, data]) => {
    if (!data.inspection?.model) throw new Error(`${name}: this snapshot predates the shared viewer. Extract it again from its saved run.`);
    return { name, get data() { return live ? sets.get(name) : data; }, token: createHash('sha256').update(`${name}:${live ? 'live' : data.headGraphHash ?? data.modelHash ?? JSON.stringify(data)}`).digest('hex').slice(0, 48) };
  });
  const byToken = new Map(entries.map((entry) => [entry.token, entry]));
  const server = createServer(async (req, res) => {
    const send = (status, body = '', type = 'text/plain; charset=utf-8', headers = {}) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    try {
      const port = server.address()?.port;
      const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      if (!hosts.has(req.headers.host) || (req.headers.origin && !hosts.has(new URL(req.headers.origin).host))) return send(403, 'Forbidden');
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'Read-only viewer');
      const url = new URL(req.url, 'http://localhost');
      const path = decodeURIComponent(url.pathname);
      const oldPage = path.replace(/^\//, '');
      if (path === '/' || path === '/index.html' || Object.hasOwn(legacyViews, oldPage)) {
        const selected = entries.find((entry) => entry.name === url.searchParams.get('data')) ?? entries[0];
        url.searchParams.delete('data');
        url.searchParams.delete('live');
        if (legacyViews[oldPage] && !url.searchParams.has('view')) url.searchParams.set('view', legacyViews[oldPage]);
        return send(302, '', undefined, { location: `/${selected.token}/${url.search}` });
      }
      const [, token, ...parts] = path.split('/');
      const entry = byToken.get(token);
      if (!entry) return send(404, 'Model snapshot not found');
      const relative = parts.join('/') || 'index.html';
      if (relative === 'data/index.json') return send(200, JSON.stringify({ default: 'model', runs: [{ name: 'model', title: entry.data.title, label: entry.data.title }] }), types['.json']);
      if (live && relative === 'data/live.json') return send(200, JSON.stringify({ revision: liveRevision(entry.data) }), types['.json']);
      if (live && relative === 'live-reload.js') return send(200, await readFile(new URL('./live-reload.js', import.meta.url)), types['.js']);
      if (relative === 'data/model.json') return send(200, JSON.stringify(entry.data), types['.json']);
      if (relative === 'data/views.json') return send(200, JSON.stringify(entries.map((item) => {
        const relatedViews = [];
        for (const reference of Array.isArray(item.data.relatedModels) ? item.data.relatedModels : []) {
          if (!['author', 'reader'].includes(reference?.role) || typeof reference.modelHash !== 'string'
            || !/^[a-f0-9]{64}$/u.test(reference.modelHash) || reference.modelHash === item.data.modelHash) continue;
          const related = entries.find((candidate) => candidate.data.modelHash === reference.modelHash);
          if (!related) continue;
          const url = `/${related.token}/`;
          if (!relatedViews.some((view) => view.url === url && view.role === reference.role)) relatedViews.push({ url, role: reference.role });
        }
        return { url: `/${item.token}/`, title: item.data.title ?? item.name,
          modelHash: item.data.modelHash, graphHash: item.data.headGraphHash, selected: item === entry,
          ...(relatedViews.length ? { relatedViews } : {}) };
      })), types['.json']);
      const file = resolve(root, relative), type = types[extname(file)];
      if (!file.startsWith(`${root}${sep}`) || !type) return send(404, 'Not found');
      let body = await readFile(file);
      if (live && relative === 'index.html') body = body.toString('utf8').replace('<head>', `<head>\n<script src="live-reload.js" data-revision="${liveRevision(entry.data)}"></script>`);
      return send(200, body, type);
    } catch (error) {
      if (error instanceof URIError) return send(400, 'Invalid path');
      return send(404, 'Not found');
    }
  });
  return server;
}

export async function main(argv = process.argv.slice(2)) {
  const options = { port: Number(process.env.PORT ?? 8765), folders: [], live: false }, runs = [];
  let current;
  const runFlags = new Set(['--name', '--title', '--config', '--log', '--graph', '--state', '--scopes']);
  const next = (index, option) => { const value = argv[index + 1]; if (!value || value.startsWith('--')) throw new Error(`${option} needs a value`); return value; };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--run') { current = { folder: resolve(next(i++, arg)), flags: [] }; runs.push(current); }
    else if (arg === '--data') options.folders.push(resolve(next(i++, arg)));
    else if (arg === '--port') options.port = Number(next(i++, arg));
    else if (arg === '--live') options.live = true;
    else if (runFlags.has(arg) || arg === '--label') {
      if (!current) throw new Error(`${arg} belongs after --run`);
      const value = next(i++, arg); if (arg === '--label') current.label = value; else current.flags.push(arg, value);
    } else if (arg === '--help' || arg === '-h') {
      console.log('meaning-model-viewer --run <folder> [--run <another>] [--live] [--port 8765]\nmeaning-model-viewer --data <folder of reviewed snapshot JSON>\nRun options: --name, --title, --label, --config, --log, --graph, --state, --scopes.');
      return;
    } else throw new Error(`Unknown option ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error('Invalid port');
  const sets = new Map(), keys = new Set();
  for (const folder of options.folders) for (const file of readdirSync(folder).filter((name) => name.endsWith('.json') && name !== 'index.json')) {
    const data = JSON.parse(readFileSync(join(folder, file), 'utf8'));
    sets.set(file.slice(0, -5), data);
  }
  const scratch = mkdtempSync(join(tmpdir(), 'meaning-model-viewer-'));
  const clean = () => rmSync(scratch, { recursive: true, force: true });
  process.on('exit', clean);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => process.exit(0));
  const extract = async (run) => {
    const out = join(scratch, `${run.key}.json`);
    await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./extract.mjs', import.meta.url)), '--run', run.folder, '--out', out, ...run.flags], { maxBuffer: 64 * 1024 * 1024 });
    const data = JSON.parse(readFileSync(out, 'utf8')); if (run.label) data.title = run.label;
    sets.set(run.key, data);
  };
  try {
    for (const run of runs) {
      const named = run.flags.indexOf('--name');
      const base = (named >= 0 ? run.flags[named + 1] : basename(run.folder)).replace(/[^a-zA-Z0-9._-]/g, '-');
      let key = base, n = 2; while (keys.has(key) || sets.has(key)) key = `${base}-${n++}`;
      keys.add(key); run.key = key; await extract(run);
    }
    const server = createViewerServer(sets, { live: options.live });
    if (options.live && runs.length) {
      let updating = false;
      const timer = setInterval(async () => {
        if (updating) return; updating = true;
        try { for (const run of runs) await extract(run); }
        catch (error) { console.error(`Keeping the last available view: ${error.message}`); }
        finally { updating = false; }
      }, 60_000);
      timer.unref(); server.once('close', () => clearInterval(timer));
    }
    await new Promise((done, fail) => { server.once('error', fail); server.listen(options.port, '127.0.0.1', done); });
    console.log(`http://localhost:${server.address().port}/`);
    console.log(`Shared Meaning Model viewer · ${[...sets.keys()].join(', ')}`);
    return server;
  } catch (error) { clean(); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
