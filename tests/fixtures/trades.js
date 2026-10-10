// Fixtures in every shape the live Bryz Trades reads.
const base = { name: "", exchange: "", strategy: "", setup: "", thesis: "", lessons: "", notes: "", getIn: null, getOut: null, orderStatus: "", fillPrice: null, close: null, exits: [], markPrice: null, markAsOf: "", targetPrice: null, avgCost: null, exitReason: "" };
const T = (o) => Object.assign({}, base, o);
const v3 = {
  schemaVersion: 3,
  trades: [
    T({ id: "t-long", symbol: "AAPL", direction: "long", status: "closed", quantity: 10, entryPrice: 182.5, exitPrice: 191.2, entryDate: "2026-09-02", exitDate: "2026-09-05", fees: 1.25, hardStop: 178, notes: "breakout", strategy: "Breakout" }),
    T({ id: "t-short", symbol: "TSLA", direction: "short", status: "closed", quantity: 4, entryPrice: 248, exitPrice: 236.5, entryDate: "2026-09-08", exitDate: "2026-09-10", fees: 0, hardStop: 255 }),
    T({ id: "t-call", symbol: "QQQ", direction: "long", status: "closed", assetType: "call", quantity: 2, entryPrice: 2.15, exitPrice: 3.4, entryDate: "2026-09-11", exitDate: "2026-09-12", fees: 1.3 }),
    T({ id: "t-loss", symbol: "MSFT", direction: "long", status: "closed", quantity: 5, entryPrice: 415, exitPrice: 408.2, entryDate: "2026-09-15", exitDate: "2026-09-15", fees: null }),
    T({ id: "t-put-open", symbol: "SPY", direction: "long", status: "open", assetType: "put", quantity: 1, entryPrice: 3.1, entryDate: "2026-10-01", markPrice: 2.4, markAsOf: "2026-10-09", hardStop: 2 }),
    T({ id: "t-partial", symbol: "NVDA", direction: "long", status: "open", quantity: 10, entryPrice: 120, entryDate: "2026-09-20", hardStop: 112, exits: [{ id: "x1", quantity: 4, price: 131.5, date: "2026-09-25", fees: 0.5, reason: "target" }] }),
    T({ id: "t-closed-lots", symbol: "AMD", direction: "short", status: "closed", quantity: 6, entryPrice: 160, entryDate: "2026-09-03", exits: [{ id: "y1", quantity: 2, price: 150, date: "2026-09-09", fees: null, reason: "" }, { id: "y2", quantity: 4, price: 165.25, date: "2026-09-18", fees: 1, reason: "stop" }] }),
    T({ id: "t-cancel", symbol: "META", direction: "long", status: "cancelled", quantity: 3, entryPrice: 590, entryDate: "2026-09-22" }),
    T({ id: "t-avg", symbol: "SOFI", direction: "long", status: "open", quantity: 150.5, entryPrice: null, avgCost: 8.42, getIn: 8.1, getOut: 7.6, orderStatus: "filled", close: 9.05, notes: "from v1" }),
    T({ id: "t-undated", symbol: "IWM", direction: "long", status: "closed", quantity: 3, entryPrice: 210, exitPrice: 214, entryDate: "", exitDate: "", fees: 0 }),
    T({ id: "t-frac", symbol: "BRK.B", direction: "long", status: "closed", quantity: 0.3333, entryPrice: 452.1234, exitPrice: 460.0001, entryDate: "2026-10-02", exitDate: "2026-10-06", fees: 0.01 })
  ],
  days: {
    "2026-09-05": { entryType: "manual", manualPnl: 80.5, note: "Good day", breakdown: [{ tickerId: "", symbol: "AAPL", amount: 80.5 }], adjustment: null, adjustmentNote: "" },
    "2026-10-03": { entryType: "manual", manualPnl: -42.1, note: "manual only", breakdown: [], adjustment: 500, adjustmentNote: "deposit" }
  },
  settings: { accountSize: 25000, riskPercent: 1.5, selectedSymbol: "AAPL", selectedExchange: "NASDAQ", chartPeriod: "6M", watchlist: [{ symbol: "AAPL", exchange: "NASDAQ" }, { symbol: "SOFI", exchange: "" }] }
};
const v2 = JSON.parse(JSON.stringify(v3)); v2.schemaVersion = 2; v2.trades.forEach((t) => { delete t.assetType; delete t.exits; delete t.markPrice; delete t.markAsOf; }); v2.trades = v2.trades.filter((t) => ["t-long", "t-short", "t-loss", "t-cancel", "t-avg", "t-undated"].includes(t.id));
const v1 = { version: 1, tickers: [{ id: "v1a", symbol: "SOFI", shares: 100, avgCost: 8.5, notes: "old", getIn: 8, getOut: 7.5, hardStop: 7.2, orderStatus: "filled", fillPrice: 8.4, close: 9.1 }, { id: "v1b", symbol: "PLTR", shares: 20, avgCost: 24, notes: "", getIn: null, getOut: null, hardStop: null, orderStatus: "", fillPrice: null, close: null }], days: { "2026-08-01": { pnl: 120.25, note: "v1 day", breakdown: [] } } };
const sofi = { shares: 250, getIn: 7.9, getOut: 7.4, hardStop: 7.1, orderStatus: "waiting", fillPrice: null, close: 8.2 };
const exportFile = Object.assign({ app: "ladder", exportedAt: "2026-10-01T12:00:00.000Z" }, JSON.parse(JSON.stringify(v3)));
module.exports = { v3, v2, v1, sofi, exportFile };
