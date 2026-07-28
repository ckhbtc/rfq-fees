# Mobile Responsive Dashboard

## Problem

The dashboard currently applies desktop spacing and a flexible 24-column
heatmap at every viewport width. On phones, the heatmap cells compress until
they are difficult to read, the date labels dominate the available width, and
the hover-only cell readout cannot be used reliably.

## Direction

Preserve the existing editorial identity and data model. Add a focused mobile
layout below 700 pixels rather than creating a separate mobile page.

## Layout

- Reduce page gutters and vertical spacing.
- Stack the hero copy above the metrics.
- Keep the metrics in a compact two-column grid.
- Scale the display headline and masthead typography without changing fonts.
- Reduce cumulative-chart date labels to about five meaningful anchors.
- Let notes and supporting sections continue stacking naturally.

## Heatmap

- Put the hourly grid in a contained two-axis scroll surface capped at roughly
  two-thirds of the viewport height.
- Give each hourly cell a fixed readable width and height on mobile.
- Keep the day label pinned to the left while hours scroll underneath it.
- Show a mobile-only swipe instruction.
- Support tapping a cell as well as hovering it.
- Update the default instruction to say "Tap or hover any cell."

Every hour and day remains available. The page itself must not gain horizontal
overflow; only the heatmap surface scrolls in either direction.

## Data and Errors

The mobile layout reuses the same cached rows and derived metrics as desktop.
No new API or persistence behavior is needed. Existing loading and fallback
behavior remains unchanged.

## Verification

Regression tests check the responsive class hooks, media query, tap binding,
mobile instruction, and reduced date-label logic. Browser verification uses an
iPhone-sized viewport to confirm:

- the hero and summary cards stack correctly;
- the page does not overflow horizontally;
- the heatmap has an internal scroll width wider than its viewport;
- the rendered cell readout is touch-appropriate;
- desktop data and styling remain intact.
