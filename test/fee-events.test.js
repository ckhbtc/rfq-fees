import assert from 'node:assert/strict';
import { test } from 'node:test';

import { feeOf, toFeeTransfer } from '../lib/fee-events.js';

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
