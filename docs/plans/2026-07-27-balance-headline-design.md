# Live Balance Headline

## Problem

The dashboard labels the sum of the searchable archive window as "Fees
collected" and pairs it with a day count. Public archive nodes only expose a
partial history, so the amount and number of days are useful chart context but
are not a trustworthy all-time wallet total.

## Decision

Use the fee collector's live on-chain balance as the primary headline:

- Label it "Total balance".
- Format the value as dollars, for example `$12,135`.
- Describe it as "read live from chain".
- Refresh it on page load and once per hour.

Keep the historical dataset for the charts, fills, and derived notional. Replace
the duplicate balance card with the fixed `4.0 bps` fee rate so the existing
two-by-two metric layout remains balanced.

## Alternatives considered

Keeping the partial-window fee sum would continue to imply that the archive
window is complete. Removing the fourth card would leave an uneven grid. Showing
both the live balance and the partial fee sum would invite comparison between
values with different scopes.

## Verification

The server bundle test must require the new labels and reject the old
"Fees collected" and `USDC · days` treatment. Production verification must
confirm the rendered bundle contains the live balance headline, no obsolete
headline, a healthy API, and valid HTTPS.
