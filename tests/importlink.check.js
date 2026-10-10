// Browser check for the one-tap import link (#import=...). Fictional data only.
// node tests/importlink.check.js [siteRoot] — needs playwright-core and Chrome (CHROME env or /usr/bin/google-chrome).
const { chromium } = require("playwright-core");
const path = require("path"), { spawn } = require("child_process");
const ROOT = process.argv[2] || path.join(__dirname, "..");
const L = require(path.join(ROOT, "js/importlink.js"));
const F = require(path.join(__dirname, "fixtures/trades.js"));
const PORT = 8812, BASE = "http://127.0.0.1:" + PORT + "/";
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const trade = { id: "link-check-1", symbol: "ACME", direction: "long", status: "open", quantity: 10, entryPrice: 50, entryDate: "2026-10-01", fees: 0, exits: [], markPrice: 45, markAsOf: "2026-10-02" };
const link = "#import=" + L.encodeBase64Url(JSON.stringify({ schemaVersion: 3, app: "ladder", trades: [trade], days: {} }));
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true });
  const ctx = await browser.newContext();
  const errors = [], dialogs = []; let answer = true;
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => { dialogs.push(d.message()); answer ? d.accept() : d.dismiss(); });
  const J = () => page.evaluate(() => localStorage.getItem("ladder-journal-v3"));
  const open = async (hash) => { await page.goto("about:blank"); await page.goto(BASE + hash); await page.waitForTimeout(400); };

  // Existing journal (fixture) must be preserved
  await page.goto(BASE);
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem("ladder-journal-v3", v); }, JSON.stringify(F.v3));
  await page.reload();
  const start = JSON.parse(await J());

  // Cancel: nothing changes
  answer = false; dialogs.length = 0;
  await open(link);
  ok(dialogs[0] === "Add 1 trade from this link? Your existing trades are kept.", "confirm text: " + dialogs[0]);
  ok(JSON.stringify(JSON.parse(await J())) === JSON.stringify(start), "cancel leaves the journal unchanged");
  ok((await page.evaluate(() => localStorage.getItem("ladder-journal-preimport"))) === null, "cancel writes no safety copy");

  // Valid: merge on yes
  answer = true; dialogs.length = 0;
  await open(link);
  let j = JSON.parse(await J());
  ok(j.trades.length === start.trades.length + 1 && j.trades.some((t) => t.id === "link-check-1"), "valid link adds the trade (" + j.trades.length + ")");
  // Saving writes the app's normalized trade shape (same as any save); every original field must survive unchanged.
  const lost = [];
  start.trades.forEach((o) => { const n = j.trades.find((t) => t.id === o.id); if (!n) lost.push(o.id); else Object.keys(o).forEach((k) => { if (JSON.stringify(o[k]) !== JSON.stringify(n[k])) lost.push(o.id + "." + k); }); });
  ok(lost.length === 0, "existing trades kept, every original field intact" + (lost.length ? ": " + lost.join(",") : ""));
  ok(JSON.stringify(j.days) === JSON.stringify(start.days) && JSON.stringify(j.settings) === JSON.stringify(start.settings), "days and settings unchanged");
  ok(!!(await page.evaluate(() => localStorage.getItem("ladder-journal-preimport"))), "safety copy written first");
  ok((await page.evaluate(() => location.hash)) === "", "hash cleared after import");
  ok((await page.textContent("#tradeRows")).includes("ACME"), "trade shows in the table");

  // Duplicate: opening again adds nothing, no confirm
  dialogs.length = 0;
  await open(link);
  j = JSON.parse(await J());
  ok(j.trades.length === start.trades.length + 1 && dialogs.length === 0, "same link again: no duplicate, no prompt");
  ok(/already in your journal/.test(await page.textContent("#toast")), "toast says it is already there");

  // Hash change on an open page (no reload) also works, and is still a no-op here
  await page.evaluate((h) => { location.hash = h; }, link); await page.waitForTimeout(300);
  ok(JSON.parse(await J()).trades.length === start.trades.length + 1, "hashchange path: still no duplicate");

  // Malformed: error, nothing changes
  const before = await J();
  for (const bad of ["#import=%%%", "#import=" + L.encodeBase64Url("not json"), "#import=" + L.encodeBase64Url('{"x":1}')]) {
    dialogs.length = 0;
    await open(bad);
    ok((await J()) === before && dialogs.length === 0, "malformed " + bad.slice(0, 24) + "… changes nothing");
    ok(/damaged|isn't a valid backup|Nothing was changed/.test(await page.textContent("#toast")), "error shown: " + (await page.textContent("#toast")).trim().slice(0, 80));
  }
  ok(errors.length === 0, "no console errors" + (errors.length ? ": " + errors.join(" || ") : ""));
  await browser.close(); srv.kill();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
