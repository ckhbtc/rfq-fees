import {
  FEE_COLLECTOR_ADDRESS,
  USDC_DENOM,
} from './fee-config.js';

function canonicalTxHash(txHash) {
  return String(txHash).replace(/^0x/i, '').toUpperCase();
}

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

// The RFQ contract names the taker on every accepted quote, whether the trade
// was sent directly, through an AuthZ relayer, or via the atomic proxy.
export function takersOf(txResponse) {
  const takers = new Set();
  for (const event of txResponse.events ?? []) {
    if (event.type !== 'wasm-rfq-accept-quote') {
      continue;
    }
    for (const attribute of event.attributes ?? []) {
      if (attribute.key === 'taker' && attribute.value) {
        takers.add(attribute.value);
      }
    }
  }
  return [...takers].sort();
}

export const CHANNELS = ['api', 'web', 'mobile'];

// TrueCurrent tags its RFQ trades with a tc-web- or tc-mobile- client order
// ID; every other accepted quote is counted as an API trade.
export function channelOfCid(cid) {
  const value = String(cid ?? '').replace(/^"|"$/g, '');
  if (value.startsWith('tc-web')) {
    return 'web';
  }
  if (value.startsWith('tc-mobile')) {
    return 'mobile';
  }
  return 'api';
}

function acceptedNotional(attributes) {
  let results = [];
  let quotes = [];
  try {
    results = JSON.parse(attributes.results ?? '[]');
    quotes = JSON.parse(attributes.quotes ?? '[]');
  } catch {
    return 0;
  }
  let notional = 0;
  for (const fill of Array.isArray(results) ? results : []) {
    const quote =
      quotes.find((candidate) => candidate.maker === fill.maker) ?? quotes[0];
    const value = Number(fill.q) * Number(quote?.price);
    if (Number.isFinite(value) && value > 0) {
      notional += value;
    }
  }
  return notional;
}

// Splits a transaction's fee across channels by each accepted quote's filled
// notional (the fee is a flat rate). Whole micro-USDC only; the rounding
// remainder goes to the largest channel so the parts always sum to the fee.
export function channelFeesOf(txResponse, feeMicroUsdc) {
  const weights = {};
  let accepts = 0;
  for (const event of txResponse.events ?? []) {
    if (event.type !== 'wasm-rfq-accept-quote') {
      continue;
    }
    const attributes = {};
    for (const attribute of event.attributes ?? []) {
      attributes[attribute.key] = attribute.value;
    }
    const channel = channelOfCid(attributes.cid);
    weights[channel] = (weights[channel] ?? 0) + acceptedNotional(attributes);
    accepts += 1;
  }

  const channels = Object.keys(weights);
  if (channels.length <= 1) {
    return { [channels[0] ?? 'api']: feeMicroUsdc };
  }

  let total = 0;
  for (const channel of channels) {
    total += weights[channel];
  }
  const split = {};
  let assigned = 0;
  let largest = channels[0];
  for (const channel of channels) {
    const share = total > 0 ? weights[channel] / total : 1 / accepts;
    split[channel] = Math.floor(feeMicroUsdc * share);
    assigned += split[channel];
    if (split[channel] > split[largest]) {
      largest = channel;
    }
  }
  split[largest] += feeMicroUsdc - assigned;
  return split;
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
    txHash: canonicalTxHash(txResponse.txhash),
    height: Number.parseInt(txResponse.height, 10),
    timestamp: txResponse.timestamp,
    hourUtc: txResponse.timestamp.slice(0, 13),
    feeMicroUsdc,
    takers: takersOf(txResponse),
    channels: channelFeesOf(txResponse, feeMicroUsdc),
  };
}
