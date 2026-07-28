# Record Fee Metrics and Chart Annotations

## Goal

Add two useful fee cards to the dashboard and prevent cumulative-chart
annotations from overlapping when the peak fee hour is close to the latest
point.

## Summary cards

Keep the existing two-column editorial grid and extend it from four cards to
six.

- **Record UTC day** sums every hourly bucket whose timestamp falls inside the
  same UTC calendar date, from 00:00 inclusive to the following 00:00
  exclusive. Its primary value is the fee total. Its note shows the date. If
  the record is the current partial day, the note also states the latest
  covered minute.
- **Last 24h fees** sums the timestamp window ending at the latest cached hour.
  It does not use the last 24 non-empty rows, so inactive hours correctly count
  as zero. Its note identifies the rolling window.

Both cards reuse the existing cached fee history and currency formatting.

## Chart annotations

Keep both the final cumulative total and peak-hour annotations. Detect crowding
when the peak point is near the right edge and vertically close to the final
point. In that case, place the final total farther above its point and the peak
hour below its point. The peak label also becomes right-anchored so it stays
inside the chart. Otherwise retain the current placement. The calculation uses
chart coordinates and fixed visual offsets, so it works consistently on
desktop and mobile.

## Verification

Add bundle regression checks for both new metric values, UTC-day aggregation,
the timestamp-based rolling window, and adaptive annotation placement. Run the
full test suite, rebuild the bundle twice to confirm idempotency, and inspect
the live chart at desktop and phone widths after deployment.
