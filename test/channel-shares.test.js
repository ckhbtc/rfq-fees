import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildChannelShares } from '../lib/channel-shares.js';

test('returns empty shares before channel tracking starts', () => {
  const shares = buildChannelShares(null);
  assert.equal(shares.since, null);
  assert.deepEqual(shares.days, []);
  assert.deepEqual(shares.all, { days: 0, total: 0, api: 0, web: 0, mobile: 0 });
});

test('computes daily and fee-weighted window shares', () => {
  const shares = buildChannelShares({
    since: '2026-10-01T00:00:00.000Z',
    daily: [
      { date: '2026-10-01', api: 1, web: 2, mobile: 1 },
      { date: '2026-10-02', api: 6, web: 0, mobile: 0 },
    ],
  });

  assert.equal(shares.days[0].apiShare, 0.25);
  assert.equal(shares.days[0].webShare, 0.5);
  assert.equal(shares.days[1].apiShare, 1);
  assert.equal(shares.all.api, 0.7);
  assert.equal(shares.all.web, 0.2);
  assert.equal(shares.all.mobile, 0.1);
  assert.deepEqual(shares.last7, shares.all);
  assert.equal(buildChannelShares({ daily: shares.days }).days[1].total, 6);
});
