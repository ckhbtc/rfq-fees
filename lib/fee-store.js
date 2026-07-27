import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { USDC_DECIMALS } from './fee-config.js';

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

  function addTransferRows(transfers) {
    let inserted = 0;
    for (const transfer of transfers) {
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

    insertTransfers(transfers) {
      return transaction(() => addTransferRows(transfers));
    },

    replaceTransfers(transfers, { cursorAt, host, syncedAt }) {
      return transaction(() => {
        db.exec('DELETE FROM fee_transfers');
        db.exec('DELETE FROM hourly_fees');
        db.exec('DELETE FROM sync_state');
        const inserted = addTransferRows(transfers);
        setState('last_cursor_at', cursorAt);
        setState('last_success_at', syncedAt);
        setState('last_attempt_at', syncedAt);
        setState('last_sync_status', 'ok');
        setState('last_host', host);
        return inserted;
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
