import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { buildDailyFees } from '../lib/daily-fees.js';
import {
  buildTemplate,
  encodeCamelAttrs,
  readRuntime,
  readScriptBody,
  syncLibBlocks,
} from '../lib/dashboard-build.js';
import { calculateRolling24 } from '../lib/rolling-fees.js';

const sourceUrl = new URL('../The RFQ Ledger.dc.html', import.meta.url);
const bundleUrl = new URL('../dist/index.html', import.meta.url);
const runtimeUrl = new URL('../support.js', import.meta.url);
const libBlocks = {
  'rolling-fees': calculateRolling24.toString(),
  'daily-fees': buildDailyFees.toString(),
};

test('encodes camelCase attributes the way the runtime decodes them', () => {
  assert.equal(
    encodeCamelAttrs(
      '<div onMouseEnter="{{ c.hover }}" aria-label="x"><svg viewBox="0 0 1 1" preserveAspectRatio="none"></svg></div>',
    ),
    '<div sc-camel-on-mouse-enter="{{ c.hover }}" aria-label="x"><svg sc-camel-view-box="0 0 1 1" sc-camel-preserve-aspect-ratio="none"></svg></div>',
  );
});

test('only encodes the x-dc markup, never the logic script', () => {
  const template = buildTemplate(
    '<head><script src="./support.js"></script></head><x-dc><b onClick="{{ go }}"></b></x-dc>\n<script>let peakIdx = 0;</script>',
  );

  assert.match(template, /<script src="6e9628f8-[^"]+"><\/script>/);
  assert.match(template, /sc-camel-on-click="\{\{ go \}\}"/);
  assert.match(template, /let peakIdx = 0;/);
});

test('replaces code between lib markers and rejects missing markers', () => {
  const source = 'a\n// <lib:demo>\nold();\n// </lib:demo>\nb';
  const synced = syncLibBlocks(source, { demo: 'function demo() {}' });

  assert.equal(synced, 'a\n// <lib:demo>\nfunction demo() {}\n// </lib:demo>\nb');
  assert.equal(syncLibBlocks(synced, { demo: 'function demo() {}' }), synced);
  assert.throws(() => syncLibBlocks('nothing', { demo: '' }), /lib:demo/);
});

test('dashboard source carries the current lib helpers', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.equal(syncLibBlocks(source, libBlocks), source, 'run npm run build');
});

test('dist/index.html is built from the current dashboard source', async () => {
  const [source, bundle, runtime] = await Promise.all([
    readFile(sourceUrl, 'utf8'),
    readFile(bundleUrl, 'utf8'),
    readFile(runtimeUrl, 'utf8'),
  ]);

  assert.equal(
    JSON.parse(readScriptBody(bundle, 'template')),
    buildTemplate(source),
    'run npm run build',
  );
  assert.equal(readRuntime(bundle), runtime);
});
