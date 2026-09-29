import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { loadMeaningModel } from '../meaning-model.mjs';

test('ordinary run extraction preserves native document processes and author references without modifying the run', async (t) => {
  const [{ LifeSimulationService }, { noEventLinkDeclaration }, { storeAuthorRecord }, { projectNarrativeDocument }] = await Promise.all([
    loadMeaningModel('src/service.mjs'), loadMeaningModel('src/narrative-grounding.mjs'),
    loadMeaningModel('src/storytelling-authoring.mjs'), loadMeaningModel('src/document-projection.mjs'),
  ]);
  const directory = await mkdtemp(join(tmpdir(), 'viewer-process-extraction-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const stateFile = join(directory, 'engine-state.sqlite');
  const service = new LifeSimulationService();
  service.backend.childEnvironment = { ...process.env, LIFE_SIM_STATE_FILE: stateFile };
  t.after(() => service.close()); await service.initialize();
  const provenance = ['Static export integration fixture'];
  const modelDefinition = (id) => ({ schema: 'life-sim-rust-model/v1', id, time_unit: 'year',
    revision: { number: 0, reason: 'Independent story and author worlds.', provenance },
    processes: [{ id: 'signal', value_type: { kind: 'scalar', bounds: { minimum: 0, maximum: 1 } },
      initial_value: { kind: 'scalar', value: 0.5 }, uncertainty: { kind: 'exact' }, unit: 'fraction', provenance, support: ['fixture'] }],
    decomposition: [], dependencies: [], laws: [], initial_claims: [] });
  const model = await service.registerModel({ requestId: 'story-world', model: modelDefinition('story-world') });
  const author = await service.registerModel({ requestId: 'author-world', model: modelDefinition('author-world') });
  const node = (id, role, text = '') => ({ id, node_type: role, role, text,
    render: role === 'story_passage' ? 'include' : 'exclude', epistemic_status: 'authored', evidence_type: 'fictional_canon',
    authority: { source: 'writer', weight: 1 }, provenance: [...provenance,
      noEventLinkDeclaration(text, 'This fixture tests only document structure.', 'writer')] });
  const endpoint = (node_id) => ({ kind: 'node', node_id });
  const graph = await service.registerNarrativeGraph({ requestId: 'story', narrativeGraph: {
    schema: 'life-sim-rust-narrative-graph/v1', id: 'export-fixture',
    revision: { number: 0, reason: 'A passage and its declared span.', provenance },
    source: { kind: 'model', model_hash: model.modelHash }, roots: ['book'],
    nodes: [node('book', 'document_root'), node('passage', 'story_passage', 'The door was still open.'),
      { ...node('span', 'metadata', JSON.stringify({ schema: 'meaning-model-document-span/v1', documentId: 'book',
        start: { nodeId: 'passage', boundary: 'start' }, end: { nodeId: 'passage', boundary: 'end' } })), node_type: 'document.span' }],
    edges: [{ id: 'book.passage', source: endpoint('book'), target: endpoint('passage'), family: 'structural', relation: 'contains', order: 0, provenance },
      { id: 'span.book', source: endpoint('span'), target: endpoint('book'), family: 'semantic', relation: 'about', provenance }],
  } });
  const context = { storyRootId: 'book', authorId: 'writer', accessScopes: ['author'], exactRevision: true };
  const world = await storeAuthorRecord(service, { ...context, graphHash: graph.graphHash, requestId: 'author-record', nodeId: 'world.author', kind: 'world', text: 'The declared author lives in another world.',
    data: { schema: 'meaning-model-story-world/v1', stage: 'author_reader', author: { lifeModelHash: author.modelHash, name: 'A fictional author' }, reader: null } });
  const record = await storeAuthorRecord(service, { ...context, graphHash: world.graphHash, requestId: 'telling', nodeId: 'telling', kind: 'assessment', text: 'A possible continuation remains.',
    data: { schema: 'meaning-model-document-process/v1', documentId: 'book', label: 'Possibility', question: 'What remains possible?', summary: 'The opening retains a possibility.',
      states: [{ label: 'Still open', spanId: 'span', description: 'The reader can anticipate another action.', evidence: [{ nodeId: 'passage', excerpt: 'The door was still open.' }] }] } });
  const expected = await projectNarrativeDocument(service, { graphHash: record.graphHash, rootId: 'book', accessScopes: ['author'] });
  const complete = await service.renderNarrativeGraph({ graphHash: record.graphHash, accessScopes: ['author'] });
  const documentRender = await service.renderNarrativeGraph({ graphHash: record.graphHash, rootIds: ['book'], accessScopes: ['author'] });
  const graphView = await service.queryNarrativeGraph({ graphHash: record.graphHash, expectedGraphHash: record.graphHash,
    mode: 'full', includeContent: true, accessScopes: ['author'] });
  assert.equal(complete.roots.length, 2, 'ordinary authoring has added an Understanding root');
  await service.close();
  const digest = async () => createHash('sha256').update(await readFile(stateFile)).digest('hex');
  const before = await digest();
  await writeFile(join(directory, 'mcp-transcript.jsonl'), '');
  const out = join(directory, 'snapshot.json');
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../extract.mjs', import.meta.url)),
    '--run', directory, '--graph', record.graphHash, '--scopes', 'author', '--out', out], { env: process.env });
  const snapshot = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(snapshot.documentProjection.projectionHash, expected.projectionHash);
  assert.deepEqual(snapshot.documentProjection.processes, expected.processes);
  assert.equal(snapshot.documentProjection.processes[0].states[0].status, 'current');
  assert.deepEqual(snapshot.relatedModels, [{ modelHash: author.modelHash, role: 'author' }]);
  assert.deepEqual(snapshot.story.units.map((unit) => unit.text), complete.units.map((unit) => unit.text));
  assert.equal(await digest(), before, 'extractor only opens its private consistent backup');

  const files = { model: join(directory, 'model.json'), graph: join(directory, 'graph.json'),
    complete: join(directory, 'complete-render.json'), document: join(directory, 'document-render.json'),
    output: join(directory, 'static-snapshot.json') };
  await Promise.all([
    writeFile(files.model, JSON.stringify(modelDefinition('story-world'))),
    writeFile(files.graph, JSON.stringify({ ...graphView.graph, source: { kind: 'model', model_hash: model.modelHash },
      roots: graphView.roots, nodes: graphView.nodes, edges: graphView.edges })),
    writeFile(files.complete, JSON.stringify(complete)), writeFile(files.document, JSON.stringify(documentRender)),
  ]);
  const staticArgs = [fileURLToPath(new URL('../extract.mjs', import.meta.url)), '--static', files.model, files.graph,
    '--render', files.complete, '--document-render', files.document, '--out', files.output];
  await t.test('static inputs preserve the same native document render without replacing the full manuscript', async () => {
    await promisify(execFile)(process.execPath, staticArgs, { env: process.env });
    const result = JSON.parse(await readFile(files.output, 'utf8'));
    assert.equal(result.documentProjection.projectionHash, expected.projectionHash);
    assert.deepEqual(result.documentProjection.processes, expected.processes);
    assert.deepEqual(result.story.units.map((unit) => unit.text), complete.units.map((unit) => unit.text));
    assert.deepEqual(result.relatedModels, snapshot.relatedModels);
  });
  await t.test('a document render from another graph revision is refused before replacing an output', async () => {
    const saved = await readFile(files.output);
    await writeFile(files.document, JSON.stringify({ ...documentRender, graph_hash: 'f'.repeat(64) }));
    await assert.rejects(promisify(execFile)(process.execPath, staticArgs, { env: process.env }), /same graph revision/u);
    assert.deepEqual(await readFile(files.output), saved);
  });
});
