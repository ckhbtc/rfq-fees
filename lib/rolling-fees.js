export function calculateRolling24(rows, currentHourKey) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const HOUR_MS = 60 * 60 * 1000;
  const FEE_EPSILON = 0.000001;
  let startIndex = 0;
  let windowFee = 0;
  let record = null;
  let previousRecord = null;
  const latestHourKey = rows[rows.length - 1].key;
  const effectiveCurrentHourKey =
    typeof currentHourKey === 'string' && currentHourKey > latestHourKey
      ? currentHourKey
      : latestHourKey;

  for (let endIndex = 0; endIndex < rows.length; endIndex += 1) {
    const endRow = rows[endIndex];
    const endMs = Date.parse(`${endRow.key}:00:00Z`);
    const startMs = endMs - 23 * HOUR_MS;
    windowFee += endRow.fee;

    while (
      startIndex <= endIndex &&
      Date.parse(`${rows[startIndex].key}:00:00Z`) < startMs
    ) {
      windowFee -= rows[startIndex].fee;
      startIndex += 1;
    }

    const candidate = {
      fee: windowFee,
      startKey: new Date(startMs).toISOString().slice(0, 13),
      endKey: endRow.key,
    };

    if (!record || candidate.fee > record.fee) {
      record = candidate;
    }
    if (
      endRow.key < effectiveCurrentHourKey &&
      (!previousRecord || candidate.fee > previousRecord.fee)
    ) {
      previousRecord = candidate;
    }
  }

  const currentEndMs = Date.parse(`${effectiveCurrentHourKey}:00:00Z`);
  const currentStartMs = currentEndMs - 23 * HOUR_MS;
  const currentFee = rows.reduce((sum, row) => {
    const rowMs = Date.parse(`${row.key}:00:00Z`);
    return rowMs >= currentStartMs && rowMs <= currentEndMs
      ? sum + row.fee
      : sum;
  }, 0);
  const current = {
    fee: currentFee,
    startKey: new Date(currentStartMs).toISOString().slice(0, 13),
    endKey: effectiveCurrentHourKey,
  };
  if (current.fee > record.fee) {
    record = current;
  }

  return {
    currentFee: current.fee,
    previousRecordFee: previousRecord?.fee ?? current.fee,
    recordFee: record.fee,
    recordStartKey: record.startKey,
    recordEndKey: record.endKey,
    isNewRecord: Boolean(
      previousRecord && current.fee > previousRecord.fee + FEE_EPSILON,
    ),
  };
}
