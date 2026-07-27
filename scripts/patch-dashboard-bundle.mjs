#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const bundlePath = resolve('dist/index.html');
const oldBlock = `  componentDidMount() {
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
const newBlock = `  loadFees = () => {
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

const encodeForEmbeddedJson = (value) =>
  JSON.stringify(value).slice(1, -1);

const bundle = await readFile(bundlePath, 'utf8');
const encodedOldBlock = encodeForEmbeddedJson(oldBlock);
const encodedNewBlock = encodeForEmbeddedJson(newBlock);

if (bundle.includes(encodedNewBlock)) {
  console.log('dashboard bundle already reads the cached fee API');
} else if (!bundle.includes(encodedOldBlock)) {
  throw new Error('could not find the static fee loader in dist/index.html');
} else {
  await writeFile(
    bundlePath,
    bundle.replace(encodedOldBlock, encodedNewBlock),
  );
  console.log('updated dist/index.html to read the cached fee API');
}
