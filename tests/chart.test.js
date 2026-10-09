const test = require("node:test");
const assert = require("node:assert/strict");
const chart = require("../js/chart.js");

test("advanced chart config uses the official embed and the page theme", () => {
  assert.equal(chart.ADVANCED_CHART_URL, "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js");
  assert.equal(chart.TICKER_TAPE_URL, "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js");
  const dark = chart.chartWidgetConfig("aapl", "nasdaq", "1Y", "dark");
  assert.equal(dark.symbol, "NASDAQ:AAPL");
  assert.equal(dark.range, "12M");
  assert.equal(dark.interval, "D");
  assert.equal(dark.theme, "dark");
  assert.equal(dark.support_host, "https://www.tradingview.com");
  assert.equal(dark.allow_symbol_change, false);
  const light = chart.chartWidgetConfig("SPY", "", "MAX", "light");
  assert.equal(light.symbol, "SPY");
  assert.equal(light.range, "ALL");
  assert.equal(light.theme, "light");
  const periods = chart.CHART_PERIODS.map((period) => period.id);
  assert.deepEqual(periods, ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"]);
});

test("ticker tape config lists symbols and does not include a price", () => {
  const tape = chart.tapeWidgetConfig([
    { symbol: "NVDA", exchange: "NASDAQ" },
    { symbol: "MSFT", exchange: "" }
  ], "dark");
  assert.equal(tape.symbols[0].proName, "NASDAQ:NVDA");
  assert.equal(tape.symbols[1].proName, "MSFT");
  assert.equal(tape.colorTheme, "dark");
  assert.equal(JSON.stringify(tape).includes("price"), false);
});
