export function buildDailyFees(rows, currentHourKey) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const byHour = new Map(rows.map((row) => [row.key, row]));
  const firstKey = rows[0].key;
  const latestKey = rows[rows.length - 1].key;
  const nowKey =
    typeof currentHourKey === 'string' && currentHourKey > latestKey
      ? currentHourKey
      : latestKey;
  const nowDate = nowKey.slice(0, 10);
  const firstDayMs = Date.parse(`${firstKey.slice(0, 10)}T00:00:00Z`);
  const lastDayMs = Date.parse(`${nowDate}T00:00:00Z`);
  const days = [];

  for (let dayMs = firstDayMs; dayMs <= lastDayMs; dayMs += DAY_MS) {
    const date = new Date(dayMs).toISOString().slice(0, 10);
    const hours = [];
    let fee = 0;
    let n = 0;
    let max = 0;
    let peak = null;
    let complete = date !== nowDate;

    for (let hour = 0; hour < 24; hour += 1) {
      const key = `${date}T${String(hour).padStart(2, '0')}`;
      const row = byHour.get(key);
      const state =
        key < firstKey ? 'before' : key > nowKey ? 'future' : 'ok';
      const entry = {
        hour,
        key,
        state,
        fee: row?.fee ?? 0,
        n: row?.n ?? 0,
        max: row?.max ?? 0,
      };

      hours.push(entry);
      fee += entry.fee;
      n += entry.n;
      max = Math.max(max, entry.max);
      if (state !== 'ok') {
        complete = false;
      } else if (!peak || entry.fee > peak.fee) {
        peak = entry;
      }
    }

    days.push({
      date,
      fee,
      n,
      max,
      peakHour: peak ? peak.hour : null,
      peakFee: peak ? peak.fee : 0,
      complete,
      current: date === nowDate,
      hours,
    });
  }

  return days;
}
