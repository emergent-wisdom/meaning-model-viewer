import test from 'node:test';
import assert from 'node:assert/strict';
import { constructionModelHistory } from '../construction-models.mjs';

const model = (modelHash, timeUnit, previous = null, events = []) => ({ modelHash, definition: {
  time_unit: timeUnit, revision: { previous_model_hash: previous },
  meaning_model: { events: events.map((id) => ({ id })) },
} });
const source = (modelHash) => ({ kind: 'model', model_hash: modelHash });

test('an author dependency after the story cannot replace its clock or enter its birth history', () => {
  const first = model('story.0', 'civil_day_since_1970_01_01', null, ['world']);
  const story = model('story.1', 'civil_day_since_1970_01_01', 'story.0', ['world', 'scene']);
  const author = model('author.0', 'year', null, ['world', 'author.childhood']);
  const fork = model('story.alternative', 'civil_day_since_1970_01_01', 'story.0', ['rejected.scene']);
  const history = { models: [author, story, first, fork, model('author.1', 'year', 'author.0')], revisions: [
    { definition: { source: source('story.0') } },
    { delta: { source: source('story.1') } },
    { delta: { upsertNodes: [{ id: 'prose' }] } },
  ] };
  const result = constructionModelHistory(history);
  assert.equal(result.finalModelEntry, story);
  assert.equal(result.finalModelEntry.definition.time_unit, 'civil_day_since_1970_01_01');
  assert.deepEqual(result.modelHistory, [first, story]);
  assert.deepEqual(result.modelHistory.flatMap((entry) => entry.definition.meaning_model.events.map((event) => event.id)), ['world', 'world', 'scene']);
});

test('a final full graph definition replaces an earlier binding', () => {
  const next = model('next', 'tick');
  const result = constructionModelHistory({ models: [next, model('old', 'year')], revisions: [
    { definition: { source: source('old') } }, { definition: { source: source('next') } },
  ] });
  assert.equal(result.finalModelEntry, next);
  assert.deepEqual(result.modelHistory, [next]);
});

test('one static model remains usable without a binding or bundled ancestors', () => {
  const entry = model('static', 'hour', 'unbundled.predecessor');
  assert.deepEqual(constructionModelHistory({ models: [entry], revisions: [{ definition: {} }] }), {
    finalModelEntry: entry, modelHistory: [entry],
  });
  assert.equal(constructionModelHistory({ models: [entry], revisions: [{ definition: { source: source('static') } }] }).finalModelEntry, entry);
});

test('missing bindings and cyclic ancestry fail instead of choosing an unrelated dependency', () => {
  assert.throws(() => constructionModelHistory({ models: [model('dependency', 'year')], revisions: [{ definition: { source: source('missing') } }] }), /no available bound model/);
  assert.throws(() => constructionModelHistory({ models: [model('a', 'year'), model('b', 'tick')], revisions: [{ definition: {} }] }), /no available bound model/);
  assert.throws(() => constructionModelHistory({ models: [model('a', 'year', 'b'), model('b', 'year', 'a')], revisions: [{ definition: { source: source('b') } }] }), /revision cycle/);
});
