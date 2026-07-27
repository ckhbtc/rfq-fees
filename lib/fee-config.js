import { resolve } from 'node:path';

export const FEE_COLLECTOR_ADDRESS = 'inj1ehxcakmxm8a0qrm690yckmdw4fk0fmzyc94ngf';
export const USDC_DENOM = 'erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a';
export const USDC_DECIMALS = 6;
export const FEE_RATE = 0.0004;
export const TX_PAGE_SIZE = 100;
export const EXPLORER_TX_PAGE_SIZE = 100;
export const DEFAULT_SYNC_INTERVAL_MS = 60 * 60 * 1000;
export const DEFAULT_SYNC_OVERLAP_MS = 60 * 60 * 1000;
export const DEFAULT_SYNC_START_DELAY_MS = 5 * 1000;
export const EXPLORER_API =
  'https://sentry.exchange.grpc-web.injective.network/api/explorer/v1';
export const LCD_HOSTS = [
  'https://injective-api.polkachu.com',
  'https://injective-rest.publicnode.com',
  'https://sentry.lcd.injective.network',
];

export function getFeeDbPath() {
  return resolve(process.env.FEE_DB_PATH ?? 'data/fees.db');
}
