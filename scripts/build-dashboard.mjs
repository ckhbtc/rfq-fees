#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildDailyFees } from '../lib/daily-fees.js';
import {
  buildBundle,
  buildTemplate,
  syncLibBlocks,
} from '../lib/dashboard-build.js';
import { calculateRolling24 } from '../lib/rolling-fees.js';

const bundlePath = resolve('dist/index.html');
const sourcePath = resolve('The RFQ Ledger.dc.html');
const runtimePath = resolve('support.js');

const source = await readFile(sourcePath, 'utf8');
const syncedSource = syncLibBlocks(source, {
  'rolling-fees': calculateRolling24.toString(),
  'daily-fees': buildDailyFees.toString(),
});
if (syncedSource !== source) {
  await writeFile(sourcePath, syncedSource);
  console.log('synced lib helpers into The RFQ Ledger.dc.html');
}

const bundle = await readFile(bundlePath, 'utf8');
const nextBundle = buildBundle(
  bundle,
  buildTemplate(syncedSource),
  await readFile(runtimePath, 'utf8'),
);

if (nextBundle === bundle) {
  console.log('dist/index.html is up to date');
} else {
  await writeFile(bundlePath, nextBundle);
  console.log('rebuilt dist/index.html from The RFQ Ledger.dc.html');
}
