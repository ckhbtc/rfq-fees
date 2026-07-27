import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createFeeStore } from '../lib/fee-store.js';
import { createFeeSync } from '../lib/fee-sync.js';

const address = 'inj1collector';
const denom = 'factory/usdc';
const csv = [
  'hour_utc,fills,fee_micro_usdc,largest_single_fee_micro_usdc',
  '2026-07-27T20,1,1000000,1000000',
  '',
].join('\n');

function tx(txhash, timestamp, amount = 500_000) {
  return {
    txhash,
    height: '100',
    timestamp,
    code: 0,
    events: [
      {
        type: 'transfer',
        attributes: [
          { key: 'recipient', value: address },
          { key: 'amount', value: `${amount}${denom}` },
        ],
      },
    ],
  };
}

function response(body) {
  return {
    ok: true,
    async json() {
      return body;
    },
  };
}

test('incremental sync stops at the overlap and deduplicates', async () => {
  const store = createFeeStore({ dbPath: ':memory:' });
  store.seedFromCsv(csv, '2026-07-27T20:55:00Z');

  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    return response({
      total: '3',
      tx_responses: [
        tx('NEW', '2026-07-27T21:30:00Z'),
        tx('SEED', '2026-07-27T20:50:00Z'),
      ],
    });
  };
  const clockValues = [
    new Date('2026-07-27T22:00:00Z'),
    new Date('2026-07-27T22:00:01Z'),
    new Date('2026-07-27T22:00:02Z'),
    new Date('2026-07-27T22:00:03Z'),
  ];
  const sync = createFeeSync({
    store,
    address,
    denom,
    hosts: ['https://lcd.example'],
    fetchImpl,
    retryCount: 1,
    clock: () => clockValues.shift(),
  });

  const first = await sync.syncIncremental();
  const second = await sync.syncIncremental();

  assert.equal(first.inserted, 1);
  assert.equal(second.inserted, 0);
  assert.equal(requests.length, 4);
  assert.deepEqual(store.getStats(), {
    hours: 2,
    fills: 2,
    feeMicroUsdc: 1_500_000,
    storedTransfers: 1,
  });
  store.close();
});

test('rebuild replaces seeded aggregates with raw history', async () => {
  const store = createFeeStore({ dbPath: ':memory:' });
  store.seedFromCsv(csv, '2026-07-27T20:55:00Z');

  const fetchImpl = async (url) => {
    if (url.includes('order_by=ORDER_BY_DESC')) {
      return response({
        total: '2',
        tx_responses: [tx('B', '2026-07-27T21:00:00Z')],
      });
    }
    return response({
      total: '2',
      tx_responses: [
        tx('A', '2026-07-27T20:00:00Z', 100_000),
        tx('B', '2026-07-27T21:00:00Z', 200_000),
      ],
    });
  };
  const sync = createFeeSync({
    store,
    address,
    denom,
    hosts: ['https://lcd.example'],
    fetchImpl,
    retryCount: 1,
    clock: () => new Date('2026-07-27T22:00:00Z'),
    logger: { error() {} },
  });

  const result = await sync.rebuild();

  assert.equal(result.inserted, 2);
  assert.deepEqual(store.getStats(), {
    hours: 2,
    fills: 2,
    feeMicroUsdc: 300_000,
    storedTransfers: 2,
  });
  store.close();
});
