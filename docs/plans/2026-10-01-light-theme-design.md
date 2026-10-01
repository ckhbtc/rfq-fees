# Light theme and serif type

The dashboard gains a light theme alongside the dark one, and its type returns to the pairing the original editorial version used.

## Theme

Every colour in the page is a CSS custom property defined twice, under `.page[data-theme="dark"]` and `.page[data-theme="light"]`. The light set keeps the same roles (blue bars, amber records, cyan accent) on a cool off-white ground with white panels; amber text gets a darker shade than amber fills so record values keep 4.5:1 contrast. The hourly heatmap uses a separate ramp in light mode, running from pale blue for quiet hours to navy for the busiest.

The theme follows `prefers-color-scheme` until the viewer chooses one with the sun/moon button in the header. That choice is stored in `localStorage` under `rfq-ledger-theme` and wins over the system setting on later visits; the page also reacts to system changes while no choice is stored. The bundle's loading screen and `theme-color` meta follow the system preference so light-mode viewers do not see a dark flash. A `theme` tweak (auto, light, dark) is available when the page is opened in the design canvas.

## Type

Instrument Serif returns for the hero total, section and note headings, and the key figures; IBM Plex Sans carries body text and IBM Plex Mono carries labels, axes, the ledger table and the wordmark. On phones the hero total drops to 60px and the theme button sits beside the wordmark.

## Verification

Automated tests, a rebuilt bundle, and a browser render at desktop and phone widths in both themes, including the toggle persisting across a reload while the system prefers the other theme.
