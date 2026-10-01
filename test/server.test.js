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
  assert.match(html, /<title>RFQ Ledger · Injective RFQ fees<\/title>/);
  assert.match(html, /Every day, and every hour inside it/);
  assert.match(html, /Fig\. 2 · Daily ledger/);
  assert.match(html, /Fees collected to date/);
  assert.match(html, /Today so far/);
  assert.match(html, /Record day/);
  assert.match(html, /Record 24 hours/);
  assert.match(html, /Collector balance/);
  assert.match(html, /\/api\/fees/);
  assert.match(html, /feeRefreshTimer/);
  assert.match(html, /balanceRefreshTimer/);
  assert.match(html, /function calculateRolling24\(rows, currentHourKey\)/);
  assert.match(html, /function buildDailyFees\(rows, currentHourKey\)/);
  assert.match(html, /sc-camel-on-mouse-enter=\\"\{\{ c\.hover \}\}\\"/);
  assert.match(html, /sc-camel-on-mouse-leave=\\"\{\{ clearHover \}\}\\"/);
  assert.match(html, /@media \(max-width: 760px\)/);
  assert.match(
    html,
    /earliest transaction retained by the Injective explorer index/,
  );
  assert.doesNotMatch(html, /onMouseEnter=/);
  assert.doesNotMatch(html, /Bundled Page/);
});

test('ships light and dark themes with the serif and Plex type', async () => {
  const html = await (await fetch(`${baseUrl}/`)).text();

  assert.match(html, /class=\\"page\\" data-theme=\\"\{\{ theme \}\}\\"/);
  assert.match(html, /\.page\[data-theme=\\"light\\"\]/);
  assert.match(html, /\.page\[data-theme=\\"dark\\"\]/);
  assert.match(html, /rfq-ledger-theme/);
  assert.match(html, /prefers-color-scheme: light/);
  assert.match(html, /aria-label=\\"\{\{ themeLabel \}\}\\"/);
  assert.match(html, /family=Instrument\+Serif/);
  assert.match(html, /family=IBM\+Plex\+Sans/);
  assert.match(html, /family=IBM\+Plex\+Mono/);
  assert.doesNotMatch(html, /Geist/);
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
  assert.deepEqual(payload.traders, { since: null, daily: [], total: 0 });
  assert.deepEqual(payload.rows, [
    {
      key: '2026-07-27T20',
      n: 2,
      fee: 3,
      max: 2,
    },
  ]);
});

test('serves the fee-data.js snapshot the dashboard falls back to', async () => {
  const page = await (await fetch(`${baseUrl}/`)).text();
  assert.ok(page.includes("import('./fee-data.js')"));

  const response = await fetch(`${baseUrl}/fee-data.js`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/javascript/);
  assert.match(body, /export function parseHourly\(\)/);
});

test('returns 404 for files outside the public bundle', async () => {
  const response = await fetch(`${baseUrl}/package.json`);

  assert.equal(response.status, 404);
});
