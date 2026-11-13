export function buildChannelShares(channels) {
  const daily = (channels && channels.daily) || [];
  const days = daily.map((row) => {
    const api = row.api || 0;
    const web = row.web || 0;
    const mobile = row.mobile || 0;
    const total = api + web + mobile;
    return {
      date: row.date,
      api: api,
      web: web,
      mobile: mobile,
      total: total,
      apiShare: total ? api / total : 0,
      webShare: total ? web / total : 0,
      mobileShare: total ? mobile / total : 0,
    };
  });

  // Fee-weighted shares over the last n days (all days when n is omitted).
  function windowShares(n) {
    const slice = n ? days.slice(-n) : days;
    let api = 0;
    let web = 0;
    let mobile = 0;
    slice.forEach((d) => {
      api += d.api;
      web += d.web;
      mobile += d.mobile;
    });
    const total = api + web + mobile;
    return {
      days: slice.length,
      total: total,
      api: total ? api / total : 0,
      web: total ? web / total : 0,
      mobile: total ? mobile / total : 0,
    };
  }

  return {
    since: (channels && channels.since) || null,
    days: days,
    last7: windowShares(7),
    last30: windowShares(30),
    all: windowShares(),
  };
}
