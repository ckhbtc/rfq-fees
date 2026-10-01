# Daily fees redesign

The dashboard moves from the cream editorial layout to a dark Injective palette (navy ground, blue and cyan data, amber for records) set in Geist and Geist Mono, and it adds daily fees alongside the existing hourly view.

## Layout

- Hero: total fees collected with the 4.0 bps sentence, plus eight figures. The top row is day-based (today so far, yesterday with its rank, the 7-day average, the record day). The bottom row is rolling and lifetime (last 24 hours with the new-record badge, record 24 hours, notional traded, live collector balance).
- Fig. 1, daily and hourly: UTC-day bars with a trailing 7-day average line sit directly above an hourly heatmap whose columns are the same days, so a tall bar can be traced to the hours that produced it. A right-hand profile shows the average for each hour of the day. Range (30D, 90D, All) and metric (fees, notional, fills) controls drive both charts, and hovering any bar or cell fills a readout row. The current day is hatched, and hours that have not happened yet, or that fall before history begins, are hatched in the grid.
- Fig. 2, daily ledger: the last ten UTC days with fees, change against the prior 7-day average, notional, fills, average fill, busiest hour and a 24-bar hourly shape.
- Fig. 3, running total: cumulative fees with the record day marked, plus median day, $1,000+ days and the last 30 days.
- Three notes (biggest fill, busiest hour, record day) and the method note.

At 760px and below the hero stacks, the figures fall back to two columns, the hour-of-day profile hides, the ledger scrolls sideways and the range defaults to 30 days.

## Data

Daily totals are derived in the browser from the hourly rows `/api/fees` already serves, so the API and SQLite schema are unchanged. `lib/daily-fees.js` builds the UTC-day series (totals, peak hour, and per-hour states of ok, before history, or not yet) and is unit tested. The page embeds it, together with `lib/rolling-fees.js`, between `// <lib:…>` markers that `npm run build` keeps in sync.

## Build

`npm run build` now regenerates the bundle's template from `The RFQ Ledger.dc.html` instead of string-patching the previous bundle. It encodes camelCase attributes inside `<x-dc>` the same way the runtime's own encoder does, points the runtime script at its manifest entry, and keeps the vendored React builds. Tests fail if the source or `dist/index.html` drift from the lib helpers or from each other.

## Verification

Automated tests, an idempotent second build, and a browser render of the built bundle against a live `/api/fees` snapshot at desktop and phone widths, covering the range and metric controls with no console errors.
