import {
  DEFAULT_SYNC_INTERVAL_MS,
  DEFAULT_SYNC_START_DELAY_MS,
} from './fee-config.js';

export function startFeeScheduler({
  sync,
  intervalMs = DEFAULT_SYNC_INTERVAL_MS,
  initialDelayMs = DEFAULT_SYNC_START_DELAY_MS,
  logger = console,
} = {}) {
  if (typeof sync !== 'function') {
    throw new Error('sync function is required');
  }

  let stopped = false;
  let running = false;
  let timer;

  async function runNow() {
    if (running) {
      return { skipped: true };
    }

    running = true;
    try {
      return await sync();
    } finally {
      running = false;
    }
  }

  function schedule(delayMs) {
    timer = setTimeout(async () => {
      try {
        const result = await runNow();
        logger.log(
          `fee sync complete: ${result.inserted} inserted from ${result.pagesRead} page(s)`,
        );
      } catch (error) {
        logger.error(`fee sync failed: ${error.message}`);
      } finally {
        if (!stopped) {
          schedule(intervalMs);
        }
      }
    }, delayMs);
    timer.unref?.();
  }

  schedule(initialDelayMs);

  return {
    runNow,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
