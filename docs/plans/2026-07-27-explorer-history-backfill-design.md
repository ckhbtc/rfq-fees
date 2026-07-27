# Explorer History Backfill

## Problem

The dashboard was seeded from Cosmos LCD transaction search. The deepest public
LCD currently returns transactions only to July 11, so the hourly charts cover
about 17 days. Presenting that count prominently makes an infrastructure limit
look like a meaningful reporting period.

The Injective explorer indexer reports 52,377 account transactions for the fee
collector and reaches June 2. Its oldest records include the expected successful
USDC transfer events to the collector.

## Decision

Use the explorer account-transaction endpoint for explicit full rebuilds:

- Fetch pages of 100 transactions with bounded concurrency and retries.
- Normalize explorer records into the existing fee-transfer shape.
- Accept only successful transactions containing a USDC transfer to the fee
  collector.
- Deduplicate by transaction hash.
- Replace SQLite history atomically only after every explorer page succeeds.
- Report progress without persisting raw explorer responses.

Keep the hourly incremental refresh on the LCD. It normally reads one recent
page and avoids repeatedly scanning the larger explorer history.

## Dashboard wording

Rename the hourly grid section to "Hourly fee activity". The heading describes
the visualization without treating the available date range as a product
concept. The exact first and last timestamps remain visible where date context
is useful.

## Failure behavior

If any explorer page still fails after retries, the rebuild exits with an error
and leaves the existing SQLite history untouched. The running app continues to
serve the last complete dataset.

## Verification

Tests cover explorer pagination, normalization, deduplication, atomic
replacement, failure preservation, and the evergreen heading. A production
rebuild must report the recovered first timestamp, hour count, fill count, and
fee total before the app is restarted and checked over HTTPS.
