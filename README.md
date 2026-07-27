# rfq-fees

Dashboard charting RFQ fees and notional volume for the Injective RFQ fee
collector `inj1ehxcakmxm8a0qrm690yckmdw4fk0fmzyc94ngf`.

Served at **https://fees.inj.so**

## What's here

- `The RFQ Ledger.dc.html` — the source design
- `fee-data.js` and `fee-data.csv` — the initial hourly snapshot and outage fallback.
  Row format:
  `YYYY-MM-DDTHH,txCount,feeMicroUSDC,largestSingleFeeMicroUSDC`
- `lib/fee-store.js` — SQLite storage for transactions, hourly aggregates, and sync state
- `lib/fee-sync.js` — lightweight incremental Injective LCD ingestion
- `lib/explorer-fee-sync.js` — explicit full-history explorer backfill
- `scripts/fetch-fees.mjs` — command-line sync and rebuild entry point
- `scripts/verify-bps.mjs` — live check of the flat 4.0 bps assumption
- `dist/index.html` — self-contained dashboard bundle

## Data notes

- Fees are paid in USDC (`erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a`, 6 decimals).
- The RFQ contract charges a flat **4.0 bps**, verified fill by fill against the quoted
  price and quantity in each `accept_quote` message. Notional volume is therefore exact:
  `volume = fees / 0.0004`.
- Full rebuilds use the Injective explorer transaction index, which currently
  reaches the collector's first indexed fee activity on 2026-06-02.
- The wallet balance shown in the header is fetched live from
  `https://sentry.lcd.injective.network`.

## Refreshing fee history

The production process runs an incremental sync five seconds after startup and
then once per hour. Each incremental run requests newest transactions first,
stops after crossing a one-hour cursor overlap, and deduplicates by transaction
hash. The dashboard also reloads the cached API once per hour.

```bash
npm run sync:fees       # one incremental update
npm run rebuild:fees    # intentionally heavy complete history rebuild
```

The complete rebuild scans the explorer account history in 100-transaction
pages, normalizes fee transfers, deduplicates transaction hashes, and replaces
SQLite data only after every page succeeds. It can download hundreds of
megabytes, so it is for initialization or repair, not scheduled use.

Runtime configuration:

```text
FEE_DB_PATH=data/fees.db
FEE_SYNC_INTERVAL_MS=3600000
FEE_SYNC_START_DELAY_MS=5000
```

`GET /api/fees` serves SQLite-backed hourly aggregates with a five-minute HTTP
cache and stale-while-revalidate fallback. If the API is unavailable, the
dashboard falls back to the embedded `fee-data.js` snapshot.

## Run

Node.js 22.5 or newer is required for the built-in SQLite API.

```bash
npm test
npm start
```

The production service listens on port `35000` behind nginx.

Health check: `GET /health`
