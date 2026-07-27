import {
  FEE_COLLECTOR_ADDRESS,
  USDC_DENOM,
} from './fee-config.js';

export function feeOf(
  txResponse,
  {
    address = FEE_COLLECTOR_ADDRESS,
    denom = USDC_DENOM,
  } = {},
) {
  let microUsdc = 0;

  for (const event of txResponse.events ?? []) {
    if (event.type !== 'transfer') {
      continue;
    }

    let recipient;
    let amount;
    for (const attribute of event.attributes ?? []) {
      if (attribute.key === 'recipient') {
        recipient = attribute.value;
      } else if (attribute.key === 'amount') {
        amount = attribute.value;
      }
    }

    if (recipient !== address || !amount) {
      continue;
    }

    for (const coin of amount.split(',')) {
      if (!coin.endsWith(denom)) {
        continue;
      }

      const value = Number.parseInt(coin.slice(0, -denom.length), 10);
      if (Number.isSafeInteger(value) && value > 0) {
        microUsdc += value;
      }
    }
  }

  return microUsdc;
}

export function toFeeTransfer(txResponse, options) {
  if (
    !txResponse?.txhash ||
    !txResponse?.timestamp ||
    Number(txResponse.code ?? 0) !== 0
  ) {
    return null;
  }

  const feeMicroUsdc = feeOf(txResponse, options);
  if (!feeMicroUsdc) {
    return null;
  }

  return {
    txHash: txResponse.txhash,
    height: Number.parseInt(txResponse.height, 10),
    timestamp: txResponse.timestamp,
    hourUtc: txResponse.timestamp.slice(0, 13),
    feeMicroUsdc,
  };
}
