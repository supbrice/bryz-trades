/* Pure calculation layer for Ladder.
   Realized results use closed trades only. Manual day entries are never added in. */
(function (root, factory) {
  const money = (typeof module !== "undefined" && module.exports)
    ? require("./money.js")
    : root.StockTracker;
  const api = factory(money);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ST = root.StockTracker = root.StockTracker || {};
  Object.assign(ST, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (money) {
  const TRADE_DATE_CONVENTION = "exit-date";
  const SHORT_RETURN_BASIS = "short-sale-proceeds";
  const LONG_RETURN_BASIS = "initial-entry-cost";

  const STATUS_HELP = {
    open: {
      label: "Open",
      summary: "Open — not realized",
      detail: "This trade is open in your journal. It is excluded from realized profit and loss. The target and hard stop are plans you recorded, not exits, and Ladder does not check the market."
    },
    closed: {
      label: "Closed",
      summary: "Closed — recorded exit",
      detail: "You recorded this trade as closed. Realized profit and loss uses the exit price, quantity, fees, and exit date you entered. Ladder does not know whether a target or stop was reached in the market."
    },
    cancelled: {
      label: "Cancelled",
      summary: "Cancelled — not realized",
      detail: "This trade is cancelled. It is excluded from realized profit and loss."
    }
  };

  const EXIT_REASON_HELP = {
    "": "No exit reason recorded.",
    target: "You recorded this exit as your planned target. That note is yours. Ladder did not verify a market price.",
    stop: "You recorded this exit as your planned stop. That note is yours. Ladder did not verify a market price.",
    other: "You recorded an exit reason other than the planned target or stop."
  };

  const CHECKLIST_HELP = "This compares the official close you paste with your planned levels. It is not a live quote, and it does not mean an order was filled or a stop was executed in the market.";

  const METRIC_HELP = {
    realizedNet: "Sum of net profit and loss on closed trades with an exit date in the selected range. Net is gross profit and loss minus fees. Open, cancelled, incomplete, and undated trades are excluded.",
    wins: "Closed trades in the range whose net result is above zero.",
    losses: "Closed trades in the range whose net result is below zero.",
    breakeven: "Closed trades in the range whose net result is exactly zero.",
    winRate: "Winning trades divided by winning, losing, and breakeven trades in the range. N/A when there are no counted trades.",
    avgWin: "Average net profit of winning trades. N/A when there are no winning trades.",
    avgLoss: "Average net result of losing trades, shown as a negative amount. N/A when there are no losing trades.",
    grossProfit: "Sum of net profit on winning trades. This is profit before losses are subtracted, not a figure before fees. N/A when there are no counted trades.",
    grossLoss: "Sum of losing trades as a positive amount. N/A when there are no counted trades.",
    profitFactor: "Gross profit divided by gross loss. N/A when there are no losses, including when every counted trade is a win or a breakeven.",
    bestDay: "Calendar day in the range with the highest closed-trade net. Days are summed by exit date. N/A when no dated closed trade is in the range. Manual entries are not included.",
    worstDay: "Calendar day in the range with the lowest closed-trade net. N/A when no dated closed trade is in the range. Manual entries are not included.",
    cumulative: "Running total of dated closed-trade net results. This is not account equity. Deposits, withdrawals, open positions, and margin are not included.",
    drawdown: "How far the latest cumulative closed-trade total sits below its previous peak. N/A when there is no dated closed trade in the range. This is not a drawdown of account equity.",
    maxDrawdown: "Largest peak-to-trough drop in the daily cumulative closed-trade total. Same-day trades are summed before the peak is updated. N/A when there is no dated closed trade.",
    byTicker: "Realized net for each ticker, using the same closed trades as the other metrics.",
    byStrategy: "Realized net for each strategy you recorded. Trades with no strategy are grouped as (No strategy)."
  };

  const RISK_DISCLAIMER = "This is a planning estimate, not financial advice, and it does not place an order. Actual losses can be larger than the planned risk because of gaps, slippage, fees, and execution.";

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function dateKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function parseDateKey(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function addDays(date, days) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + days);
    return next;
  }

  function startOfWeek(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    start.setDate(start.getDate() - start.getDay());
    return start;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function monthWeeks(year, month) {
    const last = new Date(year, month + 1, 0);
    let cursor = startOfWeek(new Date(year, month, 1));
    const weeks = [];
    while (cursor <= last) {
      const days = [];
      for (let i = 0; i < 7; i++) {
        days.push({
          date: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
          key: dateKey(cursor),
          inMonth: cursor.getMonth() === month && cursor.getFullYear() === year
        });
        cursor = addDays(cursor, 1);
      }
      weeks.push(days);
    }
    return weeks;
  }

  function monthBounds(year, month) {
    const last = new Date(year, month + 1, 0).getDate();
    return {
      start: year + "-" + pad(month + 1) + "-01",
      end: year + "-" + pad(month + 1) + "-" + pad(last)
    };
  }

  function ytdBounds(year, today) {
    const current = today.getFullYear() === year;
    return {
      start: year + "-01-01",
      end: current ? dateKey(today) : year + "-12-31",
      label: current ? "Year to date" : year + " total"
    };
  }

  function rangeForPreset(preset, today) {
    if (preset === "all") return { start: null, end: null, label: "All closed trades" };
    if (preset === "month") {
      const bounds = monthBounds(today.getFullYear(), today.getMonth());
      return { start: bounds.start, end: bounds.end, label: "This month" };
    }
    const bounds = ytdBounds(today.getFullYear(), today);
    return { start: bounds.start, end: bounds.end, label: bounds.label };
  }

  function inDateRange(key, start, end) {
    if (!parseDateKey(key)) return false;
    if (start && key < start) return false;
    if (end && key > end) return false;
    return true;
  }

  function isPresent(value) {
    return value != null && value !== "";
  }

  function effectiveEntry(trade) {
    if (!trade) return null;
    if (isPresent(trade.entryPrice) && money.parsePriceTicks(trade.entryPrice) != null) return trade.entryPrice;
    if (isPresent(trade.avgCost) && money.parsePriceTicks(trade.avgCost) != null) return trade.avgCost;
    return null;
  }

  function entrySource(trade) {
    if (!trade) return null;
    if (isPresent(trade.entryPrice) && money.parsePriceTicks(trade.entryPrice) != null) return "entry-price";
    if (isPresent(trade.avgCost) && money.parsePriceTicks(trade.avgCost) != null) return "average-cost";
    return null;
  }

  function grossPnlCents(direction, entryPrice, exitPrice, quantity) {
    if (direction !== "long" && direction !== "short") return null;
    const entry = money.parsePriceTicks(entryPrice);
    const exit = money.parsePriceTicks(exitPrice);
    const qty = money.parseQtyTicks(quantity);
    if (entry == null || exit == null || qty == null) return null;
    const diff = direction === "short" ? entry - exit : exit - entry;
    return money.divRound(diff * qty, 1000000n);
  }

  function feeInfo(fees) {
    if (!isPresent(fees)) return { cents: 0n, assumedZero: true };
    const cents = money.parseCents(fees);
    if (cents == null) return { error: "invalid" };
    if (cents < 0n) return { error: "negative" };
    return { cents: cents, assumedZero: false };
  }

  function netPnlCents(grossCents, fees) {
    if (typeof grossCents !== "bigint") return null;
    const fee = feeInfo(fees);
    if (fee.error) return null;
    return grossCents - fee.cents;
  }

  function basisCents(price, quantity) {
    const entry = money.parsePriceTicks(price);
    const qty = money.parseQtyTicks(quantity);
    if (entry == null || qty == null) return null;
    if (entry === 0n || qty === 0n) return null;
    const basis = money.divRound(entry * qty, 1000000n);
    if (basis == null || basis === 0n) return null;
    return basis < 0n ? -basis : basis;
  }

  function longCostBasisCents(entryPrice, quantity) {
    return basisCents(entryPrice, quantity);
  }

  function shortProceedsBasisCents(entryPrice, quantity) {
    return basisCents(entryPrice, quantity);
  }

  function formatPercent(numerator, denominator, decimals) {
    if (typeof numerator !== "bigint" || typeof denominator !== "bigint") return null;
    if (denominator === 0n) return null;
    const scale = 10n ** BigInt(decimals);
    const scaled = money.divRound(numerator * 100n * scale, denominator);
    if (scaled == null) return null;
    const neg = scaled < 0n;
    const abs = neg ? -scaled : scaled;
    const whole = abs / scale;
    const frac = (abs % scale).toString().padStart(decimals, "0");
    const body = decimals === 0 ? whole.toString() : whole.toString() + "." + frac;
    return (neg ? "-" : "") + body + "%";
  }

  function returnFor(direction, entryPrice, quantity, netCents) {
    if (direction === "long") {
      const basis = longCostBasisCents(entryPrice, quantity);
      return {
        basis: LONG_RETURN_BASIS,
        basisCents: basis,
        percent: basis == null ? null : formatPercent(netCents, basis, 2)
      };
    }
    if (direction === "short") {
      const basis = shortProceedsBasisCents(entryPrice, quantity);
      return {
        basis: SHORT_RETURN_BASIS,
        basisCents: basis,
        percent: basis == null ? null : formatPercent(netCents, basis, 2)
      };
    }
    return { basis: null, basisCents: null, percent: null };
  }

  function tradeResult(trade) {
    const status = trade && trade.status;
    const result = {
      id: trade && trade.id || "",
      symbol: trade && trade.symbol || "",
      strategy: trade && trade.strategy || "",
      direction: trade && trade.direction || "",
      status: status || "",
      exitDate: trade && trade.exitDate || "",
      included: false,
      reason: "",
      grossCents: null,
      feeCents: null,
      feesAssumedZero: false,
      netCents: null,
      returnBasis: null,
      basisCents: null,
      returnPercent: null,
      entrySource: null,
      dateNote: ""
    };
    if (status === "cancelled") {
      result.reason = "cancelled";
      return result;
    }
    if (status !== "closed") {
      result.reason = "open";
      return result;
    }
    const entry = effectiveEntry(trade);
    result.entrySource = entrySource(trade);
    const gross = grossPnlCents(trade.direction, entry, trade.exitPrice, trade.quantity);
    const fee = feeInfo(trade.fees);
    if (gross == null || fee.error) {
      result.reason = "incomplete";
      return result;
    }
    const net = gross - fee.cents;
    const ret = returnFor(trade.direction, entry, trade.quantity, net);
    result.included = true;
    result.grossCents = gross;
    result.feeCents = fee.cents;
    result.feesAssumedZero = fee.assumedZero;
    result.netCents = net;
    result.returnBasis = ret.basis;
    result.basisCents = ret.basisCents;
    result.returnPercent = ret.percent;
    if (!trade.exitDate) result.reason = "undated";
    else result.reason = "realized";
    if (trade.entryDate && trade.exitDate && trade.exitDate < trade.entryDate) {
      result.dateNote = "Exit date is before entry date. The result is still placed on the exit date.";
    }
    return result;
  }

  function dedupeTrades(trades) {
    const seen = new Set();
    const out = [];
    (trades || []).forEach(function (trade) {
      if (!trade) return;
      if (trade.id) {
        if (seen.has(trade.id)) return;
        seen.add(trade.id);
      }
      out.push(trade);
    });
    return out;
  }

  function blankMetrics() {
    return {
      invalidRange: false,
      tradeCount: 0,
      wins: 0,
      losses: 0,
      breakevens: 0,
      realizedNetCents: null,
      grossProfitCents: null,
      grossLossCents: null,
      profitFactor: null,
      winRate: null,
      avgWinCents: null,
      avgLossCents: null,
      bestDay: null,
      worstDay: null,
      cumulativeCents: null,
      currentDrawdownCents: null,
      maxDrawdownCents: null,
      byTicker: [],
      byStrategy: [],
      curve: [],
      excludedOpen: 0,
      excludedCancelled: 0,
      incomplete: 0,
      undated: 0,
      undatedNetCents: 0n,
      feesAssumedZero: 0
    };
  }

  function outcome(net) {
    if (net > 0n) return "win";
    if (net < 0n) return "loss";
    return "breakeven";
  }

  function analyze(journal, options) {
    const opts = options || {};
    const metrics = blankMetrics();
    if (opts.start && opts.end && opts.start > opts.end) {
      metrics.invalidRange = true;
      return metrics;
    }
    const trades = dedupeTrades(journal && journal.trades);
    const dated = [];
    trades.forEach(function (trade) {
      const result = tradeResult(trade);
      if (result.reason === "open") metrics.excludedOpen += 1;
      else if (result.reason === "cancelled") metrics.excludedCancelled += 1;
      else if (result.reason === "incomplete") metrics.incomplete += 1;
      else if (result.reason === "undated") {
        metrics.undated += 1;
        metrics.undatedNetCents += result.netCents;
      } else if (result.reason === "realized") {
        if (opts.start && result.exitDate < opts.start) return;
        if (opts.end && result.exitDate > opts.end) return;
        dated.push(result);
      }
    });
    dated.sort(function (a, b) {
      if (a.exitDate !== b.exitDate) return a.exitDate < b.exitDate ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
    });
    if (!dated.length) return metrics;

    let net = 0n;
    let grossProfit = 0n;
    let grossLoss = 0n;
    let winSum = 0n;
    let lossSum = 0n;
    const byDay = new Map();
    const tickers = new Map();
    const strategies = new Map();

    dated.forEach(function (result) {
      metrics.tradeCount += 1;
      if (result.feesAssumedZero) metrics.feesAssumedZero += 1;
      net += result.netCents;
      const kind = outcome(result.netCents);
      if (kind === "win") {
        metrics.wins += 1;
        winSum += result.netCents;
        grossProfit += result.netCents;
      } else if (kind === "loss") {
        metrics.losses += 1;
        lossSum += result.netCents;
        grossLoss += -result.netCents;
      } else {
        metrics.breakevens += 1;
      }
      byDay.set(result.exitDate, (byDay.get(result.exitDate) || 0n) + result.netCents);
      addGroup(tickers, result.symbol || "(No ticker)", result);
      addGroup(strategies, result.strategy ? result.strategy : "(No strategy)", result);
    });

    metrics.realizedNetCents = net;
    metrics.cumulativeCents = net;
    metrics.grossProfitCents = grossProfit;
    metrics.grossLossCents = grossLoss;
    metrics.winRate = formatPercent(BigInt(metrics.wins), BigInt(metrics.tradeCount), 1);
    metrics.avgWinCents = metrics.wins ? money.divRound(winSum, BigInt(metrics.wins)) : null;
    metrics.avgLossCents = metrics.losses ? money.divRound(lossSum, BigInt(metrics.losses)) : null;
    metrics.profitFactor = grossLoss === 0n ? null : formatRatio(grossProfit, grossLoss, 2);
    metrics.byTicker = groupList(tickers);
    metrics.byStrategy = groupList(strategies);

    const days = Array.from(byDay.keys()).sort();
    let peak = 0n;
    let maxDd = 0n;
    let cum = 0n;
    let best = null;
    let worst = null;
    days.forEach(function (day) {
      const dayCents = byDay.get(day);
      cum += dayCents;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDd) maxDd = dd;
      metrics.curve.push({ date: day, dayCents: dayCents, cents: cum });
      if (!best || dayCents > best.cents || (dayCents === best.cents && day < best.date)) best = { date: day, cents: dayCents };
      if (!worst || dayCents < worst.cents || (dayCents === worst.cents && day < worst.date)) worst = { date: day, cents: dayCents };
    });
    metrics.bestDay = best;
    metrics.worstDay = worst;
    metrics.currentDrawdownCents = peak == null ? null : peak - cum;
    metrics.maxDrawdownCents = maxDd;
    return metrics;
  }

  function formatRatio(numerator, denominator, decimals) {
    const scale = 10n ** BigInt(decimals);
    const scaled = money.divRound(numerator * scale, denominator);
    if (scaled == null) return null;
    const neg = scaled < 0n;
    const abs = neg ? -scaled : scaled;
    const whole = abs / scale;
    const frac = (abs % scale).toString().padStart(decimals, "0");
    return (neg ? "-" : "") + whole.toString() + "." + frac;
  }

  function addGroup(map, key, result) {
    if (!map.has(key)) {
      map.set(key, {
        label: key,
        trades: 0,
        wins: 0,
        losses: 0,
        breakevens: 0,
        netCents: 0n
      });
    }
    const row = map.get(key);
    row.trades += 1;
    row.netCents += result.netCents;
    const kind = outcome(result.netCents);
    if (kind === "win") row.wins += 1;
    else if (kind === "loss") row.losses += 1;
    else row.breakevens += 1;
  }

  function groupList(map) {
    return Array.from(map.values()).sort(function (a, b) {
      return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
    });
  }

  function manualCents(day) {
    if (!day || day.manualPnl == null || day.manualPnl === "") return null;
    return money.parseCents(day.manualPnl);
  }

  function adjustmentCents(day) {
    if (!day || day.adjustment == null || day.adjustment === "") return null;
    return money.parseCents(day.adjustment);
  }

  function tradesOnDate(journal, key) {
    return dedupeTrades(journal && journal.trades).map(tradeResult).filter(function (result) {
      return result.reason === "realized" && result.exitDate === key;
    });
  }

  function dayDetail(journal, key) {
    const results = tradesOnDate(journal, key);
    let tradeSum = 0n;
    results.forEach(function (result) { tradeSum += result.netCents; });
    const day = journal && journal.days ? journal.days[key] : null;
    const manual = manualCents(day);
    const adjustment = adjustmentCents(day);
    return {
      key: key,
      trades: results,
      tradeCents: results.length ? tradeSum : null,
      tradeCount: results.length,
      manualCents: manual,
      manualNote: day && day.note ? day.note : "",
      breakdown: day && Array.isArray(day.breakdown) ? day.breakdown : [],
      adjustmentCents: adjustment,
      adjustmentNote: day && day.adjustmentNote ? day.adjustmentNote : "",
      entryType: day ? "manual" : ""
    };
  }

  function addBest(current, key, cents) {
    if (cents == null) return current;
    if (!current || cents > current.cents || (cents === current.cents && key < current.date)) {
      return { date: key, cents: cents };
    }
    return current;
  }

  function addWorst(current, key, cents) {
    if (cents == null) return current;
    if (!current || cents < current.cents || (cents === current.cents && key < current.date)) {
      return { date: key, cents: cents };
    }
    return current;
  }

  function summarizeKeys(journal, start, end) {
    let tradeCents = 0n;
    let manualSum = 0n;
    let adjustmentSum = 0n;
    let tradeDays = 0;
    let manualDays = 0;
    let gainDays = 0;
    let lossDays = 0;
    let flatDays = 0;
    let manualGain = 0;
    let manualLoss = 0;
    let manualFlat = 0;
    let bestTrade = null;
    let worstTrade = null;
    let bestManual = null;
    let worstManual = null;
    const cursor = parseDateKey(start);
    const last = parseDateKey(end);
    if (!cursor || !last) {
      return null;
    }
    for (let date = cursor; date <= last; date = addDays(date, 1)) {
      const key = dateKey(date);
      const detail = dayDetail(journal, key);
      if (detail.tradeCents != null) {
        tradeCents += detail.tradeCents;
        tradeDays += 1;
        if (detail.tradeCents > 0n) gainDays += 1;
        else if (detail.tradeCents < 0n) lossDays += 1;
        else flatDays += 1;
        bestTrade = addBest(bestTrade, key, detail.tradeCents);
        worstTrade = addWorst(worstTrade, key, detail.tradeCents);
      }
      if (detail.manualCents != null) {
        manualSum += detail.manualCents;
        manualDays += 1;
        if (detail.manualCents > 0n) manualGain += 1;
        else if (detail.manualCents < 0n) manualLoss += 1;
        else manualFlat += 1;
        bestManual = addBest(bestManual, key, detail.manualCents);
        worstManual = addWorst(worstManual, key, detail.manualCents);
      }
      if (detail.adjustmentCents != null) adjustmentSum += detail.adjustmentCents;
    }
    return {
      tradeCents: tradeDays ? tradeCents : null,
      tradeDays: tradeDays,
      gainDays: gainDays,
      lossDays: lossDays,
      flatDays: flatDays,
      manualCents: manualDays ? manualSum : null,
      manualDays: manualDays,
      manualGain: manualGain,
      manualLoss: manualLoss,
      manualFlat: manualFlat,
      adjustmentCents: adjustmentSum === 0n && !hasAdjustment(journal, start, end) ? null : adjustmentSum,
      bestTrade: bestTrade,
      worstTrade: worstTrade,
      bestManual: bestManual,
      worstManual: worstManual
    };
  }

  function hasAdjustment(journal, start, end) {
    const days = journal && journal.days || {};
    return Object.keys(days).some(function (key) {
      if (key < start || key > end) return false;
      return adjustmentCents(days[key]) != null;
    });
  }

  function monthSummary(journal, year, month, today) {
    const bounds = monthBounds(year, month);
    const totals = summarizeKeys(journal, bounds.start, bounds.end) || {
      tradeCents: null,
      manualCents: null,
      adjustmentCents: null,
      tradeDays: 0,
      manualDays: 0,
      gainDays: 0,
      lossDays: 0,
      flatDays: 0,
      manualGain: 0,
      manualLoss: 0,
      manualFlat: 0,
      bestTrade: null,
      worstTrade: null,
      bestManual: null,
      worstManual: null
    };
    const weeks = monthWeeks(year, month).map(function (week) {
      const inMonth = week.filter(function (day) { return day.inMonth; });
      let trade = 0n;
      let manual = 0n;
      let tradeDays = 0;
      let manualDays = 0;
      inMonth.forEach(function (day) {
        const detail = dayDetail(journal, day.key);
        if (detail.tradeCents != null) {
          trade += detail.tradeCents;
          tradeDays += 1;
        }
        if (detail.manualCents != null) {
          manual += detail.manualCents;
          manualDays += 1;
        }
      });
      return {
        label: inMonth.length ? weekLabel(inMonth[0].date, inMonth[inMonth.length - 1].date) : "",
        tradeCents: tradeDays ? trade : null,
        manualCents: manualDays ? manual : null,
        tradeDays: tradeDays,
        manualDays: manualDays
      };
    });
    const ytd = ytdBounds(year, today);
    const ytdTotals = summarizeKeys(journal, ytd.start, ytd.end);
    return Object.assign({}, totals, {
      weeks: weeks,
      ytdTradeCents: ytdTotals ? ytdTotals.tradeCents : null,
      ytdManualCents: ytdTotals ? ytdTotals.manualCents : null,
      ytdLabel: ytd.label
    });
  }

  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function weekLabel(start, end) {
    const a = MONTHS_SHORT[start.getMonth()] + " " + start.getDate();
    if (dateKey(start) === dateKey(end)) return a;
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) return a + "–" + end.getDate();
    return a + " – " + MONTHS_SHORT[end.getMonth()] + " " + end.getDate();
  }

  function positionRisk(input) {
    const src = input || {};
    const fail = function (message) {
      return { ok: false, error: message, plannedRiskCents: null, perShareRiskCents: null, quantityTicks: null };
    };
    if (src.direction !== "long" && src.direction !== "short") return fail("Choose long or short.");
    const account = money.parseCents(src.accountSize);
    const percent = money.parseScaledDigits(src.riskPercent, 2);
    const entry = money.parsePriceTicks(src.entryPrice);
    const stop = money.parsePriceTicks(src.stopPrice);
    if (account == null || percent == null || entry == null || stop == null) {
      return fail("Enter account size, risk percent, entry, and stop.");
    }
    if (account <= 0n) return fail("Account size must be above zero.");
    if (percent <= 0n || percent > 10000n) return fail("Enter a risk percent above 0 and up to 100.");
    if (entry <= 0n || stop <= 0n) return fail("Entry and stop must be above zero.");
    let perShareTicks;
    if (src.direction === "long") {
      perShareTicks = entry - stop;
      if (perShareTicks <= 0n) return fail("For a long, the stop has to be below the entry.");
    } else {
      perShareTicks = stop - entry;
      if (perShareTicks <= 0n) return fail("For a short, the stop has to be above the entry.");
    }
    const planned = money.divRound(account * percent, 10000n);
    const perShareCents = money.divRound(perShareTicks, 100n);
    const quantityTicks = money.divRound(planned * 1000000n, perShareTicks);
    return {
      ok: true,
      error: "",
      plannedRiskCents: planned,
      perShareRiskCents: perShareCents,
      quantityTicks: quantityTicks,
      quantityText: trimScale(money.formatScaled(quantityTicks, 4)),
      disclaimer: RISK_DISCLAIMER
    };
  }

  function trimScale(text) {
    if (!text || text.indexOf(".") === -1) return text;
    return text.replace(/0+$/, "").replace(/\.$/, "");
  }

  function csvCell(value) {
    let text = value == null ? "" : String(value);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function csvLine(cells) {
    return cells.map(csvCell).join(",");
  }

  function centsCell(cents) {
    if (typeof cents !== "bigint") return "";
    return money.formatScaled(cents, 2);
  }

  function tradesToCsv(journal) {
    const header = ["id", "symbol", "name", "direction", "status", "quantity", "entry_price", "average_cost", "exit_price", "entry_date", "exit_date", "fees", "target_price", "hard_stop", "exit_reason", "strategy", "setup", "gross_pnl", "net_pnl", "return_basis", "return_percent", "counted_in_realized", "exclusion_reason", "notes"];
    const lines = [csvLine(header)];
    dedupeTrades(journal && journal.trades).forEach(function (trade) {
      const result = tradeResult(trade);
      lines.push(csvLine([
        trade.id,
        trade.symbol,
        trade.name || "",
        trade.direction,
        trade.status,
        trade.quantity == null ? "" : trade.quantity,
        trade.entryPrice == null ? "" : trade.entryPrice,
        trade.avgCost == null ? "" : trade.avgCost,
        trade.exitPrice == null ? "" : trade.exitPrice,
        trade.entryDate || "",
        trade.exitDate || "",
        trade.fees == null ? "" : trade.fees,
        trade.targetPrice == null ? "" : trade.targetPrice,
        trade.hardStop == null ? "" : trade.hardStop,
        trade.exitReason || "",
        trade.strategy || "",
        trade.setup || "",
        centsCell(result.grossCents),
        centsCell(result.netCents),
        result.returnBasis || "",
        result.returnPercent || "",
        result.reason === "realized" ? "yes" : "no",
        result.reason === "realized" ? "" : result.reason,
        trade.notes || ""
      ]));
    });
    return lines.join("\n") + "\n";
  }

  function dailyToCsv(journal) {
    const header = ["date", "closed_trade_net", "closed_trade_count", "manual_pnl", "manual_note", "account_adjustment", "adjustment_note", "sources"];
    const keys = new Set(Object.keys(journal && journal.days || {}));
    dedupeTrades(journal && journal.trades).forEach(function (trade) {
      const result = tradeResult(trade);
      if (result.reason === "realized") keys.add(result.exitDate);
    });
    const lines = [csvLine(header)];
    Array.from(keys).filter(parseDateKey).sort().forEach(function (key) {
      const detail = dayDetail(journal, key);
      const sources = [];
      if (detail.tradeCents != null) sources.push("closed-trades");
      if (detail.manualCents != null) sources.push("manual");
      if (detail.adjustmentCents != null) sources.push("account-adjustment");
      if (detail.manualNote && detail.manualCents == null && detail.adjustmentCents == null && detail.tradeCents == null) sources.push("note");
      lines.push(csvLine([
        key,
        centsCell(detail.tradeCents),
        detail.tradeCount ? String(detail.tradeCount) : "",
        centsCell(detail.manualCents),
        detail.manualNote,
        centsCell(detail.adjustmentCents),
        detail.adjustmentNote,
        sources.join("|")
      ]));
    });
    return lines.join("\n") + "\n";
  }

  return {
    TRADE_DATE_CONVENTION: TRADE_DATE_CONVENTION,
    SHORT_RETURN_BASIS: SHORT_RETURN_BASIS,
    LONG_RETURN_BASIS: LONG_RETURN_BASIS,
    STATUS_HELP: STATUS_HELP,
    EXIT_REASON_HELP: EXIT_REASON_HELP,
    CHECKLIST_HELP: CHECKLIST_HELP,
    METRIC_HELP: METRIC_HELP,
    RISK_DISCLAIMER: RISK_DISCLAIMER,
    dateKey: dateKey,
    parseDateKey: parseDateKey,
    addDays: addDays,
    startOfWeek: startOfWeek,
    sameDay: sameDay,
    monthWeeks: monthWeeks,
    monthBounds: monthBounds,
    ytdBounds: ytdBounds,
    rangeForPreset: rangeForPreset,
    inDateRange: inDateRange,
    effectiveEntry: effectiveEntry,
    grossPnlCents: grossPnlCents,
    netPnlCents: netPnlCents,
    longCostBasisCents: longCostBasisCents,
    shortProceedsBasisCents: shortProceedsBasisCents,
    tradeResult: tradeResult,
    dedupeTrades: dedupeTrades,
    analyze: analyze,
    monthSummary: monthSummary,
    dayDetail: dayDetail,
    summarizeKeys: summarizeKeys,
    positionRisk: positionRisk,
    tradesToCsv: tradesToCsv,
    dailyToCsv: dailyToCsv
  };
});
