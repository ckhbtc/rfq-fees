import assert from 'node:assert/strict';
import { test } from 'node:test';

import { feeOf, takersOf, toFeeTransfer } from '../lib/fee-events.js';

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
