import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { createFeeServer } from '../server.js';

let baseUrl;
let server;

before(async () => {
  server = createFeeServer();
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
});

test('serves the bundled RFQ ledger at the root', async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.match(html, /The RFQ Ledger/);
});

test('reports service health', async () => {
  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('returns 404 for files outside the public bundle', async () => {
  const response = await fetch(`${baseUrl}/package.json`);

  assert.equal(response.status, 404);
});
