/* Dev-only browser checks. The site does not load this file. */
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const shotDir = "/opt/cursor/artifacts/screenshots";
const fullShotDir = path.join(os.tmpdir(), "ladder-browser-shots");
const views = [
  ["dashboard", "Overview"],
  ["markets", "Markets"],
  ["positions", "Trades"],
  ["risk", "Risk"],
  ["analytics", "Analytics"],
  ["calendar", "Calendar"],
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
    const prefix = "/sofi-levels-card";
    let stripped = urlPath;
    if (stripped === prefix || stripped === prefix + "/") stripped = "/";
    else if (stripped.startsWith(prefix + "/")) stripped = stripped.slice(prefix.length);
    const rel = stripped === "/" ? "/index.html" : stripped;
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
  page.on("pageerror", function (err) {
    const message = String(err && err.message || err);
    if (/tradingview|sandboxed and lacks the 'allow-same-origin' flag/i.test(message)) return;
    errors.push(message);
  });
  page.on("console", function (msg) {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/tradingview|sandboxed|net::ERR|Failed to load resource/i.test(text)) return;
    errors.push("console: " + text);
  });
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

async function assertThemeIcon(page, theme) {
  const dark = theme === "dark";
  const button = page.locator("#themeToggle");
  const moon = button.locator(".theme-icon-moon");
  const sun = button.locator(".theme-icon-sun");
  const moonBox = await moon.boundingBox();
  const sunBox = await sun.boundingBox();
  const box = await button.boundingBox();
  assert(box && box.width >= 72 && box.height >= 44, "theme button size " + JSON.stringify(box));
  if (dark) {
    assert(moonBox && moonBox.width > 8 && moonBox.height > 8, "crescent visible in dark mode");
    assert(sunBox == null, "sun hidden in dark mode");
  } else {
    assert(sunBox && sunBox.width > 8 && sunBox.height > 8, "sun visible in light mode");
    assert(moonBox == null, "crescent hidden in light mode");
  }
  const label = await button.getAttribute("aria-label");
  const title = await button.getAttribute("title");
  const pressed = await button.getAttribute("aria-pressed");
  const hidden = await page.locator("#themeToggleLabel").innerText();
  if (dark) {
    assert(label === "Dark mode, switch to light mode", "aria-label " + label);
    assert(title === "Switch to light mode", "title " + title);
    assert(pressed === "true", "aria-pressed dark");
    assert(hidden === "Dark", "hidden label " + hidden);
  } else {
    assert(label === "Light mode, switch to dark mode", "aria-label " + label);
    assert(title === "Switch to dark mode", "title " + title);
    assert(pressed === "false", "aria-pressed light");
    assert(hidden === "Light", "hidden label " + hidden);
  }
  const visible = await button.evaluate(function (btn) {
    const text = window.getComputedStyle(btn.querySelector(".visually-hidden"));
    const clipped = text.position === "absolute" && (text.clip !== "auto" || text.width === "1px");
    return btn.innerText.replace(/\s+/g, " ").trim() === "" || clipped;
  });
  assert(visible, "theme text label stays visually hidden");
}

async function assertMobileChrome(page, label) {
  const width = page.viewportSize().width;
  const info = await page.evaluate(function () {
    const shell = document.querySelector(".tab-shell");
    const box = shell.getBoundingClientRect();
    const analytics = document.getElementById("tab-analytics");
    const brand = document.querySelector(".brand-row").getBoundingClientRect();
    const toggle = document.getElementById("themeToggle").getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(document.querySelector(".app")).paddingBottom);
    return {
      position: getComputedStyle(shell).position,
      bottom: box.bottom,
      height: window.innerHeight,
      pad: pad,
      navH: box.height,
      labelClipped: analytics.scrollWidth > analytics.clientWidth + 1,
      sameRow: Math.abs(toggle.top - brand.top) < 12
    };
  });
  assert(info.sameRow, label + " theme toggle shares the header row");
  assert(!info.labelClipped, label + " Analytics label is clipped");
  if (width < 900) {
    assert(info.position === "fixed", label + " nav position " + info.position);
    assert(Math.abs(info.bottom - info.height) < 2, label + " nav bottom " + info.bottom + " vs " + info.height);
    assert(info.pad + 1 >= info.navH, label + " content pad " + info.pad + " is under nav " + info.navH);
  }
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
  fs.mkdirSync(fullShotDir, { recursive: true });
  const server = await serve();
  const url = "http://127.0.0.1:" + server.address().port + "/";
  const browser = await chromium.launch({ headless: true });
  const now = new Date();
  const today = ymd(now);
  try {
    await runFlow(browser, url, today, { width: 390, height: 844 }, "phone");
    await runFlow(browser, url, today, { width: 768, height: 1024 }, "tablet");
    await runFlow(browser, url, today, { width: 1440, height: 900 }, "desktop");
    await runMigration(browser, url);
    await runImports(browser, url, today);
    await runLarge(browser, url, today);
    await runUniversal(browser, url, today);
    await runChart(browser, url);
    await runPreserve(browser, url);
    await runPagesBase(browser, url);
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
    await assertMobileChrome(page, label);
    await page.getByRole("tab", { name: "Trades" }).click();
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
    await page.getByRole("tab", { name: "Overview" }).click();
    await shows(page, "#dashRealized", "+$9.00");
    await shows(page, "#dashTodayTrades", "+$9.00");

    await page.getByRole("tab", { name: "Calendar" }).click();
    await page.locator("#logTodayBtn").click();
    await page.locator("#dayAmount").fill("25");
    await page.getByRole("button", { name: "Save day" }).click();
    await page.getByRole("tab", { name: "Overview" }).click();
    await shows(page, "#dashTodayTrades", "+$9.00");
    await shows(page, "#dashTodayManual", "+$25.00");

    await page.getByRole("tab", { name: "Trades" }).click();
    const testCard = page.locator(".stock-card", { has: page.getByRole("heading", { name: /^TEST/ }) });
    await testCard.getByRole("button", { name: "Edit" }).click();
    await page.locator("#fieldExit").fill("11");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByRole("tab", { name: "Overview" }).click();
    await shows(page, "#dashRealized", "+$4.00");

    await page.getByRole("tab", { name: "Trades" }).click();
    await page.locator("#addTradeBtn").click();
    await page.locator("#fieldSymbol").fill("BIG");
    await page.locator("#fieldStatus").selectOption("open");
    await page.locator("#fieldShares").fill("100");
    await page.locator("#fieldEntry").fill("1");
    await page.locator("#fieldExit").fill("100");
    await page.locator("#fieldExitDate").fill(today);
    await page.locator("#tradeSaveBtn").click();
    await page.getByRole("tab", { name: "Overview" }).click();
    await shows(page, "#dashRealized", "+$4.00");
    const openText = await page.locator("#dashOpen").innerText();
    assert(openText.includes("2") || openText.includes("3"), "open count should include BIG and SOFI, was " + openText);

    await page.getByRole("tab", { name: "Analytics" }).click();
    await shows(page, "#analyticsBody", "+$4.00");
    await shows(page, "#analyticsBody", "not account equity");
    await shows(page, "#metric-realized", "+$4.00");

    await page.getByRole("tab", { name: "Trades" }).click();
    await page.locator(".stock-card", { has: page.getByRole("heading", { name: /^TEST/ }) }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("tab", { name: "Overview" }).click();
    await shows(page, "#dashRealized", "N/A");
    await shows(page, "#dashTodayManual", "+$25.00");

    await page.getByRole("tab", { name: "Risk" }).click();
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

    await assertThemeIcon(page, "dark");
    await page.locator("#themeToggle").focus();
    await page.keyboard.press("Enter");
    assert((await page.locator("html").getAttribute("data-theme")) === "light", label + " theme");
    const saved = await page.evaluate(function () { return localStorage.getItem("stock-tracker-theme"); });
    assert(saved === "light", "theme storage");
    await assertThemeIcon(page, "light");
    await page.locator("#themeToggle").focus();
    await page.keyboard.press(" ");
    assert((await page.locator("html").getAttribute("data-theme")) === "dark", label + " keyboard back to dark");
    await assertThemeIcon(page, "dark");
    await page.locator("#themeToggle").click();
    assert((await page.locator("html").getAttribute("data-theme")) === "light", label + " click to light");
    await page.locator("#tab-dashboard").focus();
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(function () { return document.activeElement && document.activeElement.id; });
    assert(focused === "tab-markets", label + " tab order " + focused);
    await page.keyboard.press("Enter");
    assert(await page.locator("#view-markets").isVisible(), label + " enter opens markets");
    const assets = await page.evaluate(function () {
      return Array.from(document.querySelectorAll("link[rel='stylesheet'], script[src]")).map(function (node) {
        return node.getAttribute("href") || node.getAttribute("src") || "";
      });
    });
    assert(assets.indexOf("css/styles.css") !== -1, "stylesheet path");
    assets.forEach(function (src) {
      assert(src && src.charAt(0) !== "/" && src.indexOf("http") !== 0, "asset stays relative " + src);
    });
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
  page.on("pageerror", function (err) {
    const message = String(err && err.message || err);
    if (/tradingview|sandboxed and lacks the 'allow-same-origin' flag/i.test(message)) return;
    errors.push(message);
  });
  await page.goto(url, { waitUntil: "load" });
  await page.getByRole("tab", { name: "Trades" }).click();
  await shows(page, "#positionsList", "Open — not realized");
  await shows(page, "#positionsList", "Pasted close is under the hard stop");
  const stored = await page.evaluate(function () {
    return {
      v3: JSON.parse(localStorage.getItem("ladder-journal-v3")),
      v1: localStorage.getItem("stock-tracker-v1"),
      backup: localStorage.getItem("ladder-journal-premigration")
    };
  });
  assert(stored.v1 && stored.v1.includes("old manual"), "v1 kept");
  assert(stored.backup && stored.backup.includes("before-schema-v2-migration"), "premigration backup");
  assert(stored.v3.schemaVersion === 3, "upgraded schema");
  assert(stored.v3.trades[0].status === "open", "migrated trade stays open");
  assert(stored.v3.trades[0].exitPrice == null, "pasted close is not an exit");
  assert(stored.v3.days["2026-01-05"].entryType === "manual", "manual label");
  assert(stored.v3.days["2026-01-05"].manualPnl === 25.5, "manual amount");
  await page.getByRole("tab", { name: "Overview" }).click();
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
    fs.writeFileSync(futurePath, JSON.stringify({ schemaVersion: 4, trades: [], days: {} }));

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
    await page.getByRole("tab", { name: "Overview" }).click();
    await shows(page, "#dashRealized", "+$9.00");
    await shows(page, "#dashTodayManual", "+$25.00");

    await choose(futurePath);
    await page.waitForFunction(function () {
      const banner = document.getElementById("banner");
      return banner && !banner.hidden && banner.textContent.includes("schema version 4");
    });
    await page.getByRole("tab", { name: "Overview" }).click();
    await shows(page, "#dashRealized", "+$9.00");

    await choose(dupPath);
    await page.waitForSelector("#importDialog[open]");
    await page.getByRole("button", { name: "Merge into this journal" }).click();
    await page.getByRole("tab", { name: "Overview" }).click();
    await shows(page, "#dashRealized", "+$9.00");
    const count = await page.evaluate(function () { return JSON.parse(localStorage.getItem("ladder-journal-v3")).trades.length; });
    assert(count === 1, "duplicate id was counted twice: " + count);

    await choose(simPath);
    await page.waitForSelector("#importDialog[open]");
    await page.getByRole("button", { name: "Merge into this journal" }).click();
    await page.getByRole("tab", { name: "Overview" }).click();
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
    await page.getByRole("tab", { name: "Trades" }).click();
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

async function runUniversal(browser, url, today) {
  const journal = demoJournal(new Date());
  const raw = JSON.stringify(journal);
  const opened = await openPage(browser, url, { width: 1280, height: 900 }, "dark", journal);
  const page = opened.page;
  page.setDefaultTimeout(15000);
  page.on("dialog", function (dialog) { dialog.accept(); });
  try {
    const stored = await page.evaluate(function (original) {
      return {
        v2: localStorage.getItem("ladder-journal-v2"),
        v3: JSON.parse(localStorage.getItem("ladder-journal-v3")),
        backup: localStorage.getItem("ladder-journal-premigration-v3")
      };
    });
    assert(stored.v2 === raw, "v2 copy survives the upgrade");
    assert(stored.v3.schemaVersion === 3, "journal is schema 3");
    assert(stored.backup && stored.backup.includes("before-schema-v3-migration"), "v3 premigration backup");
    assert(stored.v3.trades.some(function (trade) { return trade.symbol === "SOFI" && trade.status === "open"; }), "SOFI survived");

    await page.getByRole("tab", { name: "Trades" }).click();
    await page.locator("#addTradeBtn").click();
    await page.locator("#fieldSymbol").fill("MSFT");
    await page.locator("#fieldExchange").fill("NASDAQ");
    await page.locator("#fieldStatus").selectOption("open");
    await page.locator("#fieldShares").fill("10");
    await page.locator("#fieldEntry").fill("100");
    await page.locator("#fieldEntryDate").fill(today);
    await page.locator("#tradeSaveBtn").click();
    await page.locator(".stock-card", { has: page.getByRole("heading", { name: /^MSFT/ }) }).getByRole("button", { name: "Edit" }).click();
    await page.locator("#partialDetails summary").click();
    await page.locator("#addExitBtn").click();
    await page.locator(".exit-qty").fill("4");
    await page.locator(".exit-price").fill("110");
    await page.locator(".exit-date").fill(today);
    await page.locator(".exit-fees").fill("0");
    await page.locator("#tradeSaveBtn").click();
    await shows(page, "#positionsList", "MSFT");
    await shows(page, "#positionsList", "partially exited");
    await shows(page, "#positionsList", "+$40.00");
    await shows(page, "#positionsList", "6 shares");

    await page.locator(".stock-card", { has: page.getByRole("heading", { name: /^MSFT/ }) }).getByRole("button", { name: "Edit" }).click();
    await page.locator("#fieldMark").fill("120");
    await page.locator("#fieldMarkAsOf").fill(today);
    await page.locator("#tradeSaveBtn").click();
    await shows(page, "#positionsList", "manual mark");
    await shows(page, "#positionsList", "+$120.00");

    await page.locator(".stock-card", { has: page.getByRole("heading", { name: /^AAPL/ }) }).getByRole("button", { name: "Edit" }).click();
    await page.locator("#fieldName").fill("Apple Inc");
    await page.locator("#tradeSaveBtn").click();
    await shows(page, "#positionsList", "Apple Inc");

    await page.locator("#positionSymbol").fill("AAPL");
    await shows(page, "#positionsList", "AAPL");
    const filtered = await page.locator("#positionsList").innerText();
    assert(!filtered.includes("MSFT"), "symbol filter hid MSFT");
    assert(!filtered.includes("SOFI"), "symbol filter hid SOFI");
    await page.locator("#positionSymbol").fill("");

    await page.locator(".stock-card", { has: page.getByRole("heading", { name: /^NVDA/ }) }).getByRole("button", { name: "Delete" }).click();
    const afterDelete = await page.locator("#positionsList").innerText();
    assert(!afterDelete.includes("NVDA"), "NVDA deleted");

    const prices = await page.evaluate(function () {
      const data = JSON.parse(localStorage.getItem("ladder-journal-v3"));
      return data.trades.map(function (trade) { return trade.symbol + ":" + trade.entryPrice + ":" + trade.exitPrice; });
    });
    assert(prices.indexOf("AAPL:180:190") !== -1, "chart did not replace AAPL prices");
    assert(prices.indexOf("MSFT:100:null") !== -1, "MSFT entry stayed manual");
    console.log("universal journal passed");
  } finally {
    await opened.context.close();
  }
}

async function readChartConfig(page) {
  const raw = await page.locator("#chartMount").getAttribute("data-widget-config");
  assert(raw, "chart config missing");
  return JSON.parse(raw);
}

async function runChart(browser, url) {
  const opened = await openPage(browser, url, { width: 390, height: 844 }, "light", demoJournal(new Date()));
  const page = opened.page;
  page.setDefaultTimeout(15000);
  try {
    await page.getByRole("tab", { name: "Markets" }).click();
    await page.waitForSelector("#chartMount[data-widget-config]");
    let config = await readChartConfig(page);
    assert(config.symbol === "NASDAQ:SOFI", "default chart symbol " + config.symbol);
    assert(config.range === "6M", "default range");
    assert(config.theme === "light", "chart follows light theme");
    const scriptSrc = await page.locator("#chartMount").getAttribute("data-widget-src");
    assert(scriptSrc === "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js", scriptSrc);
    const periods = [
      ["1D", "1D"],
      ["5D", "5D"],
      ["1M", "1M"],
      ["6M", "6M"],
      ["YTD", "YTD"],
      ["1Y", "12M"],
      ["5Y", "60M"],
      ["MAX", "ALL"]
    ];
    for (const pair of periods) {
      await page.locator("[data-period=\"" + pair[0] + "\"]").click();
      config = await readChartConfig(page);
      assert(config.range === pair[1], pair[0] + " range was " + config.range);
      assert(config.theme === "light", "period kept theme");
    }
    await page.locator("#symbolSearch").fill("NVDA");
    await page.locator("#symbolExchange").fill("NASDAQ");
    await page.locator("#symbolApply").click();
    config = await readChartConfig(page);
    assert(config.symbol === "NASDAQ:NVDA", "switched symbol " + config.symbol);
    await page.locator("#themeToggle").click();
    config = await readChartConfig(page);
    assert(config.theme === "dark", "chart follows dark theme");
    await page.waitForFunction(function () {
      const el = document.getElementById("chartMount");
      const widgetState = el && el.getAttribute("data-widget-state");
      return widgetState === "loaded" || widgetState === "fallback";
    }, null, { timeout: 12000 });
    const state = await page.locator("#chartMount").getAttribute("data-widget-state");
    if (state === "loaded") console.log("tradingview chart loaded");
    else console.log("tradingview unreachable from this environment; fallback shown and widget config was still checked");
    const journalAfter = await page.evaluate(function () { return localStorage.getItem("ladder-journal-v3"); });
    assert(journalAfter && journalAfter.includes("\"symbol\":\"SOFI\""), "chart did not clear the journal");
    console.log("chart config passed");
  } finally {
    await opened.context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(function () {
    localStorage.clear();
    localStorage.setItem("stock-tracker-theme", "dark");
  });
  await context.route("**://*.tradingview.com/**", function (route) { route.abort(); });
  await context.route("**://s3.tradingview.com/**", function (route) { route.abort(); });
  const blocked = await context.newPage();
  const errors = [];
  blocked.on("pageerror", function (err) {
    const message = String(err && err.message || err);
    if (/tradingview|sandboxed and lacks the 'allow-same-origin' flag/i.test(message)) return;
    errors.push(message);
  });
  try {
    await blocked.goto(url, { waitUntil: "load" });
    await blocked.getByRole("tab", { name: "Markets" }).click();
    await blocked.waitForSelector("#chartMount .chart-fallback", { timeout: 12000 });
    const fallback = await blocked.locator("#chartMount").innerText();
    assert(fallback.includes("Chart unavailable"), fallback);
    assert(fallback.includes("No price was filled in"), fallback);
    const config = JSON.parse(await blocked.locator("#chartMount").getAttribute("data-widget-config"));
    assert(config.symbol === "NASDAQ:SOFI", "blocked config " + config.symbol);
    assert(config.theme === "dark", "blocked theme");
    const src = await blocked.locator("#chartMount").getAttribute("data-widget-src");
    assert(src === "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js", src);
    assert(await blocked.locator("#chartMount script").count() === 0, "failed chart does not leave the embed in the page");
    const journal = await blocked.evaluate(function () { return localStorage.getItem("ladder-journal-v3"); });
    assert(journal && !journal.includes("\"markPrice\":1"), "no fabricated mark");
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("chart failure state passed");
  } finally {
    await context.close();
  }
}

async function runPreserve(browser, url) {
  const v3 = JSON.stringify({
    schemaVersion: 3,
    app: "ladder",
    settings: { accountSize: 25000, riskPercent: 1, selectedSymbol: "IBM", selectedExchange: "NYSE", chartPeriod: "6M", watchlist: [{ symbol: "AAPL", exchange: "NASDAQ" }] },
    trades: [{
      id: "keep-me",
      symbol: "IBM",
      name: "International Business Machines",
      direction: "long",
      status: "closed",
      quantity: 2,
      entryPrice: 10,
      exitPrice: 12,
      fees: 0,
      entryDate: "2026-02-01",
      exitDate: "2026-02-02",
      strategy: "kept"
    }],
    days: { "2026-02-03": { entryType: "manual", manualPnl: 3, note: "kept manual", breakdown: [], adjustment: null, adjustmentNote: "" } }
  });
  const v2 = "{\"schemaVersion\":2,\"app\":\"ladder\",\"settings\":{},\"trades\":[{\"id\":\"old-v2\",\"symbol\":\"GE\",\"direction\":\"long\",\"status\":\"open\",\"quantity\":1}],\"days\":{}}";
  const pre = "{\"reason\":\"before-schema-v2-migration\",\"raw\":\"untouched-v1\"}";
  const pre3 = "{\"reason\":\"before-schema-v3-migration\",\"raw\":\"untouched-v2\"}";
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(function (data) {
    localStorage.clear();
    localStorage.setItem("ladder-journal-v3", data.v3);
    localStorage.setItem("ladder-journal-v2", data.v2);
    localStorage.setItem("ladder-journal-premigration", data.pre);
    localStorage.setItem("ladder-journal-premigration-v3", data.pre3);
    localStorage.setItem("stock-tracker-theme", "light");
  }, { v3: v3, v2: v2, pre: pre, pre3: pre3 });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.getByRole("tab", { name: "Trades" }).click();
    await shows(page, "#positionsList", "IBM");
    const stored = await page.evaluate(function () {
      return {
        v3: localStorage.getItem("ladder-journal-v3"),
        v2: localStorage.getItem("ladder-journal-v2"),
        pre: localStorage.getItem("ladder-journal-premigration"),
        pre3: localStorage.getItem("ladder-journal-premigration-v3"),
        theme: localStorage.getItem("stock-tracker-theme")
      };
    });
    assert(stored.v3 === v3, "v3 bytes changed");
    assert(stored.v2 === v2, "v2 bytes changed");
    assert(stored.pre === pre, "premigration bytes changed");
    assert(stored.pre3 === pre3, "premigration v3 bytes changed");
    assert(stored.theme === "light", "theme key changed");
    assert((await page.locator("html").getAttribute("data-theme")) === "light", "theme applied");
    console.log("preservation passed");
  } finally {
    await context.close();
  }
}

async function runPagesBase(browser, url) {
  const opened = await openPage(browser, url + "sofi-levels-card/", { width: 390, height: 844 }, "dark", { schemaVersion: 2, settings: {}, trades: [], days: {} });
  const page = opened.page;
  try {
    assert((await page.locator("h1").innerText()) === "Ladder", "pages base title");
    const sheet = await page.evaluate(function () {
      const link = document.querySelector("link[rel='stylesheet']");
      return link ? link.getAttribute("href") : "";
    });
    assert(sheet === "css/styles.css", "pages stylesheet " + sheet);
    await shows(page, "#dashboardBody", "No trades recorded yet");
    if (page.errors.length) throw new Error(page.errors.join("\n"));
    console.log("pages base path passed");
  } finally {
    await opened.context.close();
  }
}

async function shotView(page, file) {
  const full = page.viewportSize().width >= 900;
  await page.screenshot({ path: path.join(shotDir, file), fullPage: full });
}

async function runShots(browser, url, journal) {
  const sizes = [
    ["phone", { width: 390, height: 844 }],
    ["desktop", { width: 1440, height: 900 }]
  ];
  const sections = [
    ["markets", "Markets", "investor_markets"],
    ["positions", "Trades", "investor_trades"],
    ["risk", "Risk", "investor_risk"],
    ["analytics", "Analytics", "investor_analytics"],
    ["calendar", "Calendar", "investor_calendar"],
    ["settings", "Settings", "investor_settings"]
  ];
  for (const size of sizes) {
    const opened = await openPage(browser, url, size[1], "dark", journal);
    const page = opened.page;
    try {
      assert((await page.locator("html").getAttribute("data-theme")) === "dark", "shot theme");
      await page.getByRole("tab", { name: "Overview" }).click();
      await shows(page, "#dashRealized", "+$");
      await page.locator("#dashboardBody .hit").first().dispatchEvent("pointerover");
      await shows(page, "#chartTip", "$");
      await page.locator("#dashboardBody .hit").first().focus();
      await shows(page, "#chartTip", "$");
      await noOverflow(page, size[0] + " overview");
      await shotView(page, "investor_overview_" + size[0] + ".png");
      for (const section of sections) {
        await page.getByRole("tab", { name: section[1] }).click();
        await page.waitForSelector("#view-" + section[0] + ":not([hidden])");
        if (section[0] === "markets") {
          await page.waitForFunction(function () {
            const el = document.getElementById("chartMount");
            const widgetState = el && el.getAttribute("data-widget-state");
            return widgetState === "loaded" || widgetState === "fallback" || widgetState === "empty";
          }, null, { timeout: 12000 });
        }
        if (section[0] === "risk") {
          await page.locator("#riskAccount").fill("10000");
          await page.locator("#riskPercent").fill("1");
          await page.locator("#riskEntry").fill("50");
          await page.locator("#riskStop").fill("48");
          await page.locator("#riskTarget").fill("56");
          await page.getByRole("button", { name: "Calculate size" }).click();
          await shows(page, "#riskResult", "50");
        }
        await noOverflow(page, size[0] + " " + section[0]);
        await shotView(page, section[2] + "_" + size[0] + ".png");
      }
      if (page.errors.length) throw new Error(page.errors.join("\n"));
    } finally {
      await opened.context.close();
    }
  }
  const empty = { schemaVersion: 2, settings: {}, trades: [], days: {} };
  for (const size of sizes) {
    const opened = await openPage(browser, url, size[1], "dark", empty);
    const page = opened.page;
    try {
      await shows(page, "#dashboardBody", "No trades recorded yet");
      await shows(page, "#dashRealized", "N/A");
      await noOverflow(page, size[0] + " empty overview");
      await shotView(page, "investor_overview_empty_" + size[0] + ".png");
      if (page.errors.length) throw new Error(page.errors.join("\n"));
    } finally {
      await opened.context.close();
    }
  }
  console.log("screenshots saved");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
