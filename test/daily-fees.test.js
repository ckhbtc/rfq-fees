import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildDailyFees } from '../lib/daily-fees.js';

test('groups hourly rows into UTC days with totals and a peak hour', () => {
  const days = buildDailyFees([
    { key: '2026-09-29T23', n: 4, fee: 2, max: 1.5 },
    { key: '2026-09-30T00', n: 3, fee: 5, max: 4 },
    { key: '2026-09-30T19', n: 10, fee: 147.38, max: 35.96 },
    { key: '2026-09-30T23', n: 1, fee: 1, max: 1 },
  ]);

  assert.deepEqual(
    days.map((day) => [day.date, day.fee, day.n, day.max, day.peakHour]),
    [
      ['2026-09-29', 2, 4, 1.5, 23],
      ['2026-09-30', 153.38, 14, 35.96, 19],
    ],
  );
  assert.equal(days[1].peakFee, 147.38);
  assert.equal(days[1].hours.length, 24);
  assert.equal(days[1].hours[19].key, '2026-09-30T19');
});

test('marks hours before history and after the current hour', () => {
  const days = buildDailyFees(
    [
      { key: '2026-06-02T17', n: 7, fee: 0.03, max: 0.01 },
      { key: '2026-06-03T12', n: 2, fee: 20.4, max: 18.62 },
    ],
    '2026-06-03T15',
  );

  assert.equal(days.length, 2);
  assert.equal(days[0].hours[16].state, 'before');
  assert.equal(days[0].hours[17].state, 'ok');
  assert.equal(days[0].complete, false);
  assert.equal(days[0].current, false);
  assert.equal(days[1].hours[15].state, 'ok');
  assert.equal(days[1].hours[16].state, 'future');
  assert.equal(days[1].complete, false);
  assert.equal(days[1].current, true);
});

test('treats gaps inside history as quiet hours', () => {
  const days = buildDailyFees(
    [
      { key: '2026-08-30T23', n: 1, fee: 1, max: 1 },
      { key: '2026-08-31T20', n: 8, fee: 38.59, max: 9.37 },
    ],
    '2026-09-01T00',
  );

  const quiet = days[1].hours[16];
  assert.deepEqual(
    [quiet.state, quiet.fee, quiet.n],
    ['ok', 0, 0],
  );
  assert.equal(days[1].complete, true);
});

test('extends through the current day when the latest rows are older', () => {
  const days = buildDailyFees(
    [{ key: '2026-09-30T22', n: 1, fee: 3, max: 3 }],
    '2026-10-01T02',
  );

  assert.deepEqual(
    days.map((day) => [day.date, day.fee, day.peakHour, day.current]),
    [
      ['2026-09-30', 3, 22, false],
      ['2026-10-01', 0, 0, true],
    ],
  );
  assert.equal(days[1].hours[2].state, 'ok');
  assert.equal(days[1].hours[3].state, 'future');
});

test('returns no days without rows', () => {
  assert.deepEqual(buildDailyFees([]), []);
  assert.deepEqual(buildDailyFees(null), []);
});
