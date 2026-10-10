const { chromium } = require("playwright-core");
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");
// Browser check: node tests/browser.check.js [siteRoot] [referenceRoot] [shotsDir]
// Needs playwright-core and Chrome (CHROME env or /usr/bin/google-chrome). Expected totals come from js/calc.js of referenceRoot.
const ROOT = process.argv[2] || path.join(__dirname, ".."), MAIN = process.argv[3] || ROOT, OUT = process.argv[4] || "/tmp/trades-shots";
fs.mkdirSync(OUT, { recursive: true });
const F = require(path.join(__dirname, "fixtures/trades.js"));
// Expected numbers come from the CURRENT main's modules (not the build's copies).
const money = require(path.join(MAIN, "js/money.js"));
const calc = require(path.join(MAIN, "js/calc.js"));
const schema = require(path.join(MAIN, "js/schema.js"));
const storage = require(path.join(MAIN, "js/storage.js"));
const fmt = (c) => (typeof c === "bigint" ? money.formatCents(c).replace(/^-/, "\u2212") : "—");
const plain = (c) => (typeof c === "bigint" ? money.formatCents(c, "plain").replace(/^-/, "\u2212") : "—");
const PORT = 8802, BASE = "http://127.0.0.1:" + PORT + "/";
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
function expectedFor(initial) {
  const mem = storage.createMemoryStorage(initial);
  const r = storage.loadJournal(mem);
  const m = calc.analyze(r.data, {}), ex = calc.expectancy(m), cap = calc.activeCapitalAtRisk(r.data);
  return { journal: r.data, mem, kpi: [m.tradeCount ? fmt(m.realizedNetCents) : "—", m.winRate || "—", ex.ready ? (ex.rr ? ex.rr + " R" : fmt(ex.perTradeCents)) : "—", cap.included ? plain(cap.cents) : "$0.00"], m };
}
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const errors = [], external = [];
  await ctx.route("**/*", (route) => { const u = route.request().url(); if (u.startsWith(BASE)) return route.continue(); external.push(u); return route.abort(); });
  const page = await ctx.newPage();
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());
  const dump = () => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
  async function loadWith(initial) {
    await page.goto(BASE);
    await page.evaluate((init) => { localStorage.clear(); Object.keys(init).forEach((k) => localStorage.setItem(k, init[k])); }, initial);
    await page.reload();
  }
  // Pages: each section lives on its own hash route now
  const route = async (r) => { await page.evaluate((r) => { location.hash = "#/" + r; }, r); await page.waitForTimeout(80); };
  const kpis = () => page.$$eval("#kpis .v", (n) => n.map((x) => x.textContent));
  const rows = () => page.$$eval("#tradeRows tr", (n) => n.length);

  // 0) first visit: empty state, no fake numbers
  await loadWith({});
  await route("trades");
  ok((await rows()) === 0 && !(await page.isHidden("#tradesEmpty")), "first visit: empty table + empty state");
  const k0 = await kpis();
  ok(k0[0] === "—" && k0[1] === "—" && k0[3] === "$0.00", "first visit: no fake numbers (" + k0.join(" | ") + ")");
  ok(!/LAB|example|Example|concept/.test(await page.textContent("body")), "no LAB/example/concept text");

  const shapes = [
    ["v3 journal (ladder-journal-v3)", { "ladder-journal-v3": JSON.stringify(F.v3) }, F.v3.trades.length],
    ["v2 journal (ladder-journal-v2)", { "ladder-journal-v2": JSON.stringify(F.v2) }, F.v2.trades.length],
    ["v1 tracker (stock-tracker-v1)", { "stock-tracker-v1": JSON.stringify(F.v1) }, 2],
    ["SOFI card (sofi-levels-card-v1)", { "sofi-levels-card-v1": JSON.stringify(F.sofi) }, 1],
  ];
  for (const [label, initial, n] of shapes) {
    const exp = expectedFor(initial);
    await loadWith(initial);
    const got = await kpis();
    ok((await rows()) === n, label + ": all " + n + " trades shown");
    ok(JSON.stringify(got) === JSON.stringify(exp.kpi), label + ": KPIs match main calc (" + got.join(" | ") + ")");
    // storage after load == what current main's loadJournal leaves behind
    const after = await dump();
    const expKeys = {}; Object.keys(initial).forEach((k) => (expKeys[k] = initial[k]));
    ["ladder-journal-v3", "ladder-journal-premigration", "ladder-journal-premigration-v3"].forEach((k) => { const v = exp.mem.getItem(k); if (v != null) expKeys[k] = v; });
    const strip = (o) => { const c = Object.assign({}, o); if (c["ladder-journal-v3"]) { const p = JSON.parse(c["ladder-journal-v3"]); (p.trades || []).forEach((t) => { if (/^[0-9a-f-]{36}$|^id-/.test(t.id)) t.id = "GEN"; }); c["ladder-journal-v3"] = JSON.stringify(p); } Object.keys(c).forEach((k) => { if (/premigration/.test(k)) { try { const p = JSON.parse(c[k]); delete p.savedAt; c[k] = JSON.stringify(p); } catch (e) {} } }); const sorted = {}; Object.keys(c).sort().forEach((k) => (sorted[k] = c[k])); return sorted; };
    ok(JSON.stringify(strip(after)) === JSON.stringify(strip(expKeys)), label + ": storage identical to what current main writes on load (old keys + backups kept)");
  }

  // 1) v3 details: every field preserved through an edit
  await loadWith({ "ladder-journal-v3": JSON.stringify(F.v3) });
  const v3exp = expectedFor({ "ladder-journal-v3": JSON.stringify(F.v3) });
  ok((await dump())["ladder-journal-v3"] === JSON.stringify(F.v3), "v3 saved journal not rewritten on load");
  const beforeEdit = JSON.parse(JSON.stringify(schema.toStored(schema.readStoredJournal(JSON.stringify(F.v3)).journal)));
  // P&L cells per trade vs main tradeResult
  const cells = await page.$$eval("#tradeRows tr", (n) => n.map((r) => ({ sym: r.children[1].textContent, pnl: r.children[6].textContent, st: r.children[7].textContent })));
  let pnlOk = true;
  for (const t of v3exp.journal.trades) {
    const res = calc.tradeResult(t), books = calc.positionAccounting(t);
    const want = typeof res.netCents === "bigint" ? fmt(res.netCents) : typeof books.unrealizedCents === "bigint" ? fmt(books.unrealizedCents) + (books.unrealizedPercent ? " (" + (books.unrealizedPercent[0] === "-" ? "\u2212" + books.unrealizedPercent.slice(1) : "+" + books.unrealizedPercent) + ")" : "") : "—";
    const c = cells.find((x) => x.sym === t.symbol);
    if (!c || c.pnl !== want) { pnlOk = false; console.log("   mismatch", t.symbol, c && c.pnl, want); }
  }
  ok(pnlOk, "every trade's P&L cell equals main's tradeResult / manual-mark unrealized");
  // edit NVDA partial (notes only) -> exits, stop, strategy etc kept
  await route("trades");
  const idx = await page.$$eval("#tradeRows tr", (n) => n.findIndex((r) => r.children[1].textContent === "NVDA"));
  await page.click(`#tradeRows tr:nth-child(${idx + 1}) .ib.edit`);
  ok(await page.isDisabled("#f-exit"), "partial-exit trade: exit field locked");
  await page.fill("#f-notes", "edited note");
  await page.click("#submitBtn");
  const afterEdit = JSON.parse((await dump())["ladder-journal-v3"]);
  const nb = beforeEdit.trades.find((t) => t.id === "t-partial"), na = afterEdit.trades.find((t) => t.id === "t-partial");
  const diffKeys = Object.keys(Object.assign({}, nb, na)).filter((k) => JSON.stringify(nb[k]) !== JSON.stringify(na[k]));
  ok(JSON.stringify(diffKeys) === '["notes"]', "edit changed only notes on the partial trade vs main's normalised copy (diff: " + diffKeys.join(",") + ")");
  ok(JSON.stringify(afterEdit.trades.filter((t) => t.id !== "t-partial")) === JSON.stringify(beforeEdit.trades.filter((t) => t.id !== "t-partial")), "other trades untouched");
  ok(JSON.stringify(afterEdit.days) === JSON.stringify(beforeEdit.days) && JSON.stringify(afterEdit.settings) === JSON.stringify(beforeEdit.settings), "days + settings untouched");
  // edit avgCost trade without touching entry -> avgCost stays, entryPrice stays null
  const ia = await page.$$eval("#tradeRows tr", (n) => n.findIndex((r) => r.children[1].textContent === "SOFI"));
  await page.click(`#tradeRows tr:nth-child(${ia + 1}) .ib.edit`);
  await page.fill("#f-stop", "7.5");
  await page.click("#submitBtn");
  const sa = JSON.parse((await dump())["ladder-journal-v3"]).trades.find((t) => t.id === "t-avg");
  ok(sa.entryPrice === null && sa.avgCost === 8.42 && sa.hardStop === 7.5 && sa.orderStatus === "filled" && sa.close === 9.05 && sa.quantity === 150.5, "avg-cost trade keeps avgCost/checklist fields after edit");

  // 2) CRUD: log open trade, close it, delete it; reload persists
  await page.fill("#f-symbol", "ZZZ"); await page.fill("#f-qty", "3"); await page.fill("#f-entry", "10.10"); await page.fill("#f-date", "2026-10-07");
  await page.click("#submitBtn");
  let j = JSON.parse((await dump())["ladder-journal-v3"]);
  const z = j.trades.find((t) => t.symbol === "ZZZ");
  ok(z && z.status === "open" && z.quantity === 3 && z.entryPrice === 10.1 && z.entryDate === "2026-10-07", "log open trade saved in main's v3 shape");
  await page.reload();
  const iz = await page.$$eval("#tradeRows tr", (n) => n.findIndex((r) => r.children[1].textContent === "ZZZ"));
  ok(iz >= 0, "new trade persists after reload");
  await page.click(`#tradeRows tr:nth-child(${iz + 1}) .ib.close`);
  await page.fill("#c-exit", "12.35"); await page.fill("#c-date", "2026-10-08"); await page.fill("#c-fees", "0.65");
  await page.click("#closeForm button[type=submit]");
  j = JSON.parse((await dump())["ladder-journal-v3"]);
  const zc = j.trades.find((t) => t.symbol === "ZZZ");
  const zres = calc.tradeResult(zc);
  ok(zc.status === "closed" && zres.netCents === 610n, "close: status closed, net = (12.35-10.10)*3-0.65 = $6.10 via main calc");
  const k1 = await kpis(); const e1 = expectedFor({ "ladder-journal-v3": JSON.stringify(j) });
  ok(JSON.stringify(k1) === JSON.stringify(e1.kpi), "KPIs after close match main calc (" + k1.join(" | ") + ")");
  // close partial NVDA -> adds a final exit lot for remaining 6
  const ip = await page.$$eval("#tradeRows tr", (n) => n.findIndex((r) => r.children[1].textContent === "NVDA"));
  await page.click(`#tradeRows tr:nth-child(${ip + 1}) .ib.close`);
  await page.fill("#c-exit", "125"); await page.fill("#c-date", "2026-10-09");
  await page.click("#closeForm button[type=submit]");
  j = JSON.parse((await dump())["ladder-journal-v3"]);
  const nv = j.trades.find((t) => t.id === "t-partial");
  ok(nv.status === "closed" && nv.exits.length === 2 && nv.exits[1].quantity === 6 && nv.exits[0].id === "x1", "closing a partial trade adds a final lot for the remaining 6");
  // delete ZZZ
  const iz2 = await page.$$eval("#tradeRows tr", (n) => n.findIndex((r) => r.children[1].textContent === "ZZZ"));
  await page.click(`#tradeRows tr:nth-child(${iz2 + 1}) .ib.del`);
  await page.click("#confirmOk"); await page.waitForTimeout(300);
  j = JSON.parse((await dump())["ladder-journal-v3"]);
  ok(!j.trades.some((t) => t.symbol === "ZZZ"), "delete removes the trade");

  // 3) Day dialog keeps breakdown/adjustment
  await page.evaluate(() => { document.querySelector('[data-key]'); });
  await route("calendar");
  await page.click("#calPrev"); // Sep 2026 (today is Oct)
  await page.click('[data-key="2026-09-05"]');
  await page.fill("#d-note", "Good day edited");
  await page.click("#dayForm button[type=submit]");
  j = JSON.parse((await dump())["ladder-journal-v3"]);
  const d5 = j.days["2026-09-05"];
  ok(d5.note === "Good day edited" && d5.manualPnl === 80.5 && d5.breakdown.length === 1, "day edit keeps manual amount + breakdown");
  const calTxt = await page.textContent("#calTotal");
  const sep = calc.monthSummary(j, 2026, 8, new Date());
  ok(calTxt.startsWith(fmt(sep.tradeCents)), "Sept calendar total = main monthSummary (" + calTxt + ")");

  // 4) Export -> re-import (merge + replace), plus importing an old-format export file
  await route("backup");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  const exp = path.join(OUT, "trades-export.json"); await dl.saveAs(exp);
  const exported = JSON.parse(fs.readFileSync(exp, "utf8"));
  ok(exported.schemaVersion === 3 && exported.app === "ladder" && JSON.stringify(exported.trades) === JSON.stringify(j.trades) && JSON.stringify(exported.days) === JSON.stringify(j.days), "export = main's exportPayload format with all trades/days");
  ok(schema.planImport(schema.emptyJournal(), fs.readFileSync(exp, "utf8")).ok, "exported file is importable by current main's planImport");
  await page.setInputFiles("#importFile", exp);
  await page.click("#importDlg button[value=merge]"); await page.waitForTimeout(300);
  const jm = JSON.parse((await dump())["ladder-journal-v3"]);
  ok(jm.trades.length === j.trades.length, "merge of own export does not duplicate (" + jm.trades.length + ")");
  ok(!!(await dump())["ladder-journal-preimport"], "pre-import safety copy written");
  const oldFile = path.join(OUT, "old-ladder-export.json"); fs.writeFileSync(oldFile, JSON.stringify(F.exportFile, null, 2));
  await page.setInputFiles("#importFile", oldFile);
  await page.click("#importDlg button[value=replace]"); await page.waitForTimeout(300);
  const jr = JSON.parse((await dump())["ladder-journal-v3"]);
  ok(JSON.stringify(jr.trades) === JSON.stringify(schema.cleanJournal(F.exportFile).trades), "replace with an old Ladder export loads every trade exactly as main would");
  const v1file = path.join(OUT, "v1.json"); fs.writeFileSync(v1file, JSON.stringify(F.v1));
  await page.setInputFiles("#importFile", v1file);
  await page.click("#importDlg button[value=merge]"); await page.waitForTimeout(300);
  ok(JSON.parse((await dump())["ladder-journal-v3"]).trades.length === F.v3.trades.length + 2, "v1 backup file merges in");

  // 5) Corrupt v3: kept, banner, writes paused
  await loadWith({ "ladder-journal-v3": "{broken" });
  ok(await page.isVisible("#banner"), "corrupt journal: banner shown");
  let st = await dump();
  ok(st["ladder-journal-v3-corrupt"] === "{broken", "corrupt copy kept (same as main)");
  await route("trades");
  await page.fill("#f-symbol", "AAA"); await page.fill("#f-qty", "1"); await page.fill("#f-entry", "1"); await page.click("#submitBtn");
  st = await dump();
  ok(st["ladder-journal-v3"] === "{broken", "no write while paused");

  // 6) Theme key shared with old app
  await loadWith({ "stock-tracker-theme": "dark", "ladder-journal-v3": JSON.stringify(F.v3) });
  ok((await page.getAttribute("html", "data-theme")) === "dark", "uses saved theme from the old app");
  await page.evaluate(() => localStorage.setItem("stock-tracker-theme", "light"));

  // 7) Layout
  await loadWith({ "ladder-journal-v3": JSON.stringify(F.v3) });
  for (const w of [390, 768, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.reload();
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(ov <= 0, "no horizontal overflow at " + w + " (" + ov + ")");
    await page.screenshot({ path: path.join(OUT, "trades-" + w + ".png"), fullPage: true });
  }
  ok(external.length === 0, "no external requests (" + external.join(",") + ")");
  ok(errors.length === 0, "no console errors" + (errors.length ? ": " + errors.slice(0, 5).join(" || ") : ""));
  await browser.close(); srv.kill();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
