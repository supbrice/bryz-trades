// Browser check: one page per section (hash routes) at 390/768/1440: each route renders, sticky nav, current tab,
// scroll to top, back/forward, deep links, old anchors, one-tap links, no overflow, no console errors. Fake data only.
// node tests/pages.check.js [siteRootOrURL]   (needs playwright-core and Chrome)
const { chromium } = require("playwright-core");
const path = require("path"), fs = require("fs"), { spawn } = require("child_process");
const SITE = {
  name: "bt", port: 8823,
  seed: () => ({ "ladder-journal-v3": JSON.stringify(require("./fixtures/trades.js").v3) }),
  routes: [{ id: "overview", sections: ["hero", "stats"] }, { id: "trades", sections: ["log", "trades"] }, { id: "calendar", sections: ["calendar"] }, { id: "risk", sections: ["size"] }, { id: "backup", sections: ["backup"] }],
  allSections: ["hero", "stats", "log", "trades", "calendar", "size", "backup"],
  oldAnchors: [["log", "trades"], ["trades", "trades"], ["calendar", "calendar"], ["size", "risk"], ["backup", "backup"], ["stats", "overview"], ["top", "overview"]],
  extra: async (p, ok, L, BASE) => {
    // hero buttons open their pages
    await p.goto("about:blank"); await p.goto(BASE); await p.waitForTimeout(200);
    await p.click("#heroLog"); await p.waitForTimeout(500);
    ok((await p.evaluate(() => location.hash)) === "#/trades" && (await p.evaluate(() => document.activeElement && document.activeElement.id)) === "f-symbol", L + "hero 'Log trade' opens Trades with the symbol field focused");
    // one-tap #import= link still works (fake trade), lands on Overview with the hash cleared
    const IL = require(path.join(ARG.startsWith("http") ? path.join(__dirname, "..") : ARG, "js/importlink.js"));
    const link = "#import=" + IL.encodeBase64Url(JSON.stringify({ schemaVersion: 3, app: "ladder", trades: [{ id: "pages-check-1", symbol: "ACME", direction: "long", status: "open", quantity: 10, entryPrice: 50, entryDate: "2026-10-01", fees: 0, markPrice: 45, markAsOf: "2026-10-02" }], days: {} }));
    let msg = null; const onD = (d) => { msg = d.message(); d.accept(); }; p.on("dialog", onD);
    await p.goto("about:blank"); await p.goto(BASE + link); await p.waitForTimeout(600);
    p.off("dialog", onD);
    const j = JSON.parse(await p.evaluate(() => localStorage.getItem("ladder-journal-v3")));
    ok(/^Add 1 trade from this link/.test(msg || "") && j.trades.some((t) => t.id === "pages-check-1") && (await p.evaluate(() => location.hash)) === "", L + "#import= link still merges the trade and clears the hash");
    ok((await p.$eval('#pagenav [aria-current="page"]', (a) => a.dataset.route)) === "overview", L + "after the import link you're on Overview");
  }
};
const ARG = process.argv[2] || path.join(__dirname, "..");
const LIVE = /^https?:/.test(ARG), PORT = SITE.port;
const BASE = (LIVE ? ARG : "http://127.0.0.1:" + PORT + "/").replace(/#.*$/, "");
const ORIGIN = new URL(BASE).origin;
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const srv = LIVE ? null : spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ARG, stdio: "ignore" });
  if (srv) await new Promise((r) => setTimeout(r, 800));
  const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true });
  for (const w of [390, 768, 1440]) {
    const ctx = await b.newContext({ viewport: { width: w, height: w === 768 ? 1024 : w === 390 ? 844 : 900 }, reducedMotion: "reduce", timezoneId: "America/Chicago" });
    await ctx.route("**/*", (r) => (r.request().url().startsWith(ORIGIN) ? r.continue() : r.abort()));
    const p = await ctx.newPage(); const errs = [], L = w + "px: ";
    p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(m.text()) && errs.push(m.text()));
    await p.goto(BASE); await p.evaluate((seed) => { localStorage.clear(); Object.keys(seed).forEach((k) => localStorage.setItem(k, seed[k])); }, SITE.seed());
    const snap = () => p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return JSON.stringify(o, Object.keys(o).sort()); });
    const start = await snap();
    const state = () => p.evaluate((ids) => ({
      hash: location.hash, title: document.title, y: Math.round(scrollY),
      visible: ids.filter((id) => { const e = document.getElementById(id); return e && !e.hidden && e.getClientRects().length > 0; }),
      current: [...document.querySelectorAll('#pagenav [aria-current="page"]')].map((a) => a.dataset.route),
      overflow: document.documentElement.scrollWidth - innerWidth,
      nav: (() => { const n = document.querySelector(".pagenav"), r = n.getBoundingClientRect(), cs = getComputedStyle(n); return { pos: cs.position, top: Math.round(r.top), h: Math.round(r.height), sw: document.getElementById("pagenav").scrollWidth, cw: document.getElementById("pagenav").clientWidth }; })()
    }), SITE.allSections);
    // every route via deep link
    for (const r of SITE.routes) {
      await p.goto("about:blank"); await p.goto(BASE + "#/" + (r.id === SITE.routes[0].id ? "" : r.id)); await p.waitForTimeout(250);
      const s = await state();
      ok(JSON.stringify(s.visible) === JSON.stringify(r.sections) && JSON.stringify(s.current) === JSON.stringify([r.id]), L + "deep link #/" + r.id + " shows " + s.visible.join("+") + ", tab '" + s.current + "' highlighted");
      ok(s.overflow <= 0, L + r.id + ": no horizontal overflow (" + s.overflow + ")");
      // sticky nav after scrolling down
      await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(80);
      const s2 = await state();
      if (s2.y > 200) ok(s2.nav.pos === "sticky" && s2.nav.top === 0, L + r.id + ": nav stays stuck at the top while scrolled (top " + s2.nav.top + ")");
      await p.screenshot({ path: "/tmp/pages-" + SITE.name + "-" + w + "-" + r.id + ".png" });
    }
    // nav click: scrolls to top, highlights tab, back/forward
    await p.goto("about:blank"); await p.goto(BASE); await p.waitForTimeout(200);
    const seq = SITE.routes.slice(1, 4).map((r) => r.id);
    for (const id of seq) {
      await p.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await p.click('#pagenav a[data-route="' + id + '"]'); await p.waitForTimeout(200);
      const s = await state();
      ok(s.hash === "#/" + id && s.y === 0 && s.current[0] === id, L + "tab " + id + ": opens at the top (y " + s.y + "), highlighted");
    }
    await p.goBack(); await p.waitForTimeout(200);
    ok((await state()).current[0] === seq[1], L + "Back → " + seq[1]);
    await p.goBack(); await p.waitForTimeout(200);
    ok((await state()).current[0] === seq[0], L + "Back → " + seq[0]);
    await p.goForward(); await p.waitForTimeout(200);
    ok((await state()).current[0] === seq[1], L + "Forward → " + seq[1]);
    if (w === 390) { const s = await state(); ok(s.nav.sw > s.nav.cw, L + "phone: compact scrollable tab row (" + s.nav.sw + " > " + s.nav.cw + ")"); }
    // old in-page anchors map to their page
    for (const [anchor, id] of SITE.oldAnchors) {
      await p.goto("about:blank"); await p.goto(BASE + "#" + anchor); await p.waitForTimeout(250);
      const s = await state();
      ok(s.current[0] === id && s.hash === "#/" + (id === SITE.routes[0].id ? "" : id), L + "old link #" + anchor + " → #/" + id + " (" + s.hash + ")");
    }
    await p.goto("about:blank"); await p.goto(BASE + "#/no-such-page"); await p.waitForTimeout(200);
    ok((await state()).current[0] === SITE.routes[0].id, L + "unknown route falls back to " + SITE.routes[0].id);
    ok((await snap()) === start, L + "browsing pages changed no stored data");
    if (SITE.extra) await SITE.extra(p, ok, L, BASE, w);
    ok(errs.length === 0, L + "no console errors " + errs.join(" | "));
    await ctx.close();
  }
  await b.close(); if (srv) srv.kill();
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
