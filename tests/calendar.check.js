// Browser check: calendar colors (+ green, − red, zero/empty neutral) in light and dark, with AA contrast.
// Made-up trades only. node tests/calendar.check.js [siteRootOrURL]  (needs playwright-core and Chrome)
const { chromium } = require("playwright-core");
const path = require("path"), { spawn } = require("child_process");
const ARG = process.argv[2] || path.join(__dirname, "..");
const LIVE = /^https?:/.test(ARG), PORT = 8813;
const BASE = LIVE ? ARG : "http://127.0.0.1:" + PORT + "/";
// tint = the theme's soft P&L token, possibly lightened (same RGB channels or same hue family)
const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
const sameHue = (a, b) => { const x = rgb(a), y = rgb(b); const dom = (v) => v.slice(0, 3).indexOf(Math.max(...v.slice(0, 3))); return dom(x) === dom(y); };
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const t = (id, sym, d, entry, exit) => ({ id, symbol: sym, direction: "long", status: "closed", quantity: 10, entryPrice: entry, exitPrice: exit, entryDate: d, exitDate: d, fees: 0, exits: [] });
const journal = (trades) => JSON.stringify({ schemaVersion: 3, trades, days: {}, settings: {} });
const WIN = t("c-win", "AAA", "2026-10-05", 10, 15), LOSS = t("c-loss", "BBB", "2026-10-06", 10, 8), FLAT = t("c-flat", "CCC", "2026-10-07", 10, 10);
const BIGLOSS = t("c-big", "DDD", "2026-10-08", 20, 10);
(async () => {
  const srv = LIVE ? null : spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ARG, stdio: "ignore" });
  if (srv) await new Promise((r) => setTimeout(r, 800));
  const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true });
  const errs = [];
  for (const theme of ["light", "dark"]) for (const [name, trades, sign] of [["net up", [WIN, LOSS, FLAT], "pos"], ["net down", [WIN, LOSS, FLAT, BIGLOSS], "neg"]]) {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 1000 }, timezoneId: "America/Chicago" });
    await ctx.addInitScript(() => { const D = Date; const fixed = new D("2026-10-10T12:00:00-05:00").getTime();
      globalThis.Date = class extends D { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }; });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await p.goto(BASE);
    const seeded = journal(trades);
    await p.evaluate((v) => { localStorage.clear(); localStorage.setItem("ladder-journal-v3", v); }, seeded);
    await p.goto("about:blank"); await p.goto(BASE.replace(/#.*$/, "") + "#/calendar"); await p.waitForTimeout(300);
    if (theme === "dark") await p.evaluate(() => { document.documentElement.setAttribute("data-theme", "dark"); });
    const r = await p.evaluate(() => {
      const css = (n, prop) => getComputedStyle(n)[prop];
      const probe = (v) => { const s = document.createElement("span"); s.style.setProperty("color", "var(" + v + ")"); document.body.appendChild(s); const c = getComputedStyle(s).color; s.remove(); return c; };
      const probeBg = (v) => { const s = document.createElement("span"); s.style.setProperty("background-color", "var(" + v + ")"); document.body.appendChild(s); const c = getComputedStyle(s).backgroundColor; s.remove(); return c; };
      const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true });
      // normalise any CSS color (rgb(), rgba(), color(srgb …) from color-mix) to 0–255 channels via canvas
      const parse = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; };
      const norm = (c) => { const x = parse(c); return "rgba(" + x.r + "," + x.g + "," + x.b + "," + x.a.toFixed(2) + ")"; };
      const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
      const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const card = parse(css(document.querySelector(".cal-card"), "backgroundColor"));
      const cell = (k) => { const n = document.querySelector('#calGrid [data-key="' + k + '"]'); const bg = over(parse(css(n, "backgroundColor")), card); const tx = parse(css(n.querySelector(".p"), "color"));
        return { cls: n.className, text: n.querySelector(".p").textContent, color: css(n.querySelector(".p"), "color"), bg: norm(css(n, "backgroundColor")), contrast: ratio(tx, bg) }; };
      const tot = document.querySelector("#calTotal .cal-month"), ytd = document.querySelector("#calFoot .cal-ytd");
      return { tokens: { green: probe("--green"), red: probe("--red"), be: probe("--be"), muted: probe("--muted"), greenSoft: norm(probeBg("--green-soft")), redSoft: norm(probeBg("--red-soft")), card2: norm(probeBg("--card2")) },
        win: cell("2026-10-05"), loss: cell("2026-10-06"), flat: cell("2026-10-07"), empty: cell("2026-10-09"),
        month: { text: document.getElementById("calTotal").textContent, rest: css(document.getElementById("calTotal"), "color"), color: css(tot, "color"), contrast: ratio(parse(css(tot, "color")), card) },
        year: ytd ? { text: ytd.textContent, color: css(ytd, "color"), contrast: ratio(parse(css(ytd, "color")), card) } : null,
        foot: document.getElementById("calFoot").textContent,
        tableWin: (() => { const td = [...document.querySelectorAll("#tradeRows .pos")][0]; return td ? css(td, "color") : null; })() };
    });
    const L = theme + " / " + name + ": ", T = r.tokens;
    if (name === "net up") {
      ok(r.win.color === T.green && r.win.bg !== T.card2 && sameHue(r.win.bg, T.greenSoft), L + "win day text green + green tint (" + r.win.text + ")");
      ok(r.loss.color === T.red && r.loss.bg !== T.card2 && sameHue(r.loss.bg, T.redSoft), L + "loss day text red + red tint (" + r.loss.text + ")");
      ok(r.flat.color !== T.green && r.flat.color !== T.red && r.flat.bg === T.card2, L + "flat day neutral (" + r.flat.text + ")");
      ok(r.empty.text === "" && r.empty.bg === T.card2, L + "empty day neutral");
      ok(r.tableWin === null || r.tableWin === T.green, L + "same green as trades table");
      for (const k of ["win", "loss", "flat"]) ok(r[k].contrast >= 4.5, L + k + " day contrast " + r[k].contrast.toFixed(2) + " ≥ 4.5");
    }
    const want = sign === "pos" ? T.green : T.red;
    ok(r.month.rest === T.muted, L + "'· N trading days' text stays muted");
    ok(r.month.color === want, L + "month total " + sign + " (" + r.month.text + ")");
    ok(!!r.year && r.year.color === want, L + "year total " + sign + " (" + (r.year && r.year.text) + "; foot: " + r.foot + ")");
    ok(r.month.contrast >= 4.5 && r.year && r.year.contrast >= 4.5, L + "totals contrast " + r.month.contrast.toFixed(2) + " / " + (r.year && r.year.contrast.toFixed(2)));
    ok((await p.evaluate(() => localStorage.getItem("ladder-journal-v3"))) === seeded, L + "stored journal unchanged");
    await (await p.$(".cal-card")).screenshot({ path: "/tmp/cal-" + theme + "-" + name.replace(" ", "") + ".png" });
    await ctx.close();
  }
  ok(errs.length === 0, "no console errors " + errs.join(" | "));
  await b.close(); if (srv) srv.kill();
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
