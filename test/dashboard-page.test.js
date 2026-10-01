import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const sourceUrl = new URL('../The RFQ Ledger.dc.html', import.meta.url);

// Evaluates the page's logic script outside the browser so render-path errors
// (bad references, ordering mistakes) fail here instead of on fees.inj.so.
async function loadComponent() {
  const source = await readFile(sourceUrl, 'utf8');
  const open = source.indexOf('>', source.indexOf('<script type="text/x-dc" data-dc-script')) + 1;
  const close = source.indexOf('</script>', open);
  class DCLogic {
    constructor() {
      this.props = {};
    }
    setState() {}
    forceUpdate() {}
  }
  return new Function('DCLogic', `${source.slice(open, close)}\nreturn Component;`)(DCLogic);
}

function hourlyRows() {
  const rows = [];
  for (let day = 1; day <= 12; day += 1) {
    for (let hour = 0; hour < 24; hour += 3) {
      const key = `2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}`;
      rows.push({ key, n: day + hour, fee: day * 1.5 + hour / 10, max: day / 2 });
    }
  }
  return rows;
}

function render(Component, state) {
  const component = new Component();
  component.props = {};
  Object.assign(component.state, state);
  return component.renderVals();
}

test('page logic renders days, hovers and traders without throwing', async () => {
  const Component = await loadComponent();
  const base = {
    rows: hourlyRows(),
    snapshotAt: '2026-09-12T21:06:00Z',
    traders: {
      since: '2026-09-11T00:00:00.000Z',
      daily: [
        { date: '2026-09-11', unique: 7 },
        { date: '2026-09-12', unique: 3 },
      ],
      total: 9,
    },
  };

  const vals = render(Component, base);
  assert.equal(vals.tradersToday, '3');
  assert.match(vals.todayNote, / · 3 traders$/);
  assert.deepEqual(
    vals.ledger.slice(0, 3).map((row) => row.traders),
    ['3', '7', '–'],
  );
  assert.equal(vals.ledger[2].tradersTitle, 'Trader tracking began Sep 11');
  assert.ok(vals.roParts.some((part) => part.k === 'Traders' && part.v === '3'));

  for (const hover of [{ day: 0, hour: null }, { day: 3, hour: 6 }, { day: 11, hour: 23 }]) {
    for (const range of ['30D', '90D', 'All']) {
      for (const metric of ['fees', 'notional', 'fills']) {
        const out = render(Component, { ...base, hover, range, metric });
        assert.ok(out.bars.length > 0);
      }
    }
  }
  const untracked = render(Component, { ...base, hover: { day: 0, hour: null } });
  assert.ok(untracked.roParts.some((part) => part.k === 'Traders' && part.v === 'not tracked'));
});

test('page logic renders before trader tracking starts', async () => {
  const Component = await loadComponent();
  const vals = render(Component, {
    rows: hourlyRows(),
    snapshotAt: '2026-09-12T21:06:00Z',
    traders: null,
  });

  assert.equal(vals.tradersToday, '–');
  assert.equal(vals.ledger[0].tradersTitle, 'Trader tracking has not started');
  assert.doesNotMatch(vals.todayNote, /traders/);
});
