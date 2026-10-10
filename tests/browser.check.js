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
  ["markets", "Symbols"],
  ["positions", "Trades"],
  ["risk", "Risk"],
  ["analytics", "Analytics"],
  ["calendar", "Calendar"],
  ["settings", "Settings"]
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertBrand(page) {
  const info = await page.evaluate(function () {
    const img = document.querySelector("img.logo");
    const icon = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
    const png = document.querySelector('link[rel="icon"][type="image/png"]');
    const apple = document.querySelector('link[rel="apple-touch-icon"]');
    const box = img ? img.getBoundingClientRect() : { width: 0, height: 0 };
    return {
      src: img ? img.getAttribute("src") : "",
      loaded: !!(img && img.complete && img.naturalWidth > 0),
      word: document.querySelector("h1") ? document.querySelector("h1").textContent : "",
      box: Math.round(box.width),
      icon: icon ? icon.getAttribute("href") : "",
      png: png ? png.getAttribute("href") : "",
      apple: apple ? apple.getAttribute("href") : ""
    };
  });
  assert(info.word === "Bryz Trades", "wordmark " + info.word);
  assert(info.src === "assets/bryz-trades-logo.svg", "logo src " + info.src);
  assert(info.loaded, "logo image did not load");
  assert(info.box === 28 || info.box === 32, "logo size " + info.box);
  assert(info.icon === "assets/bryz-trades-logo.svg", "svg favicon " + info.icon);
  assert(info.png === "assets/favicon-32.png", "png favicon " + info.png);
  assert(info.apple === "assets/apple-touch-icon.png", "apple icon " + info.apple);
}

function ymd(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

function serve() {
  const server = http.createServer(function (req, res) {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    const prefix = "/bryz-trades";
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
        : file.endsWith(".png") ? "image/png"
        : file.endsWith(".woff2") ? "font/woff2"
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
        id: "shop",
        symbol: "SHOP",
        name: "Shopify",
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
  watchOrigin(page, errors, new URL(url).origin);
  page.on("pageerror", function (err) {
    errors.push(String(err && err.message || err));
  });
  page.on("console", function (msg) {
    if (msg.type() !== "error") return;
    errors.push("console: " + msg.text());
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector("h1");
  if (errors.length) throw new Error(errors.join("\n"));
  page.errors = errors;
  return { context: context, page: page };
}

function watchOrigin(page, errors, origin) {
  page.on("request", function (request) {
    const raw = request.url();
    if (/^(data|blob|about):/i.test(raw)) return;
    let requestOrigin = "";
    try { requestOrigin = new URL(raw).origin; } catch (err) {
      errors.push("unreadable request " + raw);
      return;
    }
    if (requestOrigin !== origin) errors.push("outside origin " + raw);
  });
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
  if (width < 700) {
    assert(info.position === "fixed", label + " nav position " + info.position);
    assert(Math.abs(info.bottom - info.height) < 2, label + " nav bottom " + info.bottom + " vs " + info.height);
    assert(info.pad + 1 >= info.navH, label + " content pad " + info.pad + " is under nav " + info.navH);
  } else if (width < 1100) {
    assert(info.position !== "fixed", label + " tablet rail is not a bottom bar");
  }
}

async function assertMainLayout(page, label) {
  const width = page.viewportSize().width;
  if (width < 700) {
    const overlap = await page.evaluate(function () {
      function box(id) {
        const node = document.getElementById(id);
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }
      const button = box("topLogTrade");
      const field = box("overviewTo");
      const hits = !(button.right < field.left || button.left > field.right || button.bottom < field.top || button.top > field.bottom);
      return { hits: hits, buttonTop: button.top, height: window.innerHeight };
    });
    assert(!overlap.hits, label + " Log trade overlaps the To field");
    assert(overlap.buttonTop > overlap.height * 0.55, label + " Log trade is not a bottom action");
    return;
  }
  const info = await page.evaluate(function () {
    const side = document.querySelector(".sidebar").getBoundingClientRect().width;
    const main = document.querySelector("main.views").getBoundingClientRect().width;
    const cards = Array.from(document.querySelectorAll("#dashboardBody .primary-metrics > .stat")).map(function (node) {
      return Math.round(node.getBoundingClientRect().width);
    });
    return { side: side, main: Math.round(main), cards: cards, width: window.innerWidth };
  });
  const room = info.width - info.side;
  assert(info.main >= room * 0.7, label + " main " + info.main + "px is under 70% of " + Math.round(room) + "px");
  assert(info.cards.length >= 4, label + " expected 4 KPI cards, saw " + info.cards.length);
  info.cards.forEach(function (card, index) {
    assert(card >= 180, label + " KPI " + index + " is " + card + "px");
  });
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

async function runThemeSurfaces(browser, url, today) {
  const journal = {
    schemaVersion: 2,
    settings: { accountSize: 10000, riskPercent: 1 },
    trades: [
      { id: "win", symbol: "AAPL", direction: "long", status: "closed", quantity: 10, entryPrice: 100, exitPrice: 110, fees: 0, entryDate: today, exitDate: today },
      { id: "loss", symbol: "MSFT", direction: "long", status: "closed", quantity: 10, entryPrice: 100, exitPrice: 95, fees: 0, entryDate: today, exitDate: today },
      { id: "flat", symbol: "AMD", direction: "long", status: "closed", quantity: 4, entryPrice: 50, exitPrice: 50, fees: 0, entryDate: today, exitDate: today },
      { id: "open", symbol: "NVDA", direction: "long", status: "open", quantity: 5, entryPrice: 150, hardStop: 140, entryDate: today },
      { id: "call", symbol: "QQQ", assetType: "call", direction: "long", status: "closed", quantity: 1, entryPrice: 2, exitPrice: 3, fees: 0, entryDate: today, exitDate: today }
    ],
    days: {}
  };
  const sizes = [
    ["phone", { width: 390, height: 844 }],
    ["tablet", { width: 768, height: 1024 }],
    ["desktop", { width: 1440, height: 900 }]
  ];
  let realized = "";
  for (const theme of ["dark", "light"]) {
    for (const size of sizes) {
      const opened = await openPage(browser, url, size[1], theme, journal);
      const page = opened.page;
      try {
        await page.evaluate(function () { return document.fonts.ready; });
        const info = await page.evaluate(function () {
          const scene = document.querySelector(".scene");
          const grid = document.querySelector(".scene-grid");
          const chart = document.querySelector(".scene-chart");
          const card = document.querySelector(".primary-metrics > .stat");
          const topbar = document.querySelector(".topbar");
          const sceneStyle = getComputedStyle(scene);
          const gridStyle = getComputedStyle(grid);
          function painted(value) { return value && value !== "none" ? value : ""; }
          const mask = painted(sceneStyle.maskImage) || painted(sceneStyle.webkitMaskImage);
          const glass = topbar ? getComputedStyle(topbar, "::before") : null;
          const blur = glass ? (painted(glass.backdropFilter) || painted(glass.webkitBackdropFilter)) : "";
          const stored = localStorage.getItem("ladder-journal-v3") || "";
          let trades = [];
          try { trades = JSON.parse(stored).trades || []; } catch (err) { trades = []; }
          return {
            theme: document.documentElement.getAttribute("data-theme"),
            themeKey: localStorage.getItem("stock-tracker-theme"),
            bg: getComputedStyle(document.body).backgroundColor,
            font: getComputedStyle(document.body).fontFamily,
            poppins: document.fonts.check("400 16px Poppins"),
            scenePos: sceneStyle.position,
            sceneAnim: sceneStyle.animationName,
            gridSize: gridStyle.backgroundSize,
            gridImage: gridStyle.backgroundImage,
            mask: mask,
            lines: chart.querySelectorAll("polyline").length,
            bars: chart.querySelectorAll("rect").length,
            motif: getComputedStyle(scene).color,
            radius: card ? getComputedStyle(card).borderRadius : "",
            blur: blur,
            ids: trades.map(function (trade) { return trade.id; }).join(","),
            outside: document.querySelectorAll("script[src^='http'], link[href^='http']").length
          };
        });
        assert(info.theme === theme, size[0] + " " + theme + " theme " + info.theme);
        assert(info.themeKey === theme, "theme storage key changed");
        assert(info.poppins, size[0] + " " + theme + " Poppins did not load");
        assert(info.font.indexOf("Poppins") !== -1, "font stack " + info.font);
        assert(info.scenePos === "fixed", "chart scene is not fixed");
        assert(info.sceneAnim === "none", "chart scene is animated");
        assert(info.gridSize.split(",").every(function (part) { return part.trim() === "48px 48px"; }), "grid size " + info.gridSize);
        assert(info.gridImage.indexOf("linear-gradient") !== -1, "grid is not a line gradient");
        const gridColor = theme === "dark" ? "rgba(90, 240, 138, 0.06)" : "rgba(31, 122, 54, 0.07)";
        assert(info.gridImage.indexOf(gridColor) !== -1, theme + " grid color " + info.gridImage);
        assert(/ellipse|radial-gradient/i.test(info.mask), "grid mask missing");
        assert(info.lines >= 3, "trend lines missing");
        assert(info.bars >= 2, "bar clusters missing");
        assert(info.radius === "22px", "card radius " + info.radius);
        assert(/blur\(14px\)/.test(info.blur), "header blur " + info.blur);
        assert(info.ids === "win,loss,flat,open,call", "saved trades changed " + info.ids);
        assert(info.outside === 0, "external stylesheet or script");
        const expectedBg = theme === "dark" ? "rgb(22, 54, 60)" : "rgb(255, 255, 255)";
        assert(info.bg === expectedBg, theme + " background " + info.bg);
        const figure = await page.locator("#dashRealized").innerText();
        assert(figure.includes("+$150.00"), theme + " " + size[0] + " realized " + figure);
        if (!realized) realized = figure;
        assert(figure === realized, "realized P&L changed across themes");
        await noOverflow(page, "theme " + theme + " " + size[0]);
        await page.screenshot({
          path: path.join(shotDir, "theme_" + theme + "_" + size[0] + ".png"),
          fullPage: size[1].width >= 900
        });
        if (page.errors.length) throw new Error(page.errors.join("\n"));
      } finally {
        await opened.context.close();
      }
    }
  }
  console.log("theme surfaces passed");
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  fs.mkdirSync(fullShotDir, { recursive: true });
  const server = await serve();
  const url = "http://127.0.0.1:" + server.address().port + "/bryz-trades/";
  const browser = await chromium.launch({ headless: true });
  const now = new Date();
  const today = ymd(now);
  try {
    await runFlow(browser, url, today, { width: 390, height: 844 }, "phone");
    await runFlow(browser, url, today, { width: 768, height: 1024 }, "tablet");
    await runFlow(browser, url, today, { width: 1440, height: 900 }, "desktop");
    await runPremium(browser, url, today, { width: 390, height: 844 }, "phone");
    await runPremium(browser, url, today, { width: 768, height: 1024 }, "tablet");
    await runPremium(browser, url, today, { width: 1440, height: 900 }, "desktop");
    await runMigration(browser, url);
    await runImports(browser, url, today);
    await runLarge(browser, url, today);
    await runUniversal(browser, url, today);
    await runSymbols(browser, url);
    await runPreserve(browser, url);
    await runPagesBase(browser, url);
    await runTerminal(browser, url, today);
    await runThemeSurfaces(browser, url, today);
    await runShots(browser, url, demoJournal(now));
    await runProShots(browser, url, proJournal(now));
    console.log("browser checks passed");
  } finally {
    await browser.close();
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

async function runPremium(browser, url, today, viewport, label) {
  const context = await browser.newContext({ viewport: viewport, acceptDownloads: true });
  await context.addInitScript(function () {
    if (localStorage.getItem("ladder-refresh-ready") === "1") return;
    localStorage.clear();
    localStorage.setItem("stock-tracker-theme", "dark");
  });
  const page = await context.newPage();
  const errors = [];
  watchOrigin(page, errors, new URL(url).origin);
  page.on("pageerror", function (err) { errors.push(String(err && err.message || err)); });
  page.on("console", function (msg) {
    if (msg.type() !== "error") return;
    errors.push("console: " + msg.text());
  });
  page.on("dialog", function (dialog) { dialog.accept(); });
  page.setDefaultTimeout(15000);
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector("#quickSymbol");
    await shows(page, "#upcomingCard", "Nothing upcoming");
    assert(await page.locator("#dashReturn").count() === 0, label + " return hidden");
    const presets = await page.locator("#overviewPreset option").evaluateAll(function (nodes) {
      return nodes.map(function (node) { return node.value; }).join(",");
    });
    assert(presets === "1w,1m,3m,ytd,1y,all,custom", label + " ranges " + presets);
    await page.keyboard.press("n");
    const focused = await page.evaluate(function () { return document.activeElement && document.activeElement.id; });
    assert(focused === "quickSymbol", label + " N focused " + focused);

    await page.locator("#quickSymbol").fill("??");
    await page.locator("#quickQty").fill("1");
    await page.locator("#quickPrice").fill("10");
    await page.locator("#quickSave").click();
    await shows(page, "#quickError", "AAPL");

    await page.locator("#quickSymbol").fill("PART");
    await page.locator("#quickSide").selectOption("long");
    await page.locator("#quickQty").fill("10");
    await page.locator("#quickPrice").fill("20");
    await page.locator("#quickDate").fill(today);
    await page.locator("#quickPrice").press("Enter");
    await shows(page, "#upcomingCard", "PART");
    await shows(page, "#upcomingCard", "stop not recorded");
    assert(await page.locator("#quickSide").inputValue() === "long", label + " side stays long");

    await page.evaluate(function () { localStorage.setItem("ladder-refresh-ready", "1"); });
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector("#upcomingCard");
    await shows(page, "#upcomingCard", "PART");

    await page.getByRole("tab", { name: "Trades" }).click();
    await page.locator(".stock-card", { has: page.getByRole("heading", { name: /^PART/ }) }).getByRole("button", { name: "Edit" }).click();
    await page.locator("#partialDetails summary").click();
    await page.locator("#addExitBtn").click();
    await page.locator(".exit-qty").fill("4");
    await page.locator(".exit-price").fill("22");
    await page.locator(".exit-date").fill(today);
    await page.locator(".exit-fees").fill("0");
    await page.locator("#tradeSaveBtn").click();
    await shows(page, "#positionsList", "partially exited");
    await shows(page, "#positionsList", "+$8.00");

    await page.getByRole("tab", { name: "Overview" }).click();
    await page.locator("#quickSymbol").fill("DONE");
    await page.locator("#quickSide").selectOption("short");
    await page.locator("#quickQty").fill("1");
    await page.locator("#quickPrice").fill("5");
    await page.locator("#quickDate").fill(today);
    await page.locator("#quickSave").click();
    assert(await page.locator("#quickSide").inputValue() === "short", label + " last side");
    await page.getByRole("tab", { name: "Trades" }).click();
    await page.locator(".stock-card", { has: page.getByRole("heading", { name: /^DONE/ }) }).getByRole("button", { name: "Close" }).click();
    await page.locator("#fieldExit").fill("4");
    await page.locator("#fieldExitDate").fill(today);
    await page.locator("#tradeSaveBtn").click();
    await shows(page, "#positionsList", "Closed — recorded exit");

    await page.getByRole("tab", { name: "Overview" }).click();
    await shows(page, "#dashRealized", "+$9.00");
    await page.locator("#overviewPreset").selectOption("1w");
    await shows(page, "#dashboardBody", "1 week");
    await shows(page, "#dashRealized", "+$9.00");
    await page.locator("#overviewPreset").selectOption("all");
    await shows(page, "#dashRealized", "+$9.00");
    await page.locator("#overviewPreset").selectOption("custom");
    await shows(page, "#dashboardBody", "Choose a start");
    await page.locator("#overviewFrom").fill(today);
    await page.locator("#overviewTo").fill(today);
    await shows(page, "#dashRealized", "+$9.00");
    await page.locator("#overviewPreset").selectOption("ytd");

    await page.getByRole("tab", { name: "Analytics" }).click();
    await shows(page, "#metric-realized", "+$9.00");
    await shows(page, "#analyticsBody", "not account equity");

    await page.getByRole("tab", { name: "Risk" }).click();
    await page.locator("#riskAccount").fill("10000");
    await page.locator("#riskPercent").fill("1");
    await page.locator("#riskEntry").fill("50");
    await page.locator("#riskStop").fill("48");
    await page.locator("#riskRemember").check();
    await page.getByRole("button", { name: "Calculate size" }).click();
    await page.getByRole("tab", { name: "Overview" }).click();
    await shows(page, "#dashReturn", "%");
    await shows(page, "#dashReturn", "account");

    await page.getByRole("tab", { name: "Settings" }).click();
    const jsonDownload = page.waitForEvent("download");
    await page.locator("#exportJsonBtn").click();
    const jsonFile = await jsonDownload;
    assert(jsonFile.suggestedFilename().indexOf("bryz-trades-") === 0, jsonFile.suggestedFilename());
    const csvDownload = page.waitForEvent("download");
    await page.locator("#exportTradesCsvBtn").click();
    const csvFile = await csvDownload;
    assert(csvFile.suggestedFilename().indexOf("bryz-trades-trades-") === 0, csvFile.suggestedFilename());

    assert(await page.locator("iframe").count() === 0, label + " frames");
    assert(await page.locator("script[src^='http']").count() === 0, label + " outside scripts");
    await noOverflow(page, label + " premium");
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("premium passed", label);
  } finally {
    await context.close();
  }
}

async function runFlow(browser, url, today, viewport, label) {
  const opened = await openPage(browser, url, viewport, "dark", null);
  const page = opened.page;
  page.setDefaultTimeout(15000);
  page.on("dialog", function (dialog) { dialog.accept(); });
  try {
    assert((await page.locator("h1").innerText()) === "Bryz Trades", "title");
    assert((await page.title()) === "Bryz Trades", "document title");
    await assertBrand(page);
    await assertMainLayout(page, label);
    await assertMobileChrome(page, label);
    await shows(page, "#dashboardBody", "No trades recorded yet");
    await shows(page, "#upcomingCard", "Nothing upcoming");
    assert(await page.locator("#dashReturn").count() === 0, "return without account size");
    await page.getByRole("tab", { name: "Trades" }).click();
    await shows(page, "#positionsList", "No trades yet");
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
    assert(openText.includes("1"), "open count should be the one open trade, was " + openText);
    assert(!openText.includes("SHOP") && !openText.includes("SOFI"), "no seeded ticker in " + openText);

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
      tickers: [{ id: "sof", symbol: "AAPL", shares: 10, avgCost: 18, notes: "from before", getIn: 18, getOut: 18, hardStop: 16.92, orderStatus: "filled", fillPrice: 18, close: 16 }],
      days: { "2026-01-05": { pnl: 25.5, note: "old manual", breakdown: [{ tickerId: "sof", symbol: "AAPL", amount: 25.5 }] } }
    }));
  });
  const page = await context.newPage();
  const errors = [];
  watchOrigin(page, errors, new URL(url).origin);
  page.on("pageerror", function (err) {
    errors.push(String(err && err.message || err));
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
    assert(stored.v3.trades.some(function (trade) { return trade.symbol === "SHOP" && trade.status === "open"; }), "open symbol survived");

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
    assert(!filtered.includes("SHOP"), "symbol filter hid SHOP");
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

async function runSymbols(browser, url) {
  const opened = await openPage(browser, url, { width: 1440, height: 900 }, "dark", demoJournal(new Date()));
  const page = opened.page;
  page.setDefaultTimeout(15000);
  try {
    await page.getByRole("tab", { name: "Symbols" }).click();
    await shows(page, "#watchlistBody", "SHOP");
    await shows(page, "#watchlistBody", "AAPL");
    await shows(page, "#symbolDetailBody", "SHOP");
    await shows(page, "#symbolDetailBody", "Win rate");
    await shows(page, "#symbolDetailBody", "Closed P/L");
    await shows(page, "#symbolDetailBody", "$16.92");
    await shows(page, "#symbolDetailBody", "$22.00");
    await page.locator("#symbolSearch").fill("AAPL");
    await page.locator("#symbolApply").click();
    await shows(page, "#symbolDetailName", "AAPL");
    await shows(page, "#symbolRealized", "+$");
    assert(await page.locator("iframe").count() === 0, "no frames");
    assert(await page.locator("script[src^='http']").count() === 0, "no outside scripts");
    const journalAfter = await page.evaluate(function () { return localStorage.getItem("ladder-journal-v3"); });
    assert(journalAfter && journalAfter.includes("\"symbol\":\"SHOP\""), "symbol view changed the journal");
    if (page.errors.length) throw new Error(page.errors.join("\n"));
    console.log("symbols view passed");
  } finally {
    await opened.context.close();
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
  const preserveErrors = [];
  watchOrigin(page, preserveErrors, new URL(url).origin);
  try {
    await page.goto(url, { waitUntil: "load" });
    assert((await page.locator("h1").innerText()) === "Bryz Trades", "rename title");
    assert((await page.title()) === "Bryz Trades", "rename document title");
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
    if (preserveErrors.length) throw new Error(preserveErrors.join("\n"));
    console.log("preservation passed");
  } finally {
    await context.close();
  }
}

async function runPagesBase(browser, url) {
  const opened = await openPage(browser, url, { width: 390, height: 844 }, "dark", { schemaVersion: 2, settings: {}, trades: [], days: {} });
  const page = opened.page;
  try {
    assert((await page.locator("h1").innerText()) === "Bryz Trades", "pages base title");
    assert((await page.title()) === "Bryz Trades", "pages base document title");
    const sheet = await page.evaluate(function () {
      const link = document.querySelector("link[rel='stylesheet']");
      return link ? link.getAttribute("href") : "";
    });
    assert(sheet === "css/styles.css", "pages stylesheet " + sheet);
    await assertBrand(page);
    await shows(page, "#dashboardBody", "No trades recorded yet");
    if (page.errors.length) throw new Error(page.errors.join("\n"));
    console.log("pages base path passed");
  } finally {
    await opened.context.close();
  }
}

async function runTerminal(browser, url, today) {
  const journal = {
    schemaVersion: 2,
    settings: { accountSize: 10000, riskPercent: 1 },
    trades: [
      { id: "win", symbol: "AAPL", direction: "long", status: "closed", quantity: 10, entryPrice: 100, exitPrice: 110, fees: 0, entryDate: today, exitDate: today },
      { id: "loss", symbol: "MSFT", direction: "long", status: "closed", quantity: 10, entryPrice: 100, exitPrice: 95, fees: 0, entryDate: today, exitDate: today },
      { id: "flat", symbol: "AMD", direction: "long", status: "closed", quantity: 4, entryPrice: 50, exitPrice: 50, fees: 0, entryDate: today, exitDate: today },
      { id: "open", symbol: "NVDA", direction: "long", status: "open", quantity: 5, entryPrice: 150, hardStop: 140, entryDate: today },
      { id: "call", symbol: "QQQ", assetType: "call", direction: "long", status: "closed", quantity: 1, entryPrice: 2, exitPrice: 3, fees: 0, entryDate: today, exitDate: today }
    ],
    days: {}
  };
  const sizes = [
    ["desktop", { width: 1440, height: 900 }],
    ["phone", { width: 390, height: 844 }]
  ];
  for (const size of sizes) {
    const opened = await openPage(browser, url, size[1], "dark", journal);
    const page = opened.page;
    try {
      await shows(page, "#dashRealized", "+$150.00");
      await shows(page, "#dashWinRate", "2 / 4");
      await shows(page, "#dashExpectancy", "2.00 R:R");
      await shows(page, "#dashExpectancy", "+$37.50");
      await shows(page, "#dashCapital", "Active Capital at Risk");
      await shows(page, "#dashCapital", "$750.00");
      await shows(page, "#dashCapital", "Committed cost basis");
      await shows(page, "#dashOpen", "1 open");
      await shows(page, "#dashboardBody", "CLOSED - WIN");
      await shows(page, "#dashboardBody", "CLOSED - LOSS");
      await shows(page, "#dashboardBody", "CLOSED - BREAKEVEN");
      await shows(page, "#dashboardBody", "OPEN");
      await shows(page, "#dashboardBody", "Call");
      await shows(page, "#dashboardBody", "Equity");
      const headers = await page.locator("#dashboardBody .terminal-table th").allTextContents();
      assert(headers.join(" ").toUpperCase().indexOf("EXIT/TARGET") !== -1, "table headers " + headers.join("|"));
      assert(headers.join(" ").toUpperCase().indexOf("TYPE") !== -1, "type column " + headers.join("|"));
      await shows(page, "#dashCapital", "Planned risk");
      const empty = await page.locator("#dashExpectancy").innerText();
      assert(!/NaN|Infinity/.test(empty), "expectancy text " + empty);
      await noOverflow(page, "terminal " + size[0]);
      if (page.errors.length) throw new Error(page.errors.join("\n"));
    } finally {
      await opened.context.close();
    }
  }
  const bare = await openPage(browser, url, { width: 768, height: 1024 }, "dark", { schemaVersion: 2, settings: {}, trades: [], days: {} });
  try {
    await shows(bare.page, "#dashExpectancy", "Not enough closed trades");
    await shows(bare.page, "#dashCapital", "No open positions");
    await shows(bare.page, "#dashRealized", "N/A");
    await noOverflow(bare.page, "terminal empty tablet");
  } finally {
    await bare.context.close();
  }
  const calcPage = await openPage(browser, url, { width: 390, height: 844 }, "dark", journal);
  const page = calcPage.page;
  try {
    await page.getByRole("tab", { name: "Risk" }).click();
    await page.locator("#riskAccount").fill("10000");
    await page.locator("#riskPercent").fill("1");
    await page.locator("#riskEntry").fill("50");
    await page.locator("#riskStop").fill("48");
    await page.locator("#riskAsset").selectOption("options");
    await page.locator("#riskDirection").selectOption("long");
    await page.locator("#riskCalcBtn").click();
    await shows(page, "#riskResult", "0 contracts");
    await shows(page, "#riskResult", "does not cover 1 contract");
    assert(!/NaN|Infinity/.test(await page.locator("#riskResult").innerText()), "options size");
    await page.locator("#riskPercent").fill("10");
    await page.locator("#riskAsset").selectOption("shares");
    await page.locator("#riskCalcBtn").click();
    await shows(page, "#riskResult", "Max 500 shares");
    await shows(page, "#riskResult", "Max account drawdown");
    await shows(page, "#riskResult", "gaps, slippage, fees");
    await page.locator("#riskStop").fill("50");
    await page.locator("#riskCalcBtn").click();
    await shows(page, "#riskResult", "same");
    await page.locator("#riskStop").fill("48");
    await page.locator("#riskPercent").fill("101");
    await page.locator("#riskCalcBtn").click();
    await shows(page, "#riskResult", "above 100");
    await page.locator("#riskPercent").fill("1");
    await page.locator("#riskEntry").fill("-1");
    await page.locator("#riskCalcBtn").click();
    await shows(page, "#riskResult", "negative");
    await page.locator("#riskAccount").fill("");
    await page.locator("#riskCalcBtn").click();
    await shows(page, "#riskResult", "Enter account capital");
    await page.getByRole("tab", { name: "Overview" }).click();
    await page.locator("#sizeCapital").fill("10000");
    await page.locator("#sizeRisk").fill("1");
    await page.locator("#sizeEntry").fill("50");
    await page.locator("#sizeStop").fill("48");
    await page.locator("#sizeAsset").selectOption("shares");
    await page.locator("#sizeCalcBtn").click();
    await shows(page, "#sizeResult", "Max 50 shares");
    await shows(page, "#sizeResult", "Capital at risk");
    await noOverflow(page, "terminal calculator phone");
    if (page.errors.length) throw new Error(page.errors.join("\n"));
    console.log("terminal checks passed");
  } finally {
    await calcPage.context.close();
  }
}

async function assertRecentTradesFit(page) {
  const bad = await page.evaluate(function () {
    const card = document.querySelector("#dashboardBody .side-card");
    if (!card) return "missing recent trades card";
    const box = card.getBoundingClientRect();
    const cells = card.querySelectorAll(".trade-table td");
    if (!cells.length) return "recent trades has no rows";
    for (let i = 0; i < cells.length; i++) {
      const node = cells[i];
      const rect = node.getBoundingClientRect();
      const label = (node.getAttribute("data-label") || "") + " " + node.textContent.trim();
      if (rect.width > 0 && rect.right < box.left - 1) return "outside card " + label;
      if (node.scrollWidth > node.clientWidth + 2) return "clipped " + label;
    }
    const text = card.innerText;
    const source = card.textContent || "";
    if (!/\$\d+\.\d{2}/.test(text)) return "money value is not fully present";
    if (source.indexOf("Exit") === -1 && text.indexOf("N/A") === -1) return "exit column missing";
    const scroller = card.querySelector(".trade-scroll");
    if (scroller) {
      const sbox = scroller.getBoundingClientRect();
      if (sbox.right > box.right + 2 || sbox.left < box.left - 2) return "table scroll extends outside the card";
    }
    return "";
  });
  assert(!bad, "recent trades " + bad);
}

async function assertOnlyActiveTab(page, activeId) {
  const info = await page.evaluate(function (id) {
    function paint(node) {
      const style = getComputedStyle(node);
      return {
        active: node.classList.contains("active"),
        bg: style.backgroundColor,
        color: style.color,
        shadow: style.boxShadow
      };
    }
    return {
      activeIds: Array.from(document.querySelectorAll(".tabs button.active")).map(function (node) { return node.id; }),
      risk: paint(document.getElementById("tab-risk")),
      markets: paint(document.getElementById("tab-markets")),
      current: paint(document.getElementById(id))
    };
  }, activeId);
  assert(info.activeIds.length === 1 && info.activeIds[0] === activeId, "selected tabs " + info.activeIds.join(","));
  assert(info.risk.bg === info.markets.bg && info.risk.color === info.markets.color, "inactive tab still looks selected");
  assert(info.current.bg !== info.markets.bg, "active tab has no selected fill");
}

async function shotView(page, file) {
  const only = process.env.LADDER_SHOTS;
  if (only && only.split(",").indexOf(file) === -1) return;
  await page.evaluate(function () {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
  const full = page.viewportSize().width >= 900;
  await page.screenshot({ path: path.join(shotDir, file), fullPage: full });
}

async function runShots(browser, url, journal) {
  const sizes = [
    ["phone", { width: 390, height: 844 }],
    ["desktop", { width: 1440, height: 900 }]
  ];
  const sections = [
    ["markets", "Symbols", "investor_markets"],
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
      await page.evaluate(function () {
        const tip = document.getElementById("chartTip");
        if (tip) tip.hidden = true;
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      });
      await noOverflow(page, size[0] + " overview");
      await assertMainLayout(page, size[0] + " overview");
      await assertRecentTradesFit(page);
      await shotView(page, "investor_overview_" + size[0] + ".png");
      for (const section of sections) {
        await page.getByRole("tab", { name: section[1] }).click();
        await page.waitForSelector("#view-" + section[0] + ":not([hidden])");
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
        if (section[0] === "analytics") {
          await assertOnlyActiveTab(page, "tab-analytics");
          await page.evaluate(function () { document.getElementById("tab-risk").focus({ focusVisible: true }); });
          const focused = await page.evaluate(function () {
            const risk = document.getElementById("tab-risk");
            const markets = document.getElementById("tab-markets");
            const riskStyle = getComputedStyle(risk);
            const marketsStyle = getComputedStyle(markets);
            return {
              visible: risk.matches(":focus-visible"),
              riskBg: riskStyle.backgroundColor,
              marketsBg: marketsStyle.backgroundColor,
              analyticsBg: getComputedStyle(document.getElementById("tab-analytics")).backgroundColor,
              riskShadow: riskStyle.boxShadow,
              marketsShadow: marketsStyle.boxShadow
            };
          });
          assert(focused.visible, "Risk focus is not visible");
          assert(focused.riskBg === focused.marketsBg, "focused Risk uses the selected fill");
          assert(focused.analyticsBg !== focused.riskBg, "Analytics lost the selected fill");
          assert(focused.riskShadow !== "none" && focused.riskShadow !== focused.marketsShadow, "focus ring matches an idle tab");
        }
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

function proJournal(now) {
  const year = now.getFullYear();
  const specs = [
    ["01-08", "AAPL", "long", 10, 180, 188, 1.5, "breakout"],
    ["01-15", "MSFT", "long", 6, 400, 392, 1, "pullback"],
    ["01-22", "NVDA", "long", 4, 130, 142, 1.25, "momentum"],
    ["02-03", "TSLA", "short", 3, 240, 228, 1, "fade"],
    ["02-12", "AMD", "long", 8, 150, 150, 0, "range"],
    ["02-20", "META", "long", 20, 16, 14.5, 0.4, "breakout"],
    ["03-04", "QQQ", "long", 5, 480, 496, 1, "trend"],
    ["03-18", "AAPL", "long", 8, 185, 191, 1, "breakout"],
    ["04-02", "NVDA", "short", 2, 140, 148, 0.8, "fade"],
    ["04-16", "MSFT", "long", 4, 410, 424, 1, "trend"],
    ["05-06", "AMD", "long", 10, 155, 149, 1, "pullback"],
    ["05-21", "META", "long", 30, 15, 17.2, 0.6, "breakout"],
    ["06-09", "TSLA", "long", 4, 220, 236, 1.2, "momentum"],
    ["06-24", "QQQ", "long", 3, 500, 508, 0.8, "trend"],
    ["07-08", "AAPL", "long", 12, 195, 202, 1.4, "breakout"],
    ["07-22", "NVDA", "long", 3, 145, 138, 0.9, "momentum"],
    ["08-05", "MSFT", "short", 2, 430, 418, 1, "fade"],
    ["08-19", "AMD", "long", 6, 160, 171, 0.7, "range"],
    ["09-03", "META", "long", 25, 17, 18.4, 0.5, "breakout"],
    ["09-17", "QQQ", "long", 4, 520, 512, 1, "trend"],
    ["09-30", "TSLA", "long", 3, 250, 261, 1, "momentum"],
    ["10-01", "META", "long", 15, 18, 19.1, 0.4, "breakout"],
    ["10-02", "AAPL", "long", 6, 200, 196, 1, "pullback"],
    ["10-05", "NVDA", "long", 2, 150, 146, 0.8, "momentum"],
    ["10-06", "MSFT", "long", 3, 420, 428, 1, "trend"],
    ["10-07", "QQQ", "long", 2, 530, 536, 0.6, "trend"],
    ["10-08", "AMD", "long", 5, 165, 170, 0.5, "range"]
  ];
  const trades = specs.map(function (row, index) {
    const long = row[2] === "long";
    return {
      id: "pro-" + index,
      symbol: row[1],
      direction: row[2],
      status: "closed",
      quantity: row[3],
      entryPrice: row[4],
      exitPrice: row[5],
      fees: row[6],
      entryDate: year + "-" + row[0],
      exitDate: year + "-" + row[0],
      strategy: row[7],
      exitReason: row[5] === row[4] ? "other" : (long ? (row[5] > row[4] ? "target" : "stop") : (row[5] < row[4] ? "target" : "stop")),
      hardStop: long ? Math.round(row[4] * 0.95 * 100) / 100 : Math.round(row[4] * 1.05 * 100) / 100,
      targetPrice: long ? Math.round(row[4] * 1.08 * 100) / 100 : Math.round(row[4] * 0.92 * 100) / 100
    };
  });
  trades.push({
    id: "pro-open",
    symbol: "NVDA",
    name: "NVIDIA",
    direction: "long",
    status: "open",
    quantity: 5,
    entryPrice: 150,
    hardStop: 142,
    entryDate: year + "-10-02",
    strategy: "momentum",
    thesis: "Still open. Not a realized result."
  });
  return {
    schemaVersion: 2,
    settings: { accountSize: 50000, riskPercent: 1, selectedSymbol: "NVDA", selectedExchange: "NASDAQ", chartPeriod: "6M" },
    trades: trades,
    days: {}
  };
}

async function runProShots(browser, url, journal) {
  const shots = [
    ["desktop", { width: 1440, height: 900 }, [
      ["Overview", "pro_overview_desktop.png"],
      ["Analytics", "pro_analytics_desktop.png"],
      ["Trades", "pro_trades_desktop.png"],
      ["Calendar", "pro_calendar_desktop.png"]
    ]],
    ["phone", { width: 390, height: 844 }, [
      ["Overview", "pro_overview_phone.png"],
      ["Trades", "pro_trades_phone.png"]
    ]]
  ];
  for (const size of shots) {
    const opened = await openPage(browser, url, size[1], "dark", journal);
    const page = opened.page;
    try {
      for (const shot of size[2]) {
        await page.getByRole("tab", { name: shot[0] }).click();
        await page.waitForTimeout(200);
        await page.evaluate(function () {
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
          const tip = document.getElementById("chartTip");
          if (tip) tip.hidden = true;
        });
        await noOverflow(page, "pro " + size[0] + " " + shot[0]);
        await page.screenshot({
          path: "/opt/cursor/artifacts/" + shot[1],
          fullPage: size[1].width >= 900
        });
      }
      if (page.errors.length) throw new Error(page.errors.join("\n"));
    } finally {
      await opened.context.close();
    }
  }
  console.log("pro screenshots saved");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
