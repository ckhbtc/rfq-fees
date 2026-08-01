import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateRolling24 } from '../lib/rolling-fees.js';

test('finds a rolling 24h record that crosses a UTC date boundary', () => {
  const result = calculateRolling24([
    { key: '2026-07-31T20', fee: 1_254 },
    { key: '2026-08-01T19', fee: 1_048 },
    { key: '2026-08-01T20', fee: 10 },
  ]);

  assert.deepEqual(result, {
    currentFee: 1_058,
    previousRecordFee: 2_302,
    recordFee: 2_302,
    recordStartKey: '2026-07-31T20',
    recordEndKey: '2026-08-01T19',
    isNewRecord: false,
  });
});

test('marks the latest window when it strictly surpasses every prior window', () => {
  const result = calculateRolling24([
    { key: '2026-07-31T21', fee: 100 },
    { key: '2026-08-01T20', fee: 200 },
    { key: '2026-08-01T21', fee: 101 },
  ]);

  assert.equal(result.currentFee, 301);
  assert.equal(result.previousRecordFee, 300);
  assert.equal(result.recordFee, 301);
  assert.equal(result.recordStartKey, '2026-07-31T22');
  assert.equal(result.recordEndKey, '2026-08-01T21');
  assert.equal(result.isNewRecord, true);
});

test('does not call a tie a new record', () => {
  const result = calculateRolling24([
    { key: '2026-07-31T20', fee: 100 },
    { key: '2026-08-01T20', fee: 100 },
  ]);

  assert.equal(result.currentFee, 100);
  assert.equal(result.previousRecordFee, 100);
  assert.equal(result.recordFee, 100);
  assert.equal(result.isNewRecord, false);
});

test('advances the current window through hours with no fee activity', () => {
  const result = calculateRolling24(
    [
      { key: '2026-07-31T21', fee: 100 },
      { key: '2026-07-31T22', fee: 100 },
    ],
    '2026-08-01T22',
  );

  assert.equal(result.currentFee, 0);
  assert.equal(result.previousRecordFee, 200);
  assert.equal(result.recordFee, 200);
  assert.equal(result.isNewRecord, false);
});
