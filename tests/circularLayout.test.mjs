import test from 'node:test';
import assert from 'node:assert/strict';
import { distributeCircularObjects } from '../js/circularLayout.mjs';

test('assigns a stable render order for anti-overlap without changing spacing', () => {
  const items = [
    { name: 'A', rawAngle: 0.02 },
    { name: 'B', rawAngle: 0.04 },
    { name: 'C', rawAngle: 0.06 },
  ];

  const distributed = distributeCircularObjects(items, {
    minSeparation: 0.02,
    lockGuard: 0.05,
  });

  const expectedOrder = [...distributed].sort(
    (a, b) => a.adjustedAngle - b.adjustedAngle || a.originalIndex - b.originalIndex,
  ).map((item) => item.name);

  assert.ok(distributed.every((item) => Number.isInteger(item.renderOrder)));
  assert.deepEqual(
    distributed.map((item) => item.name).sort((a, b) => distributed.find((item) => item.name === a).renderOrder - distributed.find((item) => item.name === b).renderOrder),
    expectedOrder,
  );
});
