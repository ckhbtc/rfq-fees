#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const bundlePath = resolve('dist/index.html');
const staticDataBlock = `  componentDidMount() {
    import("./fee-data.js").then((m) => this.setState({ rows: m.parseHourly() }));
    fetch(LCD + "/cosmos/bank/v1beta1/balances/" + ADDR)
      .then((r) => r.json())
      .then((j) => {
        const b = (j.balances || []).find((x) => x.denom === DEN);
        if (b) this.setState({ balance: +b.amount / 1e6 });
      })
      .catch(() => {});
  }
`;
const cachedDataBlock = `  loadFees = () => {
    fetch("/api/fees", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("fee cache unavailable");
        return r.json();
      })
      .then((j) => this.setState({ rows: j.rows }))
      .catch(() => {
        if (!this.state.rows) {
          import("./fee-data.js").then((m) =>
            this.setState({ rows: m.parseHourly() })
          );
        }
      });
  };

  componentDidMount() {
    this.loadFees();
    this.feeRefreshTimer = setInterval(this.loadFees, 60 * 60 * 1000);
    fetch(LCD + "/cosmos/bank/v1beta1/balances/" + ADDR)
      .then((r) => r.json())
      .then((j) => {
        const b = (j.balances || []).find((x) => x.denom === DEN);
        if (b) this.setState({ balance: +b.amount / 1e6 });
      })
      .catch(() => {});
  }

  componentWillUnmount() {
    clearInterval(this.feeRefreshTimer);
  }
`;
const hourlyDataBlock = `  loadFees = () => {
    fetch("/api/fees", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("fee cache unavailable");
        return r.json();
      })
      .then((j) => this.setState({ rows: j.rows }))
      .catch(() => {
        if (!this.state.rows) {
          import("./fee-data.js").then((m) =>
            this.setState({ rows: m.parseHourly() })
          );
        }
      });
  };

  loadBalance = () => {
    fetch(LCD + "/cosmos/bank/v1beta1/balances/" + ADDR)
      .then((r) => r.json())
      .then((j) => {
        const b = (j.balances || []).find((x) => x.denom === DEN);
        if (b) this.setState({ balance: +b.amount / 1e6 });
      })
      .catch(() => {});
  };

  componentDidMount() {
    this.loadFees();
    this.loadBalance();
    this.feeRefreshTimer = setInterval(this.loadFees, 60 * 60 * 1000);
    this.balanceRefreshTimer = setInterval(this.loadBalance, 60 * 60 * 1000);
  }

  componentWillUnmount() {
    clearInterval(this.feeRefreshTimer);
    clearInterval(this.balanceRefreshTimer);
  }
`;

const oldSummaryBlock = `        <div style="display: flex; flex-direction: column; gap: 2px">
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: oklch(0.55 0.012 60)">Fees collected</span>
          <span style="font-family: 'Instrument Serif', serif; font-size: 34px; line-height: 1.05">{{ kFees }}</span>
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: oklch(0.55 0.012 60)">USDC · {{ kDays }}</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px">
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: oklch(0.55 0.012 60)">Notional traded</span>
          <span style="font-family: 'Instrument Serif', serif; font-size: 34px; line-height: 1.05; color: oklch(0.5 0.19 25)">{{ kVol }}</span>
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: oklch(0.55 0.012 60)">fees ÷ 0.0004, exact</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px">
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: oklch(0.55 0.012 60)">Fills</span>
          <span style="font-family: 'Instrument Serif', serif; font-size: 34px; line-height: 1.05">{{ kFills }}</span>
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: oklch(0.55 0.012 60)">avg {{ kAvgFill }} each</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px">
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: oklch(0.55 0.012 60)">Balance today</span>
          <span style="font-family: 'Instrument Serif', serif; font-size: 34px; line-height: 1.05">{{ kBal }}</span>
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: oklch(0.55 0.012 60)">read live from chain</span>
        </div>`;
const newSummaryBlock = `        <div style="display: flex; flex-direction: column; gap: 2px">
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: oklch(0.55 0.012 60)">Total balance</span>
          <span style="font-family: 'Instrument Serif', serif; font-size: 34px; line-height: 1.05">{{ kBal }}</span>
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: oklch(0.55 0.012 60)">read live from chain</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px">
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: oklch(0.55 0.012 60)">Notional traded</span>
          <span style="font-family: 'Instrument Serif', serif; font-size: 34px; line-height: 1.05; color: oklch(0.5 0.19 25)">{{ kVol }}</span>
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: oklch(0.55 0.012 60)">fees ÷ 0.0004, exact</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px">
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: oklch(0.55 0.012 60)">Fills</span>
          <span style="font-family: 'Instrument Serif', serif; font-size: 34px; line-height: 1.05">{{ kFills }}</span>
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: oklch(0.55 0.012 60)">avg {{ kAvgFill }} each</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px">
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: oklch(0.55 0.012 60)">Fee rate</span>
          <span style="font-family: 'Instrument Serif', serif; font-size: 34px; line-height: 1.05">4.0 bps</span>
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: oklch(0.55 0.012 60)">flat on every fill</span>
        </div>`;

const encodeForEmbeddedJson = (value) =>
  JSON.stringify(value).slice(1, -1).replaceAll('</', '<\\u002F');

function patchEmbeddedBlock(bundle, candidates, replacement, description) {
  const encodedReplacement = encodeForEmbeddedJson(replacement);
  if (bundle.includes(encodedReplacement)) {
    return { bundle, changed: false };
  }

  for (const candidate of candidates) {
    const encodedCandidate = encodeForEmbeddedJson(candidate);
    if (bundle.includes(encodedCandidate)) {
      return {
        bundle: bundle.replace(encodedCandidate, encodedReplacement),
        changed: true,
      };
    }
  }

  throw new Error(`could not find ${description} in dist/index.html`);
}

let bundle = await readFile(bundlePath, 'utf8');
let changed = false;

const dataResult = patchEmbeddedBlock(
  bundle,
  [cachedDataBlock, staticDataBlock],
  hourlyDataBlock,
  'dashboard data loader',
);
bundle = dataResult.bundle;
changed ||= dataResult.changed;

const summaryResult = patchEmbeddedBlock(
  bundle,
  [oldSummaryBlock],
  newSummaryBlock,
  'dashboard summary',
);
bundle = summaryResult.bundle;
changed ||= summaryResult.changed;

const textReplacements = [
  ['The jar, filling', 'Cumulative fees over time'],
  [
    '        <p style="margin: 0; font-size: 17px; line-height: 1.5; color: oklch(0.38 0.012 60); max-width: 58ch; text-wrap: pretty">One wallet on Injective receives a flat 4.0 bps of every request-for-quote fill. Read hour by hour, it becomes a record of when the market was awake — and how much passed through it.</p>\n',
    '',
  ],
  ['Every hour, all {{ kDays }}', 'Every hour in the searchable window'],
  [
    'kBal: this.state.balance == null ? "…" : num(this.state.balance, 0),',
    'kBal: this.state.balance == null ? "…" : "$" + num(this.state.balance, 0),',
  ],
  ['      kFees: num(totalFee, 0),\n', ''],
  ['      kDays: dayKeys.length + " days",\n', ''],
];

for (const [from, to] of textReplacements) {
  const encodedFrom = encodeForEmbeddedJson(from);
  const encodedTo = encodeForEmbeddedJson(to);
  if (bundle.includes(encodedFrom)) {
    bundle = bundle.replace(encodedFrom, encodedTo);
    changed = true;
  } else if (!bundle.includes(encodedTo) && to) {
    throw new Error(`could not find dashboard text: ${from}`);
  }
}

if (changed) {
  await writeFile(bundlePath, bundle);
  console.log('updated dist/index.html dashboard data and balance headline');
} else {
  console.log('dashboard bundle already has the live balance headline');
}
