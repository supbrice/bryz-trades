const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const schema = require("../js/schema.js");
const calc = require("../js/calc.js");
const storage = require("../js/storage.js");

function trade(overrides) {
  return Object.assign({
    id: "t1",
    symbol: "SOFI",
    name: "SoFi",
    direction: "long",
    status: "closed",
    quantity: 5,
    entryPrice: 10,
    avgCost: 10,
    targetPrice: 18,
    hardStop: 9,
    exitPrice: 12,
    entryDate: "2026-01-02",
    exitDate: "2026-01-15",
    fees: 1,
    exitReason: "target",
    strategy: "breakout",
    setup: "daily",
    thesis: "idea",
    lessons: "wait",
    notes: "note",
    getIn: 18,
    getOut: 18,
    orderStatus: "filled",
    fillPrice: 10,
    close: 17
  }, overrides);
}

function journalWith(trades, days) {
  return { schemaVersion: 2, trades: trades, days: days || {}, settings: { accountSize: null, riskPercent: null } };
}

test("v1 positions and manual days migrate without becoming realized trades", () => {
  const migrated = schema.migrateV1({
    version: 1,
    tickers: [{
      id: "sof",
      symbol: "SOFI",
      shares: 50,
      avgCost: 18,
      notes: "keep me",
      getIn: 18,
      getOut: 18,
      hardStop: 16.92,
      orderStatus: "filled",
      fillPrice: 18,
      close: 17
    }],
    days: {
      "2026-01-05": { pnl: 25.5, note: "manual day", breakdown: [{ tickerId: "sof", symbol: "SOFI", amount: 25.5 }] }
    }
  });
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.trades.length, 1);
  assert.equal(migrated.trades[0].status, "open");
  assert.equal(migrated.trades[0].direction, "long");
  assert.equal(migrated.trades[0].exitPrice, null);
  assert.equal(migrated.trades[0].close, 17);
  assert.equal(migrated.trades[0].quantity, 50);
  assert.equal(migrated.days["2026-01-05"].entryType, "manual");
  assert.equal(migrated.days["2026-01-05"].manualPnl, 25.5);
  assert.equal(migrated.days["2026-01-05"].breakdown[0].amount, 25.5);
  assert.equal(calc.analyze(migrated).realizedNetCents, null);
  assert.equal(calc.monthSummary(migrated, 2026, 0, new Date(2026, 0, 31)).manualCents, 2550n);
  assert.equal(calc.monthSummary(migrated, 2026, 0, new Date(2026, 0, 31)).tradeCents, null);
});

test("a pasted close is not an exit, and a bad v1 row is kept", () => {
  const migrated = schema.migrateV1({
    version: 1,
    tickers: [
      { id: "ok", symbol: "SOFI", shares: 1, avgCost: 10, orderStatus: "filled", close: 9 },
      { id: "bad", symbol: "???", shares: -5, notes: "messy" }
    ],
    days: { "not-a-date": { pnl: 3 }, "2026-01-08": { pnl: "nope", note: "kept" } }
  });
  assert.equal(migrated.trades.length, 2);
  assert.equal(calc.tradeResult(migrated.trades[0]).reason, "open");
  assert.equal(migrated.trades[1].status, "open");
  assert.equal(migrated.days["not-a-date"], undefined);
  assert.equal(migrated.days["2026-01-08"].manualPnl, null);
  assert.match(migrated.days["2026-01-08"].note, /Unreadable/);
});

test("round trip, malformed files, and incompatible versions do not apply", () => {
  const original = journalWith([trade({})]);
  const snapshot = JSON.stringify(original);
  const exported = schema.exportJson(original);
  const parsed = schema.journalFromText(exported);
  assert.equal(parsed.trades[0].netCents, undefined);
  assert.equal(parsed.trades[0].symbol, "SOFI");
  assert.equal(parsed.trades[0].fees, 1);
  assert.equal(parsed.schemaVersion, 2);
  assert.match(exported, /"schemaVersion": 2/);
  assert.match(exported, /"app": "ladder"/);

  ["{", "", "null", JSON.stringify({ schemaVersion: 3, trades: [], days: {} }), JSON.stringify({ hello: true })].forEach((text) => {
    const plan = schema.planImport(original, text);
    assert.equal(plan.ok, false);
    assert.equal(JSON.stringify(original), snapshot);
  });
  const duplicateFile = schema.planImport(original, JSON.stringify({
    schemaVersion: 2,
    trades: [trade({ id: "dup" }), trade({ id: "dup" })],
    days: {},
    settings: {}
  }));
  assert.equal(duplicateFile.ok, false);
  assert.match(duplicateFile.error, /more than once/);
  assert.equal(JSON.stringify(original), snapshot);
});

test("merge skips duplicate ids and similar closed trades unless asked", () => {
  const current = journalWith([trade({ id: "t1", exitPrice: 12, quantity: 1, fees: 0 })]);
  const incoming = schema.exportJson(journalWith([
    trade({ id: "t1", exitPrice: 20, quantity: 1, fees: 0 }),
    trade({ id: "t2", exitPrice: 12, quantity: 1, fees: 0 }),
    trade({ id: "t3", symbol: "AMD", exitPrice: 12, quantity: 1, fees: 0 })
  ], { "2026-01-15": { manualPnl: 8, note: "file", breakdown: [] } }));
  current.days["2026-01-15"] = { entryType: "manual", manualPnl: 3, note: "saved", breakdown: [], adjustment: null, adjustmentNote: "" };
  const plan = schema.planImport(current, incoming);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.duplicateIds, ["t1"]);
  const merged = schema.applyImport(current, plan, { mode: "merge" });
  assert.equal(merged.trades.length, 2);
  assert.equal(calc.analyze(merged).realizedNetCents, 400n);
  assert.equal(merged.days["2026-01-15"].manualPnl, 3);
  const overwritten = schema.applyImport(current, plan, { mode: "merge", overwriteIds: true, importSimilar: true, days: "file" });
  assert.equal(overwritten.trades.filter((row) => row.id === "t1").length, 1);
  assert.equal(calc.analyze(overwritten).realizedNetCents, 1400n);
  assert.equal(overwritten.days["2026-01-15"].manualPnl, 8);
  assert.notEqual(overwritten.days["2026-01-15"].manualPnl + current.days["2026-01-15"].manualPnl, overwritten.days["2026-01-15"].manualPnl);
});

test("replace swaps the journal and a failed commit leaves the saved copy", () => {
  const store = storage.createMemoryStorage();
  const current = journalWith([trade({ id: "keep", quantity: 1, fees: 0 })]);
  storage.saveJournal(store, current);
  const before = store.getItem(schema.KEYS.journal);
  const bad = schema.planImport(current, "{");
  assert.throws(() => storage.commitImport(store, current, bad, { mode: "replace" }));
  assert.equal(store.getItem(schema.KEYS.journal), before);

  const plan = schema.planImport(current, schema.exportJson(journalWith([trade({ id: "new", symbol: "AMD", quantity: 1, fees: 0 })])));
  const throwing = storage.createMemoryStorage();
  throwing.setItem(schema.KEYS.journal, before);
  const originalSet = throwing.setItem.bind(throwing);
  throwing.setItem = (key, value) => {
    if (key === schema.KEYS.journal) throw new Error("quota");
    originalSet(key, value);
  };
  assert.throws(() => storage.commitImport(throwing, current, plan, { mode: "replace" }));
  assert.equal(throwing.getItem(schema.KEYS.journal), before);
  const backup = JSON.parse(throwing.getItem(schema.KEYS.preimport));
  assert.equal(backup.raw, before);

  const replaced = schema.applyImport(current, plan, { mode: "replace" });
  assert.equal(replaced.trades.length, 1);
  assert.equal(replaced.trades[0].id, "new");
});

test("migration stores a premigration backup and does not drop the old key", () => {
  const v1 = JSON.stringify({
    version: 1,
    tickers: [{ id: "sof", symbol: "SOFI", shares: 2, avgCost: 18, getIn: 18, getOut: 18, hardStop: 16.92, orderStatus: "waiting" }],
    days: { "2026-02-02": { pnl: -4, note: "down", breakdown: [] } }
  });
  const store = storage.createMemoryStorage({ [schema.KEYS.v1]: v1 });
  const loaded = storage.loadJournal(store);
  assert.equal(loaded.warning, "");
  assert.equal(store.getItem(schema.KEYS.v1), v1);
  const backup = JSON.parse(store.getItem(schema.KEYS.premigration));
  assert.equal(backup.raw, v1);
  assert.equal(backup.reason, "before-schema-v2-migration");
  assert.equal(loaded.data.days["2026-02-02"].entryType, "manual");
  assert.equal(loaded.data.days["2026-02-02"].manualPnl, -4);
  assert.equal(loaded.data.trades[0].status, "open");
  assert.equal(calc.analyze(loaded.data).tradeCount, 0);
  const again = storage.loadJournal(store);
  assert.equal(again.data.trades.length, 1);
  assert.equal(store.getItem(schema.KEYS.v1), v1);
});

test("a failed migration backup does not write the new journal", () => {
  const v1 = JSON.stringify({ version: 1, tickers: [{ symbol: "SOFI" }], days: {} });
  const store = storage.createMemoryStorage({ [schema.KEYS.v1]: v1 });
  const originalSet = store.setItem.bind(store);
  store.setItem = (key, value) => {
    if (key === schema.KEYS.premigration) throw new Error("blocked");
    originalSet(key, value);
  };
  const loaded = storage.loadJournal(store);
  assert.match(loaded.warning, /safety copy/);
  assert.equal(store.getItem(schema.KEYS.journal), null);
  assert.equal(store.getItem(schema.KEYS.v1), v1);
  assert.equal(loaded.unsaved, true);
});

test("unreadable saved data is kept and an earlier copy can be recovered", () => {
  const v1 = JSON.stringify({
    version: 1,
    tickers: [{ id: "sof", symbol: "AMD", shares: 1 }],
    days: { "2026-03-03": { pnl: 2, note: "", breakdown: [] } }
  });
  const store = storage.createMemoryStorage({
    [schema.KEYS.journal]: "{",
    [schema.KEYS.v1]: v1
  });
  const loaded = storage.loadJournal(store);
  assert.equal(store.getItem(schema.KEYS.corrupt), "{");
  assert.equal(loaded.data.trades[0].symbol, "AMD");
  assert.equal(loaded.data.days["2026-03-03"].manualPnl, 2);
  assert.match(loaded.warning, /unreadable copy|backup|earlier/i);
});

test("loose loading keeps a good trade when another trade is invalid", () => {
  const raw = {
    schemaVersion: 2,
    trades: [
      trade({ id: "good", quantity: 1, fees: 0 }),
      { id: "bad", symbol: "BAD!", direction: "long", status: "closed", quantity: -3, entryPrice: 10, exitPrice: 12 }
    ],
    days: {},
    settings: {}
  };
  const read = schema.readStoredJournal(JSON.stringify(raw));
  assert.equal(read.journal.trades.length, 2);
  assert.equal(calc.analyze(read.journal).realizedNetCents, 200n);
  const duped = schema.readStoredJournal(JSON.stringify({
    schemaVersion: 2,
    trades: [trade({ id: "good", quantity: 1, fees: 0 }), trade({ id: "good", quantity: 9, fees: 0 })],
    days: {},
    settings: {}
  }));
  assert.equal(duped.journal.trades.length, 1);
  assert.equal(calc.analyze(duped.journal).realizedNetCents, 200n);
});

test("old SOFI card migrates to one open long and the checklist wording stays manual", () => {
  const journal = schema.migrateSofiCard({ getIn: 18, getOut: 18, hardStop: 16.92, orderStatus: "filled", close: 16, shares: 10 });
  assert.equal(journal.trades[0].symbol, "SOFI");
  assert.equal(journal.trades[0].status, "open");
  assert.equal(journal.trades[0].close, 16);
  assert.equal(calc.analyze(journal).tradeCount, 0);
  vm.runInThisContext(fs.readFileSync(require("node:path").join(__dirname, "../js/logic.js"), "utf8"));
  const status = global.StockTracker.computeStatus(journal.trades[0]);
  assert.equal(status.text, "Pasted close is under the hard stop");
  assert.match(status.detail, /not a live quote/i);
  const held = global.StockTracker.computeStatus(Object.assign({}, journal.trades[0], { close: 19 }));
  assert.equal(held.text, "Filled — hold");
  const short = global.StockTracker.computeStatus(Object.assign({}, journal.trades[0], { direction: "short" }));
  assert.match(short.text, /long trades/);
});
