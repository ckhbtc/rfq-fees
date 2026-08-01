#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { calculateRolling24 } from '../lib/rolling-fees.js';

const bundlePath = resolve('dist/index.html');
const sourcePath = resolve('The RFQ Ledger.dc.html');
const baseStyleBlock = `<style>
  html, body { margin: 0; padding: 0; background: oklch(0.965 0.008 85); }
  * { box-sizing: border-box; }
  a { color: oklch(0.5 0.19 25); text-decoration: none; border-bottom: 1px solid oklch(0.5 0.19 25 / 0.4); }
  a:hover { color: oklch(0.35 0.14 25); border-bottom-color: oklch(0.35 0.14 25); }
  @keyframes sweep { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
</style>`;
const desktopHeatmapBlock = `      <div style="display: flex; flex-direction: column; gap: 3px">
        <div style="display: flex; gap: 3px; padding-left: 58px">
          <sc-for list="{{ hourHeads }}" as="h" hint-placeholder-count="24">
            <span style="flex: 1 1 0; min-width: 0; font-family: 'IBM Plex Mono', monospace; font-size: 9px; color: oklch(0.55 0.012 60); text-align: center">{{ h }}</span>
          </sc-for>
        </div>
        <sc-for list="{{ grid }}" as="row" hint-placeholder-count="17">
          <div style="display: flex; align-items: center; gap: 3px">
            <span style="flex: 0 0 55px; font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: oklch(0.4 0.012 60); text-align: right; padding-right: 3px">{{ row.label }}</span>
            <sc-for list="{{ row.cells }}" as="c" hint-placeholder-count="24">
              <div sc-camel-on-mouse-enter="{{ c.hover }}" title="{{ c.title }}" style="flex: 1 1 0; min-width: 0; height: 20px; background: {{ c.bg }}; border: {{ c.border }}; cursor: crosshair"></div>
            </sc-for>
          </div>
        </sc-for>
      </div>

`;
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
const snapshotHourlyDataBlock = hourlyDataBlock.replace(
  '      .then((j) => this.setState({ rows: j.rows }))\n',
  '      .then((j) => this.setState({\n        rows: j.rows,\n        snapshotHour: j.snapshotAt.slice(0, 13),\n      }))\n',
);

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
const recordDayMetricsBlock = `
        <div style="display: flex; flex-direction: column; gap: 2px">
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: oklch(0.55 0.012 60)">Record UTC day</span>
          <span style="font-family: 'Instrument Serif', serif; font-size: 34px; line-height: 1.05; color: oklch(0.5 0.19 25)">{{ kRecordDayFee }}</span>
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: oklch(0.55 0.012 60)">{{ recordDayNote }}</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px">
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: oklch(0.55 0.012 60)">Last 24h fees</span>
          <span style="font-family: 'Instrument Serif', serif; font-size: 34px; line-height: 1.05">{{ kLast24h }}</span>
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: oklch(0.55 0.012 60)">{{ last24Note }}</span>
        </div>`;
const rollingRecordMetricsBlock = `
        <div style="display: flex; flex-direction: column; gap: 2px">
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: oklch(0.55 0.012 60)">Record 24h</span>
          <span style="font-family: 'Instrument Serif', serif; font-size: 34px; line-height: 1.05; color: oklch(0.5 0.19 25)">{{ kRecord24h }}</span>
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: oklch(0.55 0.012 60)">{{ record24Note }}</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px">
          <div style="display: flex; align-items: center; gap: 8px; min-height: 13px">
            <span style="font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: oklch(0.55 0.012 60)">Last 24h fees</span>
            <sc-if value="{{ isNewRecord }}" hint-placeholder-val="{{ false }}">
              <span class="new-record-indicator"><span class="new-record-dot"></span>new record</span>
            </sc-if>
          </div>
          <span style="font-family: 'Instrument Serif', serif; font-size: 34px; line-height: 1.05">{{ kLast24h }}</span>
          <span style="font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: oklch(0.55 0.012 60)">{{ last24Note }}</span>
        </div>`;
const recordDaySummaryBlock = newSummaryBlock + recordDayMetricsBlock;
const sixCardSummaryBlock = newSummaryBlock + rollingRecordMetricsBlock;

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

const sourcePage = await readFile(sourcePath, 'utf8');
const sourceStyleBlocks = [
  ...sourcePage.matchAll(/<style>[\s\S]*?<\/style>/g),
].map((match) => match[0]);
const responsiveStyleBlock = sourceStyleBlocks[0];
const recordStateStyleBlock = sourceStyleBlocks[1];
const mobileHeatmapStart = sourcePage.indexOf(
  '      <p class="mobile-swipe-hint">',
);
const mobileHeatmapEnd = sourcePage.indexOf(
  '      <div class="heatmap-readout-row"',
  mobileHeatmapStart,
);
if (
  !responsiveStyleBlock ||
  !recordStateStyleBlock ||
  mobileHeatmapStart === -1 ||
  mobileHeatmapEnd === -1
) {
  throw new Error('could not extract responsive dashboard blocks from source');
}
const mobileHeatmapBlock = sourcePage
  .slice(mobileHeatmapStart, mobileHeatmapEnd)
  .replaceAll('onMouseEnter=', 'sc-camel-on-mouse-enter=')
  .replaceAll('onClick=', 'sc-camel-on-click=');

let bundle = await readFile(bundlePath, 'utf8');
let changed = false;

const dataResult = patchEmbeddedBlock(
  bundle,
  [hourlyDataBlock, cachedDataBlock, staticDataBlock],
  snapshotHourlyDataBlock,
  'dashboard data loader',
);
bundle = dataResult.bundle;
changed ||= dataResult.changed;

const summaryResult = patchEmbeddedBlock(
  bundle,
  [recordDaySummaryBlock, oldSummaryBlock, newSummaryBlock],
  sixCardSummaryBlock,
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

const hourLabelFunction =
  'function hourLabel(k) { return dayLabel(k) + " " + k.slice(11, 13) + ":00"; }\n';
const rollingMetricFunctions =
  `${calculateRolling24.toString()}\n` +
  hourLabelFunction +
  'function hourEndLabel(k) { return dayLabel(k) + " " + k.slice(11, 13) + ":59"; }\n';
const rollingFunctionResult = patchEmbeddedBlock(
  bundle,
  [hourLabelFunction],
  rollingMetricFunctions,
  'rolling 24h metric function',
);
bundle = rollingFunctionResult.bundle;
changed ||= rollingFunctionResult.changed;

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

const recordMetricsResult = patchEmbeddedBlock(
  bundle,
  [
    '    const biggest = rows.reduce((a, r) => (r.max > a.max ? r : a), rows[0]);\n    const latestRow = rows[rows.length - 1];\n    const rolling24 = calculateRolling24(rows);\n    const record24End = rolling24.isNewRecord\n      ? hourLabel(rolling24.recordEndKey) + " UTC · live"\n      : hourEndLabel(rolling24.recordEndKey) + " UTC";\n    const record24Note =\n      hourLabel(rolling24.recordStartKey) + " → " + record24End;\n',
    '    const biggest = rows.reduce((a, r) => (r.max > a.max ? r : a), rows[0]);\n    const recordDay = dayKeys.reduce(\n      (best, day) => (byDay[day].fee > best.fee ? byDay[day] : best),\n      byDay[dayKeys[0]]\n    );\n    const latestRow = rows[rows.length - 1];\n    const latestDay = latestRow.key.slice(0, 10);\n    const recordDayNote = recordDay.key.slice(0, 10) === latestDay\n      ? dayLabel(recordDay.key) + " UTC · partial through " + latestRow.key.slice(11, 13) + ":00"\n      : dayLabel(recordDay.key) + " · 00:00–23:59 UTC";\n    const lastHourMs = Date.parse(latestRow.key + ":00:00Z");\n    const last24Start = lastHourMs - 23 * 60 * 60 * 1000;\n    const last24Fee = rows.reduce(\n      (sum, r) => Date.parse(r.key + ":00:00Z") >= last24Start ? sum + r.fee : sum,\n      0\n    );\n',
    '    const biggest = rows.reduce((a, r) => (r.max > a.max ? r : a), rows[0]);\n',
  ],
  '    const biggest = rows.reduce((a, r) => (r.max > a.max ? r : a), rows[0]);\n    const latestRow = rows[rows.length - 1];\n    const currentHourKey = this.state.snapshotHour || latestRow.key;\n    const rolling24 = calculateRolling24(rows, currentHourKey);\n    const record24End = rolling24.isNewRecord\n      ? hourLabel(rolling24.recordEndKey) + " UTC · live"\n      : hourEndLabel(rolling24.recordEndKey) + " UTC";\n    const record24Note =\n      hourLabel(rolling24.recordStartKey) + " → " + record24End;\n',
  'rolling record fee metrics',
);
bundle = recordMetricsResult.bundle;
changed ||= recordMetricsResult.changed;

const annotationSetupResult = patchEmbeddedBlock(
  bundle,
  [
    '    const steepest = pts.reduce((a, p, i) => (i > 0 && p.r.fee > a.r.fee ? p : a), pts[0]);\n    const marks = [\n',
    '    const steepest = pts.reduce((a, p, i) => (i > 0 && p.r.fee > a.r.fee ? p : a), pts[0]);\n    const endPoint = pts[pts.length - 1];\n    const annotationsCrowded =\n      W - steepest.x < 240 && Math.abs(steepest.y - endPoint.y) < 54;\n    const steepestLabelOffset = annotationsCrowded ? 18 : -26;\n    const endLabelOffset = annotationsCrowded ? -44 : -26;\n    const labelTop = (point, offset) =>\n      "calc(" +\n      ((point.y / H) * 100).toFixed(2) +\n      "% " +\n      (offset < 0 ? "- " + Math.abs(offset) : "+ " + offset) +\n      "px)";\n    const marks = [\n',
  ],
  '    const steepest = pts.reduce((a, p, i) => (i > 0 && p.r.fee > a.r.fee ? p : a), pts[0]);\n    const endPoint = pts[pts.length - 1];\n    const annotationsCrowded =\n      W - steepest.x < 240 && Math.abs(steepest.y - endPoint.y) < 54;\n    const steepestLabelOffset = annotationsCrowded ? 18 : -26;\n    const endLabelOffset = annotationsCrowded ? -44 : -26;\n    const peakLabelTransform = annotationsCrowded\n      ? "translateX(-100%)"\n      : "translateX(-50%)";\n    const labelTop = (point, offset) =>\n      "calc(" +\n      ((point.y / H) * 100).toFixed(2) +\n      "% " +\n      (offset < 0 ? "- " + Math.abs(offset) : "+ " + offset) +\n      "px)";\n    const marks = [\n',
  'adaptive annotation setup',
);
bundle = annotationSetupResult.bundle;
changed ||= annotationSetupResult.changed;

const steepestAnnotationResult = patchEmbeddedBlock(
  bundle,
  [
    '        labelTop: "calc(" + ((steepest.y / H) * 100).toFixed(2) + "% - 26px)",\n        text: "steepest hour',
    '        labelTop: "calc(" + ((steepest.y / H) * 100).toFixed(2) + "% - 26px)",\n        labelTransform: "translateX(-50%)",\n        text: "steepest hour',
    '        labelTop: labelTop(steepest, steepestLabelOffset),\n        labelTransform: "translateX(-50%)",\n        text: "steepest hour',
  ],
  '        labelTop: labelTop(steepest, steepestLabelOffset),\n        labelTransform: peakLabelTransform,\n        text: "steepest hour',
  'adaptive peak-hour annotation',
);
bundle = steepestAnnotationResult.bundle;
changed ||= steepestAnnotationResult.changed;

const endAnnotationResult = patchEmbeddedBlock(
  bundle,
  [
    '        top: ((pts[pts.length - 1].y / H) * 100).toFixed(2) + "%",\n        labelTop: "calc(" + ((pts[pts.length - 1].y / H) * 100).toFixed(2) + "% - 26px)",\n        text: num(totalFee, 0) + " USDC",',
    '        top: ((pts[pts.length - 1].y / H) * 100).toFixed(2) + "%",\n        labelTop: "calc(" + ((pts[pts.length - 1].y / H) * 100).toFixed(2) + "% - 26px)",\n        labelTransform: "translateX(-100%)",\n        text: num(totalFee, 0) + " USDC",',
  ],
  '        top: ((endPoint.y / H) * 100).toFixed(2) + "%",\n        labelTop: labelTop(endPoint, endLabelOffset),\n        labelTransform: "translateX(-100%)",\n        text: num(totalFee, 0) + " USDC",',
  'adaptive cumulative-total annotation',
);
bundle = endAnnotationResult.bundle;
changed ||= endAnnotationResult.changed;

const recordMetricValuesResult = patchEmbeddedBlock(
  bundle,
  [
    '      kAvgFill: usd(totalFee / BPS / fills),\n      kRecord24h: "$" + num(rolling24.recordFee, 0),\n      record24Note,\n      kLast24h: "$" + num(rolling24.currentFee, 0),\n      last24Note: "rolling 24h · through " + hourLabel(latestRow.key) + " UTC",\n      isNewRecord: rolling24.isNewRecord,\n',
    '      kAvgFill: usd(totalFee / BPS / fills),\n      kRecordDayFee: "$" + num(recordDay.fee, 0),\n      recordDayNote,\n      kLast24h: "$" + num(last24Fee, 0),\n      last24Note: "rolling 24h · through " + hourLabel(latestRow.key) + " UTC",\n',
    '      kAvgFill: usd(totalFee / BPS / fills),\n',
  ],
  '      kAvgFill: usd(totalFee / BPS / fills),\n      kRecord24h: "$" + num(rolling24.recordFee, 0),\n      record24Note,\n      kLast24h: "$" + num(rolling24.currentFee, 0),\n      last24Note: "rolling 24h · through " + hourLabel(currentHourKey) + " UTC",\n      isNewRecord: rolling24.isNewRecord,\n',
  'rolling record fee metric values',
);
bundle = recordMetricValuesResult.bundle;
changed ||= recordMetricValuesResult.changed;

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

const recordStateStyleResult = patchEmbeddedBlock(
  bundle,
  ['</style>\n</helmet>'],
  `</style>\n${recordStateStyleBlock}\n</helmet>`,
  'new-record indicator styles',
);
bundle = recordStateStyleResult.bundle;
changed ||= recordStateStyleResult.changed;

const styleResult = patchEmbeddedBlock(
  bundle,
  [baseStyleBlock],
  responsiveStyleBlock,
  'responsive dashboard styles',
);
bundle = styleResult.bundle;
changed ||= styleResult.changed;

const heatmapResult = patchEmbeddedBlock(
  bundle,
  [desktopHeatmapBlock],
  mobileHeatmapBlock,
  'mobile heatmap',
);
bundle = heatmapResult.bundle;
changed ||= heatmapResult.changed;

const xLabelsResult = patchEmbeddedBlock(
  bundle,
  [
    '    const xLabels = dayKeys.map((d, i) => (dayKeys.length > 12 && i % 2 ? "" : dayLabel(d + "T00")));\n',
  ],
  '    const labelStep = Math.max(1, Math.ceil((dayKeys.length - 1) / 4));\n    const xLabels = dayKeys.map((d, i) =>\n      i === 0 || i === dayKeys.length - 1 || i % labelStep === 0\n        ? dayLabel(d + "T00")\n        : ""\n    );\n',
  'responsive cumulative chart labels',
);
bundle = xLabelsResult.bundle;
changed ||= xLabelsResult.changed;

const readoutResult = patchEmbeddedBlock(
  bundle,
  [
    '      : "Hover any cell. Each row is a day, each column an hour, UTC. Hatched cells are hours with no RFQ activity at all.";\n',
  ],
  '      : "Tap or hover any cell. Each row is a day, each column an hour, UTC. Hatched cells are hours with no RFQ activity at all.";\n',
  'mobile heatmap readout',
);
bundle = readoutResult.bundle;
changed ||= readoutResult.changed;

const textReplacements = [
  ['The jar, filling', 'Cumulative fees over time'],
  [
    '        <p style="margin: 0; font-size: 17px; line-height: 1.5; color: oklch(0.38 0.012 60); max-width: 58ch; text-wrap: pretty">One wallet on Injective receives a flat 4.0 bps of every request-for-quote fill. Read hour by hour, it becomes a record of when the market was awake — and how much passed through it.</p>\n',
    '',
  ],
  [
    '<div style="background: oklch(0.965 0.008 85); color: oklch(0.22 0.012 60); font-family: \'IBM Plex Sans\', system-ui, sans-serif; min-height: 100vh; padding: 44px 32px 72px; display: flex; justify-content: center">',
    '<div class="page-frame" style="background: oklch(0.965 0.008 85); color: oklch(0.22 0.012 60); font-family: \'IBM Plex Sans\', system-ui, sans-serif; min-height: 100vh; padding: 44px 32px 72px; display: flex; justify-content: center">',
  ],
  [
    '  <div style="width: 100%; max-width: 1120px; display: flex; flex-direction: column">',
    '  <div class="page-shell" style="width: 100%; max-width: 1120px; display: flex; flex-direction: column">',
  ],
  [
    '    <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 20px; flex-wrap: wrap; padding-bottom: 8px; border-bottom: 3px double oklch(0.22 0.012 60)">',
    '    <div class="masthead" style="display: flex; align-items: baseline; justify-content: space-between; gap: 20px; flex-wrap: wrap; padding-bottom: 8px; border-bottom: 3px double oklch(0.22 0.012 60)">',
  ],
  [
    '      <span style="font-family: \'IBM Plex Mono\', monospace; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: oklch(0.5 0.012 60)">Injective mainnet',
    '      <span class="masthead-source" style="font-family: \'IBM Plex Mono\', monospace; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: oklch(0.5 0.012 60)">Injective mainnet',
  ],
  [
    '    <div style="display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 40px; padding: 30px 0 26px; border-bottom: 1px solid oklch(0.82 0.012 60); align-items: start">',
    '    <div class="hero-layout" style="display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 40px; padding: 30px 0 26px; border-bottom: 1px solid oklch(0.82 0.012 60); align-items: start">',
  ],
  [
    '        <h1 style="margin: 0; font-family: \'Instrument Serif\', Georgia, serif;',
    '        <h1 class="hero-title" style="margin: 0; font-family: \'Instrument Serif\', Georgia, serif;',
  ],
  [
    '      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 22px 26px; padding-top: 8px">',
    '      <div class="metrics-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 22px 26px; padding-top: 8px">',
  ],
  [
    '    <div style="padding: 34px 0 30px; border-bottom: 1px solid oklch(0.82 0.012 60); display: flex; flex-direction: column; gap: 18px">',
    '    <div class="figure-section cumulative-section" style="padding: 34px 0 30px; border-bottom: 1px solid oklch(0.82 0.012 60); display: flex; flex-direction: column; gap: 18px">',
  ],
  [
    '      <div style="display: flex; gap: 12px">',
    '      <div class="cumulative-chart" style="display: flex; gap: 12px">',
  ],
  [
    '          <div style="display: flex">\n            <sc-for list="{{ xLabels }}"',
    '          <div class="cumulative-x-labels" style="display: flex">\n            <sc-for list="{{ xLabels }}"',
  ],
  [
    '              <div style="position: absolute; left: {{ m.left }}; top: {{ m.labelTop }}; transform: translateX(-50%); pointer-events: none; text-align: center; animation: fadein 600ms ease-out both 1700ms">',
    '              <div style="position: absolute; left: {{ m.left }}; top: {{ m.labelTop }}; transform: {{ m.labelTransform }}; pointer-events: none; text-align: center; animation: fadein 600ms ease-out both 1700ms">',
  ],
  [
    '    <div style="padding: 34px 0 30px; border-bottom: 1px solid oklch(0.82 0.012 60); display: flex; flex-direction: column; gap: 16px">',
    '    <div class="figure-section heatmap-section" style="padding: 34px 0 30px; border-bottom: 1px solid oklch(0.82 0.012 60); display: flex; flex-direction: column; gap: 16px">',
  ],
  [
    '      <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; padding-top: 4px">',
    '      <div class="heatmap-readout-row" style="display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; padding-top: 4px">',
  ],
  [
    '    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 32px; padding: 32px 0 30px; border-bottom: 3px double oklch(0.22 0.012 60)">',
    '    <div class="notes-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 32px; padding: 32px 0 30px; border-bottom: 3px double oklch(0.22 0.012 60)">',
  ],
  [
    '    <p style="margin: 18px 0 0; font-family: \'IBM Plex Mono\', monospace;',
    '    <p class="method-note" style="margin: 18px 0 0; font-family: \'IBM Plex Mono\', monospace;',
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
