# rfq-fees

Static page charting RFQ fees and notional volume for the Injective RFQ fee collector
`inj1ehxcakmxm8a0qrm690yckmdw4fk0fmzyc94ngf`.

Served at **https://fees.inj.so**

## What's here

- `The RFQ Ledger.dc.html` — the source design
- `fee-data.js` — hourly snapshot of every USDC transfer received by the fee collector,
  read from Injective mainnet transaction events. Row format:
  `YYYY-MM-DDTHH,txCount,feeMicroUSDC,largestSingleFeeMicroUSDC`
- `dist/index.html` — self-contained build (no external assets besides Google Fonts),
  plus `CNAME` and `.nojekyll` for GitHub Pages

## Data notes

- Fees are paid in USDC (`erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a`, 6 decimals).
- The RFQ contract charges a flat **4.0 bps**, verified fill by fill against the quoted
  price and quantity in each `accept_quote` message. Notional volume is therefore exact:
  `volume = fees / 0.0004`.
- Window starts 2026-07-11 because public archive nodes only retain a couple of weeks of
  searchable transaction index. The wallet itself is older and holds more than this window's total.
- The wallet balance shown in the header is fetched live from
  `https://sentry.lcd.injective.network`.

## Deploy

The production service runs the bundled page through the dependency-free Node server:

```bash
PORT=35000 npm start
```

Health check: `GET /health`
