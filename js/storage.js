/* localStorage load/save, the old SOFI card migration, and JSON backup. */
(function (root) {
  const ST = root.StockTracker = root.StockTracker || {};
  const NEW_KEY = "stock-tracker-v1";
  const OLD_KEY = "sofi-levels-card-v1";
  const MAX_TICKERS = 200;
  const MAX_DAYS = 4000;

  function uid() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function numOrNull(value) {
    if (value === "" || value == null) return null;
    const n = typeof value === "number" ? value : Number(String(value).trim());
    return Number.isFinite(n) ? n : null;
  }

  function nonNegOrNull(value) {
    const n = numOrNull(value);
    if (n == null || n < 0) return null;
    return n;
  }

  function cleanSymbol(value) {
    return String(value || "").trim().replace(/^\$/, "").toUpperCase();
  }

  function validSymbol(symbol) {
    return /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol);
  }

  function cleanOrder(value) {
    if (value === "waiting" || value === "filled" || value === "cancelled") return value;
    return "";
  }

  function textField(value) {
    if (value == null) return "";
    return String(value).trim().slice(0, 500);
  }

  function cleanTicker(raw) {
    const symbol = cleanSymbol(raw && raw.symbol);
    if (!validSymbol(symbol)) throw new Error("Enter a ticker like SOFI or BRK.B.");
    const shares = numOrNull(raw.shares);
    const avgCost = numOrNull(raw.avgCost);
    if (shares != null && shares < 0) throw new Error(symbol + " can't have a negative share count.");
    if (avgCost != null && avgCost < 0) throw new Error(symbol + " can't have a negative average cost.");
    ["getIn", "getOut", "hardStop", "fillPrice", "close"].forEach(function (field) {
      const n = numOrNull(raw[field]);
      if (n != null && n < 0) throw new Error(symbol + " can't have a negative price level.");
    });
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : uid();
    return {
      id: id,
      symbol: symbol,
      shares: shares,
      avgCost: avgCost,
      notes: textField(raw.notes),
      getIn: nonNegOrNull(raw.getIn),
      getOut: nonNegOrNull(raw.getOut),
      hardStop: nonNegOrNull(raw.hardStop),
      orderStatus: cleanOrder(raw.orderStatus),
      fillPrice: nonNegOrNull(raw.fillPrice),
      close: nonNegOrNull(raw.close)
    };
  }

  function cleanDay(raw) {
    if (!raw || raw.pnl == null || raw.pnl === "") throw new Error("Enter the day's gain or loss.");
    const pnl = Number(raw.pnl);
    if (!Number.isFinite(pnl)) throw new Error("Enter a number, like 25 or -10.");
    const breakdown = [];
    if (Array.isArray(raw.breakdown)) {
      raw.breakdown.forEach(function (row) {
        if (!row) return;
        const amount = numOrNull(row.amount);
        const symbol = cleanSymbol(row.symbol);
        if (amount == null || !symbol) return;
        breakdown.push({
          tickerId: typeof row.tickerId === "string" ? row.tickerId : "",
          symbol: symbol,
          amount: ST.roundCents(amount)
        });
      });
    }
    return {
      pnl: ST.roundCents(pnl),
      note: textField(raw.note),
      breakdown: breakdown.slice(0, 12)
    };
  }

  function cleanData(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("That file is not a tracker backup.");
    if (!Array.isArray(raw.tickers) || !raw.days || typeof raw.days !== "object" || Array.isArray(raw.days)) {
      throw new Error("That file is missing stocks or days.");
    }
    if (raw.tickers.length > MAX_TICKERS) throw new Error("That file has too many stocks.");
    const dayKeys = Object.keys(raw.days);
    if (dayKeys.length > MAX_DAYS) throw new Error("That file has too many days.");

    const seenSymbols = Object.create(null);
    const seenIds = Object.create(null);
    const tickers = raw.tickers.map(function (ticker, index) {
      let cleaned;
      try {
        cleaned = cleanTicker(ticker || {});
      } catch (err) {
        throw new Error("Stock " + (index + 1) + ": " + err.message);
      }
      if (seenSymbols[cleaned.symbol]) throw new Error("Two entries use the ticker " + cleaned.symbol + ".");
      seenSymbols[cleaned.symbol] = true;
      if (seenIds[cleaned.id]) cleaned.id = uid();
      seenIds[cleaned.id] = true;
      return cleaned;
    });

    const days = {};
    dayKeys.forEach(function (key) {
      if (!ST.parseDateKey(key)) throw new Error("A day has a bad date (" + key + ").");
      try {
        days[key] = cleanDay(raw.days[key] || {});
      } catch (err) {
        throw new Error(key + ": " + err.message);
      }
    });
    return { version: 1, tickers: tickers, days: days };
  }

  function seed() {
    return {
      version: 1,
      tickers: [{
        id: uid(),
        symbol: "SOFI",
        shares: null,
        avgCost: null,
        notes: "",
        getIn: 18,
        getOut: 18,
        hardStop: 16.92,
        orderStatus: "waiting",
        fillPrice: null,
        close: null
      }],
      days: {}
    };
  }

  function migrateOld(old) {
    const data = seed();
    const ticker = data.tickers[0];
    const shares = numOrNull(old.shares);
    ticker.shares = shares != null && shares < 0 ? null : shares;
    ticker.avgCost = null;
    ticker.getIn = nonNegOrNull(old.getIn);
    ticker.getOut = nonNegOrNull(old.getOut);
    ticker.hardStop = nonNegOrNull(old.hardStop);
    ticker.orderStatus = cleanOrder(old.orderStatus) || "waiting";
    ticker.fillPrice = nonNegOrNull(old.fillPrice);
    ticker.close = nonNegOrNull(old.close);
    return data;
  }

  ST.tickerFromFields = function (fields, existingId) {
    try {
      const ticker = cleanTicker(Object.assign({}, fields, { id: existingId || "" }));
      return { ticker: ticker };
    } catch (err) {
      return { error: err.message };
    }
  };

  ST.dayFromFields = function (fields) {
    try {
      return { day: cleanDay(fields) };
    } catch (err) {
      return { error: err.message };
    }
  };

  ST.saveState = function (data) {
    localStorage.setItem(NEW_KEY, JSON.stringify({
      version: 1,
      tickers: data.tickers,
      days: data.days
    }));
  };

  ST.loadState = function () {
    let raw = null;
    try {
      raw = localStorage.getItem(NEW_KEY);
    } catch (err) {
      return { data: seed(), warning: "This browser blocked saved data. Export a backup when you can." };
    }
    if (raw) {
      try {
        return { data: cleanData(JSON.parse(raw)), warning: "" };
      } catch (err) {
        try { localStorage.setItem(NEW_KEY + "-corrupt", raw); } catch (e) { /* keep going */ }
        const fresh = seed();
        try { ST.saveState(fresh); } catch (e) { /* ignore */ }
        return {
          data: fresh,
          warning: "Saved data could not be read, so the tracker started fresh. The unreadable copy is still in this browser."
        };
      }
    }
    try {
      const oldRaw = localStorage.getItem(OLD_KEY);
      if (oldRaw) {
        const migrated = migrateOld(JSON.parse(oldRaw));
        ST.saveState(migrated);
        return { data: migrated, warning: "" };
      }
    } catch (err) { /* a broken old card should not block the new tracker */ }
    const seeded = seed();
    try { ST.saveState(seeded); } catch (err) { /* ignore */ }
    return { data: seeded, warning: "" };
  };

  ST.exportJson = function (data) {
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      tickers: data.tickers,
      days: data.days
    }, null, 2);
  };

  ST.parseImport = function (text) {
    if (typeof text !== "string" || !text.trim() || text.length > 2000000) {
      throw new Error("That file is empty or too large.");
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error("That file is not valid JSON.");
    }
    return cleanData(parsed);
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
