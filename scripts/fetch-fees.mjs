#!/usr/bin/env node

import { resolve } from 'node:path';

import {
  FEE_COLLECTOR_ADDRESS,
  getFeeDbPath,
  USDC_DENOM,
} from '../lib/fee-config.js';
import { createExplorerChannelBackfill } from '../lib/explorer-channel-backfill.js';
import { createExplorerFeeBackfill } from '../lib/explorer-fee-sync.js';
import { createFeeStore } from '../lib/fee-store.js';
import { createFeeSync } from '../lib/fee-sync.js';
import { SNAPSHOT_AT } from '../fee-data.js';

const store = createFeeStore({
  dbPath: getFeeDbPath(),
  seedCsvPath: resolve('fee-data.csv'),
  seedSnapshotAt: SNAPSHOT_AT,
});
const sync = createFeeSync({
  store,
  address: FEE_COLLECTOR_ADDRESS,
  denom: USDC_DENOM,
});
const backfill = createExplorerFeeBackfill({
  store,
  address: FEE_COLLECTOR_ADDRESS,
  denom: USDC_DENOM,
});

const channelBackfill = createExplorerChannelBackfill({
  store,
  address: FEE_COLLECTOR_ADDRESS,
  denom: USDC_DENOM,
});

const sinceIndex = process.argv.indexOf('--since');
const since = sinceIndex === -1 ? undefined : process.argv[sinceIndex + 1];
if (since !== undefined && !Number.isFinite(Date.parse(since))) {
  throw new Error('--since needs an ISO timestamp, e.g. 2026-10-01T00:00:00Z');
}

const mode = process.argv.includes('--rebuild')
  ? 'rebuild'
  : process.argv.includes('--channels')
    ? 'channels'
    : 'incremental';
if (mode === 'channels' && since === undefined) {
  throw new Error('--channels needs --since, e.g. --since 2026-06-01');
}

try {
  const result =
    mode === 'rebuild'
      ? await backfill.rebuild({ force: process.argv.includes('--force') })
      : mode === 'channels'
        ? await channelBackfill.backfill({ from: since })
        : await sync.syncIncremental({ since });
  const stats = store.getStats();
  console.log(
    JSON.stringify(
      {
        mode,
        ...result,
        ...stats,
      },
      null,
      2,
    ),
  );
} finally {
  store.close();
}
