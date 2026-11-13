import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { USDC_DECIMALS } from './fee-config.js';
import { CHANNELS } from './fee-events.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS fee_transfers (
    tx_hash TEXT PRIMARY KEY,
    height INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    hour_utc TEXT NOT NULL,
    fee_micro_usdc INTEGER NOT NULL CHECK (fee_micro_usdc > 0)
  );

  CREATE INDEX IF NOT EXISTS fee_transfers_timestamp_idx
    ON fee_transfers(timestamp);

  CREATE TABLE IF NOT EXISTS hourly_fees (
    hour_utc TEXT PRIMARY KEY,
    fills INTEGER NOT NULL CHECK (fills >= 0),
    fee_micro_usdc INTEGER NOT NULL CHECK (fee_micro_usdc >= 0),
    largest_single_fee_micro_usdc INTEGER NOT NULL
      CHECK (largest_single_fee_micro_usdc >= 0)
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fee_transfer_takers (
    tx_hash TEXT NOT NULL,
    taker TEXT NOT NULL,
    hour_utc TEXT NOT NULL,
    PRIMARY KEY (tx_hash, taker)
  );

  CREATE INDEX IF NOT EXISTS fee_transfer_takers_hour_idx
    ON fee_transfer_takers(hour_utc);

  CREATE TABLE IF NOT EXISTS fee_transfer_channels (
    tx_hash TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('api', 'web', 'mobile')),
    hour_utc TEXT NOT NULL,
    fee_micro_usdc INTEGER NOT NULL CHECK (fee_micro_usdc >= 0),
    PRIMARY KEY (tx_hash, channel)
  );

  CREATE INDEX IF NOT EXISTS fee_transfer_channels_hour_idx
    ON fee_transfer_channels(hour_utc);
`;

function parseCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (
    lines.shift() !==
    'hour_utc,fills,fee_micro_usdc,largest_single_fee_micro_usdc'
  ) {
    throw new Error('unexpected fee-data.csv header');
  }

  return lines.filter(Boolean).map((line) => {
    const [hourUtc, fills, feeMicroUsdc, largestSingleFeeMicroUsdc] =
      line.split(',');
    return {
      hourUtc,
      fills: Number.parseInt(fills, 10),
      feeMicroUsdc: Number.parseInt(feeMicroUsdc, 10),
      largestSingleFeeMicroUsdc: Number.parseInt(
        largestSingleFeeMicroUsdc,
        10,
      ),
    };
  });
}

export function createFeeStore({
  dbPath,
  seedCsvPath,
  seedSnapshotAt,
} = {}) {
  const resolvedDbPath = dbPath === ':memory:' ? dbPath : resolve(dbPath);
  if (resolvedDbPath !== ':memory:') {
    mkdirSync(dirname(resolvedDbPath), { recursive: true });
  }

  const db = new DatabaseSync(resolvedDbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(SCHEMA);

  const countHours = db.prepare(
    'SELECT COUNT(*) AS count FROM hourly_fees',
  );
  const insertHour = db.prepare(`
    INSERT INTO hourly_fees (
      hour_utc,
      fills,
      fee_micro_usdc,
      largest_single_fee_micro_usdc
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(hour_utc) DO UPDATE SET
      fills = excluded.fills,
      fee_micro_usdc = excluded.fee_micro_usdc,
      largest_single_fee_micro_usdc =
        excluded.largest_single_fee_micro_usdc
  `);
  const insertTransfer = db.prepare(`
    INSERT OR IGNORE INTO fee_transfers (
      tx_hash,
      height,
      timestamp,
      hour_utc,
      fee_micro_usdc
    ) VALUES (?, ?, ?, ?, ?)
  `);
  const addToHour = db.prepare(`
    INSERT INTO hourly_fees (
      hour_utc,
      fills,
      fee_micro_usdc,
      largest_single_fee_micro_usdc
    ) VALUES (?, 1, ?, ?)
    ON CONFLICT(hour_utc) DO UPDATE SET
      fills = hourly_fees.fills + 1,
      fee_micro_usdc =
        hourly_fees.fee_micro_usdc + excluded.fee_micro_usdc,
      largest_single_fee_micro_usdc = MAX(
        hourly_fees.largest_single_fee_micro_usdc,
        excluded.largest_single_fee_micro_usdc
      )
  `);
  const insertTaker = db.prepare(`
    INSERT OR IGNORE INTO fee_transfer_takers (tx_hash, taker, hour_utc)
    VALUES (?, ?, ?)
  `);
  const dailyTakers = db.prepare(`
    SELECT
      substr(hour_utc, 1, 10) AS date,
      COUNT(DISTINCT taker) AS unique_takers
    FROM fee_transfer_takers
    WHERE hour_utc >= ?
    GROUP BY date
    ORDER BY date
  `);
  const totalTakers = db.prepare(`
    SELECT COUNT(DISTINCT taker) AS unique_takers
    FROM fee_transfer_takers
    WHERE hour_utc >= ?
  `);
  const insertChannel = db.prepare(`
    INSERT OR IGNORE INTO fee_transfer_channels (
      tx_hash,
      channel,
      hour_utc,
      fee_micro_usdc
    ) VALUES (?, ?, ?, ?)
  `);
  const dailyChannels = db.prepare(`
    SELECT
      substr(hour_utc, 1, 10) AS date,
      channel,
      SUM(fee_micro_usdc) AS fee_micro_usdc
    FROM fee_transfer_channels
    WHERE hour_utc >= ?
    GROUP BY date, channel
    ORDER BY date
  `);
  const setStateStatement = db.prepare(`
    INSERT INTO sync_state (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  const deleteStateStatement = db.prepare(
    'DELETE FROM sync_state WHERE key = ?',
  );
  const getStateStatement = db.prepare(
    'SELECT value FROM sync_state WHERE key = ?',
  );
  const storedTransferSummary = db.prepare(`
    SELECT COUNT(*) AS count, MAX(timestamp) AS newest
    FROM fee_transfers
  `);

  function transaction(callback) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function setState(key, value) {
    if (value == null || value === '') {
      deleteStateStatement.run(key);
      return;
    }
    setStateStatement.run(key, String(value));
  }

  function getState(key) {
    return getStateStatement.get(key)?.value ?? null;
  }

  // Taker and channel history is complete from takers_since / channels_since
  // onward; a sync only ever extends it backwards, since hourly syncs overlap
  // the previous window.
  function recordCoverage(key, coveredFrom) {
    if (!coveredFrom) {
      return;
    }
    const current = getState(key);
    if (!current || Date.parse(coveredFrom) < Date.parse(current)) {
      setState(key, coveredFrom);
    }
  }

  function recordTakerCoverage(coveredFrom) {
    recordCoverage('takers_since', coveredFrom);
    recordCoverage('channels_since', coveredFrom);
  }

  function addChannelRows(transfer) {
    for (const [channel, fee] of Object.entries(transfer.channels ?? {})) {
      insertChannel.run(transfer.txHash, channel, transfer.hourUtc, fee);
    }
  }

  // A rebuild source can return less than is stored (e.g. an explorer index
  // that stops early), and replacing would silently delete the rest.
  function assertReplacementKeepsHistory(transfers) {
    const stored = storedTransferSummary.get();
    const storedCount = Number(stored.count);
    if (!storedCount) {
      return;
    }

    const replacementCount = new Set(
      transfers.map((transfer) => transfer.txHash),
    ).size;
    let replacementNewest = null;
    for (const transfer of transfers) {
      if (
        !replacementNewest ||
        Date.parse(transfer.timestamp) > Date.parse(replacementNewest)
      ) {
        replacementNewest = transfer.timestamp;
      }
    }

    const endsEarlier =
      !replacementNewest ||
      Date.parse(replacementNewest) < Date.parse(stored.newest);
    if (replacementCount < storedCount || endsEarlier) {
      throw new Error(
        `refusing to shrink stored fee history: ${storedCount} stored ` +
          `transfers through ${stored.newest}, replacement has ` +
          `${replacementCount} through ${replacementNewest ?? 'none'}; ` +
          'rerun with --force to replace it anyway',
      );
    }
  }

  function addTransferRows(transfers) {
    let inserted = 0;
    for (const transfer of transfers) {
      for (const taker of transfer.takers ?? []) {
        insertTaker.run(transfer.txHash, taker, transfer.hourUtc);
      }
      addChannelRows(transfer);

      const result = insertTransfer.run(
        transfer.txHash,
        transfer.height,
        transfer.timestamp,
        transfer.hourUtc,
        transfer.feeMicroUsdc,
      );
      if (!result.changes) {
        continue;
      }

      addToHour.run(
        transfer.hourUtc,
        transfer.feeMicroUsdc,
        transfer.feeMicroUsdc,
      );
      inserted += 1;
    }
    return inserted;
  }

  function seedFromCsv(csvText, snapshotAt) {
    if (Number(countHours.get().count) > 0) {
      return false;
    }

    const rows = parseCsv(csvText);
    transaction(() => {
      for (const row of rows) {
        insertHour.run(
          row.hourUtc,
          row.fills,
          row.feeMicroUsdc,
          row.largestSingleFeeMicroUsdc,
        );
      }
      setState('aggregate_seed_through_at', snapshotAt);
      setState('last_cursor_at', snapshotAt);
      setState('last_success_at', snapshotAt);
      setState('last_sync_status', 'seeded');
    });
    return true;
  }

  if (
    Number(countHours.get().count) === 0 &&
    seedCsvPath &&
    seedSnapshotAt &&
    existsSync(seedCsvPath)
  ) {
    seedFromCsv(readFileSync(seedCsvPath, 'utf8'), seedSnapshotAt);
  }

  return {
    close() {
      db.close();
    },

    seedFromCsv,

    insertTransfers(transfers, { coveredFrom } = {}) {
      return transaction(() => {
        const inserted = addTransferRows(transfers);
        recordTakerCoverage(coveredFrom);
        return inserted;
      });
    },

    replaceTransfers(transfers, { cursorAt, host, syncedAt, force }) {
      return transaction(() => {
        if (!force) {
          assertReplacementKeepsHistory(transfers);
        }
        db.exec('DELETE FROM fee_transfers');
        db.exec('DELETE FROM fee_transfer_takers');
        db.exec('DELETE FROM fee_transfer_channels');
        db.exec('DELETE FROM hourly_fees');
        db.exec('DELETE FROM sync_state');
        const inserted = addTransferRows(transfers);
        recordTakerCoverage(transfers[0]?.timestamp);
        setState('last_cursor_at', cursorAt);
        setState('last_success_at', syncedAt);
        setState('last_attempt_at', syncedAt);
        setState('last_sync_status', 'ok');
        setState('last_host', host);
        return inserted;
      });
    },

    // Records channel splits only, for history that is already aggregated;
    // fee totals and hourly rows are left untouched.
    insertChannels(transfers, { coveredFrom } = {}) {
      return transaction(() => {
        for (const transfer of transfers) {
          addChannelRows(transfer);
        }
        recordCoverage('channels_since', coveredFrom);
        return transfers.length;
      });
    },

    recordSyncStart(attemptedAt) {
      transaction(() => {
        setState('last_attempt_at', attemptedAt);
        setState('last_sync_status', 'running');
        setState('last_error', null);
      });
    },

    recordSyncSuccess({ cursorAt, host, syncedAt }) {
      transaction(() => {
        setState('last_cursor_at', cursorAt);
        setState('last_success_at', syncedAt);
        setState('last_attempt_at', syncedAt);
        setState('last_sync_status', 'ok');
        setState('last_host', host);
        setState('last_error', null);
      });
    },

    recordSyncFailure({ attemptedAt, error }) {
      transaction(() => {
        setState('last_attempt_at', attemptedAt);
        setState('last_sync_status', 'error');
        setState('last_error', error);
      });
    },

    getCursorAt() {
      return getState('last_cursor_at');
    },

    getAggregateSeedThroughAt() {
      return getState('aggregate_seed_through_at');
    },

    getSnapshot() {
      const scale = 10 ** USDC_DECIMALS;
      const rows = db
        .prepare(`
          SELECT
            hour_utc,
            fills,
            fee_micro_usdc,
            largest_single_fee_micro_usdc
          FROM hourly_fees
          ORDER BY hour_utc
        `)
        .all()
        .map((row) => ({
          key: row.hour_utc,
          n: row.fills,
          fee: row.fee_micro_usdc / scale,
          max: row.largest_single_fee_micro_usdc / scale,
        }));
      const takersSince = getState('takers_since');
      const takersFromHour = takersSince?.slice(0, 13);
      const channelsSince = getState('channels_since');
      const channelsByDate = new Map();
      if (channelsSince) {
        for (const row of dailyChannels.all(channelsSince.slice(0, 13))) {
          if (!channelsByDate.has(row.date)) {
            channelsByDate.set(
              row.date,
              Object.fromEntries(CHANNELS.map((channel) => [channel, 0])),
            );
          }
          channelsByDate.get(row.date)[row.channel] =
            Number(row.fee_micro_usdc) / scale;
        }
      }

      return {
        source: 'sqlite',
        snapshotAt: getState('last_success_at'),
        sync: {
          status: getState('last_sync_status') ?? 'never',
          lastAttemptAt: getState('last_attempt_at'),
          lastSuccessAt: getState('last_success_at'),
          host: getState('last_host'),
          error: getState('last_error'),
        },
        rows,
        traders: takersSince
          ? {
              since: takersSince,
              daily: dailyTakers.all(takersFromHour).map((row) => ({
                date: row.date,
                unique: Number(row.unique_takers),
              })),
              total: Number(totalTakers.get(takersFromHour).unique_takers),
            }
          : { since: null, daily: [], total: 0 },
        channels: {
          since: channelsSince,
          daily: [...channelsByDate].map(([date, fees]) => ({
            date,
            ...fees,
          })),
        },
      };
    },

    getStats() {
      const row = db
        .prepare(`
          SELECT
            COUNT(*) AS hours,
            COALESCE(SUM(fills), 0) AS fills,
            COALESCE(SUM(fee_micro_usdc), 0) AS fee_micro_usdc
          FROM hourly_fees
        `)
        .get();
      const transferRow = db
        .prepare('SELECT COUNT(*) AS count FROM fee_transfers')
        .get();
      return {
        hours: Number(row.hours),
        fills: Number(row.fills),
        feeMicroUsdc: Number(row.fee_micro_usdc),
        storedTransfers: Number(transferRow.count),
      };
    },
  };
}

export { parseCsv };
