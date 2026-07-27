import assert from 'node:assert/strict';
import { test } from 'node:test';

import { startFeeScheduler } from '../lib/fee-scheduler.js';

test('runs fee syncs on demand without overlap', async () => {
  let calls = 0;
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const scheduler = startFeeScheduler({
    sync: async () => {
      calls += 1;
      await blocked;
      return { inserted: 1, pagesRead: 1 };
    },
    initialDelayMs: 60_000,
    logger: { log() {}, error() {} },
  });

  const first = scheduler.runNow();
  const second = await scheduler.runNow();

  assert.equal(calls, 1);
  assert.deepEqual(second, { skipped: true });
  release();
  assert.deepEqual(await first, {
    inserted: 1,
    pagesRead: 1,
  });
  scheduler.stop();
});
