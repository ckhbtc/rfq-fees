# Hourly fee cache design

## Goal

Keep the RFQ fee dashboard current without repeatedly scanning the complete
Injective transaction history.

## Architecture

The existing Node process owns a local SQLite database at `data/fees.db`. The
database stores one deduplicated row per fee transaction, hourly aggregates, and
sync metadata. On first startup it can seed the aggregates from the attached
`fee-data.csv`, so the dashboard remains available without a chain backfill.

An explicit rebuild command retains the attached generator's behavior: select
the LCD host with the deepest transaction index, fetch every page, parse USDC
transfers to the fee collector, and atomically replace the cached history.

Normal refreshes run once per hour. They query transactions newest-first and
stop after crossing a short overlap behind the saved cursor. Transaction hashes
make the overlap safe and prevent double counting. A failed refresh records its
error but leaves the last successful database contents available.

## Data flow

1. The server opens SQLite and seeds it from `fee-data.csv` if empty.
2. The dashboard requests `GET /api/fees`.
3. The API reads hourly aggregates from SQLite and returns sync metadata.
4. A non-overlapping background timer runs the incremental chain sync hourly.
5. The browser reloads `/api/fees` hourly without reloading the page.

The existing live wallet-balance request remains once per page load.

## Operations

- `npm run sync:fees` performs one incremental update.
- `npm run rebuild:fees` performs the intentionally heavy complete rebuild.
- `FEE_SYNC_INTERVAL_MS` controls the scheduler and defaults to one hour.
- `FEE_DB_PATH` overrides the database location.

## Testing

Unit tests cover transfer parsing, CSV seeding, deduplication, aggregation,
incremental pagination and cutoff behavior, rebuild behavior, API responses,
and the frontend bundle's switch from static data to the cached API.
