import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildExplorerDayUrl,
  createExplorerChannelBackfill,
  utcDays,
} from '../lib/explorer-channel-backfill.js';
import { createFeeStore } from '../lib/fee-store.js';

const address = 'inj1collector';
const denom = 'factory/usdc';

function explorerTx(hash, timestampMs, fee, cid) {
  return {
    hash,
    block_number: '100',
    block_unix_timestamp: String(timestampMs),
    code: 0,
    logs: [
      {
        events: [
          {
            type: 'transfer',
            attributes: [
              { key: 'recipient', value: address },
              { key: 'amount', value: `${fee}${denom}` },
            ],
          },
          {
            type: 'wasm-rfq-accept-quote',
            attributes: [{ key: 'cid', value: JSON.stringify(cid) }],
          },
        ],
      },
    ],
  };
}

test('builds day-window URLs with the cursor token', () => {
  assert.equal(
    buildExplorerDayUrl('https://explorer.example/v2/', 'inj1a', {
      startMs: 0,
      endMs: 9,
      token: 'a+b',
      pageSize: 50,
    }),
    'https://explorer.example/v2/accountTxs/inj1a?per_page=50&start_time=0&end_time=9&token=a%2Bb',
  );
});

test('lists every UTC day from the start date through now', () => {
  assert.deepEqual(
    utcDays('2026-10-01T15:00:00Z', new Date('2026-10-03T01:00:00Z')).map(
      (ms) => new Date(ms).toISOString().slice(0, 10),
    ),
    ['2026-10-01', '2026-10-02', '2026-10-03'],
  );
});

test('backfills channel splits day by day and then marks coverage', async () => {
  const store = createFeeStore({ dbPath: ':memory:' });
  const day1 = Date.parse('2026-10-01T00:00:00Z');
  const day2 = Date.parse('2026-10-02T00:00:00Z');
  const pages = new Map([
    [`${day1}:`, { data: [explorerTx('0xA', day1 + 1000, 300_000, 'tc-web-1')], paging: { next: ['p2'] } }],
    [`${day1}:p2`, { data: [explorerTx('0xB', day1 + 2000, 100_000, 'x')], paging: { next: [] } }],
    [`${day2}:`, { data: [explorerTx('0xC', day2 + 1000, 200_000, 'tc-mobile-1')], paging: {} }],
  ]);
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams;
    const page = pages.get(`${params.get('start_time')}:${params.get('token') ?? ''}`);
    return { ok: true, json: async () => page };
  };
  const result = await createExplorerChannelBackfill({
    store,
    address,
    denom,
    endpoint: 'https://explorer.example/v2',
    fetchImpl,
    clock: () => new Date('2026-10-02T12:00:00Z'),
    logger: { error() {} },
  }).backfill({ from: '2026-10-01' });

  assert.deepEqual(result, {
    days: 2,
    found: 3,
    coveredFrom: '2026-10-01T00:00:00.000Z',
  });
  assert.deepEqual(store.getSnapshot().channels, {
    since: '2026-10-01T00:00:00.000Z',
    daily: [
      { date: '2026-10-01', api: 0.1, web: 0.3, mobile: 0 },
      { date: '2026-10-02', api: 0, web: 0, mobile: 0.2 },
    ],
  });
  assert.equal(store.getStats().storedTransfers, 0);
  store.close();
});

test('treats a day without transactions as empty and rejects malformed pages', async () => {
  const run = (body) =>
    createExplorerChannelBackfill({
      store: createFeeStore({ dbPath: ':memory:' }),
      address,
      denom,
      fetchImpl: async () => ({ ok: true, json: async () => body }),
      clock: () => new Date('2026-10-01T12:00:00Z'),
      retryCount: 1,
      logger: { error() {} },
    }).backfill({ from: '2026-10-01' });

  assert.deepEqual(await run({ paging: {} }), {
    days: 1,
    found: 0,
    coveredFrom: '2026-10-01T00:00:00.000Z',
  });
  await assert.rejects(run({ error: 'boom' }), /invalid explorer response/);
});
