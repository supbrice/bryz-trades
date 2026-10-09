/* Journal shape, validation, v1 migration, and import planning.
   Applying an import is a pure function. Storage IO lives in storage.js. */
(function (root, factory) {
  const money = (typeof module !== "undefined" && module.exports)
    ? require("./money.js")
    : root.StockTracker;
  const api = factory(money);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ST = root.StockTracker = root.StockTracker || {};
  Object.assign(ST, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (money) {
  const SCHEMA_VERSION = 2;
  const KEYS = {
    journal: "ladder-journal-v2",
    v1: "stock-tracker-v1",
    sofi: "sofi-levels-card-v1",
    premigration: "ladder-journal-premigration",
    preimport: "ladder-journal-preimport",
    corrupt: "ladder-journal-v2-corrupt"
  };
  const MAX_TRADES = 2000;
  const MAX_DAYS = 4000;
  const MAX_IMPORT_CHARS = 2000000;
  const DIRECTIONS = { long: true, short: true };
  const STATUSES = { open: true, closed: true, cancelled: true };
  const EXIT_REASONS = { "": true, target: true, stop: true, other: true };
  const ORDER_STATUSES = { "": true, waiting: true, filled: true, cancelled: true };

  function uid() {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === "function") return cryptoObj.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function text(value, max) {
    if (value == null) return "";
    return String(value).trim().slice(0, max);
  }

  function cleanSymbol(value) {
    return String(value || "").trim().replace(/^\$/, "").toUpperCase();
  }

  function validSymbol(symbol) {
    return /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol);
  }

  function optionalMoney(value, label) {
    if (value == null || value === "") return null;
    const n = money.moneyNumber(value);
    if (n == null) throw new Error(label + " must be a number.");
    if (n < 0) throw new Error(label + " can't be negative.");
    return n;
  }

  function optionalPrice(value, label) {
    if (value == null || value === "") return null;
    const n = money.priceNumber(value);
    if (n == null) throw new Error(label + " must be a number.");
    if (n < 0) throw new Error(label + " can't be negative.");
    return n;
  }

  function optionalQty(value, label) {
    if (value == null || value === "") return null;
    const n = money.qtyNumber(value);
    if (n == null) throw new Error(label + " must be a number.");
    if (n < 0) throw new Error(label + " can't be negative.");
    return n;
  }

  function signedMoney(value, label) {
    if (value == null || value === "") return null;
    const n = money.moneyNumber(value);
    if (n == null) throw new Error(label + " must be a number.");
    return n;
  }

  function optionalDate(value, label) {
    if (value == null || value === "") return "";
    const textValue = String(value).trim();
    if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(textValue)) throw new Error(label + " must be a YYYY-MM-DD date.");
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(textValue);
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      throw new Error(label + " is not a real date.");
    }
    return textValue;
  }

  function cleanTrade(raw, indexLabel) {
    const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const where = indexLabel ? indexLabel + ": " : "";
    const symbol = cleanSymbol(src.symbol);
    if (!validSymbol(symbol)) throw new Error(where + "Enter a ticker like SOFI or BRK.B.");
    if (!DIRECTIONS[src.direction]) throw new Error(where + symbol + " needs a long or short direction.");
    if (!STATUSES[src.status]) throw new Error(where + symbol + " needs an open, closed, or cancelled status.");
    const exitReason = src.exitReason == null || src.exitReason === "" ? "" : String(src.exitReason);
    if (!EXIT_REASONS[exitReason]) throw new Error(where + symbol + " has an unknown exit reason.");
    const orderStatus = src.orderStatus == null || src.orderStatus === "" ? "" : String(src.orderStatus);
    if (!ORDER_STATUSES[orderStatus]) throw new Error(where + symbol + " has an unknown checklist status.");
    let quantity;
    let entryPrice;
    let avgCost;
    let targetPrice;
    let hardStop;
    let exitPrice;
    let fees;
    let getIn;
    let getOut;
    let fillPrice;
    let close;
    try {
      quantity = optionalQty(src.quantity != null ? src.quantity : src.shares, "Shares");
      entryPrice = optionalPrice(src.entryPrice, "Entry price");
      avgCost = optionalPrice(src.avgCost, "Average cost");
      targetPrice = optionalPrice(src.targetPrice, "Target");
      hardStop = optionalPrice(src.hardStop, "Hard stop");
      exitPrice = optionalPrice(src.exitPrice, "Exit price");
      fees = optionalMoney(src.fees, "Fees");
      getIn = optionalPrice(src.getIn, "Get-in");
      getOut = optionalPrice(src.getOut, "Get-out");
      fillPrice = optionalPrice(src.fillPrice, "Fill price");
      close = optionalPrice(src.close, "Close");
    } catch (err) {
      throw new Error(where + err.message);
    }
    let entryDate;
    let exitDate;
    try {
      entryDate = optionalDate(src.entryDate, "Entry date");
      exitDate = optionalDate(src.exitDate, "Exit date");
    } catch (err) {
      throw new Error(where + err.message);
    }
    const id = typeof src.id === "string" && src.id.trim() ? src.id.trim().slice(0, 80) : uid();
    return {
      id: id,
      symbol: symbol,
      name: text(src.name, 80),
      direction: src.direction,
      status: src.status,
      quantity: quantity,
      entryPrice: entryPrice,
      avgCost: avgCost,
      targetPrice: targetPrice,
      hardStop: hardStop,
      exitPrice: exitPrice,
      entryDate: entryDate,
      exitDate: exitDate,
      fees: fees,
      exitReason: exitReason,
      strategy: text(src.strategy, 80),
      setup: text(src.setup, 80),
      thesis: text(src.thesis, 2000),
      lessons: text(src.lessons, 2000),
      notes: text(src.notes, 2000),
      getIn: getIn,
      getOut: getOut,
      orderStatus: orderStatus,
      fillPrice: fillPrice,
      close: close
    };
  }

  function cleanBreakdown(raw) {
    if (!Array.isArray(raw)) return [];
    const rows = [];
    raw.forEach(function (row) {
      if (!row || rows.length >= 12) return;
      const symbol = cleanSymbol(row.symbol);
      const amount = money.moneyNumber(row.amount);
      if (!symbol || amount == null) return;
      rows.push({
        tickerId: typeof row.tickerId === "string" ? row.tickerId.slice(0, 80) : "",
        symbol: symbol,
        amount: amount
      });
    });
    return rows;
  }

  function cleanDay(raw) {
    const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const manualSource = src.manualPnl != null ? src.manualPnl : src.pnl;
    return {
      entryType: "manual",
      manualPnl: signedMoney(manualSource, "Manual result"),
      note: text(src.note, 2000),
      breakdown: cleanBreakdown(src.breakdown),
      adjustment: signedMoney(src.adjustment, "Account adjustment"),
      adjustmentNote: text(src.adjustmentNote, 500)
    };
  }

  function emptySettings() {
    return { accountSize: null, riskPercent: null };
  }

  function cleanSettings(raw) {
    const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const accountSize = src.accountSize == null || src.accountSize === "" ? null : optionalMoney(src.accountSize, "Account size");
    const riskPercent = src.riskPercent == null || src.riskPercent === "" ? null : money.scaledToNumber(money.parseScaledDigits(src.riskPercent, 2), 2);
    if (src.riskPercent != null && src.riskPercent !== "" && (riskPercent == null || riskPercent < 0 || riskPercent > 100)) {
      throw new Error("Risk percent must be between 0 and 100.");
    }
    return { accountSize: accountSize, riskPercent: riskPercent };
  }

  function emptyJournal() {
    return { schemaVersion: SCHEMA_VERSION, trades: [], days: {}, settings: emptySettings() };
  }

  function seedJournal() {
    const journal = emptyJournal();
    journal.trades.push(cleanTrade({
      symbol: "SOFI",
      direction: "long",
      status: "open",
      getIn: 18,
      getOut: 18,
      hardStop: 16.92,
      orderStatus: "waiting"
    }));
    return journal;
  }

  function cleanJournal(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("That file is not a Ladder backup.");
    if (raw.schemaVersion !== SCHEMA_VERSION) {
      throw new Error("That file uses schema version " + (raw.schemaVersion == null ? "(missing)" : raw.schemaVersion) + ", which this page does not read. Nothing was changed.");
    }
    if (!Array.isArray(raw.trades)) throw new Error("That file is missing trades.");
    if (!raw.days || typeof raw.days !== "object" || Array.isArray(raw.days)) throw new Error("That file is missing days.");
    if (raw.trades.length > MAX_TRADES) throw new Error("That file has too many trades.");
    const dayKeys = Object.keys(raw.days);
    if (dayKeys.length > MAX_DAYS) throw new Error("That file has too many days.");
    const seen = Object.create(null);
    const trades = raw.trades.map(function (trade, index) {
      const cleaned = cleanTrade(trade, "Trade " + (index + 1));
      if (seen[cleaned.id]) throw new Error("That file lists trade id " + cleaned.id + " more than once. Nothing was changed.");
      seen[cleaned.id] = true;
      return cleaned;
    });
    const days = {};
    dayKeys.forEach(function (key) {
      if (!optionalDate(key, "Day")) throw new Error("A day has a bad date (" + key + ").");
      try {
        days[key] = cleanDay(raw.days[key]);
      } catch (err) {
        throw new Error(key + ": " + err.message);
      }
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      trades: trades,
      days: days,
      settings: cleanSettings(raw.settings)
    };
  }

  function looseNumber(parser, value) {
    if (value == null || value === "") return null;
    const n = parser(value);
    if (n == null || n < 0) return null;
    return n;
  }

  function recoverTrade(raw, index) {
    const src = raw && typeof raw === "object" ? raw : {};
    let symbol = cleanSymbol(src.symbol);
    if (!validSymbol(symbol)) {
      const fallback = symbol.replace(/[^A-Z0-9.-]/g, "").replace(/^[^A-Z]+/, "").slice(0, 10);
      symbol = validSymbol(fallback) ? fallback : ("M" + String(index + 1));
    }
    const direction = DIRECTIONS[src.direction] ? src.direction : "long";
    const status = STATUSES[src.status] ? src.status : "open";
    const exitReason = EXIT_REASONS[src.exitReason] ? src.exitReason : "";
    const orderStatus = ORDER_STATUSES[src.orderStatus] ? src.orderStatus : "";
    const noteBits = [];
    if (src.notes) noteBits.push(String(src.notes));
    if (!DIRECTIONS[src.direction] || !STATUSES[src.status]) {
      noteBits.push("Recovered with missing direction or status kept as " + direction + " / " + status + " so it is not invented as a realized result.");
    }
    return {
      id: typeof src.id === "string" && src.id.trim() ? src.id.trim().slice(0, 80) : uid(),
      symbol: symbol,
      name: text(src.name, 80),
      direction: direction,
      status: status,
      quantity: looseNumber(money.qtyNumber, src.quantity != null ? src.quantity : src.shares),
      entryPrice: looseNumber(money.priceNumber, src.entryPrice),
      avgCost: looseNumber(money.priceNumber, src.avgCost),
      targetPrice: looseNumber(money.priceNumber, src.targetPrice),
      hardStop: looseNumber(money.priceNumber, src.hardStop),
      exitPrice: looseNumber(money.priceNumber, src.exitPrice),
      entryDate: safeDate(src.entryDate),
      exitDate: safeDate(src.exitDate),
      fees: looseNumber(money.moneyNumber, src.fees),
      exitReason: exitReason || "",
      strategy: text(src.strategy, 80),
      setup: text(src.setup, 80),
      thesis: text(src.thesis, 2000),
      lessons: text(src.lessons, 2000),
      notes: text(noteBits.join(" "), 2000),
      getIn: looseNumber(money.priceNumber, src.getIn),
      getOut: looseNumber(money.priceNumber, src.getOut),
      orderStatus: orderStatus,
      fillPrice: looseNumber(money.priceNumber, src.fillPrice),
      close: looseNumber(money.priceNumber, src.close)
    };
  }

  function safeDate(value) {
    try {
      return optionalDate(value, "Date");
    } catch (err) {
      return "";
    }
  }

  function readStoredJournal(raw) {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("unreadable");
    if (parsed.schemaVersion !== SCHEMA_VERSION) throw new Error("incompatible");
    if (!Array.isArray(parsed.trades) || !parsed.days || typeof parsed.days !== "object" || Array.isArray(parsed.days)) {
      throw new Error("unreadable");
    }
    const warnings = [];
    const seen = Object.create(null);
    const trades = [];
    parsed.trades.forEach(function (trade, index) {
      let cleaned;
      try {
        cleaned = cleanTrade(trade, "Trade " + (index + 1));
      } catch (err) {
        cleaned = recoverTrade(trade, index);
        warnings.push("Trade " + (index + 1) + " was kept with invalid fields cleared.");
      }
      if (seen[cleaned.id]) {
        warnings.push("A duplicate trade id was ignored so it is not counted twice.");
        return;
      }
      seen[cleaned.id] = true;
      trades.push(cleaned);
    });
    const days = {};
    Object.keys(parsed.days).forEach(function (key) {
      if (Object.keys(days).length >= MAX_DAYS) return;
      let dateOk = false;
      try { dateOk = !!optionalDate(key, "Day"); } catch (err) { dateOk = false; }
      if (!dateOk) {
        warnings.push("A day with a bad date was left out of the calendar.");
        return;
      }
      try {
        days[key] = cleanDay(parsed.days[key]);
      } catch (err) {
        const src = parsed.days[key] || {};
        days[key] = {
          entryType: "manual",
          manualPnl: null,
          note: text("Unreadable manual amount. " + (src.note || ""), 2000),
          breakdown: [],
          adjustment: null,
          adjustmentNote: ""
        };
        warnings.push(key + " had an unreadable amount and was kept without a number.");
      }
    });
    let settings = emptySettings();
    try { settings = cleanSettings(parsed.settings); } catch (err) { warnings.push("Saved risk settings were reset."); }
    return {
      journal: { schemaVersion: SCHEMA_VERSION, trades: trades, days: days, settings: settings },
      warnings: warnings
    };
  }

  function v1TickerToTrade(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    return {
      id: src.id,
      symbol: src.symbol,
      name: "",
      direction: "long",
      status: "open",
      quantity: src.shares,
      entryPrice: null,
      avgCost: src.avgCost,
      targetPrice: null,
      hardStop: src.hardStop,
      exitPrice: null,
      entryDate: "",
      exitDate: "",
      fees: null,
      exitReason: "",
      strategy: "",
      setup: "",
      thesis: "",
      lessons: "",
      notes: src.notes,
      getIn: src.getIn,
      getOut: src.getOut,
      orderStatus: src.orderStatus,
      fillPrice: src.fillPrice,
      close: src.close
    };
  }

  function migrateV1(raw) {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Older data was not a journal.");
    if (!Array.isArray(parsed.tickers) || !parsed.days || typeof parsed.days !== "object" || Array.isArray(parsed.days)) {
      throw new Error("Older data is missing stocks or days.");
    }
    const trades = parsed.tickers.map(function (ticker, index) {
      try {
        return cleanTrade(v1TickerToTrade(ticker), "Stock " + (index + 1));
      } catch (err) {
        const recovered = recoverTrade(v1TickerToTrade(ticker), index);
        recovered.notes = text((recovered.notes ? recovered.notes + " " : "") + "Recovered from the previous tracker.", 2000);
        recovered.status = "open";
        recovered.direction = "long";
        recovered.exitPrice = null;
        recovered.exitDate = "";
        return recovered;
      }
    });
    const days = {};
    Object.keys(parsed.days).forEach(function (key) {
      let dateOk = false;
      try { dateOk = !!optionalDate(key, "Day"); } catch (err) { dateOk = false; }
      if (!dateOk) return;
      const src = parsed.days[key] || {};
      let manual = null;
      try { manual = signedMoney(src.pnl, "Manual result"); } catch (err) { manual = null; }
      days[key] = {
        entryType: "manual",
        manualPnl: manual,
        note: text(manual == null && src.pnl != null ? "Unreadable manual amount. " + (src.note || "") : src.note, 2000),
        breakdown: cleanBreakdown(src.breakdown),
        adjustment: null,
        adjustmentNote: ""
      };
    });
    return { schemaVersion: SCHEMA_VERSION, trades: trades, days: days, settings: emptySettings() };
  }

  function migrateSofiCard(raw) {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const src = parsed && typeof parsed === "object" ? parsed : {};
    return migrateV1({
      version: 1,
      tickers: [{
        symbol: "SOFI",
        shares: src.shares,
        avgCost: null,
        notes: "",
        getIn: src.getIn,
        getOut: src.getOut,
        hardStop: src.hardStop,
        orderStatus: src.orderStatus,
        fillPrice: src.fillPrice,
        close: src.close
      }],
      days: {}
    });
  }

  function toStored(journal) {
    return {
      schemaVersion: SCHEMA_VERSION,
      trades: journal.trades,
      days: journal.days,
      settings: journal.settings || emptySettings()
    };
  }

  function exportPayload(journal, isoTime) {
    return {
      schemaVersion: SCHEMA_VERSION,
      app: "ladder",
      exportedAt: isoTime || new Date().toISOString(),
      trades: journal.trades,
      days: journal.days,
      settings: journal.settings || emptySettings()
    };
  }

  function exportJson(journal) {
    return JSON.stringify(exportPayload(journal), null, 2);
  }

  function closedFingerprint(trade) {
    if (!trade || trade.status !== "closed") return "";
    const qty = trade.quantity == null ? "" : String(money.qtyNumber(trade.quantity));
    const entry = trade.entryPrice == null ? (trade.avgCost == null ? "" : "avg:" + String(money.priceNumber(trade.avgCost))) : String(money.priceNumber(trade.entryPrice));
    const exit = trade.exitPrice == null ? "" : String(money.priceNumber(trade.exitPrice));
    return [trade.symbol, trade.direction, qty, entry, exit, trade.entryDate || "", trade.exitDate || ""].join("|");
  }

  function classifyEnvelope(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "unknown";
    if (parsed.schemaVersion === SCHEMA_VERSION && Array.isArray(parsed.trades)) return "v2";
    if (parsed.schemaVersion != null && parsed.schemaVersion !== SCHEMA_VERSION) return "incompatible";
    if ((parsed.version === 1 || parsed.version == null) && Array.isArray(parsed.tickers) && parsed.days && typeof parsed.days === "object") return "v1";
    if (parsed.getIn != null || parsed.hardStop != null || parsed.orderStatus != null) return "sofi";
    return "unknown";
  }

  function journalFromText(textValue) {
    if (typeof textValue !== "string" || !textValue.trim()) throw new Error("That file is empty.");
    if (textValue.length > MAX_IMPORT_CHARS) throw new Error("That file is too large.");
    let parsed;
    try {
      parsed = JSON.parse(textValue);
    } catch (err) {
      throw new Error("That file is not valid JSON.");
    }
    const kind = classifyEnvelope(parsed);
    if (kind === "incompatible") {
      throw new Error("That file uses schema version " + parsed.schemaVersion + ", which this page does not read. Nothing was changed.");
    }
    if (kind === "v2") return cleanJournal(parsed);
    if (kind === "v1") return migrateV1(parsed);
    if (kind === "sofi") return migrateSofiCard(parsed);
    throw new Error("That file is not a Ladder backup. Nothing was changed.");
  }

  function planImport(current, textValue) {
    let incoming;
    try {
      incoming = journalFromText(textValue);
    } catch (err) {
      return { ok: false, error: err.message || "Couldn't read that file." };
    }
    const currentTrades = current && Array.isArray(current.trades) ? current.trades : [];
    const currentDays = current && current.days ? current.days : {};
    const currentIds = Object.create(null);
    const currentPrints = Object.create(null);
    currentTrades.forEach(function (trade) {
      currentIds[trade.id] = trade;
      const print = closedFingerprint(trade);
      if (print) currentPrints[print] = trade.id;
    });
    const duplicateIds = [];
    const similar = [];
    const seenFilePrints = Object.create(null);
    incoming.trades.forEach(function (trade) {
      if (currentIds[trade.id]) duplicateIds.push(trade.id);
      const print = closedFingerprint(trade);
      if (!print) return;
      if (currentPrints[print] && currentPrints[print] !== trade.id) {
        similar.push({ importedId: trade.id, existingId: currentPrints[print], symbol: trade.symbol, source: "saved" });
      } else if (seenFilePrints[print] && seenFilePrints[print] !== trade.id) {
        similar.push({ importedId: trade.id, existingId: seenFilePrints[print], symbol: trade.symbol, source: "file" });
      } else {
        seenFilePrints[print] = trade.id;
      }
    });
    const dayOverlaps = Object.keys(incoming.days).filter(function (key) { return !!currentDays[key]; }).sort();
    return {
      ok: true,
      error: "",
      journal: incoming,
      fileTrades: incoming.trades.length,
      fileDays: Object.keys(incoming.days).length,
      duplicateIds: duplicateIds,
      similar: similar,
      dayOverlaps: dayOverlaps
    };
  }

  function cloneJournal(journal) {
    return {
      schemaVersion: SCHEMA_VERSION,
      trades: journal.trades.map(function (trade) { return Object.assign({}, trade); }),
      days: Object.keys(journal.days).reduce(function (acc, key) {
        const day = journal.days[key];
        acc[key] = Object.assign({}, day, { breakdown: (day.breakdown || []).map(function (row) { return Object.assign({}, row); }) });
        return acc;
      }, {}),
      settings: Object.assign({}, journal.settings || emptySettings())
    };
  }

  function applyImport(current, plan, choices) {
    if (!plan || !plan.ok) throw new Error(plan && plan.error || "Nothing to import.");
    const mode = choices && choices.mode === "replace" ? "replace" : "merge";
    if (mode === "replace") return cloneJournal(plan.journal);
    const overwrite = !!(choices && choices.overwriteIds);
    const importSimilar = !!(choices && choices.importSimilar);
    const dayChoice = choices && choices.days === "file" ? "file" : "keep";
    const next = cloneJournal(current && current.trades ? current : emptyJournal());
    const indexById = Object.create(null);
    next.trades.forEach(function (trade, index) { indexById[trade.id] = index; });
    const prints = Object.create(null);
    next.trades.forEach(function (trade) {
      const print = closedFingerprint(trade);
      if (print) prints[print] = trade.id;
    });
    plan.journal.trades.forEach(function (trade) {
      const print = closedFingerprint(trade);
      if (indexById[trade.id] != null) {
        if (overwrite) {
          next.trades[indexById[trade.id]] = Object.assign({}, trade);
          if (print) prints[print] = trade.id;
        }
        return;
      }
      if (print && prints[print] && !importSimilar) return;
      next.trades.push(Object.assign({}, trade));
      indexById[trade.id] = next.trades.length - 1;
      if (print) prints[print] = trade.id;
    });
    Object.keys(plan.journal.days).forEach(function (key) {
      if (next.days[key] && dayChoice !== "file") return;
      const day = plan.journal.days[key];
      next.days[key] = Object.assign({}, day, { breakdown: (day.breakdown || []).slice() });
    });
    const incomingSettings = plan.journal.settings || emptySettings();
    next.settings = {
      accountSize: next.settings.accountSize != null ? next.settings.accountSize : incomingSettings.accountSize,
      riskPercent: next.settings.riskPercent != null ? next.settings.riskPercent : incomingSettings.riskPercent
    };
    return next;
  }

  function tradeFromFields(fields, existingId) {
    try {
      const trade = cleanTrade(Object.assign({}, fields, { id: existingId || fields.id || "" }));
      return { trade: trade };
    } catch (err) {
      return { error: err.message };
    }
  }

  function dayFromFields(fields) {
    try {
      return { day: cleanDay(fields || {}) };
    } catch (err) {
      return { error: err.message };
    }
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    KEYS: KEYS,
    emptyJournal: emptyJournal,
    seedJournal: seedJournal,
    cleanTrade: cleanTrade,
    cleanDay: cleanDay,
    cleanJournal: cleanJournal,
    readStoredJournal: readStoredJournal,
    migrateV1: migrateV1,
    migrateSofiCard: migrateSofiCard,
    toStored: toStored,
    exportPayload: exportPayload,
    exportJson: exportJson,
    closedFingerprint: closedFingerprint,
    journalFromText: journalFromText,
    planImport: planImport,
    applyImport: applyImport,
    tradeFromFields: tradeFromFields,
    dayFromFields: dayFromFields
  };
});
