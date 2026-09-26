import test from 'node:test';
import assert from 'node:assert/strict';
import { placeStoryUnits, partsAtTime } from '../public/story-time.js';

const link = (node, event, relation = 'renders') => ({ relation, source: { kind: 'node', node_id: node }, target: { kind: 'anchor', anchor_kind: 'event', anchor_id: event } });
const events = [{ id: 'early', start: 2000, end: 2001 }, { id: 'late', start: 2020, end: 2021 }, { id: 'undated', start: null, end: null }];

test('declared flashbacks retain reading order and independent world time', () => {
  const units = placeStoryUnits([{ id: 'first' }, { id: 'flashback' }], [link('first', 'late'), link('flashback', 'early')], events);
  assert.deepEqual(units.map((unit) => [unit.id, unit.t]), [['first', 2020], ['flashback', 2000]]);
  assert.deepEqual(partsAtTime(units, 2000.5), [1]);
  assert.deepEqual(partsAtTime(units, 2020.5), [0]);
});

test('one passage can depict disjoint Events and several passages can depict one Event', () => {
  const units = placeStoryUnits([{ id: 'both' }, { id: 'earlyOnly' }], [link('both', 'early'), link('both', 'late'), link('earlyOnly', 'early')], events);
  assert.equal(units[0].spans.length, 2);
  assert.deepEqual(partsAtTime(units, 2000.5), [0, 1]);
  assert.deepEqual(partsAtTime(units, 2020.5), [0]);
});

test('missing, undated and non-depiction anchors never manufacture a date', () => {
  const units = placeStoryUnits([{ id: 'reflection' }, { id: 'undated' }, { id: 'missing' }, { id: 'supported' }],
    [link('undated', 'undated'), link('missing', 'absent'), link('supported', 'early', 'supports')], events);
  assert.deepEqual(units.map((unit) => unit.t), [null, null, null, null]);
  assert.deepEqual(units.map((unit) => unit.timing), ['unlinked', 'undated', 'undated', 'unlinked']);
  assert.deepEqual(partsAtTime(units, 2020), []);
});

test('a point Event remains active at its exact time alongside a broader Event', () => {
  const units = placeStoryUnits([{ id: 'broad' }, { id: 'point' }], [link('broad', 'life'), link('point', 'moment')],
    [{ id: 'life', start: 2000, end: 2030 }, { id: 'moment', start: 2010, end: 2010 }]);
  assert.deepEqual(partsAtTime(units, units[1].t), [0, 1]);
});
