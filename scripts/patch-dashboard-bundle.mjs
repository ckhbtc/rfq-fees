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

const headingResult = patchEmbeddedBlock(
  bundle,
  [
    'Every hour in the searchable window',
    'Every hour, all {{ kDays }}',
  ],
  'Hourly fee activity',
  'hourly activity heading',
);
bundle = headingResult.bundle;
changed ||= headingResult.changed;

const heroResult = patchEmbeddedBlock(
  bundle,
  ['{{ kVol }} traded to date', 'eleven million dollars'],
  '{{ heroVolume }}',
  'dynamic hero volume',
);
bundle = heroResult.bundle;
changed ||= heroResult.changed;

const simpleNumberFormatter =
  'function num(v, dp) { return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }); }\nfunction dayLabel(k) { return MON[+k.slice(5, 7) - 1] + " " + +k.slice(8, 10); }';
const wordVolumeFormatter =
  'function num(v, dp) { return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }); }\nconst SMALL_NUMBER_WORDS = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];\nconst TENS_WORDS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];\nfunction wholeNumberWords(value) {\n  const n = Math.floor(value);\n  if (n < 20) return SMALL_NUMBER_WORDS[n];\n  if (n < 100) return TENS_WORDS[Math.floor(n / 10)] + (n % 10 ? "-" + SMALL_NUMBER_WORDS[n % 10] : "");\n  if (n < 1000) return SMALL_NUMBER_WORDS[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + wholeNumberWords(n % 100) : "");\n  return num(n, 0);\n}\nfunction volumeWords(value) {\n  if (value >= 1e9) return wholeNumberWords(value / 1e9) + " billion dollars";\n  if (value >= 1e6) return wholeNumberWords(value / 1e6) + " million dollars";\n  if (value >= 1e3) return wholeNumberWords(value / 1e3) + " thousand dollars";\n  return wholeNumberWords(value) + " dollars";\n}\nfunction dayLabel(k) { return MON[+k.slice(5, 7) - 1] + " " + +k.slice(8, 10); }';
const formatterResult = patchEmbeddedBlock(
  bundle,
  [simpleNumberFormatter],
  wordVolumeFormatter,
  'word-based volume formatter',
);
bundle = formatterResult.bundle;
changed ||= formatterResult.changed;

const heroValueLine =
  '      heroVolume: volumeWords(totalFee / BPS),\n';
const encodedHeroValueLine = encodeForEmbeddedJson(heroValueLine);
while (
  bundle.includes(encodedHeroValueLine + encodedHeroValueLine)
) {
  bundle = bundle.replace(
    encodedHeroValueLine + encodedHeroValueLine,
    encodedHeroValueLine,
  );
  changed = true;
}
const heroValueResult = patchEmbeddedBlock(
  bundle,
  ['      kVol: usd(totalFee / BPS),\n'],
  heroValueLine + '      kVol: usd(totalFee / BPS),\n',
  'dynamic hero volume value',
);
bundle = heroValueResult.bundle;
changed ||= heroValueResult.changed;

const oldMethodNote =
  'Method \u2014 every USDC transfer received by the fee collector was read from Injective mainnet transaction events and bucketed by hour: {{ methodCount }}. The 4.0 bps rate was verified fill by fill against the quoted price and quantity in each accept_quote message, so notional is derived exactly rather than estimated. The window begins where public archive nodes stop keeping a searchable transaction index; the wallet predates it.';
const newMethodNote =
  "Method: every USDC transfer received by the fee collector was read from Injective mainnet transaction events and bucketed by hour: {{ methodCount }}. The 4.0 bps rate was verified fill by fill against the quoted price and quantity in each accept_quote message, so notional is derived exactly rather than estimated. History begins with the collector's earliest transaction retained by the Injective explorer index.";
const methodResult = patchEmbeddedBlock(
  bundle,
  [oldMethodNote],
  newMethodNote,
  'dashboard method note',
);
bundle = methodResult.bundle;
changed ||= methodResult.changed;

const textReplacements = [
  ['The jar, filling', 'Cumulative fees over time'],
  [
    '        <p style="margin: 0; font-size: 17px; line-height: 1.5; color: oklch(0.38 0.012 60); max-width: 58ch; text-wrap: pretty">One wallet on Injective receives a flat 4.0 bps of every request-for-quote fill. Read hour by hour, it becomes a record of when the market was awake — and how much passed through it.</p>\n',
    '',
  ],
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
