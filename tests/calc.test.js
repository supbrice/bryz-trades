const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const calc = require("../js/calc.js");

function closed(overrides) {
  return Object.assign({
    id: "t1",
    symbol: "SOFI",
    direction: "long",
    status: "closed",
    quantity: 5,
    entryPrice: 10,
    avgCost: null,
    exitPrice: 12,
    entryDate: "2026-01-02",
    exitDate: "2026-01-15",
    fees: 0,
    strategy: ""
  }, overrides);
}

test("long and short gross and net use the documented formulas", () => {
  assert.equal(calc.grossPnlCents("long", 10, 12, 5), 1000n);
  assert.equal(calc.netPnlCents(1000n, 1), 900n);
  assert.equal(calc.grossPnlCents("short", 10, 8, 5), 1000n);
  assert.equal(calc.netPnlCents(1000n, 1), 900n);
  assert.equal(calc.grossPnlCents("short", 10, 12, 2), -400n);
  assert.equal(calc.netPnlCents(-400n, 0.5), -450n);

  const long = calc.tradeResult(closed({ fees: 1 }));
  assert.equal(long.grossCents, 1000n);
  assert.equal(long.netCents, 900n);
  assert.equal(long.included, true);
  assert.equal(long.returnBasis, calc.LONG_RETURN_BASIS);

  const short = calc.tradeResult(closed({
    id: "s1",
    direction: "short",
    entryPrice: 10,
    exitPrice: 8,
    quantity: 5,
    fees: 1
  }));
  assert.equal(short.grossCents, 1000n);
  assert.equal(short.netCents, 900n);
  assert.equal(short.returnBasis, calc.SHORT_RETURN_BASIS);
});

test("fractional shares, breakeven, fees, and missing values", () => {
  assert.equal(calc.grossPnlCents("long", 10.25, 10.5, 0.5), 13n);
  assert.equal(calc.grossPnlCents("long", 10, 10.1, 0.1), 1n);
  const even = calc.tradeResult(closed({ exitPrice: 10, quantity: 1, fees: 0 }));
  assert.equal(even.netCents, 0n);
  const feeEven = calc.tradeResult(closed({ exitPrice: 10, quantity: 1, fees: 0.01 }));
  assert.equal(feeEven.netCents, -1n);
  const grossWinNetLoss = calc.tradeResult(closed({ exitPrice: 11, quantity: 1, fees: 2 }));
  assert.equal(grossWinNetLoss.grossCents, 100n);
  assert.equal(grossWinNetLoss.netCents, -100n);

  assert.equal(calc.grossPnlCents("long", "nope", 12, 1), null);
  assert.equal(calc.tradeResult(closed({ exitPrice: null })).reason, "incomplete");
  assert.equal(calc.tradeResult(closed({ quantity: null })).included, false);
  assert.equal(calc.tradeResult(closed({ fees: -1 })).reason, "incomplete");
  const assumed = calc.tradeResult(closed({ fees: null, quantity: 1, exitPrice: 11 }));
  assert.equal(assumed.feesAssumedZero, true);
  assert.equal(assumed.netCents, 100n);
});

test("long return uses entry cost and short return uses proceeds, not margin", () => {
  const long = calc.tradeResult(closed({ quantity: 2, entryPrice: 20, exitPrice: 21, fees: 0 }));
  assert.equal(long.basisCents, 4000n);
  assert.equal(long.returnPercent, "5.00%");
  assert.equal(calc.longCostBasisCents(20, 2), 4000n);

  const short = calc.tradeResult(closed({
    direction: "short",
    quantity: 2,
    entryPrice: 20,
    exitPrice: 19.5,
    fees: 0
  }));
  assert.equal(short.netCents, 100n);
  assert.equal(short.basisCents, calc.shortProceedsBasisCents(20, 2));
  assert.equal(short.basisCents, 4000n);
  assert.equal(short.returnPercent, "2.50%");
  assert.notEqual(short.returnPercent, "5.00%");

  const both = calc.tradeResult(closed({ entryPrice: 10, avgCost: 8, exitPrice: 12, quantity: 1, fees: 0 }));
  assert.equal(both.grossCents, 200n);
  assert.equal(both.basisCents, 1000n);
  assert.equal(both.entrySource, "entry-price");

  const fallback = calc.tradeResult(closed({ entryPrice: null, avgCost: 8, exitPrice: 10, quantity: 1, fees: 0 }));
  assert.equal(fallback.grossCents, 200n);
  assert.equal(fallback.entrySource, "average-cost");

  assert.equal(calc.tradeResult(closed({ entryPrice: 0, exitPrice: 1, quantity: 1 })).returnPercent, null);
  assert.equal(calc.tradeResult(closed({ quantity: 0, exitPrice: 10 })).returnPercent, null);
});

test("only dated closed trades are realized", () => {
  const open = closed({ id: "o", status: "open", exitPrice: 100, quantity: 100 });
  const cancelled = closed({ id: "c", status: "cancelled", exitPrice: 100, quantity: 100 });
  const undated = closed({ id: "u", exitDate: "", exitPrice: 12, quantity: 1, fees: 0 });
  const realized = closed({ id: "r", exitPrice: 11, quantity: 1, fees: 0 });
  const metrics = calc.analyze({ trades: [open, cancelled, undated, realized, realized] });
  assert.equal(metrics.excludedOpen, 1);
  assert.equal(metrics.excludedCancelled, 1);
  assert.equal(metrics.undated, 1);
  assert.equal(metrics.undatedNetCents, 200n);
  assert.equal(metrics.tradeCount, 1);
  assert.equal(metrics.realizedNetCents, 100n);
});

test("win rate, averages, profit factor, and drawdown", () => {
  const trades = [
    closed({ id: "a", exitDate: "2026-01-02", exitPrice: 12, quantity: 1, fees: 0, symbol: "AAA", strategy: "breakout" }),
    closed({ id: "b", exitDate: "2026-01-03", exitPrice: 11, quantity: 1, fees: 0, symbol: "AAA", strategy: "breakout" }),
    closed({ id: "c", exitDate: "2026-01-04", exitPrice: 9, quantity: 1, fees: 0, symbol: "BBB", strategy: "" }),
    closed({ id: "d", exitDate: "2026-01-05", exitPrice: 10, quantity: 1, fees: 0, symbol: "BBB", strategy: "" })
  ];
  const metrics = calc.analyze({ trades: trades });
  assert.equal(metrics.wins, 2);
  assert.equal(metrics.losses, 1);
  assert.equal(metrics.breakevens, 1);
  assert.equal(metrics.winRate, "50.0%");
  assert.equal(metrics.avgWinCents, 150n);
  assert.equal(metrics.avgLossCents, -100n);
  assert.equal(metrics.grossProfitCents, 300n);
  assert.equal(metrics.grossLossCents, 100n);
  assert.equal(metrics.profitFactor, "3.00");
  assert.equal(metrics.realizedNetCents, 200n);
  assert.equal(metrics.byTicker.length, 2);
  assert.equal(metrics.byStrategy[0].label, "(No strategy)");
  assert.equal(metrics.byTicker.find((row) => row.label === "AAA").netCents, 300n);

  const curveTrades = [1000, 500, -800, -400, 100].map((cents, index) => closed({
    id: "d" + index,
    exitDate: "2026-02-" + String(index + 1).padStart(2, "0"),
    entryPrice: 0,
    exitPrice: Number(cents) / 100,
    quantity: 1,
    fees: 0
  }));
  const curve = calc.analyze({ trades: curveTrades });
  assert.equal(curve.maxDrawdownCents, 1200n);
  assert.equal(curve.currentDrawdownCents, 1100n);
  assert.equal(curve.curve[curve.curve.length - 1].cents, 400n);
  assert.equal(curve.bestDay.cents, 1000n);
  assert.equal(curve.worstDay.cents, -800n);
});

test("profit factor and win rate are N/A without enough data", () => {
  const none = calc.analyze({ trades: [] });
  assert.equal(none.realizedNetCents, null);
  assert.equal(none.winRate, null);
  assert.equal(none.profitFactor, null);
  assert.equal(none.bestDay, null);
  assert.equal(none.maxDrawdownCents, null);
  const onlyWins = calc.analyze({ trades: [closed({ quantity: 1, exitPrice: 11, fees: 0 })] });
  assert.equal(onlyWins.profitFactor, null);
  assert.equal(onlyWins.avgLossCents, null);
  assert.equal(onlyWins.maxDrawdownCents, 0n);
});

test("same-day trades are one curve step and duplicate ids count once", () => {
  const up = closed({ id: "same", exitDate: "2026-03-01", exitPrice: 11, quantity: 1, fees: 0 });
  const down = closed({ id: "same-b", exitDate: "2026-03-01", entryPrice: 10, exitPrice: 7, quantity: 1, fees: 0 });
  const metrics = calc.analyze({ trades: [up, down, Object.assign({}, up)] });
  assert.equal(metrics.tradeCount, 2);
  assert.equal(metrics.curve.length, 1);
  assert.equal(metrics.curve[0].dayCents, -200n);
  assert.equal(metrics.maxDrawdownCents, 200n);
});

test("editing or deleting a trade changes every dependent total", () => {
  const journal = { trades: [closed({ fees: 1 })], days: {} };
  assert.equal(calc.analyze(journal).realizedNetCents, 900n);
  journal.trades[0] = closed({ fees: 1, exitPrice: 11 });
  assert.equal(calc.analyze(journal).realizedNetCents, 400n);
  const month = calc.monthSummary(journal, 2026, 0, new Date(2026, 0, 20));
  assert.equal(month.tradeCents, 400n);
  journal.trades = [];
  assert.equal(calc.analyze(journal).realizedNetCents, null);
  assert.equal(calc.monthSummary(journal, 2026, 0, new Date(2026, 0, 20)).tradeCents, null);
});

test("manual entries, adjustments, and closed trades stay separate across month and year boundaries", () => {
  const journal = {
    trades: [
      closed({ id: "dec", exitDate: "2025-12-31", exitPrice: 11, quantity: 1, fees: 0 }),
      closed({ id: "jan", exitDate: "2026-01-01", exitPrice: 12, quantity: 1, fees: 0 }),
      closed({ id: "later", exitDate: "2026-03-20", exitPrice: 13, quantity: 1, fees: 0 })
    ],
    days: {
      "2026-01-01": { entryType: "manual", manualPnl: 100, note: "old", breakdown: [], adjustment: 5, adjustmentNote: "deposit" },
      "2025-12-31": { entryType: "manual", manualPnl: -2, note: "", breakdown: [], adjustment: null, adjustmentNote: "" }
    }
  };
  const january = calc.monthSummary(journal, 2026, 0, new Date(2026, 2, 15));
  assert.equal(january.tradeCents, 200n);
  assert.equal(january.manualCents, 10000n);
  assert.equal(january.adjustmentCents, 500n);
  assert.equal(january.combinedCents, undefined);
  assert.notEqual(january.tradeCents + january.manualCents, january.tradeCents);
  const weekTrade = january.weeks.reduce((sum, week) => sum + (week.tradeCents || 0n), 0n);
  const weekManual = january.weeks.reduce((sum, week) => sum + (week.manualCents || 0n), 0n);
  assert.equal(weekTrade, january.tradeCents);
  assert.equal(weekManual, january.manualCents);

  const december = calc.monthSummary(journal, 2025, 11, new Date(2026, 2, 15));
  assert.equal(december.tradeCents, 100n);
  assert.equal(december.manualCents, -200n);
  assert.equal(december.ytdLabel, "2025 total");

  const ytd = calc.ytdBounds(2026, new Date(2026, 2, 15));
  const ytdTotals = calc.summarizeKeys(journal, ytd.start, ytd.end);
  assert.equal(ytd.end, "2026-03-15");
  assert.equal(ytdTotals.tradeCents, 200n);
  assert.equal(calc.analyze(journal, { start: ytd.start, end: ytd.end }).realizedNetCents, 200n);
  assert.equal(calc.analyze(journal).realizedNetCents, 600n);
  const detail = calc.dayDetail(journal, "2026-01-01");
  assert.equal(detail.tradeCents, 200n);
  assert.equal(detail.manualCents, 10000n);
  assert.equal(detail.entryType, "manual");
});

test("date keys do not move across a timezone boundary", () => {
  const parsed = calc.parseDateKey("2026-01-01");
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 0);
  assert.equal(parsed.getDate(), 1);
  assert.equal(calc.dateKey(parsed), "2026-01-01");
  assert.equal(calc.parseDateKey("2026-02-31"), null);
  assert.equal(calc.inDateRange("2026-01-01", "2026-01-01", "2026-01-31"), true);
  assert.equal(calc.inDateRange("2025-12-31", "2026-01-01", "2026-01-31"), false);
  const root = path.resolve(__dirname, "..");
  const script = `
    const calc = require("./js/calc.js");
    const date = calc.parseDateKey("2026-01-01");
    if (date.getFullYear() !== 2026 || date.getMonth() !== 0 || date.getDate() !== 1) process.exit(2);
    if (calc.dateKey(date) !== "2026-01-01") process.exit(3);
    const bounds = calc.monthBounds(2026, 0);
    if (!calc.inDateRange("2026-01-01", bounds.start, bounds.end)) process.exit(4);
    if (calc.inDateRange("2025-12-31", bounds.start, bounds.end)) process.exit(5);
    const summary = calc.monthSummary({ trades: [{ id: "a", symbol: "SOFI", direction: "long", status: "closed", quantity: 1, entryPrice: 10, exitPrice: 11, exitDate: "2026-01-01", fees: 0 }], days: {} }, 2026, 0, new Date(2026, 0, 31));
    if (summary.tradeCents !== 100n) process.exit(6);
  `;
  ["Pacific/Kiritimati", "Pacific/Honolulu", "UTC", "America/New_York"].forEach((tz) => {
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: root,
      env: Object.assign({}, process.env, { TZ: tz }),
      encoding: "utf8"
    });
    assert.equal(result.status, 0, tz + " " + result.stderr + result.stdout);
  });
});

test("risk calculator sizes a long and a short and refuses a stop on the wrong side", () => {
  const long = calc.positionRisk({ accountSize: 10000, riskPercent: 1, entryPrice: 50, stopPrice: 48, direction: "long" });
  assert.equal(long.ok, true);
  assert.equal(long.plannedRiskCents, 10000n);
  assert.equal(long.perShareRiskCents, 200n);
  assert.equal(long.quantityText, "50");
  const awkward = calc.positionRisk({ accountSize: 333.33, riskPercent: 1, entryPrice: 10, stopPrice: 9, direction: "long" });
  assert.equal(awkward.plannedRiskCents, 333n);
  assert.equal(awkward.quantityText, "3.33");
  const third = calc.positionRisk({ accountSize: 10000, riskPercent: 1, entryPrice: 10, stopPrice: 7, direction: "long" });
  assert.equal(third.quantityText, "33.3333");
  const short = calc.positionRisk({ accountSize: 10000, riskPercent: 1, entryPrice: 50, stopPrice: 52, direction: "short" });
  assert.equal(short.quantityText, "50");
  assert.match(short.disclaimer, /gaps, slippage, fees/);
  assert.equal(calc.positionRisk({ accountSize: 10000, riskPercent: 1, entryPrice: 50, stopPrice: 55, direction: "long" }).ok, false);
  assert.equal(calc.positionRisk({ accountSize: 10000, riskPercent: 1, entryPrice: 50, stopPrice: 45, direction: "short" }).ok, false);
  assert.equal(calc.positionRisk({ accountSize: 10000, riskPercent: 1, entryPrice: 50, stopPrice: 50, direction: "long" }).ok, false);
  assert.equal(calc.positionRisk({ accountSize: 0, riskPercent: 1, entryPrice: 50, stopPrice: 48, direction: "long" }).ok, false);
});

test("a thousand closed trades sum without dropping cents", () => {
  const trades = [];
  for (let i = 0; i < 1000; i++) {
    trades.push(closed({
      id: "n" + i,
      exitDate: "2026-04-01",
      quantity: 0.1,
      entryPrice: 10,
      exitPrice: 10.1,
      fees: 0
    }));
  }
  const metrics = calc.analyze({ trades: trades });
  assert.equal(metrics.tradeCount, 1000);
  assert.equal(metrics.realizedNetCents, 1000n);
});

test("csv export labels sources and neutralizes spreadsheet formulas", () => {
  const journal = {
    trades: [closed({ notes: "=cmd", fees: 1 })],
    days: { "2026-01-15": { entryType: "manual", manualPnl: 4, note: "manual note", breakdown: [], adjustment: null, adjustmentNote: "" } }
  };
  const tradesCsv = calc.tradesToCsv(journal);
  assert.match(tradesCsv.split("\n")[0], /gross_pnl,net_pnl/);
  assert.match(tradesCsv, /'=cmd/);
  assert.match(tradesCsv, /9\.00/);
  const daily = calc.dailyToCsv(journal);
  assert.match(daily, /2026-01-15/);
  assert.match(daily, /closed-trades\|manual/);
  assert.match(daily, /4\.00/);
});

test("metric and status help stays descriptive and avoids market-hit claims", () => {
  ["realizedNet", "wins", "losses", "breakeven", "winRate", "avgWin", "avgLoss", "grossProfit", "grossLoss", "profitFactor", "bestDay", "worstDay", "cumulative", "drawdown", "maxDrawdown", "byTicker", "byStrategy"].forEach((key) => {
    assert.equal(typeof calc.METRIC_HELP[key], "string");
    assert.ok(calc.METRIC_HELP[key].length > 20);
  });
  assert.match(calc.METRIC_HELP.profitFactor, /N\/A/);
  assert.match(calc.METRIC_HELP.winRate, /N\/A/);
  assert.match(calc.METRIC_HELP.cumulative, /not account equity/i);
  assert.match(calc.STATUS_HELP.closed.detail, /does not know/i);
  assert.doesNotMatch(calc.STATUS_HELP.open.detail, /target reached/i);
  assert.equal(calc.TRADE_DATE_CONVENTION, "exit-date");
  assert.equal(calc.SHORT_RETURN_BASIS, "short-sale-proceeds");
  assert.equal(calc.COST_METHOD, "average-cost");
  assert.match(calc.METRIC_HELP.unrealized, /mark price you type/i);
  assert.match(calc.METRIC_HELP.portfolioValue, /N\/A/);
});

test("average-cost partial exits realize only the shares sold", () => {
  const trade = {
    id: "part",
    symbol: "NVDA",
    direction: "long",
    status: "open",
    quantity: 10,
    entryPrice: 100,
    exitPrice: null,
    fees: 99,
    exits: [
      { id: "a", quantity: 4, price: 110, date: "2026-03-01", fees: 1, reason: "" },
      { id: "b", quantity: 2, price: 90, date: "2026-03-02", fees: 0, reason: "target" }
    ],
    markPrice: null
  };
  const books = calc.positionAccounting(trade);
  assert.equal(books.method, "average-cost");
  assert.equal(books.remainingQty, 4);
  assert.equal(books.partial, true);
  assert.equal(books.realizedNetCents, 1900n);
  assert.equal(books.unrealizedCents, null);
  assert.equal(books.unrealizedReason, "no-mark");
  const metrics = calc.analyze({ trades: [trade], days: {} });
  assert.equal(metrics.realizedNetCents, 1900n);
  assert.equal(metrics.tradeCount, 2);
  const marked = Object.assign({}, trade, { markPrice: 130, markAsOf: "2026-03-03" });
  const after = calc.positionAccounting(marked);
  assert.equal(after.unrealizedCents, 12000n);
  assert.equal(after.unrealizedReason, "manual-mark");
  assert.equal(after.markAsOf, "2026-03-03");
  const snap = calc.portfolioSnapshot({ trades: [marked] });
  assert.equal(snap.portfolioValueCents, null);
  assert.equal(snap.cashCents, null);
  assert.equal(snap.unrealizedCents, 12000n);
  const closed = Object.assign({}, trade, {
    status: "closed",
    exits: [
      { id: "a", quantity: 4, price: 110, date: "2026-03-01", fees: 0, reason: "" },
      { id: "b", quantity: 6, price: 100, date: "2026-03-04", fees: 0, reason: "" }
    ]
  });
  assert.equal(calc.positionAccounting(closed).remainingQty, 0);
  assert.equal(calc.positionAccounting(closed).unrealizedReason, "flat");
  assert.equal(calc.analyze({ trades: [closed] }).realizedNetCents, 4000n);
});

test("a legacy closed trade is unchanged when it has no exit lots", () => {
  const trade = closed({ quantity: 5, entryPrice: 10, exitPrice: 12, fees: 1 });
  assert.equal(calc.tradeResult(trade).reason, "realized");
  assert.equal(calc.tradeResult(trade).netCents, 900n);
  assert.equal(calc.positionAccounting(trade).unrealizedReason, "flat");
  assert.equal(calc.analyze({ trades: [trade] }).realizedNetCents, 900n);
});
