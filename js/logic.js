/* Month grid, summaries, and the per-ticker daily-close checklist. */
(function (root) {
  const ST = root.StockTracker = root.StockTracker || {};

  /**
   * Same rules as the original SOFI card.
   * Hard stop is checked before get-out. A close equal to a level does not count as a hit.
   * Returns null when this ticker is not using the checklist.
   */
  ST.computeStatus = function (ticker) {
    const order = ticker.orderStatus;
    if (order !== "waiting" && order !== "filled" && order !== "cancelled") return null;
    if (order === "waiting" || order === "cancelled") return { text: "Waiting", kind: "wait" };
    const close = typeof ticker.close === "number" ? ticker.close : null;
    const getOut = typeof ticker.getOut === "number" ? ticker.getOut : null;
    const hardStop = typeof ticker.hardStop === "number" ? ticker.hardStop : null;
    if (close == null) return { text: "Filled — hold", kind: "hold" };
    if (hardStop != null && close < hardStop) return { text: "Hard stop hit", kind: "stop" };
    if (getOut != null && close < getOut) return { text: "Get-out hit (close under get-out)", kind: "exit" };
    return { text: "Filled — hold", kind: "hold" };
  };

  ST.monthWeeks = function (year, month) {
    const last = new Date(year, month + 1, 0);
    let cursor = ST.startOfWeek(new Date(year, month, 1));
    const weeks = [];
    while (cursor <= last) {
      const days = [];
      for (let i = 0; i < 7; i++) {
        days.push({
          date: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
          key: ST.dateKey(cursor),
          inMonth: cursor.getMonth() === month && cursor.getFullYear() === year
        });
        cursor = ST.addDays(cursor, 1);
      }
      weeks.push(days);
    }
    return weeks;
  };

  function centsOf(days, key) {
    const entry = days[key];
    if (!entry || typeof entry.pnl !== "number" || !Number.isFinite(entry.pnl)) return null;
    return Math.round(entry.pnl * 100);
  };

  ST.summarizeMonth = function (days, year, month, today) {
    const weeks = ST.monthWeeks(year, month);
    let monthCents = 0;
    let wins = 0;
    let losses = 0;
    let flats = 0;
    let best = null;
    let worst = null;

    const weekRows = weeks.map(function (week) {
      const inMonth = week.filter(function (day) { return day.inMonth; });
      let totalCents = 0;
      let logged = 0;
      inMonth.forEach(function (day) {
        const cents = centsOf(days, day.key);
        if (cents == null) return;
        logged += 1;
        totalCents += cents;
        monthCents += cents;
        if (cents > 0) wins += 1;
        else if (cents < 0) losses += 1;
        else flats += 1;
        const pnl = cents / 100;
        if (!best || pnl > best.pnl || (pnl === best.pnl && day.key < best.key)) best = { key: day.key, pnl: pnl };
        if (!worst || pnl < worst.pnl || (pnl === worst.pnl && day.key < worst.key)) worst = { key: day.key, pnl: pnl };
      });
      return {
        label: inMonth.length ? ST.formatWeekLabel(inMonth[0].date, inMonth[inMonth.length - 1].date) : "",
        total: totalCents / 100,
        logged: logged
      };
    });

    const ytd = summarizeYear(days, year, today);
    return {
      monthTotal: monthCents / 100,
      wins: wins,
      losses: losses,
      flats: flats,
      best: best,
      worst: worst,
      weeks: weekRows,
      ytdTotal: ytd.total,
      ytdLabel: ytd.label
    };
  };

  function summarizeYear(days, year, today) {
    const current = today.getFullYear() === year;
    const start = year + "-01-01";
    const end = current ? ST.dateKey(today) : year + "-12-31";
    let totalCents = 0;
    Object.keys(days).forEach(function (key) {
      if (key < start || key > end) return;
      const cents = centsOf(days, key);
      if (cents == null) return;
      totalCents += cents;
    });
    return {
      total: totalCents / 100,
      label: current ? "Year to date" : year + " total"
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
