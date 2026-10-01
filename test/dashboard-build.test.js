import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildTemplate,
  encodeCamelAttrs,
  syncLibBlocks,
} from '../lib/dashboard-build.js';

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
