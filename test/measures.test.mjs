import test from 'node:test';
import assert from 'node:assert/strict';
import { readPath } from '../measures.mjs';

test('signed values, including Unicode minus and leading decimals, remain in the path', () => {
  const points = readPath('-5 in 2020; +2.5 in 2021; −.75 in 2022');
  assert.deepEqual(points.map((point) => point.v), [-5, 2.5, -0.75]);
  assert.ok(points.every((point) => point.valueSource === 'parsed' && point.dateSource === 'parsed'));
});

test('ranges retain their endpoints and source words instead of posing as authored midpoints', () => {
  const points = readPath('10-20 by 2020; -8–-2 in 2021; −3 to +1 in 2022');
  assert.deepEqual(points.map((point) => point.v), [15, -5, -1]);
  assert.deepEqual(points.map((point) => point.range), [[10, 20], [-8, -2], [-3, 1]]);
  assert.ok(points.every((point) => point.valueSource === 'range_midpoint'));
  assert.equal(points[0].text, '10-20 by 2020');
});

test('an undated sample is explicitly marked inferred while dated neighbours retain their source', () => {
  const points = readPath('0 in January 2020; 1; 2 in January 2022');
  assert.equal(points[1].t, (points[0].t + points[2].t) / 2);
  assert.equal(points[1].dateSource, 'inferred');
  assert.equal(points[1].text, '1');
  assert.equal(points[0].dateSource, 'parsed');
  assert.equal(readPath('0 in January 2020; 1 in February')[1].dateSource, 'inferred');
});

test('inferred starting zero and span endpoints keep their provenance', () => {
  const points = readPath('started in 2019; 0.85 through 2021');
  assert.equal(points[0].valueSource, 'inferred_zero');
  assert.equal(points[0].text, 'started in 2019');
  assert.equal(points.length, 3);
  assert.ok(points.slice(1).every((point) => point.valueSource === 'parsed' && point.text === '0.85 through 2021'));
  assert.deepEqual(readPath('unknown in 2020; 1 without any date'), []);
});
