import {
  EXPLORER_API,
  EXPLORER_TX_PAGE_SIZE,
} from './fee-config.js';
import { toFeeTransfer } from './fee-events.js';

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function buildExplorerTxUrl(
  endpoint,
  address,
  {
    pageSize = EXPLORER_TX_PAGE_SIZE,
    skip = 0,
  } = {},
) {
  const base = endpoint.replace(/\/+$/, '');
  return (
    `${base}/accountTxs/${encodeURIComponent(address)}` +
    `?limit=${pageSize}&skip=${skip}`
  );
}

export function normalizeExplorerFeeTransfer(
  tx,
  { address, denom },
) {
  const timestampValue = Number(tx?.block_unix_timestamp);
  if (!Number.isFinite(timestampValue)) {
    return null;
  }

  const timestampMs =
    timestampValue < 1_000_000_000_000
      ? timestampValue * 1000
      : timestampValue;
  const timestamp = new Date(timestampMs).toISOString();
  const events = (tx.logs ?? []).flatMap((log) => log.events ?? []);

  return toFeeTransfer(
    {
      txhash: tx.hash,
      height: String(tx.block_number),
      timestamp,
      code: tx.code,
      events,
    },
    { address, denom },
  );
}

export function createExplorerFeeBackfill({
  store,
  address,
  denom,
  endpoint = EXPLORER_API,
  fetchImpl = globalThis.fetch,
  pageSize = EXPLORER_TX_PAGE_SIZE,
  concurrency = 4,
  retryCount = 3,
  clock = () => new Date(),
  logger = console,
} = {}) {
  if (!store || !address || !denom) {
    throw new Error('store, address, and denom are required');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('pageSize must be an integer from 1 through 100');
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('concurrency must be a positive integer');
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

  function readPage(json, skip, total) {
    if (!Array.isArray(json?.data)) {
      throw new Error(`invalid explorer response at skip ${skip}`);
    }
    if (skip < total && json.data.length === 0) {
      throw new Error(`empty explorer page at skip ${skip}`);
    }
    return json.data;
  }

  async function rebuild() {
    const attemptedAt = clock().toISOString();
    store.recordSyncStart(attemptedAt);

    try {
      const firstJson = await getJson(
        buildExplorerTxUrl(endpoint, address, {
          pageSize,
          skip: 0,
        }),
      );
      const total = Number(
        firstJson?.paging?.total ?? firstJson?.total ?? 0,
      );
      if (!Number.isSafeInteger(total) || total < 1) {
        throw new Error('explorer returned no account history');
      }

      const pages = Math.ceil(total / pageSize);
      const transfers = [];
      let matchingTransfers = 0;
      let completedPages = 0;

      function collectPage(json, skip) {
        for (const tx of readPage(json, skip, total)) {
          const transfer = normalizeExplorerFeeTransfer(tx, {
            address,
            denom,
          });
          if (transfer) {
            matchingTransfers += 1;
            transfers.push(transfer);
          }
        }
        completedPages += 1;
        if (
          completedPages % 10 === 0 ||
          completedPages === pages
        ) {
          logger.error(
            `fee explorer rebuild: ${completedPages}/${pages} pages`,
          );
        }
      }

      collectPage(firstJson, 0);

      let nextSkip = pageSize;
      async function worker() {
        while (nextSkip < total) {
          const skip = nextSkip;
          nextSkip += pageSize;
          const json = await getJson(
            buildExplorerTxUrl(endpoint, address, {
              pageSize,
              skip,
            }),
          );
          collectPage(json, skip);
        }
      }

      await Promise.all(
        Array.from(
          {
            length: Math.min(
              concurrency,
              Math.max(0, pages - 1),
            ),
          },
          () => worker(),
        ),
      );

      const uniqueTransfers = [];
      const seenHashes = new Set();
      for (const transfer of transfers) {
        if (seenHashes.has(transfer.txHash)) {
          continue;
        }
        seenHashes.add(transfer.txHash);
        uniqueTransfers.push(transfer);
      }
      uniqueTransfers.sort((left, right) =>
        left.timestamp.localeCompare(right.timestamp),
      );
      if (!uniqueTransfers.length) {
        throw new Error('explorer history contained no fee transfers');
      }

      const syncedAt = clock().toISOString();
      const oldestAt = uniqueTransfers[0].timestamp;
      const cursorAt = uniqueTransfers.at(-1).timestamp;
      const inserted = store.replaceTransfers(uniqueTransfers, {
        cursorAt,
        host: endpoint,
        syncedAt,
      });
      return {
        host: endpoint,
        pagesRead: pages,
        found: matchingTransfers,
        inserted,
        cursorAt,
        oldestAt,
      };
    } catch (error) {
      store.recordSyncFailure({
        attemptedAt,
        error: error.message,
      });
      throw error;
    }
  }

  return { rebuild };
}
