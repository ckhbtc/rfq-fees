import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { createFeeStore } from '../lib/fee-store.js';
import { createFeeServer } from '../server.js';

let baseUrl;
let feeStore;
let server;

before(async () => {
  feeStore = createFeeStore({ dbPath: ':memory:' });
  feeStore.seedFromCsv(
    [
      'hour_utc,fills,fee_micro_usdc,largest_single_fee_micro_usdc',
      '2026-07-27T20,2,3000000,2000000',
      '',
    ].join('\n'),
    '2026-07-27T20:55:00Z',
  );
  server = createFeeServer({
    feeStore,
    refreshIntervalMs: 60 * 60 * 1000,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  feeStore.close();
});

test('serves the bundled RFQ ledger at the root', async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.match(html, /The RFQ Ledger/);
  assert.match(html, /\{\{ heroVolume \}\}/);
  assert.match(
    html,
    /heroVolume: volumeWords\(totalFee \/ BPS\)/,
  );
  assert.equal(
    html.match(/heroVolume: volumeWords\(totalFee \/ BPS\)/g)
      ?.length,
    1,
  );
  assert.doesNotMatch(html, /\{\{ kVol \}\} traded to date/);
  assert.doesNotMatch(html, /eleven million dollars/);
  assert.match(html, /\/api\/fees/);
  assert.match(html, /feeRefreshTimer/);
  assert.match(html, /Total balance/);
  assert.match(html, /\{\{ kBal \}\}/);
  assert.match(html, /Fee rate/);
  assert.match(html, /balanceRefreshTimer/);
  assert.ok(
    html.includes(
      'kBal: this.state.balance == null ? \\"…\\" : \\"$\\" + num',
    ),
  );
  assert.doesNotMatch(html, /Fees collected/);
  assert.doesNotMatch(html, /Balance today/);
  assert.doesNotMatch(html, /USDC · \{\{ kDays \}\}/);
  assert.doesNotMatch(html, /Every hour, all \{\{ kDays \}\}/);
  assert.doesNotMatch(html, /Every hour in the searchable window/);
  assert.match(html, /Hourly fee activity/);
  assert.match(
    html,
    /earliest transaction retained by the Injective explorer index/,
  );
  assert.doesNotMatch(
    html,
    /One wallet on Injective receives a flat 4\.0 bps/,
  );
  assert.match(html, /Cumulative fees over time/);
  assert.doesNotMatch(html, /The jar, filling/);
  assert.match(html, /@media \(max-width: 700px\)/);
  assert.match(html, /class=\\"page-frame\\"/);
  assert.match(html, /class=\\"heatmap-scroll\\"/);
  assert.match(html, /class=\\"mobile-swipe-hint\\"/);
  assert.match(html, /max-height: 68svh/);
  assert.match(html, /min-width: 740px/);
  assert.match(html, /Tap or hover any cell/);
  assert.match(html, /sc-camel-on-click=\\"\{\{ c\.hover \}\}\\"/);
  assert.match(html, /const labelStep = Math\.max/);
  assert.match(html, /labelTransform: \\"translateX\(-100%\)\\"/);
});

test('reports service health', async () => {
  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('serves cached fee history with hourly refresh metadata', async () => {
  const response = await fetch(`${baseUrl}/api/fees`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('cache-control'),
    'public, max-age=300, stale-while-revalidate=3600',
  );
  assert.equal(payload.source, 'sqlite');
  assert.equal(payload.snapshotAt, '2026-07-27T20:55:00Z');
  assert.equal(payload.refreshIntervalSeconds, 3600);
  assert.deepEqual(payload.rows, [
    {
      key: '2026-07-27T20',
      n: 2,
      fee: 3,
      max: 2,
    },
  ]);
});

test('returns 404 for files outside the public bundle', async () => {
  const response = await fetch(`${baseUrl}/package.json`);

  assert.equal(response.status, 404);
});
