import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  DEFAULT_SYNC_INTERVAL_MS,
  DEFAULT_SYNC_START_DELAY_MS,
  FEE_COLLECTOR_ADDRESS,
  getFeeDbPath,
  USDC_DENOM,
} from './lib/fee-config.js';
import { startFeeScheduler } from './lib/fee-scheduler.js';
import { createFeeStore } from './lib/fee-store.js';
import { createFeeSync } from './lib/fee-sync.js';
import { SNAPSHOT_AT } from './fee-data.js';

const distDir = resolve(fileURLToPath(new URL('./dist/', import.meta.url)));
const seedCsvPath = fileURLToPath(
  new URL('./fee-data.csv', import.meta.url),
);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function send(res, statusCode, body, contentType) {
  res.writeHead(statusCode, {
    'Cache-Control': statusCode === 200 ? 'public, max-age=300' : 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': contentType,
  });
  res.end(body);
}

function sendJson(res, statusCode, value, cacheControl = 'no-store') {
  const body = `${JSON.stringify(value)}\n`;
  res.writeHead(statusCode, {
    'Cache-Control': cacheControl,
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(body);
}

export function createFeeServer({
  feeStore,
  refreshIntervalMs = DEFAULT_SYNC_INTERVAL_MS,
} = {}) {
  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'Method Not Allowed\n', 'text/plain; charset=utf-8');
      return;
    }

    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/health') {
      send(res, 200, '{"status":"ok"}\n', 'application/json; charset=utf-8');
      return;
    }

    if (pathname === '/api/fees') {
      if (!feeStore) {
        sendJson(res, 503, {
          error: 'fee cache unavailable',
        });
        return;
      }

      try {
        sendJson(
          res,
          200,
          {
            ...feeStore.getSnapshot(),
            refreshIntervalSeconds: Math.round(
              refreshIntervalMs / 1000,
            ),
          },
          'public, max-age=300, stale-while-revalidate=3600',
        );
      } catch (error) {
        sendJson(res, 500, {
          error: 'failed to read fee cache',
        });
      }
      return;
    }

    let relativePath;
    try {
      relativePath = decodeURIComponent(pathname === '/' ? 'index.html' : pathname.slice(1));
    } catch {
      send(res, 400, 'Bad Request\n', 'text/plain; charset=utf-8');
      return;
    }

    const filePath = resolve(distDir, relativePath);
    if (filePath !== distDir && !filePath.startsWith(`${distDir}${sep}`)) {
      send(res, 404, 'Not Found\n', 'text/plain; charset=utf-8');
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        throw new Error('Not a file');
      }

      const body = await readFile(filePath);
      res.writeHead(200, {
        'Cache-Control': relativePath === 'index.html' ? 'no-cache' : 'public, max-age=3600',
        'Content-Length': body.byteLength,
        'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      send(res, 404, 'Not Found\n', 'text/plain; charset=utf-8');
    }
  });
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntryPoint) {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number.parseInt(process.env.PORT ?? '35000', 10);
  const refreshIntervalMs = Number.parseInt(
    process.env.FEE_SYNC_INTERVAL_MS ??
      String(DEFAULT_SYNC_INTERVAL_MS),
    10,
  );
  const initialDelayMs = Number.parseInt(
    process.env.FEE_SYNC_START_DELAY_MS ??
      String(DEFAULT_SYNC_START_DELAY_MS),
    10,
  );
  const feeStore = createFeeStore({
    dbPath: getFeeDbPath(),
    seedCsvPath,
    seedSnapshotAt: SNAPSHOT_AT,
  });
  const feeSync = createFeeSync({
    store: feeStore,
    address: FEE_COLLECTOR_ADDRESS,
    denom: USDC_DENOM,
  });
  const server = createFeeServer({
    feeStore,
    refreshIntervalMs,
  });
  const scheduler = startFeeScheduler({
    sync: () => feeSync.syncIncremental(),
    intervalMs: refreshIntervalMs,
    initialDelayMs,
  });

  server.listen(port, host, () => {
    console.log(`rfq-fees listening on http://${host}:${port}`);
  });

  function shutdown() {
    scheduler.stop();
    server.close(() => {
      feeStore.close();
    });
  }

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
