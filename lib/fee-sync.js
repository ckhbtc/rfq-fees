import {
  DEFAULT_SYNC_OVERLAP_MS,
  LCD_HOSTS,
  TX_PAGE_SIZE,
} from './fee-config.js';
import { toFeeTransfer } from './fee-events.js';

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function buildTxUrl(
  host,
  page,
  {
    address,
    pageSize = TX_PAGE_SIZE,
    order = 'ORDER_BY_DESC',
  },
) {
  const query = encodeURIComponent(`transfer.recipient='${address}'`);
  return (
    `${host}/cosmos/tx/v1beta1/txs?query=${query}` +
    `&limit=${pageSize}&page=${page}&order_by=${order}`
  );
}

export function createFeeSync({
  store,
  address,
  denom,
  hosts = LCD_HOSTS,
  fetchImpl = globalThis.fetch,
  pageSize = TX_PAGE_SIZE,
  overlapMs = DEFAULT_SYNC_OVERLAP_MS,
  maxPages = 500,
  retryCount = 3,
  clock = () => new Date(),
  logger = console,
} = {}) {
  if (!store || !address || !denom) {
    throw new Error('store, address, and denom are required');
  }

  async function getJson(url, tries = retryCount) {
    let lastError;
    for (let attempt = 0; attempt < tries; attempt += 1) {
      try {
        const response = await fetchImpl(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt + 1 < tries) {
          await delay(250 * (attempt + 1));
        }
      }
    }
    throw lastError;
  }

  async function probeHost(host) {
    try {
      const json = await getJson(
        buildTxUrl(host, 1, { address, pageSize }),
        1,
      );
      return {
        host,
        total: Number(json.total ?? 0),
        latestAt: json.tx_responses?.[0]?.timestamp ?? null,
      };
    } catch (error) {
      return {
        host,
        total: -1,
        latestAt: null,
        error: error.message,
      };
    }
  }

  async function pickHost() {
    const probes = await Promise.all(hosts.map(probeHost));
    const available = probes.filter(
      (probe) => probe.total >= 0 && probe.latestAt,
    );
    available.sort((left, right) => {
      const recency =
        Date.parse(right.latestAt) - Date.parse(left.latestAt);
      return recency || right.total - left.total;
    });
    if (!available.length) {
      throw new Error('no Injective LCD host responded');
    }
    return { ...available[0], probes };
  }

  async function syncIncremental() {
    const attemptedAt = clock().toISOString();
    store.recordSyncStart(attemptedAt);

    try {
      const selected = await pickHost();
      const aggregateSeedThroughAt =
        store.getAggregateSeedThroughAt();
      const cursorAt =
        store.getCursorAt() ?? aggregateSeedThroughAt;
      const cursorTime = cursorAt ? Date.parse(cursorAt) : 0;
      const seedTime = aggregateSeedThroughAt
        ? Date.parse(aggregateSeedThroughAt)
        : 0;
      const cutoffTime = Math.max(
        seedTime,
        cursorTime - overlapMs,
      );

      const transfers = [];
      let newestTimestamp = cursorAt;
      let pagesRead = 0;

      for (let page = 1; page <= maxPages; page += 1) {
        const json = await getJson(
          buildTxUrl(selected.host, page, {
            address,
            pageSize,
          }),
        );
        const responses = json.tx_responses ?? [];
        pagesRead += 1;
        if (!responses.length) {
          break;
        }

        let reachedCutoff = false;
        for (const txResponse of responses) {
          const timestampTime = Date.parse(txResponse.timestamp);
          if (!Number.isFinite(timestampTime)) {
            continue;
          }

          if (
            !newestTimestamp ||
            timestampTime > Date.parse(newestTimestamp)
          ) {
            newestTimestamp = txResponse.timestamp;
          }

          if (timestampTime <= cutoffTime) {
            reachedCutoff = true;
            continue;
          }
          if (seedTime && timestampTime <= seedTime) {
            continue;
          }

          const transfer = toFeeTransfer(txResponse, {
            address,
            denom,
          });
          if (transfer) {
            transfers.push(transfer);
          }
        }

        if (
          reachedCutoff ||
          page * pageSize >= Number(json.total ?? 0)
        ) {
          break;
        }
      }

      const inserted = store.insertTransfers(transfers);
      const syncedAt = clock().toISOString();
      store.recordSyncSuccess({
        cursorAt: newestTimestamp ?? cursorAt ?? syncedAt,
        host: selected.host,
        syncedAt,
      });
      return {
        host: selected.host,
        pagesRead,
        found: transfers.length,
        inserted,
        cursorAt: newestTimestamp,
      };
    } catch (error) {
      store.recordSyncFailure({
        attemptedAt,
        error: error.message,
      });
      throw error;
    }
  }

  async function rebuild() {
    const attemptedAt = clock().toISOString();
    store.recordSyncStart(attemptedAt);

    try {
      const selected = await pickHost();
      const pages = Math.ceil(selected.total / pageSize);
      const transfers = [];
      let nextPage = 1;
      let completedPages = 0;
      const concurrency = Math.min(6, pages);

      async function worker() {
        while (nextPage <= pages) {
          const page = nextPage;
          nextPage += 1;
          const json = await getJson(
            buildTxUrl(selected.host, page, {
              address,
              pageSize,
              order: 'ORDER_BY_ASC',
            }),
          );
          for (const txResponse of json.tx_responses ?? []) {
            const transfer = toFeeTransfer(txResponse, {
              address,
              denom,
            });
            if (transfer) {
              transfers.push(transfer);
            }
          }
          completedPages += 1;
          if (
            completedPages % 10 === 0 ||
            completedPages === pages
          ) {
            logger.error(
              `fee rebuild: ${completedPages}/${pages} pages`,
            );
          }
        }
      }

      await Promise.all(
        Array.from({ length: concurrency }, () => worker()),
      );
      transfers.sort((left, right) =>
        left.timestamp.localeCompare(right.timestamp),
      );

      const syncedAt = clock().toISOString();
      const cursorAt =
        transfers.at(-1)?.timestamp ?? syncedAt;
      const inserted = store.replaceTransfers(transfers, {
        cursorAt,
        host: selected.host,
        syncedAt,
      });
      return {
        host: selected.host,
        pagesRead: pages,
        found: transfers.length,
        inserted,
        cursorAt,
      };
    } catch (error) {
      store.recordSyncFailure({
        attemptedAt,
        error: error.message,
      });
      throw error;
    }
  }

  return {
    pickHost,
    rebuild,
    syncIncremental,
  };
}
