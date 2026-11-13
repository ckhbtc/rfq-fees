import { EXPLORER_V2_API, EXPLORER_TX_PAGE_SIZE } from './fee-config.js';
import { normalizeExplorerFeeTransfer } from './explorer-fee-sync.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

// The v1 explorer index stops paging after about 10,000 transactions, so
// history is read through v2 one UTC day at a time with its cursor token.
export function buildExplorerDayUrl(
  endpoint,
  address,
  { startMs, endMs, token, pageSize = EXPLORER_TX_PAGE_SIZE },
) {
  const base = endpoint.replace(/\/+$/, '');
  return (
    `${base}/accountTxs/${encodeURIComponent(address)}` +
    `?per_page=${pageSize}&start_time=${startMs}&end_time=${endMs}` +
    (token ? `&token=${encodeURIComponent(token)}` : '')
  );
}

export function utcDays(fromIso, now) {
  const days = [];
  const first = Date.parse(`${String(fromIso).slice(0, 10)}T00:00:00Z`);
  for (let dayMs = first; dayMs <= now.getTime(); dayMs += DAY_MS) {
    days.push(dayMs);
  }
  return days;
}

export function createExplorerChannelBackfill({
  store,
  address,
  denom,
  endpoint = EXPLORER_V2_API,
  fetchImpl = globalThis.fetch,
  pageSize = EXPLORER_TX_PAGE_SIZE,
  concurrency = 6,
  retryCount = 6,
  clock = () => new Date(),
  logger = console,
} = {}) {
  if (!store || !address || !denom) {
    throw new Error('store, address, and denom are required');
  }

  async function getJson(url) {
    let lastError;
    for (let attempt = 0; attempt < retryCount; attempt += 1) {
      try {
        const response = await fetchImpl(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt + 1 < retryCount) {
          await delay(500 * 2 ** attempt);
        }
      }
    }
    throw lastError;
  }

  async function readDay(startMs) {
    const transfers = [];
    let token;
    for (;;) {
      const json = await getJson(
        buildExplorerDayUrl(endpoint, address, {
          startMs,
          endMs: startMs + DAY_MS - 1,
          token,
          pageSize,
        }),
      );
      // A day with no transactions comes back as {"paging":{}} with no data.
      if (!json?.paging || (json.data != null && !Array.isArray(json.data))) {
        throw new Error(
          `invalid explorer response for ${new Date(startMs).toISOString()}`,
        );
      }
      const page = json.data ?? [];
      for (const tx of page) {
        const transfer = normalizeExplorerFeeTransfer(tx, { address, denom });
        if (transfer) {
          transfers.push(transfer);
        }
      }
      token = json.paging?.next?.[0];
      if (!token || page.length === 0) {
        return transfers;
      }
    }
  }

  // Fills fee_transfer_channels back to `from`; channels_since only moves
  // once every day up to now has been read.
  async function backfill({ from }) {
    if (!Number.isFinite(Date.parse(from))) {
      throw new Error('backfill needs an ISO start date');
    }
    const days = utcDays(from, clock());
    let next = 0;
    let done = 0;
    let found = 0;

    async function worker() {
      while (next < days.length) {
        const startMs = days[next];
        next += 1;
        const transfers = await readDay(startMs);
        store.insertChannels(transfers);
        found += transfers.length;
        done += 1;
        if (done % 10 === 0 || done === days.length) {
          logger.error(`channel backfill: ${done}/${days.length} days`);
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, days.length) }, () =>
        worker(),
      ),
    );
    const coveredFrom = new Date(days[0]).toISOString();
    store.insertChannels([], { coveredFrom });
    return { days: days.length, found, coveredFrom };
  }

  return { backfill };
}
