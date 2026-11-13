import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  channelFeesOf,
  channelOfCid,
  feeOf,
  takersOf,
  toFeeTransfer,
} from '../lib/fee-events.js';

const address = 'inj1collector';
const denom = 'factory/usdc';

function transaction(overrides = {}) {
  return {
    txhash: 'ABC123',
    height: '42',
    timestamp: '2026-07-27T21:36:14Z',
    code: 0,
    events: [
      {
        type: 'transfer',
        attributes: [
          { key: 'recipient', value: address },
          {
            key: 'amount',
            value: `1200000${denom},4other`,
          },
        ],
      },
    ],
    ...overrides,
  };
}

test('extracts received USDC amounts from transfer events', () => {
  assert.equal(
    feeOf(transaction(), { address, denom }),
    1_200_000,
  );
});

test('converts successful fee transactions into stored rows', () => {
  assert.deepEqual(
    toFeeTransfer(transaction(), { address, denom }),
    {
      txHash: 'ABC123',
      height: 42,
      timestamp: '2026-07-27T21:36:14Z',
      hourUtc: '2026-07-27T21',
      feeMicroUsdc: 1_200_000,
      takers: [],
      channels: { api: 1_200_000 },
    },
  );
});

test('canonicalizes explorer and LCD transaction hash formats', () => {
  const lcd = toFeeTransfer(
    transaction({ txhash: 'ABC123' }),
    { address, denom },
  );
  const explorer = toFeeTransfer(
    transaction({ txhash: '0xabc123' }),
    { address, denom },
  );

  assert.equal(lcd.txHash, 'ABC123');
  assert.equal(explorer.txHash, 'ABC123');
});

test('ignores failed transactions and unrelated transfers', () => {
  assert.equal(
    toFeeTransfer(transaction({ code: 5 }), {
      address,
      denom,
    }),
    null,
  );
  assert.equal(
    feeOf(transaction(), {
      address: 'inj1someoneelse',
      denom,
    }),
    0,
  );
});

test('reads unique RFQ takers from accept_quote events', () => {
  const fee = transaction();
  const withTakers = transaction({
    events: [
      ...fee.events,
      {
        type: 'wasm-rfq-accept-quote',
        attributes: [
          { key: '_contract_address', value: 'inj1rfq' },
          { key: 'taker', value: 'inj1bob' },
        ],
      },
      {
        type: 'wasm-rfq-accept-quote',
        attributes: [{ key: 'taker', value: 'inj1alice' }],
      },
      {
        type: 'wasm-rfq-accept-quote',
        attributes: [{ key: 'taker', value: 'inj1bob' }],
      },
      {
        type: 'wasm-atomic-rfq-proxy-execution-started',
        attributes: [{ key: 'user', value: 'inj1carol' }],
      },
    ],
  });

  assert.deepEqual(takersOf(withTakers), ['inj1alice', 'inj1bob']);
  assert.deepEqual(
    toFeeTransfer(withTakers, { address, denom }).takers,
    ['inj1alice', 'inj1bob'],
  );
  assert.deepEqual(takersOf(fee), []);
});

function acceptQuote(cid, q, price) {
  return {
    type: 'wasm-rfq-accept-quote',
    attributes: [
      { key: 'taker', value: 'inj1taker' },
      { key: 'cid', value: JSON.stringify(cid) },
      {
        key: 'quotes',
        value: JSON.stringify([{ maker: 'inj1maker', price: String(price) }]),
      },
      {
        key: 'results',
        value: JSON.stringify([{ maker: 'inj1maker', q: String(q) }]),
      },
    ],
  };
}

test('classifies TrueCurrent web and mobile order IDs, everything else as API', () => {
  assert.equal(channelOfCid('"tc-web-510b42ba"'), 'web');
  assert.equal(channelOfCid('tc-mobile-ios-80cd683c'), 'mobile');
  assert.equal(channelOfCid('"rfq-probe-1"'), 'api');
  assert.equal(channelOfCid('null'), 'api');
  assert.equal(channelOfCid(undefined), 'api');
});

test('gives a single-channel transaction its whole fee', () => {
  const tx = transaction({
    events: [...transaction().events, acceptQuote('tc-web-1', 1, 100)],
  });
  assert.deepEqual(toFeeTransfer(tx, { address, denom }).channels, {
    web: 1_200_000,
  });
});

test('splits a mixed transaction by filled notional and keeps every micro-USDC', () => {
  const tx = transaction({
    events: [
      ...transaction().events,
      acceptQuote('tc-mobile-1', 1, 100),
      acceptQuote('abc', 2, 100),
    ],
  });
  const split = channelFeesOf(tx, 1_000_001);
  assert.deepEqual(split, { mobile: 333_333, api: 666_668 });
  assert.equal(split.mobile + split.api, 1_000_001);
});
