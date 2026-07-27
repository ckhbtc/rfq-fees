import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createFeeStore, parseCsv } from '../lib/fee-store.js';

const csv = [
  'hour_utc,fills,fee_micro_usdc,largest_single_fee_micro_usdc',
  '2026-07-27T20,2,3000000,2000000',
  '2026-07-27T21,1,500000,500000',
  '',
].join('\n');

test('parses and seeds hourly snapshot data', () => {
  assert.equal(parseCsv(csv).length, 2);

  const store = createFeeStore({ dbPath: ':memory:' });
  assert.equal(
    store.seedFromCsv(csv, '2026-07-27T21:30:00Z'),
    true,
  );
  assert.equal(
    store.seedFromCsv(csv, '2026-07-27T21:30:00Z'),
    false,
  );

  assert.deepEqual(store.getStats(), {
    hours: 2,
    fills: 3,
    feeMicroUsdc: 3_500_000,
    storedTransfers: 0,
  });
  assert.equal(
    store.getAggregateSeedThroughAt(),
    '2026-07-27T21:30:00Z',
  );
  store.close();
});

test('deduplicates transfers and updates hourly aggregates once', () => {
  const store = createFeeStore({ dbPath: ':memory:' });
  const transfer = {
    txHash: 'ABC',
    height: 42,
    timestamp: '2026-07-27T22:01:00Z',
    hourUtc: '2026-07-27T22',
    feeMicroUsdc: 750_000,
  };

  assert.equal(store.insertTransfers([transfer, transfer]), 1);
  assert.deepEqual(store.getSnapshot().rows, [
    {
      key: '2026-07-27T22',
      n: 1,
      fee: 0.75,
      max: 0.75,
    },
  ]);
  store.close();
});

test('atomically rebuilds raw transfers and aggregates', () => {
  const store = createFeeStore({ dbPath: ':memory:' });
  store.seedFromCsv(csv, '2026-07-27T21:30:00Z');

  const inserted = store.replaceTransfers(
    [
      {
        txHash: 'A',
        height: 1,
        timestamp: '2026-07-26T10:00:00Z',
        hourUtc: '2026-07-26T10',
        feeMicroUsdc: 100_000,
      },
      {
        txHash: 'B',
        height: 2,
        timestamp: '2026-07-26T10:05:00Z',
        hourUtc: '2026-07-26T10',
        feeMicroUsdc: 300_000,
      },
    ],
    {
      cursorAt: '2026-07-26T10:05:00Z',
      host: 'https://lcd.example',
      syncedAt: '2026-07-27T22:00:00Z',
    },
  );

  assert.equal(inserted, 2);
  assert.equal(store.getAggregateSeedThroughAt(), null);
  assert.deepEqual(store.getStats(), {
    hours: 1,
    fills: 2,
    feeMicroUsdc: 400_000,
    storedTransfers: 2,
  });
  store.close();
});
