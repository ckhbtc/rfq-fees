import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildExplorerTxUrl,
  createExplorerFeeBackfill,
  normalizeExplorerFeeTransfer,
} from '../lib/explorer-fee-sync.js';
import { createFeeStore } from '../lib/fee-store.js';

const address = 'inj1collector';
const denom = 'factory/usdc';
const endpoint = 'https://explorer.example/api/explorer/v1';

function explorerTx(
  hash,
  timestamp,
  amount = 500_000,
  { code = 0 } = {},
) {
  return {
    hash,
    block_number: 100,
    block_unix_timestamp: Date.parse(timestamp),
    code,
    logs: [
      {
        events: [
          {
            type: 'transfer',
            attributes: [
              { key: 'recipient', value: address },
              { key: 'amount', value: `${amount}${denom}` },
            ],
          },
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

test('builds explorer account transaction URLs', () => {
  assert.equal(
    buildExplorerTxUrl(endpoint, address, {
      pageSize: 100,
      skip: 200,
    }),
    `${endpoint}/accountTxs/${address}?limit=100&skip=200`,
  );
});

test('normalizes successful explorer fee transfers', () => {
  assert.deepEqual(
    normalizeExplorerFeeTransfer(
      explorerTx('0xA', '2026-06-02T17:49:59.737Z', 3_772),
      { address, denom },
    ),
    {
      txHash: 'A',
      height: 100,
      timestamp: '2026-06-02T17:49:59.737Z',
      hourUtc: '2026-06-02T17',
      feeMicroUsdc: 3_772,
    },
  );

  assert.equal(
    normalizeExplorerFeeTransfer(
      explorerTx('0xFAILED', '2026-06-02T18:00:00Z', 3_772, {
        code: 5,
      }),
      { address, denom },
    ),
    null,
  );
});

test('backfill paginates explorer history and deduplicates atomically', async () => {
  const store = createFeeStore({ dbPath: ':memory:' });
  store.seedFromCsv(
    [
      'hour_utc,fills,fee_micro_usdc,largest_single_fee_micro_usdc',
      '2026-07-27T20,1,1000000,1000000',
      '',
    ].join('\n'),
    '2026-07-27T20:55:00Z',
  );

  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    const skip = Number(new URL(url).searchParams.get('skip'));
    if (skip === 0) {
      return response({
        paging: { total: '4' },
        data: [
          explorerTx('0xC', '2026-06-02T20:00:00Z', 300_000),
          explorerTx('0xB', '2026-06-02T19:00:00Z', 200_000),
        ],
      });
    }
    return response({
      paging: { total: '4' },
      data: [
        explorerTx('0xB', '2026-06-02T19:00:00Z', 200_000),
        explorerTx('0xA', '2026-06-02T18:00:00Z', 100_000),
      ],
    });
  };
  const backfill = createExplorerFeeBackfill({
    store,
    address,
    denom,
    endpoint,
    fetchImpl,
    pageSize: 2,
    concurrency: 2,
    retryCount: 1,
    clock: () => new Date('2026-07-27T22:00:00Z'),
    logger: { error() {} },
  });

  const result = await backfill.rebuild();

  assert.deepEqual(requests.sort(), [
    `${endpoint}/accountTxs/${address}?limit=2&skip=0`,
    `${endpoint}/accountTxs/${address}?limit=2&skip=2`,
  ]);
  assert.deepEqual(result, {
    host: endpoint,
    pagesRead: 2,
    found: 4,
    inserted: 3,
    cursorAt: '2026-06-02T20:00:00.000Z',
    oldestAt: '2026-06-02T18:00:00.000Z',
  });
  assert.deepEqual(store.getStats(), {
    hours: 3,
    fills: 3,
    feeMicroUsdc: 600_000,
    storedTransfers: 3,
  });
  store.close();
});

test('failed backfill preserves the complete stored history', async () => {
  const store = createFeeStore({ dbPath: ':memory:' });
  store.seedFromCsv(
    [
      'hour_utc,fills,fee_micro_usdc,largest_single_fee_micro_usdc',
      '2026-07-27T20,2,3000000,2000000',
      '',
    ].join('\n'),
    '2026-07-27T20:55:00Z',
  );
  const before = store.getStats();
  const fetchImpl = async (url) => {
    const skip = Number(new URL(url).searchParams.get('skip'));
    if (skip === 0) {
      return response({
        paging: { total: '3' },
        data: [
          explorerTx('0xB', '2026-06-02T19:00:00Z'),
          explorerTx('0xA', '2026-06-02T18:00:00Z'),
        ],
      });
    }
    throw new Error('explorer unavailable');
  };
  const backfill = createExplorerFeeBackfill({
    store,
    address,
    denom,
    endpoint,
    fetchImpl,
    pageSize: 2,
    retryCount: 1,
    clock: () => new Date('2026-07-27T22:00:00Z'),
    logger: { error() {} },
  });

  await assert.rejects(backfill.rebuild(), /explorer unavailable/);
  assert.deepEqual(store.getStats(), before);
  store.close();
});
