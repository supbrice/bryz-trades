/* Dev-only browser checks. The site does not load this file. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const shotDir = "/opt/cursor/artifacts/screenshots";
const views = [
  ["dashboard", "Dashboard"],
  ["positions", "Positions"],
  ["calendar", "Calendar"],
  ["analytics", "Analytics"],
  ["settings", "Settings"]
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function ymd(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

function serve() {
  const server = http.createServer(function (req, res) {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    const rel = urlPath === "/" ? "/index.html" : urlPath;
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, function (err, data) {
      if (err) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      const type = file.endsWith(".css") ? "text/css"
        : file.endsWith(".js") ? "text/javascript"
        : file.endsWith(".svg") ? "image/svg+xml"
        : "text/html";
      res.writeHead(200, { "content-type": type });
      res.end(data);
    });
  });
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () { resolve(server); });
  });
}

function demoJournal(now) {
  const today = ymd(now);
  const earlier = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10));
  const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  return {
    schemaVersion: 2,
    settings: { accountSize: 25000, riskPercent: 1 },
    trades: [
      {
        id: "sofi",
        symbol: "SOFI",
        name: "SoFi",
        direction: "long",
        status: "open",
        quantity: 40,
        entryPrice: 18,
        avgCost: 18.25,
        targetPrice: 22,
        hardStop: 16.92,
        entryDate: monthStart,
        exitDate: "",
        fees: null,
        exitReason: "",
        strategy: "",
        setup: "",
        thesis: "Open position. Not realized.",
        lessons: "",
        notes: "Checklist uses a pasted close.",
        getIn: 18,
        getOut: 18,
        orderStatus: "filled",
        fillPrice: 18,
        close: 19
      },
      {
        id: "aapl",
        symbol: "AAPL",
        name: "Apple",
        direction: "long",
        status: "closed",
        quantity: 10,
        entryPrice: 180,
        avgCost: 180,
        targetPrice: 200,
        hardStop: 170,
        exitPrice: 190,
        entryDate: earlier,
        exitDate: monthStart,
        fees: 2,
        exitReason: "target",
        strategy: "breakout",
        setup: "daily flag",
        thesis: "Recorded exit at the planned target.",
        lessons: "Wrote the exit down instead of guessing a fill.",
        notes: "",
        getIn: null,
        getOut: null,
        orderStatus: "",
        fillPrice: null,
        close: null
      },
      {
        id: "tsla",
        symbol: "TSLA",
        name: "Tesla",
        direction: "short",
        status: "closed",
        quantity: 2,
        entryPrice: 250,
        avgCost: null,
        targetPrice: 230,
        hardStop: 265,
        exitPrice: 260,
        entryDate: earlier,
        exitDate: earlier,
        fees: 1.5,
        exitReason: "stop",
        strategy: "fade",
        setup: "",
        thesis: "",
        lessons: "Short return uses proceeds, not margin.",
        notes: "",
        getIn: null,
        getOut: null,
        orderStatus: "",
        fillPrice: null,
        close: null
      },
      {
        id: "nvda",
        symbol: "NVDA",
        name: "NVIDIA",
        direction: "long",
        status: "cancelled",
        quantity: 5,
        entryPrice: 120,
        avgCost: null,
        targetPrice: 140,
        hardStop: 110,
        exitPrice: null,
        entryDate: today,
        exitDate: "",
        fees: null,
        exitReason: "",
        strategy: "",
        setup: "",
        thesis: "",
        lessons: "",
        notes: "Cancelled before entry.",
        getIn: null,
        getOut: null,
        orderStatus: "",
        fillPrice: null,
        close: null
      }
    ],
    days: {
      [today]: {
        entryType: "manual",
        manualPnl: 42.5,
        note: "Manual futures note",
        breakdown: [],
        adjustment: -100,
        adjustmentNote: "Withdrawal"
      }
    }
  };
}

async function openPage(browser, url, viewport, theme, journal) {
  const context = await browser.newContext({ viewport: viewport });
  await context.addInitScript(function (data) {
    localStorage.clear();
    localStorage.setItem("stock-tracker-theme", data.theme);
    if (data.journal) localStorage.setItem("ladder-journal-v2", data.journal);
    if (data.v1) localStorage.setItem("stock-tracker-v1", data.v1);
  }, { theme: theme, journal: journal ? JSON.stringify(journal) : "", v1: "" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", function (err) { errors.push(err.message); });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector("h1");
  if (errors.length) throw new Error(errors.join("\n"));
  page.errors = errors;
  return { context: context, page: page };
}

async function shows(page, selector, text) {
  const body = await page.locator(selector).innerText();
  assert(body.includes(text), selector + " should include " + text + " but was:\n" + body);
}

async function noOverflow(page, label) {
  const info = await page.evaluate(function () {
    return {
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth
    };
  });
  assert(info.scroll <= info.client + 1, label + " overflows " + info.scroll + " > " + info.client);
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const server = await serve();
  const url = "http://127.0.0.1:" + server.address().port + "/";
  const browser = await chromium.launch({ headless: true });
  const now = new Date();
  const today = ymd(now);
  try {
    await runFlow(browser, url, today, { width: 390, height: 844 }, "phone");
    await runFlow(browser, url, today, { width: 1280, height: 900 }, "desktop");
    await runMigration(browser, url);
    await runImports(browser, url, today);
    await runLarge(browser, url, today);
    await runShots(browser, url, demoJournal(now));
    console.log("browser checks passed");
  } finally {
    await browser.close();
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

async function runFlow(browser, url, today, viewport, label) {
  const opened = await openPage(browser, url, viewport, "dark", null);
  const page = opened.page;
  page.setDefaultTimeout(15000);
  page.on("dialog", function (dialog) { dialog.accept(); });
  try {
    assert((await page.locator("h1").innerText()) === "Ladder", "title");
    await page.getByRole("tab", { name: "Positions" }).click();
    await shows(page, "#positionsList", "SOFI");
    await shows(page, "#positionsList", "Open — not realized");
    await page.locator("#addTradeBtn").click();
    await page.locator("#fieldSymbol").fill("TEST");
    await page.locator("#fieldStatus").selectOption("closed");
    await page.locator("#fieldShares").fill("5");
    await page.locator("#fieldFees").fill("1");
    await page.locator("#fieldEntry").fill("10");
    await page.locator("#fieldExit").fill("12");
    await page.locator("#fieldExitDate").fill(today);
    await page.locator("#tradeSaveBtn").click();
    await page.getByRole("tab", { name: "Dashboard" }).click();
    await shows(page, "#dashRealized", "+$9.00");
    await shows(page, "#dashTodayTrades", "+$9.00");

    await page.getByRole("tab", { name: "Calendar" }).click();
    await page.locator("#logTodayBtn").click();
    await page.locator("#dayAmount").fill("25");
    await page.getByRole("button", { name: "Save day" }).click();
    await page.getByRole("tab", { name: "Dashboard" }).click();
    await shows(page, "#dashTodayTrades", "+$9.00");
    await shows(page, "#dashTodayManual", "+$25.00");

    await page.getByRole("tab", { name: "Positions" }).click();
    const testCard = page.locator(".stock-card", { has: page.getByRole("heading", { name: /^TEST/ }) });
    await testCard.getByRole("button", { name: "Edit" }).click();
    await page.locator("#fieldExit").fill("11");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByRole("tab", { name: "Dashboard" }).click();
    await shows(page, "#dashRealized", "+$4.00");

    await page.getByRole("tab", { name: "Positions" }).click();
    await page.locator("#addTradeBtn").click();
    await page.locator("#fieldSymbol").fill("BIG");
    await page.locator("#fieldStatus").selectOption("open");
    await page.locator("#fieldShares").fill("100");
    await page.locator("#fieldEntry").fill("1");
    await page.locator("#fieldExit").fill("100");
    await page.locator("#fieldExitDate").fill(today);
    await page.locator("#tradeSaveBtn").click();
    await page.getByRole("tab", { name: "Dashboard" }).click();
    await shows(page, "#dashRealized", "+$4.00");
    const openText = await page.locator("#dashOpen").innerText();
    assert(openText.includes("2") || openText.includes("3"), "open count should include BIG and SOFI, was " + openText);

    await page.getByRole("tab", { name: "Analytics" }).click();
    await shows(page, "#analyticsBody", "+$4.00");
    await shows(page, "#analyticsBody", "not account equity");
    await shows(page, "#metric-realized", "+$4.00");

    await page.getByRole("tab", { name: "Positions" }).click();
    await page.locator(".stock-card", { has: page.getByRole("heading", { name: /^TEST/ }) }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("tab", { name: "Dashboard" }).click();
    await shows(page, "#dashRealized", "N/A");
    await shows(page, "#dashTodayManual", "+$25.00");

    await page.getByRole("tab", { name: "Settings" }).click();
    await page.locator("#riskAccount").fill("10000");
    await page.locator("#riskPercent").fill("1");
    await page.locator("#riskEntry").fill("50");
    await page.locator("#riskStop").fill("48");
    await page.locator("#riskDirection").selectOption("long");
    await page.getByRole("button", { name: "Calculate size" }).click();
    await shows(page, "#riskResult", "50");
    await shows(page, "#riskResult", "gaps, slippage, fees");
    await page.locator("#riskDirection").selectOption("short");
    await page.getByRole("button", { name: "Calculate size" }).click();
    await shows(page, "#riskResult", "above the entry");

    await page.locator("#themeToggle").click();
    assert((await page.locator("html").getAttribute("data-theme")) === "light", label + " theme");
    const saved = await page.evaluate(function () { return localStorage.getItem("stock-tracker-theme"); });
    assert(saved === "light", "theme storage");
    for (const view of views) {
      await page.getByRole("tab", { name: view[1] }).click();
      await noOverflow(page, label + " " + view[0] + " light");
    }
    if (page.errors.length) throw new Error(page.errors.join("\n"));
    console.log("flow passed", label);
  } finally {
    await opened.context.close();
  }
}

async function runMigration(browser, url) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(function () {
    localStorage.clear();
    localStorage.setItem("stock-tracker-v1", JSON.stringify({
      version: 1,
      tickers: [{ id: "sof", symbol: "SOFI", shares: 10, avgCost: 18, notes: "from before", getIn: 18, getOut: 18, hardStop: 16.92, orderStatus: "filled", fillPrice: 18, close: 16 }],
      days: { "2026-01-05": { pnl: 25.5, note: "old manual", breakdown: [{ tickerId: "sof", symbol: "SOFI", amount: 25.5 }] } }
    }));
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", function (err) { errors.push(err.message); });
  await page.goto(url, { waitUntil: "load" });
  await page.getByRole("tab", { name: "Positions" }).click();
  await shows(page, "#positionsList", "Open — not realized");
  await shows(page, "#positionsList", "Pasted close is under the hard stop");
  const stored = await page.evaluate(function () {
    return {
      v2: JSON.parse(localStorage.getItem("ladder-journal-v2")),
      v1: localStorage.getItem("stock-tracker-v1"),
      backup: localStorage.getItem("ladder-journal-premigration")
    };
  });
  assert(stored.v1 && stored.v1.includes("old manual"), "v1 kept");
  assert(stored.backup && stored.backup.includes("before-schema-v2-migration"), "premigration backup");
  assert(stored.v2.trades[0].status === "open", "migrated trade stays open");
  assert(stored.v2.trades[0].exitPrice == null, "pasted close is not an exit");
  assert(stored.v2.days["2026-01-05"].entryType === "manual", "manual label");
  assert(stored.v2.days["2026-01-05"].manualPnl === 25.5, "manual amount");
  await page.getByRole("tab", { name: "Dashboard" }).click();
  await shows(page, "#dashRealized", "N/A");
  if (errors.length) throw new Error(errors.join("\n"));
  await context.close();
  console.log("migration passed");
}

async function runImports(browser, url, today) {
  const journal = {
    schemaVersion: 2,
    settings: { accountSize: null, riskPercent: null },
    trades: [{
      id: "t1", symbol: "TEST", name: "", direction: "long", status: "closed", quantity: 5,
      entryPrice: 10, avgCost: null, targetPrice: null, hardStop: null, exitPrice: 12,
      entryDate: today, exitDate: today, fees: 1, exitReason: "", strategy: "", setup: "",
      thesis: "", lessons: "", notes: "", getIn: null, getOut: null, orderStatus: "",
      fillPrice: null, close: null
    }],
    days: { [today]: { entryType: "manual", manualPnl: 25, note: "keep me", breakdown: [], adjustment: null, adjustmentNote: "" } }
  };
  const opened = await openPage(browser, url, { width: 1280, height: 900 }, "dark", journal);
  const page = opened.page;
  page.setDefaultTimeout(15000);
  try {
    await shows(page, "#dashRealized", "+$9.00");
    const duplicate = JSON.stringify(journal);
    const similar = JSON.parse(duplicate);
    similar.trades[0].id = "t2";
    const scratch = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ladder-import-"));
    const badPath = path.join(scratch, "bad-import.json");
    const dupPath = path.join(scratch, "dup-import.json");
    const simPath = path.join(scratch, "sim-import.json");
    const futurePath = path.join(scratch, "future-import.json");
    fs.writeFileSync(badPath, "{");
    fs.writeFileSync(dupPath, duplicate);
    fs.writeFileSync(simPath, JSON.stringify(similar));
    fs.writeFileSync(futurePath, JSON.stringify({ schemaVersion: 3, trades: [], days: {} }));

    async function choose(file) {
      await page.evaluate(function () {
        const banner = document.getElementById("banner");
        banner.hidden = true;
        banner.textContent = "";
      });
      await page.getByRole("tab", { name: "Settings" }).click();
      const chooserPromise = page.waitForEvent("filechooser");
      await page.locator("#importBtn").click();
      const chooser = await chooserPromise;
      await chooser.setFiles(file);
    }

    await choose(badPath);
    await page.waitForFunction(function () {
      const banner = document.getElementById("banner");
      return banner && !banner.hidden && banner.textContent.includes("JSON");
    });
    await page.getByRole("tab", { name: "Dashboard" }).click();
    await shows(page, "#dashRealized", "+$9.00");
    await shows(page, "#dashTodayManual", "+$25.00");

    await choose(futurePath);
    await page.waitForFunction(function () {
      const banner = document.getElementById("banner");
      return banner && !banner.hidden && banner.textContent.includes("schema version 3");
    });
    await page.getByRole("tab", { name: "Dashboard" }).click();
    await shows(page, "#dashRealized", "+$9.00");

    await choose(dupPath);
    await page.waitForSelector("#importDialog[open]");
    await page.getByRole("button", { name: "Merge into this journal" }).click();
    await page.getByRole("tab", { name: "Dashboard" }).click();
    await shows(page, "#dashRealized", "+$9.00");
    const count = await page.evaluate(function () { return JSON.parse(localStorage.getItem("ladder-journal-v2")).trades.length; });
    assert(count === 1, "duplicate id was counted twice: " + count);

    await choose(simPath);
    await page.waitForSelector("#importDialog[open]");
    await page.getByRole("button", { name: "Merge into this journal" }).click();
    await page.getByRole("tab", { name: "Dashboard" }).click();
    await shows(page, "#dashRealized", "+$9.00");
    const backup = await page.evaluate(function () { return localStorage.getItem("ladder-journal-preimport"); });
    assert(backup && backup.includes("before-import"), "pre-import backup");
    console.log("imports passed");
  } finally {
    await opened.context.close();
  }
}

async function runLarge(browser, url, today) {
  const trades = [];
  for (let i = 0; i < 300; i++) {
    trades.push({
      id: "n" + i, symbol: "AAA", name: "", direction: "long", status: "closed", quantity: 1,
      entryPrice: 10, avgCost: null, targetPrice: null, hardStop: null, exitPrice: 10.01,
      entryDate: today, exitDate: today, fees: 0, exitReason: "", strategy: i % 2 ? "fade" : "breakout",
      setup: "", thesis: "", lessons: "", notes: "", getIn: null, getOut: null, orderStatus: "",
      fillPrice: null, close: null
    });
  }
  const opened = await openPage(browser, url, { width: 390, height: 844 }, "light", {
    schemaVersion: 2,
    settings: { accountSize: null, riskPercent: null },
    trades: trades,
    days: {}
  });
  const page = opened.page;
  try {
    await shows(page, "#dashRealized", "+$3.00");
    await page.getByRole("tab", { name: "Positions" }).click();
    const cards = await page.locator(".stock-card").count();
    assert(cards === 300, "expected 300 cards, saw " + cards);
    await page.getByRole("tab", { name: "Analytics" }).click();
    await shows(page, "#metric-realized", "+$3.00");
    await noOverflow(page, "large phone");
    if (page.errors.length) throw new Error(page.errors.join("\n"));
    console.log("large dataset passed");
  } finally {
    await opened.context.close();
  }
}

async function runShots(browser, url, journal) {
  const sizes = [
    ["phone", { width: 390, height: 844 }],
    ["desktop", { width: 1280, height: 900 }]
  ];
  for (const size of sizes) {
    for (const theme of ["dark", "light"]) {
      const opened = await openPage(browser, url, size[1], theme, journal);
      const page = opened.page;
      try {
        const themeAttr = await page.locator("html").getAttribute("data-theme");
        assert(themeAttr === theme, "screenshot theme " + theme);
        for (const view of views) {
          await page.getByRole("tab", { name: view[1] }).click();
          await page.waitForSelector("#view-" + view[0] + ":not([hidden])");
          await noOverflow(page, size[0] + " " + theme + " " + view[0]);
          await page.screenshot({
            path: path.join(shotDir, view[0] + "_" + size[0] + "_" + theme + ".png"),
            fullPage: true
          });
        }
        if (page.errors.length) throw new Error(page.errors.join("\n"));
      } finally {
        await opened.context.close();
      }
    }
  }
  console.log("screenshots saved");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
