# Record 24h metric

## Goal

Replace the fixed UTC calendar-day record with the highest rolling 24-hour fee total. Make it immediately visible when the current rolling window sets a new all-time record without disrupting the dashboard's restrained editorial style.

## Metric semantics

- Treat every hourly fee bucket as a possible rolling-window endpoint.
- For each endpoint, sum fees from that hour and the preceding 23 clock hours. Missing activity hours contribute zero.
- `Record 24h` is the largest of those rolling totals.
- `Last 24h fees` remains the rolling total through the latest cached hour.
- A current window is a new record only when it is strictly greater than every window ending before it. Equality does not retrigger the state.
- Show the record's inclusive UTC range so it cannot be confused with a calendar day.

## Interface

Rename the fifth card to `Record 24h`, display the record amount in red, and show its UTC start and end hours below it. Add a compact red dot and `new record` label beside the `Last 24h fees` heading only while the current window is setting the record.

The dot uses a restrained opacity-and-scale pulse. Under `prefers-reduced-motion: reduce`, it remains visible but static. The marker is text-backed, so meaning does not depend on color or animation.

## Verification

Add bundle regression assertions for the renamed bindings, rolling-window calculation, strict previous-record comparison, marker visibility, and reduced-motion behavior. Run the full test suite and idempotent build, then verify the six-card layout and marker behavior on desktop and mobile before deploying through the existing PM2 setup.
