#!/usr/bin/env node
// Sanity-checks the assumption the whole page rests on: that the RFQ contract
// charges a flat 4.0 bps, so notional volume = fees / 0.0004.
//
//   node scripts/verify-bps.mjs [n]
//
// For each recent accept_quote tx it recomputes notional from the quoted price and
// quantity in the message, then compares it against the USDC actually received by
// the fee collector. Uses the Injective explorer indexer, which unlike the LCD
// nodes returns the decoded message body alongside the event log.

const ADDR = 'inj1ehxcakmxm8a0qrm690yckmdw4fk0fmzyc94ngf';
const DENOM =
  'erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a';
const EXPLORER =
  'https://sentry.exchange.grpc-web.injective.network/api/explorer/v1';
const n = Math.min(+process.argv[2] || 25, 100);

const r = await fetch(`${EXPLORER}/accountTxs/${ADDR}?limit=${n}`);
const { data = [] } = await r.json();

const samples = [];
for (const tx of data) {
  let micro = 0;
  for (const log of tx.logs ?? []) {
    for (const ev of log.events ?? []) {
      if (ev.type !== 'transfer') {
        continue;
      }
      let recipient, amount;
      for (const a of ev.attributes) {
        if (a.key === 'recipient') {
          recipient = a.value;
        } else if (a.key === 'amount') {
          amount = a.value;
        }
      }
      if (recipient === ADDR && amount?.endsWith(DENOM)) {
        micro += Number.parseInt(
          amount.slice(0, -DENOM.length),
          10,
        );
      }
    }
  }
  if (!micro) {
    continue;
  }

  let notional = null;
  try {
    const inner = tx.messages[0].value.msgs[0].msg;
    const q = JSON.parse(inner).accept_quote;
    notional =
      Number.parseFloat(q.quantity) *
      Number.parseFloat(q.quotes[0].price);
  } catch {
    // Ignore transactions without the expected RFQ message shape.
  }
  if (!notional) {
    continue;
  }

  const fee = micro / 1e6;
  samples.push({ fee, notional, bps: (fee / notional) * 10000 });
}

if (!samples.length) {
  console.error('no comparable fills in the last', n, 'txs');
  process.exit(1);
}

for (const s of samples) {
  console.log(
    `fee ${s.fee.toFixed(6).padStart(12)} USDC   ` +
      `notional ${s.notional.toFixed(4).padStart(14)}   ${s.bps.toFixed(3)} bps`,
  );
}
const bps = samples.map((s) => s.bps);
const mean = bps.reduce((a, b) => a + b, 0) / bps.length;
console.log(
  `\n${samples.length} fills · mean ${mean.toFixed(4)} bps · ` +
    `min ${Math.min(...bps).toFixed(3)} · max ${Math.max(...bps).toFixed(3)}`,
);
console.log(
  Math.abs(mean - 4) < 0.01
    ? 'flat 4.0 bps holds ✓'
    : 'rate drifted: revisit the assumption',
);
