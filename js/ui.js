/* Draw the journal and the edit sheets. */
(function (root) {
  const ST = root.StockTracker = root.StockTracker || {};
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const TABS = ["dashboard", "markets", "positions", "risk", "analytics", "calendar", "settings"];

  let handlers = {};
  let state = null;
  let editingId = null;
  let tradeMode = "create";
  let editingDayKey = null;
  let importPlan = null;
  let bannerTimer = 0;
  let tradeSort = { key: "date", dir: "desc" };
  const PAGE_TITLES = {
    dashboard: "Overview",
    markets: "Symbols",
    positions: "Trades",
    risk: "Risk",
    analytics: "Analytics",
    calendar: "Calendar",
    settings: "Settings"
  };

  ST.bind = function (next) {
    handlers = next;
    document.getElementById("addTradeBtn").addEventListener("click", function () { handlers.addTrade(); });
    document.getElementById("topLogTrade").addEventListener("click", function () { handlers.addTrade(); });
    document.getElementById("drawerClose").addEventListener("click", closeDrawer);
    document.getElementById("prevMonth").addEventListener("click", function () { handlers.shiftMonth(-1); });
    document.getElementById("nextMonth").addEventListener("click", function () { handlers.shiftMonth(1); });
    document.getElementById("todayBtn").addEventListener("click", function () { handlers.goToday(); });
    document.getElementById("logTodayBtn").addEventListener("click", function () { handlers.openDay(ST.dateKey(state.today)); });
    document.getElementById("positionFilter").addEventListener("change", function () { handlers.setFilter(readPositionQuery()); });
    document.getElementById("positionSymbol").addEventListener("input", function () { handlers.setFilter(readPositionQuery()); });
    document.getElementById("positionDirection").addEventListener("change", function () { handlers.setFilter(readPositionQuery()); });
    document.getElementById("positionStrategy").addEventListener("input", function () { handlers.setFilter(readPositionQuery()); });
    document.getElementById("positionFrom").addEventListener("change", function () { handlers.setFilter(readPositionQuery()); });
    document.getElementById("positionTo").addEventListener("change", function () { handlers.setFilter(readPositionQuery()); });
    document.getElementById("overviewPreset").addEventListener("change", function () { handlers.setOverview({ preset: this.value }); });
    document.getElementById("overviewFrom").addEventListener("change", function () {
      handlers.setOverview({ preset: "custom", from: this.value, to: document.getElementById("overviewTo").value });
    });
    document.getElementById("overviewTo").addEventListener("change", function () {
      handlers.setOverview({ preset: "custom", from: document.getElementById("overviewFrom").value, to: this.value });
    });
    document.getElementById("analyticsSymbol").addEventListener("input", function () { handlers.setAnalytics(readAnalyticsQuery()); });
    document.getElementById("analyticsStatus").addEventListener("change", function () { handlers.setAnalytics(readAnalyticsQuery()); });
    document.getElementById("symbolForm").addEventListener("submit", function (event) {
      event.preventDefault();
      handlers.selectSymbol({ symbol: valueOf("symbolSearch"), exchange: valueOf("symbolExchange") });
    });
    document.getElementById("watchAdd").addEventListener("click", function () {
      handlers.addWatch({ symbol: valueOf("symbolSearch"), exchange: valueOf("symbolExchange") });
    });
    document.getElementById("exchangeHint").addEventListener("click", function () {
      const hint = this.getAttribute("data-exchange") || "";
      if (hint) document.getElementById("symbolExchange").value = hint;
    });
    document.getElementById("dashAddTrade").addEventListener("click", function () { handlers.addTrade(); });
    document.getElementById("dashPositions").addEventListener("click", function () {
      handlers.setFilter({ filter: "open", symbol: "", direction: "all", strategy: "", from: "", to: "" });
    });
    document.getElementById("gotoAnalytics").addEventListener("click", function () { handlers.setTab("analytics"); });
    document.getElementById("gotoCalendar").addEventListener("click", function () { handlers.setTab("calendar"); });
    document.getElementById("addExitBtn").addEventListener("click", function () {
      document.getElementById("exitRows").insertAdjacentHTML("beforeend", exitRowHtml(null));
      updateTradeChrome();
    });
    document.getElementById("exitRows").addEventListener("click", function (event) {
      const btn = event.target.closest("[data-remove-exit]");
      if (!btn) return;
      const row = btn.closest(".exit-row");
      if (row) row.remove();
      updateTradeChrome();
    });
    document.querySelectorAll("[data-pane]").forEach(function (btn) {
      btn.addEventListener("click", function () { handlers.setAnalyticsPane(btn.getAttribute("data-pane")); });
    });
    const sectionNav = document.querySelector(".tabs");
    if (sectionNav) sectionNav.addEventListener("scroll", syncTabFade);
    document.getElementById("rangePreset").addEventListener("change", function () { handlers.setRange({ preset: this.value }); });
    document.getElementById("rangeFrom").addEventListener("change", function () { handlers.setRange({ preset: "custom", from: this.value, to: document.getElementById("rangeTo").value }); });
    document.getElementById("rangeTo").addEventListener("change", function () { handlers.setRange({ preset: "custom", from: document.getElementById("rangeFrom").value, to: this.value }); });
    document.getElementById("exportJsonBtn").addEventListener("click", function () { handlers.exportJson(); });
    document.getElementById("exportTradesCsvBtn").addEventListener("click", function () { handlers.exportTradesCsv(); });
    document.getElementById("exportDaysCsvBtn").addEventListener("click", function () { handlers.exportDaysCsv(); });
    document.getElementById("importBtn").addEventListener("click", function () { document.getElementById("importFile").click(); });
    document.getElementById("importFile").addEventListener("change", function () {
      const file = this.files && this.files[0];
      this.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () { handlers.importText(String(reader.result || "")); };
      reader.onerror = function () { ST.showBanner("Couldn't read that file.", true); };
      reader.readAsText(file);
    });
    document.getElementById("riskCalcBtn").addEventListener("click", function () { handlers.calculateRisk(readRisk()); });
    document.getElementById("tradeForm").addEventListener("submit", onTradeSubmit);
    document.getElementById("tradeForm").addEventListener("input", updateTradeChrome);
    document.getElementById("tradeForm").addEventListener("change", updateTradeChrome);
    document.getElementById("tradeEditBtn").addEventListener("click", function () { tradeMode = "edit"; updateTradeChrome(); });
    document.getElementById("tradeCloseBtn").addEventListener("click", function () {
      tradeMode = "edit";
      document.getElementById("fieldStatus").value = "closed";
      if (!document.getElementById("fieldExitDate").value) document.getElementById("fieldExitDate").value = ST.dateKey(state.today);
      updateTradeChrome();
      document.getElementById("fieldExit").focus();
    });
    document.getElementById("tradeDeleteBtn").addEventListener("click", function () {
      const result = handlers.removeTrade(editingId);
      if (result && result.ok) document.getElementById("tradeDialog").close();
    });
    document.getElementById("dayForm").addEventListener("submit", onDaySubmit);
    document.getElementById("clearDayBtn").addEventListener("click", function () {
      const result = handlers.clearDay(editingDayKey);
      if (result && result.ok) document.getElementById("dayDialog").close();
    });
    document.getElementById("signGain").addEventListener("click", function () { setSign(false); updateSplitHint(); });
    document.getElementById("signLoss").addEventListener("click", function () { setSign(true); updateSplitHint(); });
    document.getElementById("dayAmount").addEventListener("input", function () {
      if (String(this.value).trim().startsWith("-")) setSign(true);
      updateSplitHint();
    });
    document.getElementById("addSplitBtn").addEventListener("click", function () {
      document.getElementById("splitRows").insertAdjacentHTML("beforeend", splitRowHtml(null));
      updateSplitHint();
    });
    document.getElementById("splitRows").addEventListener("click", function (event) {
      const btn = event.target.closest("[data-remove-split]");
      if (!btn) return;
      const row = btn.closest(".split-row");
      if (row) row.remove();
      updateSplitHint();
    });
    document.getElementById("splitRows").addEventListener("input", updateSplitHint);
    document.getElementById("importForm").addEventListener("submit", onImportSubmit);
    document.getElementById("importForm").addEventListener("change", updateImportMode);

    document.addEventListener("click", function (event) {
      const closer = event.target.closest("[data-close-dialog]");
      if (closer) {
        const dialog = closer.closest("dialog");
        if (dialog) dialog.close();
        return;
      }
      const info = event.target.closest("[data-info]");
      if (info) { showChartTip(info, info.getAttribute("data-info")); return; }
      const tab = event.target.closest("[data-tab]");
      if (tab) { handlers.setTab(tab.dataset.tab); return; }
      const day = event.target.closest("[data-day]");
      if (day) { handlers.openDay(day.dataset.day); return; }
      const review = event.target.closest("[data-review]");
      if (review) { handlers.reviewTrade(review.dataset.review); return; }
      const sortBtn = event.target.closest("[data-sort]");
      if (sortBtn) {
        const key = sortBtn.getAttribute("data-sort");
        tradeSort = { key: key, dir: tradeSort.key === key && tradeSort.dir === "desc" ? "asc" : "desc" };
        drawPositions();
        return;
      }
      const edit = event.target.closest("[data-edit]");
      if (edit) { handlers.editTrade(edit.dataset.edit); return; }
      const closeTrade = event.target.closest("[data-close-trade]");
      if (closeTrade) { handlers.closeTrade(closeTrade.dataset.closeTrade); return; }
      const remove = event.target.closest("[data-remove]");
      if (remove) handlers.removeTrade(remove.dataset.remove);
      const pick = event.target.closest("[data-pick-symbol]");
      if (pick) {
        handlers.selectSymbol({ symbol: pick.dataset.pickSymbol, exchange: pick.dataset.exchange || "" });
        return;
      }
      const chartBtn = event.target.closest("[data-chart-symbol]");
      if (chartBtn) {
        handlers.selectSymbol({ symbol: chartBtn.dataset.chartSymbol, exchange: chartBtn.dataset.exchange || "" });
        return;
      }
      const dropWatch = event.target.closest("[data-remove-watch]");
      if (dropWatch) { handlers.removeWatch(dropWatch.dataset.removeWatch); return; }
      const openTrade = event.target.closest("[data-open-trade]");
      if (openTrade && !event.target.closest("button")) openDrawer(openTrade.getAttribute("data-open-trade"));
    });
    document.addEventListener("pointerover", function (event) {
      const hit = event.target.closest && event.target.closest("[data-tip]");
      if (hit) showChartTip(hit, hit.getAttribute("data-tip"));
    });
    document.addEventListener("pointerout", function (event) {
      const hit = event.target.closest && event.target.closest("[data-tip]");
      if (!hit) return;
      const next = event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest("[data-tip]");
      if (!next) hideChartTip();
    });
    document.addEventListener("focusin", function (event) {
      const hit = event.target.closest && event.target.closest("[data-tip], [data-info]");
      if (!hit) return;
      showChartTip(hit, hit.getAttribute("data-tip") || hit.getAttribute("data-info"));
    });
    document.addEventListener("focusout", hideChartTip);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") hideChartTip();
    });
    document.querySelectorAll("dialog").forEach(function (dialog) {
      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) dialog.close();
      });
    });
  };

  ST.draw = function (nextState) {
    state = nextState;
    drawTabs();
    drawDashboard();
    drawPositions();
    drawCalendar();
    drawAnalytics();
    fillRiskDefaults();
    drawSymbolChrome();
  };

  ST.showBanner = function (message, isError) {
    const el = document.getElementById("banner");
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle("error", !!isError);
    el.setAttribute("role", isError ? "alert" : "status");
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(function () { el.hidden = true; }, isError ? 12000 : 3200);
  };

  ST.setSaveState = function (message) {
    const el = document.getElementById("saveState");
    if (el) el.textContent = message;
  };

  ST.openTradeDialog = function (trade, mode) {
    editingId = trade ? trade.id : null;
    tradeMode = mode || (trade ? "edit" : "create");
    const fields = document.getElementById("tradeFields");
    fields.disabled = false;
    document.getElementById("fieldSymbol").value = trade ? trade.symbol : (state && state.data.settings && state.data.settings.selectedSymbol || "");
    document.getElementById("fieldExchange").value = trade ? trade.exchange || "" : (state && state.data.settings && state.data.settings.selectedExchange || "");
    document.getElementById("fieldName").value = trade ? trade.name || "" : "";
    document.getElementById("fieldDirection").value = trade && trade.direction === "short" ? "short" : "long";
    document.getElementById("fieldStatus").value = trade ? trade.status : "open";
    setControl("fieldShares", trade && trade.quantity);
    setControl("fieldFees", trade && trade.fees);
    setControl("fieldEntry", trade && trade.entryPrice);
    setControl("fieldAvg", trade && trade.avgCost);
    setControl("fieldTarget", trade && trade.targetPrice);
    setControl("fieldHardStop", trade && trade.hardStop);
    document.getElementById("fieldEntryDate").value = trade && trade.entryDate || "";
    document.getElementById("fieldExitDate").value = trade && trade.exitDate || "";
    setControl("fieldExit", trade && trade.exitPrice);
    document.getElementById("fieldExitReason").value = trade && trade.exitReason || "";
    document.getElementById("fieldStrategy").value = trade ? trade.strategy || "" : "";
    document.getElementById("fieldSetup").value = trade ? trade.setup || "" : "";
    document.getElementById("fieldThesis").value = trade ? trade.thesis || "" : "";
    document.getElementById("fieldLessons").value = trade ? trade.lessons || "" : "";
    document.getElementById("fieldNotes").value = trade ? trade.notes || "" : "";
    setControl("fieldGetIn", trade && trade.getIn);
    setControl("fieldGetOut", trade && trade.getOut);
    document.getElementById("fieldOrder").value = trade && trade.orderStatus ? trade.orderStatus : "";
    setControl("fieldFill", trade && trade.fillPrice);
    setControl("fieldClose", trade && trade.close);
    setControl("fieldMark", trade && trade.markPrice);
    document.getElementById("fieldMarkAsOf").value = trade && trade.markAsOf || "";
    renderExitRows(trade && trade.exits || []);
    const used = !!(trade && (trade.getIn != null || trade.getOut != null || trade.hardStop != null || trade.orderStatus || trade.fillPrice != null || trade.close != null));
    document.getElementById("levelsDetails").open = used;
    if (tradeMode === "close") {
      document.getElementById("fieldStatus").value = "closed";
      if (!document.getElementById("fieldExitDate").value) document.getElementById("fieldExitDate").value = ST.dateKey(state.today);
      tradeMode = "edit";
    }
    hideFormError("tradeError");
    updateTradeChrome();
    document.getElementById("tradeDialog").showModal();
    if (tradeMode === "review") document.getElementById("tradeEditBtn").focus();
    else document.getElementById("fieldSymbol").focus();
  };

  ST.openDayDialog = function (key, entry) {
    editingDayKey = key;
    const date = ST.parseDateKey(key);
    document.getElementById("dayDialogTitle").textContent = date ? ST.formatLongDate(date) : key;
    const detail = ST.dayDetail(state.data, key);
    document.getElementById("dayTrades").innerHTML = dayTradesHtml(detail);
    const amount = document.getElementById("dayAmount");
    if (entry && entry.manualPnl != null) {
      amount.value = formatAbs(entry.manualPnl);
      setSign(entry.manualPnl < 0);
    } else {
      amount.value = "";
      setSign(false);
    }
    document.getElementById("dayNote").value = entry ? entry.note || "" : "";
    document.getElementById("dayAdjustment").value = entry && entry.adjustment != null ? String(entry.adjustment) : "";
    document.getElementById("dayAdjustmentNote").value = entry ? entry.adjustmentNote || "" : "";
    renderSplits(entry && entry.breakdown || []);
    document.getElementById("clearDayBtn").hidden = !entry;
    hideFormError("dayError");
    updateSplitHint();
    document.getElementById("dayDialog").showModal();
    amount.focus();
  };

  ST.openImportDialog = function (plan) {
    importPlan = plan;
    const lines = ["<p>This file has " + plan.fileTrades + " trades and " + plan.fileDays + " manual days.</p>"];
    if (plan.duplicateIds.length) lines.push("<p>" + plan.duplicateIds.length + " trades share an id already saved. Merge keeps the saved copy unless you choose overwrite.</p>");
    if (plan.similar.length) lines.push("<p>" + plan.similar.length + " closed trades look like ones already counted (" + ST.escapeHtml(plan.similar.slice(0, 5).map(function (row) { return row.symbol; }).join(", ")) + "). They are skipped unless you ask to import them.</p>");
    if (plan.dayOverlaps.length) lines.push("<p>" + plan.dayOverlaps.length + " dates already have a manual day. The two amounts will not be added.</p>");
    document.getElementById("importSummary").innerHTML = lines.join("");
    document.getElementById("importOverwrite").checked = false;
    document.getElementById("importSimilar").checked = false;
    document.getElementById("replaceConfirm").checked = false;
    document.querySelector('input[name="importMode"][value="merge"]').checked = true;
    document.querySelector('input[name="importDays"][value="keep"]').checked = true;
    hideFormError("importError");
    updateImportMode();
    document.getElementById("importDialog").showModal();
  };

  function drawTabs() {
    const nav = document.querySelector(".tabs");
    TABS.forEach(function (tab) {
      const on = state.tab === tab;
      const view = document.getElementById("view-" + tab);
      const btn = document.getElementById("tab-" + tab);
      view.classList.toggle("active", on);
      view.hidden = !on;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
      if (on && nav) revealTab(nav, btn);
    });
    const title = document.getElementById("pageTitle");
    if (title) title.textContent = PAGE_TITLES[state.tab] || "Overview";
    if (state.tab !== "positions") closeDrawer();
    syncTabFade();
  }

  function revealTab(nav, btn) {
    const left = btn.offsetLeft;
    const right = left + btn.offsetWidth;
    if (left < nav.scrollLeft) nav.scrollLeft = Math.max(0, left - 8);
    else if (right > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = right - nav.clientWidth + 12;
  }

  function syncTabFade() {
    const nav = document.querySelector(".tabs");
    const shell = document.querySelector(".tab-shell");
    if (!nav || !shell) return;
    const max = nav.scrollWidth - nav.clientWidth;
    shell.classList.toggle("scrolled", nav.scrollLeft > 4);
    shell.classList.toggle("at-end", max <= 4 || nav.scrollLeft >= max - 4);
  }

  function overviewBounds() {
    const preset = state.overviewPreset || "ytd";
    if (preset === "all") return { start: "", end: "", label: "All dated closes", ready: true };
    if (preset === "custom") {
      const start = state.overviewFrom || "";
      const end = state.overviewTo || "";
      if (!start || !end) return { start: start, end: end, label: "Custom range", ready: false, message: "Choose a start and an end date. Both are included. No result is filled in until then." };
      if (start > end) return { start: start, end: end, label: "Custom range", ready: false, message: "The start date is after the end date." };
      return { start: start, end: end, label: "Custom range", ready: true };
    }
    const range = ST.rangeForPreset(preset === "month" ? "month" : "ytd", state.today);
    return { start: range.start, end: range.end, label: range.label, ready: true };
  }

  function drawDashboard() {
    const presetEl = document.getElementById("overviewPreset");
    if (presetEl && document.activeElement !== presetEl) presetEl.value = state.overviewPreset || "ytd";
    setIfIdle("overviewFrom", state.overviewFrom || "");
    setIfIdle("overviewTo", state.overviewTo || "");
    const bounds = overviewBounds();
    const todayKey = ST.dateKey(state.today);
    const today = ST.dayDetail(state.data, todayKey);
    const openTrades = state.data.trades.filter(function (trade) { return trade.status === "open"; });
    const planned = ST.plannedOpenRisk(state.data);
    const books = ST.portfolioSnapshot(state.data);
    const metrics = bounds.ready
      ? ST.analyze(state.data, { start: bounds.start || null, end: bounds.end || null })
      : null;
    const emptyJournal = !state.data.trades.length;
    const noCloses = !metrics || metrics.tradeCount === 0;
    const periodLine = !bounds.ready ? bounds.message : bounds.label;
    const spark = sparkSvg(metrics && metrics.curve);
    const delta = deltaHtml(bounds, metrics);
    const aside = (spark || delta) ? '<div class="kpi-aside">' + spark + delta + "</div>" : "";
    const winSub = noCloses ? "No closed trades in this period" : (metrics.wins + "W · " + metrics.losses + "L · " + metrics.breakevens + " flat");
    const openSub = openTrades.length ? "Not realized" : "None open";
    const planSub = planned.cents == null
      ? (planned.skipped ? "Stop not recorded" : "No open plan")
      : (planned.equityPercent ? planned.equityPercent + " of account" : "From recorded stops");
    document.getElementById("dashboardBody").innerHTML =
      (emptyJournal ? emptyState("No trades recorded yet. Log a trade to see results. Sample numbers are not filled in.") : "") +
      (!emptyJournal && !bounds.ready ? '<p class="empty">' + ST.escapeHtml(bounds.message) + "</p>" : "") +
      (!emptyJournal && bounds.ready && noCloses ? '<p class="empty">No closed trades in this period. Open positions are not shown as profit.</p>' : "") +
      '<div class="primary-metrics">' +
        kpi("Realized P/L", metrics ? metrics.realizedNetCents : null, noCloses ? "No closed trades in this period" : periodLine, "dashRealized", true, "Sum of net profit on closed trades with an exit date in the period. Fees are subtracted. This is not account equity.", aside) +
        kpiText("Win rate", metrics && metrics.winRate, winSub, "dashWinRate", "Wins divided by wins, losses, and breakevens. A breakeven is a net of zero and is not a win.") +
        kpiText("Open positions", String(openTrades.length), openSub, "dashOpen", "Positions still open. They are excluded from realized profit.") +
        kpiPlain("Planned risk", planned.cents, planSub, "dashPlanned", "Remaining shares times the distance from the recorded entry to the recorded stop. Missing stops are left out. This is not a live stop.") +
      "</div>" +
      '<div class="quiet-row">' +
        quietStat("Unrealized, estimate", books.unrealizedCents, "dashUnrealized", books.unrealizedCents == null ? "price not entered" : "manual mark") +
        quietStat("Today, closed", today.tradeCents, "dashTodayTrades", today.tradeCents == null ? "nothing closed today" : "") +
        quietStat("Today, manual", today.manualCents, "dashTodayManual", today.manualCents == null ? "no manual entry" : "") +
      "</div>" +
      '<div class="overview-board">' +
        '<section class="chart-card"><div class="card-title"><h3>Equity curve</h3>' + infoBtn("Cumulative closed-trade profit. Not account equity.") + "</div>" +
          '<p class="hint">Closed trades only. Not account equity.</p>' +
          curveSvg(metrics ? metrics.curve : [], metrics) +
        "</section>" +
        '<section class="chart-card side-card ledger"><h3>Recent trades</h3>' + recentTable(bounds) + "</section>" +
        '<section class="chart-card"><h3>Open positions</h3>' + openCard(openTrades) + "</section>" +
      "</div>";
    drawSymbolDetail();
    drawWatchlist();
  }

  function kpi(label, cents, sub, id, hero, about, extra) {
    return '<div class="stat' + (hero ? " hero" : "") + '" id="' + id + '"><div class="kpi-head"><div class="label">' + ST.escapeHtml(label) + "</div>" + infoBtn(about) + "</div><div class=\"kpi-main\">" + moneyHtml(cents) + (extra || "") + "</div>" + '<p class="substat">' + ST.escapeHtml(sub || "") + "</p></div>";
  }

  function emptyState(text) {
    return '<p class="empty empty-hero"><svg class="empty-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect x="8" y="6" width="32" height="36" rx="4"></rect><path d="M16 16h16M16 24h16M16 32h10"></path></svg>' + ST.escapeHtml(text) + "</p>";
  }

  function priorWindow(bounds) {
    if (!bounds.ready || !bounds.start || !bounds.end) return null;
    const start = ST.parseDateKey(bounds.start);
    const end = ST.parseDateKey(bounds.end);
    if (!start || !end) return null;
    const span = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - span);
    return { start: ST.dateKey(prevStart), end: ST.dateKey(prevEnd) };
  }

  function deltaHtml(bounds, metrics) {
    const earlier = priorWindow(bounds);
    if (!earlier || !metrics || typeof metrics.realizedNetCents !== "bigint") return "";
    const prev = ST.analyze(state.data, earlier);
    if (!prev.tradeCount || typeof prev.realizedNetCents !== "bigint") {
      return '<p class="delta na">No prior window</p>';
    }
    const delta = metrics.realizedNetCents - prev.realizedNetCents;
    return '<p class="delta ' + ST.pnlWord(delta) + '">' + ST.escapeHtml(ST.formatCents(delta)) + " <span>vs prior window</span></p>";
  }

  function sparkSvg(curve) {
    if (!curve || curve.length < 2) return "";
    const values = curve.map(function (point) { return Number(point.cents); });
    const width = 88;
    const height = 32;
    let min = values[0];
    let max = values[0];
    values.forEach(function (value) {
      if (value < min) min = value;
      if (value > max) max = value;
    });
    const span = (max - min) || 1;
    const d = values.map(function (value, index) {
      const x = 1 + (index * (width - 2)) / (values.length - 1);
      const y = height - 2 - ((value - min) * (height - 6)) / span;
      return (index ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }).join(" ");
    const tone = values[values.length - 1] >= values[0] ? "up" : "down";
    return '<svg class="spark ' + tone + '" viewBox="0 0 ' + width + " " + height + '" aria-hidden="true" focusable="false"><path d="' + d + '"></path></svg>';
  }

  function kpiText(label, text, sub, id, about) {
    const value = text == null || text === ""
      ? '<div class="value na">N/A</div>'
      : '<div class="value flat">' + ST.escapeHtml(text) + "</div>";
    return '<div class="stat" id="' + id + '"><div class="kpi-head"><div class="label">' + ST.escapeHtml(label) + "</div>" + infoBtn(about) + "</div>" + value + '<p class="substat">' + ST.escapeHtml(sub || "") + "</p></div>";
  }

  function kpiPlain(label, cents, sub, id, about) {
    const value = typeof cents !== "bigint"
      ? '<div class="value na">N/A</div>'
      : '<div class="value flat">' + ST.escapeHtml(ST.formatCents(cents, "plain")) + "</div>";
    return '<div class="stat" id="' + id + '"><div class="kpi-head"><div class="label">' + ST.escapeHtml(label) + "</div>" + infoBtn(about) + "</div>" + value + '<p class="substat">' + ST.escapeHtml(sub || "") + "</p></div>";
  }

  function quietStat(label, cents, id, emptyTag) {
    const value = typeof cents !== "bigint"
      ? '<div class="value na">N/A' + (emptyTag ? ' <span class="tag">' + ST.escapeHtml(emptyTag) + "</span>" : "") + "</div>"
      : moneyHtml(cents);
    return '<div class="stat quiet" id="' + id + '"><div class="label">' + ST.escapeHtml(label) + "</div>" + value + "</div>";
  }

  function infoBtn(text) {
    return '<button type="button" class="info" aria-label="About this figure" data-info="' + ST.escapeHtml(text) + '">i</button>';
  }

  function openCard(openTrades) {
    if (!openTrades.length) return '<p class="empty">No open positions.</p>';
    return '<ul class="perf-list">' + openTrades.slice(0, 6).map(function (trade) {
      const row = ST.positionAccounting(trade);
      const stop = trade.hardStop == null ? "stop not recorded" : "stop " + ST.formatPlainMoney(trade.hardStop);
      return "<li><span><strong>" + ST.escapeHtml(trade.symbol) + "</strong> " + ST.escapeHtml(trade.direction === "short" ? "Short" : "Long") +
        "</span><span>" + ST.escapeHtml(row.remainingQty == null ? "quantity N/A" : ST.formatShares(row.remainingQty) + " left") + " · " + ST.escapeHtml(stop) + "</span></li>";
    }).join("") + "</ul>";
  }

  function recentTable(bounds) {
    const rows = [];
    state.data.trades.forEach(function (trade) {
      const entry = ST.effectiveEntry ? ST.effectiveEntry(trade) : (trade.entryPrice != null ? trade.entryPrice : trade.avgCost);
      if (trade.exits && trade.exits.length && trade.status !== "cancelled") {
        const events = ST.realizedEvents(trade);
        trade.exits.forEach(function (exit, index) {
          const event = events[index];
          if (!event || event.reason !== "realized") return;
          if (bounds.ready && bounds.start && event.exitDate < bounds.start) return;
          if (bounds.ready && bounds.end && event.exitDate > bounds.end) return;
          rows.push(tableRow(trade.symbol, trade.direction, exit.date, exit.quantity, entry, exit.price, event.netCents, "Closed"));
        });
        return;
      }
      const result = ST.tradeResult(trade);
      if (result.reason === "realized") {
        if (bounds.ready && bounds.start && result.exitDate < bounds.start) return;
        if (bounds.ready && bounds.end && result.exitDate > bounds.end) return;
        rows.push(tableRow(trade.symbol, trade.direction, result.exitDate, trade.quantity, entry, trade.exitPrice, result.netCents, "Closed"));
      } else if (trade.status === "open") {
        rows.push(tableRow(trade.symbol, trade.direction, trade.entryDate || "", trade.quantity, entry, null, null, "Open"));
      }
    });
    rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    const shown = rows.slice(0, 8);
    if (!state.data.trades.length) return '<p class="empty">No trades recorded yet.</p>';
    if (!shown.length) return '<p class="empty">No trades in this period. A blank result is not shown as zero.</p>';
    const body = shown.map(function (row) {
      const net = row.net == null ? '<span class="na">N/A</span>' : '<span class="' + ST.pnlWord(row.net) + '">' + ST.escapeHtml(ST.formatCents(row.net)) + "</span>";
      const exit = row.exit == null ? '<span class="na">N/A</span>' : ST.escapeHtml(ST.formatPlainMoney(row.exit));
      return "<tr><td data-label=\"Ticker\">" + ST.escapeHtml(row.symbol) + "</td>" +
        "<td data-label=\"Side\">" + ST.escapeHtml(row.side) + "</td>" +
        "<td data-label=\"Date\">" + ST.escapeHtml(row.date || "N/A") + "</td>" +
        '<td class="num" data-label="Qty">' + ST.escapeHtml(row.qty == null ? "N/A" : ST.formatShares(row.qty)) + "</td>" +
        '<td class="num" data-label="Entry">' + ST.escapeHtml(row.entry == null ? "N/A" : ST.formatPlainMoney(row.entry)) + "</td>" +
        '<td class="num" data-label="Exit">' + exit + "</td>" +
        '<td class="num" data-label="Net">' + net + "</td>" +
        "<td data-label=\"Status\">" + ST.escapeHtml(row.status) + "</td></tr>";
    }).join("");
    return '<div class="trade-scroll"><table class="trade-table"><thead><tr><th>Ticker</th><th>Side</th><th>Date</th><th class="num">Qty</th><th class="num">Entry</th><th class="num">Exit</th><th class="num">Net</th><th>Status</th></tr></thead><tbody>' + body + "</tbody></table></div>";
  }

  function tableRow(symbol, direction, date, qty, entry, exit, net, status) {
    return { symbol: symbol, side: direction === "short" ? "Short" : "Long", date: date || "", qty: qty, entry: entry, exit: exit, net: net, status: status };
  }

  function drawPositions() {
    const filterEl = document.getElementById("positionFilter");
    if (document.activeElement !== filterEl) filterEl.value = state.positionFilter || "all";
    setIfIdle("positionSymbol", state.positionSymbol || "");
    setIfIdle("positionFrom", state.positionFrom || "");
    setIfIdle("positionTo", state.positionTo || "");
    setIfIdle("positionStrategy", state.positionStrategy || "");
    const directionEl = document.getElementById("positionDirection");
    if (document.activeElement !== directionEl) directionEl.value = state.positionDirection || "all";
    const filter = state.positionFilter || "all";
    const symbol = String(state.positionSymbol || "").trim().replace(/^\$/, "").toUpperCase();
    const direction = state.positionDirection || "all";
    const strategy = String(state.positionStrategy || "").trim().toLowerCase();
    const from = state.positionFrom || "";
    const to = state.positionTo || "";
    const trades = state.data.trades.filter(function (trade) {
      if (filter !== "all" && trade.status !== filter) return false;
      if (symbol && trade.symbol !== symbol) return false;
      if (direction !== "all" && trade.direction !== direction) return false;
      if (strategy && String(trade.strategy || "").toLowerCase().indexOf(strategy) === -1) return false;
      if ((from || to) && !tradeInDateRange(trade, from, to)) return false;
      return true;
    });
    const list = document.getElementById("positionsList");
    if (!state.data.trades.length) {
      list.innerHTML = emptyState("No trades yet. Add one to record a ticker, direction, and plan. Nothing is sent to a broker.");
      return;
    }
    if (!trades.length) {
      list.innerHTML = emptyState("Nothing in this filter.");
      return;
    }
    list.innerHTML = tradeTable(sortTradeRows(trades));
  }

  function tradeDate(trade) {
    const result = ST.tradeResult(trade);
    return (result && result.exitDate) || trade.exitDate || trade.entryDate || "";
  }

  function tradeNet(trade) {
    const result = ST.tradeResult(trade);
    return result && result.included ? result.netCents : null;
  }

  function sortTradeRows(trades) {
    const dir = tradeSort.dir === "asc" ? 1 : -1;
    return trades.slice().sort(function (a, b) {
      if (tradeSort.key === "symbol") return dir * String(a.symbol).localeCompare(String(b.symbol));
      if (tradeSort.key === "net") {
        const left = tradeNet(a);
        const right = tradeNet(b);
        if (left == null && right == null) return 0;
        if (left == null) return 1;
        if (right == null) return -1;
        if (left === right) return 0;
        return left < right ? -dir : dir;
      }
      return dir * String(tradeDate(a)).localeCompare(String(tradeDate(b)));
    });
  }

  function sortHead(key, label, numeric) {
    const on = tradeSort.key === key;
    const mark = on ? (tradeSort.dir === "asc" ? " ↑" : " ↓") : "";
    return "<th" + (numeric ? ' class="num"' : "") + '><button type="button" data-sort="' + key + '" aria-pressed="' + (on ? "true" : "false") + '">' + label + mark + "</button></th>";
  }

  function tradeTable(trades) {
    const body = trades.map(function (trade) {
      const help = ST.STATUS_HELP[trade.status] || ST.STATUS_HELP.open;
      const result = ST.tradeResult(trade);
      const books = ST.positionAccounting(trade);
      const entry = trade.entryPrice != null ? trade.entryPrice : trade.avgCost;
      const checklist = ST.computeStatus(trade);
      const net = result.included
        ? '<span class="' + ST.pnlWord(result.netCents) + '">' + ST.escapeHtml(ST.formatCents(result.netCents)) + "</span>"
        : '<span class="na">N/A</span>';
      const side = trade.direction === "short" ? "Short" : "Long";
      const status = books.partial ? "Open — partially exited" : help.summary;
      const notes = [];
      if (trade.name) notes.push(trade.name);
      if (books.partial || (trade.exits && trade.exits.length)) {
        notes.push("Remaining " + (books.remainingQty == null ? "N/A" : ST.formatShares(books.remainingQty)) + ". Realized on exits " + (books.realizedNetCents == null ? "N/A" : ST.formatCents(books.realizedNetCents)) + ".");
      }
      if (books.unrealizedReason === "manual-mark") {
        notes.push("Unrealized " + ST.formatCents(books.unrealizedCents) + " at manual mark" + (books.markAsOf ? " as of " + books.markAsOf : " (as-of date not recorded)") + ".");
      }
      const closeBtn = trade.status === "open"
        ? '<button type="button" data-close-trade="' + ST.escapeHtml(trade.id) + '">Close</button>'
        : "";
      return '<tr class="stock-card" data-open-trade="' + ST.escapeHtml(trade.id) + '">' +
        '<td data-label="Ticker"><h3>' + ST.escapeHtml(trade.symbol) + ' <span class="dir">' + side + "</span></h3>" +
          '<span class="side-pill ' + ST.escapeHtml(trade.direction) + '">' + side + "</span>" +
          (checklist ? '<p class="pill ' + checklist.kind + '">' + ST.escapeHtml(checklist.text) + "</p>" : "") +
          (notes.length ? '<p class="meta">' + ST.escapeHtml(notes.join(" ")) + "</p>" : "") +
        "</td>" +
        '<td data-label="Status"><span class="pill ' + trade.status + '">' + ST.escapeHtml(status) + "</span></td>" +
        '<td data-label="Date">' + ST.escapeHtml(tradeDate(trade) || "N/A") + "</td>" +
        '<td class="num" data-label="Qty">' + ST.escapeHtml(trade.quantity == null ? "N/A" : ST.formatShares(trade.quantity)) + "</td>" +
        '<td class="num" data-label="Entry">' + ST.escapeHtml(entry == null ? "N/A" : ST.formatPlainMoney(entry)) + "</td>" +
        '<td class="num" data-label="Exit">' + ST.escapeHtml(trade.exitPrice == null ? "N/A" : ST.formatPlainMoney(trade.exitPrice)) + "</td>" +
        '<td class="num" data-label="Net">' + net + "</td>" +
        '<td data-label="Actions"><div class="row-actions">' +
          '<button type="button" data-edit="' + ST.escapeHtml(trade.id) + '">Edit</button>' +
          closeBtn +
          '<button type="button" data-remove="' + ST.escapeHtml(trade.id) + '">Delete</button>' +
        "</div></td></tr>";
    }).join("");
    return '<div class="trade-scroll book-scroll"><table class="trade-table book"><thead><tr>' +
      sortHead("symbol", "Ticker") +
      "<th>Status</th>" +
      sortHead("date", "Date") +
      '<th class="num">Qty</th><th class="num">Entry</th><th class="num">Exit</th>' +
      sortHead("net", "Net", true) +
      "<th>Actions</th></tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function openDrawer(id) {
    const trade = state.data.trades.find(function (item) { return item.id === id; });
    const drawer = document.getElementById("tradeDrawer");
    if (!trade || !drawer) return;
    document.getElementById("drawerTitle").textContent = trade.symbol + " " + (trade.direction === "short" ? "short" : "long");
    document.getElementById("drawerBody").innerHTML = tradeCard(trade);
    drawer.hidden = false;
  }

  function closeDrawer() {
    const drawer = document.getElementById("tradeDrawer");
    if (!drawer) return;
    drawer.hidden = true;
    const body = document.getElementById("drawerBody");
    if (body) body.innerHTML = "";
  }

  function tradeCard(trade) {
    const help = ST.STATUS_HELP[trade.status] || ST.STATUS_HELP.open;
    const result = ST.tradeResult(trade);
    const bits = [trade.direction === "short" ? "Short" : "Long"];
    if (trade.quantity != null) bits.push(ST.formatShares(trade.quantity));
    const entry = trade.entryPrice != null ? trade.entryPrice : trade.avgCost;
    if (entry != null) bits.push("entry " + ST.formatPlainMoney(entry));
    if (result.included) bits.push("net " + ST.formatCents(result.netCents));
    const plans = [];
    if (trade.targetPrice != null) plans.push("Planned target " + ST.formatPlainMoney(trade.targetPrice));
    if (trade.hardStop != null) plans.push("Planned stop " + ST.formatPlainMoney(trade.hardStop));
    const checklist = ST.computeStatus(trade);
    const pill = checklist ? '<p class="pill ' + checklist.kind + '">' + ST.escapeHtml(checklist.text) + "</p>" : "";
    const books = ST.positionAccounting(trade);
    const closeBtn = trade.status === "open"
      ? '<button type="button" data-close-trade="' + ST.escapeHtml(trade.id) + '">Close</button>'
      : "";
    let partialLine = "";
    if (books.partial || (trade.exits && trade.exits.length)) {
      partialLine = '<p class="meta">Average-cost exits. Remaining ' + ST.escapeHtml(books.remainingQty == null ? "N/A" : ST.formatShares(books.remainingQty)) +
        ". Realized on exits " + (books.realizedNetCents == null ? "N/A" : ST.escapeHtml(ST.formatCents(books.realizedNetCents))) + ".</p>";
    }
    const unrealizedLine = books.unrealizedReason === "manual-mark"
      ? '<p class="meta">Unrealized ' + ST.escapeHtml(ST.formatCents(books.unrealizedCents)) + " at manual mark" + (books.markAsOf ? " as of " + ST.escapeHtml(books.markAsOf) : " (as-of date not recorded)") + ".</p>"
      : (trade.status === "open" ? '<p class="meta">Unrealized P/L: N/A until you enter a manual mark.</p>' : "");
    return '<article class="stock-card"><h3>' + ST.escapeHtml(trade.symbol) +
      ' <span class="dir">' + (trade.direction === "short" ? "Short" : "Long") + "</span></h3>" +
      '<p class="pill ' + trade.status + '">' + ST.escapeHtml(books.partial ? "Open — partially exited" : help.summary) + "</p>" +
      '<p class="card-notes">' + ST.escapeHtml(help.detail) + "</p>" +
      '<p class="meta">' + ST.escapeHtml(bits.join(" · ")) + "</p>" +
      (plans.length ? '<p class="levels">' + ST.escapeHtml(plans.join(" · ")) + "</p>" : "") +
      (trade.name ? '<p class="meta">' + ST.escapeHtml(trade.name) + "</p>" : "") +
      pill +
      (trade.notes ? '<p class="card-notes">' + ST.escapeHtml(trade.notes) + "</p>" : "") +
      partialLine + unrealizedLine +
      '<div class="card-actions">' +
        '<button type="button" data-chart-symbol="' + ST.escapeHtml(trade.symbol) + '" data-exchange="' + ST.escapeHtml(trade.exchange || "") + '">Chart</button>' +
        '<button type="button" data-review="' + ST.escapeHtml(trade.id) + '">Review</button>' +
        '<button type="button" data-edit="' + ST.escapeHtml(trade.id) + '">Edit</button>' +
        closeBtn +
        '<button type="button" data-remove="' + ST.escapeHtml(trade.id) + '">Delete</button>' +
      "</div></article>";
  }

  function drawCalendar() {
    const summary = ST.monthSummary(state.data, state.year, state.month, state.today);
    document.getElementById("monthLabel").textContent = ST.formatMonthYear(state.year, state.month);
    const onThisMonth = state.year === state.today.getFullYear() && state.month === state.today.getMonth();
    document.getElementById("todayBtn").hidden = onThisMonth;
    const todayKey = ST.dateKey(state.today);
    const today = state.data.days[todayKey];
    document.getElementById("logTodayBtn").textContent = today ? "Edit today" : "Log today";
    document.getElementById("summary").innerHTML =
      '<div class="stats">' +
        stat("Closed trades this month", summary.tradeCents) +
        stat("Manual entries this month", summary.manualCents) +
        stat(summary.ytdLabel + ", closed trades", summary.ytdTradeCents) +
        stat(summary.ytdLabel + ", manual", summary.ytdManualCents) +
        '<div class="stat record"><div class="label">Closed-trade days</div><p class="record-line">' +
          ST.escapeHtml(countPhrase(summary.gainDays, "gain day", "gain days") + " · " + countPhrase(summary.lossDays, "loss day", "loss days") + (summary.flatDays ? " · " + countPhrase(summary.flatDays, "flat day", "flat days") : "")) +
        '</p><div class="extremes">' + extreme("Best closed", summary.bestTrade) + extreme("Worst closed", summary.worstTrade) + "</div></div>" +
        '<div class="stat record"><div class="label">Manual days</div><p class="record-line">' +
          ST.escapeHtml(countPhrase(summary.manualGain, "gain day", "gain days") + " · " + countPhrase(summary.manualLoss, "loss day", "loss days") + (summary.manualFlat ? " · " + countPhrase(summary.manualFlat, "flat day", "flat days") : "")) +
        '</p><div class="extremes">' + extreme("Best manual", summary.bestManual) + extreme("Worst manual", summary.worstManual) + "</div></div></div>";
    document.getElementById("weekList").innerHTML = weekHtml(summary.weeks);
    document.getElementById("calendarGrid").setAttribute("aria-label", ST.formatMonthYear(state.year, state.month));
    document.getElementById("calendarGrid").innerHTML = calendarHtml();
  }

  function drawAnalytics() {
    const preset = document.getElementById("rangePreset");
    if (document.activeElement !== preset) preset.value = state.rangePreset || "ytd";
    const from = document.getElementById("rangeFrom");
    const to = document.getElementById("rangeTo");
    if (document.activeElement !== from && state.rangeFrom) from.value = state.rangeFrom;
    if (document.activeElement !== to && state.rangeTo) to.value = state.rangeTo;
    let start = null;
    let end = null;
    let label = "All dated closes";
    if ((state.rangePreset || "ytd") === "custom") {
      start = state.rangeFrom || "";
      end = state.rangeTo || "";
      label = "Custom range";
      if (!start || !end) {
        document.getElementById("rangeHint").textContent = "Choose a start and an end date. Both are included.";
        document.getElementById("analyticsBody").innerHTML = '<p class="empty">N/A until the custom range has both dates.</p>';
        return;
      }
    } else {
      const range = ST.rangeForPreset(state.rangePreset || "ytd", state.today);
      start = range.start;
      end = range.end;
      label = range.label;
    }
    document.getElementById("rangeHint").textContent = start
      ? label + " · exit dates " + start + " – " + end + ". Not account equity."
      : "All dated closes. Not account equity.";
    setIfIdle("analyticsSymbol", state.analyticsSymbol || "");
    const statusEl = document.getElementById("analyticsStatus");
    if (document.activeElement !== statusEl) statusEl.value = state.analyticsStatus || "all";
    const metrics = ST.analyze(state.data, {
      start: start,
      end: end,
      symbol: state.analyticsSymbol || "",
      status: state.analyticsStatus || "all"
    });
    if (metrics.invalidRange) {
      document.getElementById("analyticsBody").innerHTML = '<p class="empty">The start date is after the end date.</p>';
      return;
    }
    const pane = state.analyticsPane || "overview";
    document.querySelectorAll("[data-pane]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-pane") === pane ? "true" : "false");
    });
    const body = [];
    if (!metrics.tradeCount) {
      body.push('<p class="empty">No closed trades in this range. Nothing is filled in as zero.</p>');
      body.push('<div class="metrics">' + metric("Realized net P/L", null, ST.METRIC_HELP.realizedNet, "metric-realized") + "</div>");
      body.push('<p class="hint">Cumulative closed-trade P/L is not account equity.</p>');
    } else if (pane === "symbol") {
      body.push(paneChart("By symbol", barSvg(metrics.byTicker.map(function (row) { return { label: row.label, cents: row.netCents }; }), "Realized profit and loss by ticker"), groupHtml("By ticker", metrics.byTicker, ST.METRIC_HELP.byTicker)));
    } else if (pane === "strategy") {
      body.push(paneChart("By strategy", barSvg(metrics.byStrategy.map(function (row) { return { label: row.label, cents: row.netCents }; }), "Realized profit and loss by strategy"), groupHtml("By strategy", metrics.byStrategy, ST.METRIC_HELP.byStrategy)));
    } else if (pane === "time") {
      body.push('<section class="chart-card"><h3>Daily realized P/L</h3><p class="hint">Each bar is that exit date. Manual days are not included.</p>' + barSvg(metrics.curve.map(function (point) { return { label: point.date, cents: point.dayCents }; }), "Daily realized profit and loss") + "</section>");
      body.push('<section class="chart-card"><h3>By month</h3><p class="hint">Closed-trade net by exit month. This is not cash flow.</p>' + barSvg(monthPoints(metrics.curve), "Monthly realized profit and loss") + "</section>");
    } else {
      body.push('<div class="primary-metrics">' + metric("Realized net P/L", metrics.realizedNetCents, ST.METRIC_HELP.realizedNet, "metric-realized") + metricText("Win rate", metrics.winRate, ST.METRIC_HELP.winRate) + metricText("Profit factor", metrics.profitFactor, ST.METRIC_HELP.profitFactor) + metric("Avg P/L", metrics.avgTradeCents, ST.METRIC_HELP.avgTrade) + "</div>");
      body.push('<section class="chart-card"><div class="card-title"><h3>Realized P/L</h3>' + infoBtn(ST.METRIC_HELP.cumulative) + "</div>" + curveSvg(metrics.curve, metrics) + "</section>");
      body.push('<p class="hint">Not account equity.</p>');
      body.push('<div class="viz-grid">' +
        '<section class="chart-card"><h3>Win / loss</h3>' + donutSvg(metrics) + "</section>" +
        '<section class="chart-card"><h3>Avg win vs avg loss</h3>' + compareBars(metrics) + "</section>" +
        '<section class="chart-card"><h3>By weekday</h3><p class="hint">Exit-date net. Empty weekdays are left off.</p>' + barSvg(weekdayPoints(metrics.curve), "Realized profit and loss by weekday") + "</section>" +
        '<section class="chart-card"><h3>By ticker</h3>' + barSvg(metrics.byTicker.map(function (row) { return { label: row.label, cents: row.netCents }; }), "Realized profit and loss by ticker") + "</section>" +
      "</div>");
      body.push('<div class="stat-grid">');
      body.push(compactCard("Monthly", monthCard(metrics)));
      body.push(compactCard("Trade stats", tradeStatsCard(metrics)));
      body.push(compactCard("Daily stats", dailyStatsCard(metrics)));
      body.push("</div>");
    }
    const notes = [];
    if (metrics.excludedOpen) notes.push(metrics.excludedOpen + " open " + (metrics.excludedOpen === 1 ? "trade is" : "trades are") + " excluded.");
    if (metrics.excludedCancelled) notes.push(metrics.excludedCancelled + " cancelled " + (metrics.excludedCancelled === 1 ? "trade is" : "trades are") + " excluded.");
    if (metrics.incomplete) notes.push(metrics.incomplete + " closed " + (metrics.incomplete === 1 ? "trade is" : "trades are") + " missing a price or quantity, so no result was invented.");
    if (metrics.undated) notes.push(metrics.undated + " closed " + (metrics.undated === 1 ? "trade has" : "trades have") + " no exit date (" + ST.formatCents(metrics.undatedNetCents) + "). Saved, but not in these totals.");
    if (metrics.feesAssumedZero) notes.push(metrics.feesAssumedZero + " counted " + (metrics.feesAssumedZero === 1 ? "trade treats" : "trades treat") + " blank fees as $0.00.");
    if (notes.length) body.push('<p class="hint">' + ST.escapeHtml(notes.join(" ")) + "</p>");
    document.getElementById("analyticsBody").innerHTML = body.join("");
  }

  function paneChart(title, chart, list) {
    return '<section class="chart-card"><h3>' + ST.escapeHtml(title) + "</h3>" + chart + "</section>" + list;
  }

  function compactCard(title, inner) {
    return '<section class="stat-card"><h3>' + ST.escapeHtml(title) + "</h3>" + inner + "</section>";
  }

  function lineItem(label, valueHtml) {
    return "<li><span>" + ST.escapeHtml(label) + "</span>" + valueHtml + "</li>";
  }

  function monthCard(metrics) {
    const months = monthPoints(metrics.curve);
    if (!months.length) return '<p class="empty">Not enough closed trades for a month.</p>';
    let best = months[0];
    let worst = months[0];
    months.forEach(function (row) {
      if (row.cents > best.cents) best = row;
      if (row.cents < worst.cents) worst = row;
    });
    return '<ul class="perf-list">' +
      lineItem("Best month", moneyHtml(best.cents).replace("</div>", " <span class=\"tag\">" + ST.escapeHtml(chartLabel(best.label)) + "</span></div>")) +
      lineItem("Lowest month", moneyHtml(worst.cents).replace("</div>", " <span class=\"tag\">" + ST.escapeHtml(chartLabel(worst.label)) + "</span></div>")) +
      lineItem("Months", '<div class="value flat">' + months.length + "</div>") +
      "</ul>";
  }

  function tradeStatsCard(metrics) {
    return '<ul class="perf-list">' +
      lineItem("Wins", '<div class="value flat">' + metrics.wins + "</div>") +
      lineItem("Losses", '<div class="value flat">' + metrics.losses + "</div>") +
      lineItem("Breakeven", '<div class="value flat">' + metrics.breakevens + "</div>") +
      lineItem("Avg win", moneyHtml(metrics.avgWinCents)) +
      lineItem("Avg loss", moneyHtml(metrics.avgLossCents)) +
      lineItem("Max drawdown", typeof metrics.maxDrawdownCents === "bigint" ? '<div class="value loss">' + ST.escapeHtml(ST.formatCents(metrics.maxDrawdownCents, "plain")) + "</div>" : '<div class="value na">N/A</div>') +
      "</ul>";
  }

  function dailyStatsCard(metrics) {
    if (!metrics.curve.length) return '<p class="empty">Not enough dated closes.</p>';
    return '<ul class="perf-list">' +
      lineItem("Trading days", '<div class="value flat">' + metrics.curve.length + "</div>") +
      lineItem("Best day", extremeValue(metrics.bestDay)) +
      lineItem("Worst day", extremeValue(metrics.worstDay)) +
      "</ul>";
  }

  function fillRiskDefaults() {
    const view = document.getElementById("view-risk");
    if (document.activeElement && view.contains(document.activeElement)) return;
    const settings = state.data.settings || {};
    if (settings.accountSize != null && !document.getElementById("riskAccount").value) {
      document.getElementById("riskAccount").value = String(settings.accountSize);
    }
    if (settings.riskPercent != null && !document.getElementById("riskPercent").value) {
      document.getElementById("riskPercent").value = String(settings.riskPercent);
    }
  }

  function stat(label, cents, idAttr) {
    return '<div class="stat" ' + (idAttr || "") + '><div class="label">' + ST.escapeHtml(label) + "</div>" + moneyHtml(cents) + "</div>";
  }

  function metric(label, cents, help, id) {
    return '<div class="metric"' + (id ? ' id="' + id + '"' : "") + '><div class="kpi-head"><h3>' + ST.escapeHtml(label) + "</h3>" + infoBtn(help) + "</div>" + moneyHtml(cents) + "</div>";
  }

  function metricCount(label, count, help) {
    const value = count == null
      ? '<div class="value na">N/A <span class="tag">not enough data</span></div>'
      : '<div class="value flat">' + count + "</div>";
    return '<div class="metric"><div class="kpi-head"><h3>' + ST.escapeHtml(label) + "</h3>" + infoBtn(help) + "</div>" + value + "</div>";
  }

  function metricMagnitude(label, cents, help, tag) {
    if (typeof cents !== "bigint") return metric(label, null, help);
    const word = cents === 0n ? "none" : tag;
    const cls = cents === 0n ? "flat" : "loss";
    return '<div class="metric"><div class="kpi-head"><h3>' + ST.escapeHtml(label) + "</h3>" + infoBtn(help) + '</div><div class="value ' + cls + '">' +
      ST.escapeHtml(ST.formatCents(cents, "plain")) + ' <span class="tag">' + ST.escapeHtml(word) + "</span></div></div>";
  }

  function metricText(label, text, help) {
    const value = text == null
      ? '<div class="value na">N/A <span class="tag">not enough data</span></div>'
      : '<div class="value flat">' + ST.escapeHtml(text) + "</div>";
    return '<div class="metric"><div class="kpi-head"><h3>' + ST.escapeHtml(label) + "</h3>" + infoBtn(help) + "</div>" + value + "</div>";
  }

  function moneyHtml(cents) {
    if (typeof cents !== "bigint") return '<div class="value na">N/A <span class="tag">not enough data</span></div>';
    const word = ST.pnlWord(cents);
    return '<div class="value ' + word + '">' + ST.escapeHtml(ST.formatCents(cents)) + ' <span class="tag">' + word + "</span></div>";
  }

  function extreme(label, item) {
    if (!item) return "<div><span>" + ST.escapeHtml(label) + '</span><strong class="na">N/A</strong></div>';
    const date = ST.parseDateKey(item.date);
    const text = (date ? ST.formatShortDate(date) : item.date) + " · " + ST.formatCents(item.cents);
    return "<div><span>" + ST.escapeHtml(label) + '</span><strong class="' + ST.pnlWord(item.cents) + '">' + ST.escapeHtml(text) + " " + ST.pnlWord(item.cents) + "</strong></div>";
  }

  function extremeValue(item) {
    if (!item) return '<div class="value na">N/A <span class="tag">not enough data</span></div>';
    const date = ST.parseDateKey(item.date);
    return moneyHtml(item.cents).replace("</div>", " <span class=\"tag\">" + ST.escapeHtml(date ? ST.formatShortDate(date) : item.date) + "</span></div>");
  }

  function groupHtml(title, rows, help) {
    if (!rows.length) {
      return '<div class="metric wide"><div class="kpi-head"><h3>' + ST.escapeHtml(title) + "</h3>" + infoBtn(help) + '</div><div class="value na">N/A <span class="tag">not enough data</span></div></div>';
    }
    const items = rows.map(function (row) {
      return "<li><span><strong>" + ST.escapeHtml(row.label) + "</strong> <span class=\"tag\">" + row.trades + " " + (row.trades === 1 ? "trade" : "trades") + "</span></span>" + moneyHtml(row.netCents) + "</li>";
    }).join("");
    return '<div class="metric wide"><div class="kpi-head"><h3>' + ST.escapeHtml(title) + "</h3>" + infoBtn(help) + '</div><ul class="perf-list">' + items + "</ul></div>";
  }

  function monthPoints(curve) {
    const map = new Map();
    (curve || []).forEach(function (point) {
      const key = String(point.date || "").slice(0, 7);
      if (!key) return;
      map.set(key, (map.get(key) || 0n) + point.dayCents);
    });
    return Array.from(map.keys()).sort().map(function (key) {
      return { label: key, cents: map.get(key) };
    });
  }

  function chartLabel(text) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const date = ST.parseDateKey(text);
      return date ? ST.formatShortDate(date) : text;
    }
    if (/^\d{4}-\d{2}$/.test(text)) {
      const date = ST.parseDateKey(text + "-01");
      return date ? ST.formatShortDate(date).replace(/\s+\d+$/, "") + " " + date.getFullYear() : text;
    }
    return text;
  }

  function tipText(label, cents) {
    return chartLabel(label) + " · " + (typeof cents === "bigint" ? ST.formatCents(cents) : "N/A");
  }

  function axisMoney(cents) {
    const n = Math.round(Number(cents));
    const big = BigInt(n);
    if (big % 100n === 0n) {
      const neg = big < 0n;
      const dollars = (neg ? -big : big) / 100n;
      const text = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return (neg ? "-" : "") + "$" + text;
    }
    return ST.formatCents(big, "plain");
  }

  function niceAxis(minCents, maxCents) {
    let lo = minCents;
    let hi = maxCents;
    if (lo > 0) lo = 0;
    if (hi < 0) hi = 0;
    const span = Math.max(hi - lo, 100);
    const roughDollars = Math.max((span / 4) / 100, 1);
    const pow = Math.pow(10, Math.floor(Math.log10(roughDollars)));
    const err = roughDollars / pow;
    const factor = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    const step = Math.max(100, Math.round(factor * pow * 100));
    const start = Math.floor(lo / step) * step;
    let end = Math.ceil(hi / step) * step;
    if (end <= start) end = start + step;
    const count = Math.round((end - start) / step);
    const ticks = [];
    for (let i = 0; i <= count; i++) ticks.push(start + i * step);
    return { min: start, max: end, ticks: ticks };
  }

  function barSvg(points, title) {
    const rows = (points || []).filter(function (point) { return typeof point.cents === "bigint"; });
    if (!rows.length) {
      return '<p class="empty">Not enough closed trades to draw this chart. Nothing is filled in as zero.</p>';
    }
    if (rows.length > 8) return verticalBars(rows, title);
    const rowH = 44;
    const height = 28 + rows.length * rowH;
    const width = 640;
    const labelW = 92;
    const valueW = 88;
    const plotL = labelW + 8;
    const plotR = width - valueW;
    const plotW = plotR - plotL;
    let maxAbs = 1;
    rows.forEach(function (point) {
      const value = Math.abs(Number(point.cents));
      if (value > maxAbs) maxAbs = value;
    });
    const mixed = rows.some(function (point) { return point.cents > 0n; }) && rows.some(function (point) { return point.cents < 0n; });
    const zeroX = mixed ? plotL + plotW / 2 : plotL;
    const scale = mixed ? (plotW / 2) / maxAbs : plotW / maxAbs;
    let guides = "";
    [0.5, 1].forEach(function (step) {
      if (!mixed) {
        const x = plotL + plotW * step;
        guides += '<line class="grid" x1="' + x.toFixed(1) + '" y1="16" x2="' + x.toFixed(1) + '" y2="' + (height - 8) + '"></line>';
      }
    });
    const bars = rows.map(function (point, index) {
      const y = 16 + index * rowH;
      const value = Number(point.cents);
      const len = Math.min(plotW, Math.abs(value) * scale);
      const x = value < 0 && mixed ? zeroX - len : zeroX;
      const cls = value > 0 ? "up" : value < 0 ? "down" : "flatbar";
      const tip = tipText(point.label, point.cents);
      const barH = 12;
      const barY = y + (rowH - barH) / 2;
      return '<text class="axis" x="4" y="' + (y + rowH / 2 + 4) + '">' + ST.escapeHtml(chartLabel(point.label)) + "</text>" +
        '<rect class="hit" x="' + plotL + '" y="' + y + '" width="' + plotW + '" height="' + rowH + '" tabindex="0" data-tip="' + ST.escapeHtml(tip) + '" role="img" aria-label="' + ST.escapeHtml(tip) + '"><title>' + ST.escapeHtml(tip) + "</title></rect>" +
        '<rect class="' + cls + '" x="' + x.toFixed(1) + '" y="' + barY.toFixed(1) + '" width="' + Math.max(value === 0 ? 2 : len, 2).toFixed(1) + '" height="' + barH + '" rx="3"></rect>' +
        '<text class="axis" x="' + (width - 8) + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="end">' + ST.escapeHtml(ST.formatCents(point.cents)) + "</text>";
    }).join("");
    const label = title + ". Realized closed trades only. Not account equity.";
    return '<svg class="bars" viewBox="0 0 ' + width + " " + height + '" role="group" aria-label="' + ST.escapeHtml(label) + '">' +
      guides +
      '<line class="zero" x1="' + zeroX.toFixed(1) + '" y1="12" x2="' + zeroX.toFixed(1) + '" y2="' + (height - 6) + '"></line>' +
      bars + "</svg>";
  }

  function verticalBars(rows, title) {
    const slot = 48;
    const height = 210;
    const left = 56;
    const bottom = 36;
    const top = 16;
    const width = left + 12 + rows.length * slot;
    let min = 0;
    let max = 0;
    rows.forEach(function (point) {
      const value = Number(point.cents);
      if (value < min) min = value;
      if (value > max) max = value;
    });
    const span = (max - min) || 1;
    function yOf(value) { return top + ((max - value) * (height - top - bottom)) / span; }
    const zeroY = yOf(0);
    const guides = [max, 0, min].map(function (value) {
      const y = yOf(value);
      return '<line class="grid" x1="' + left + '" y1="' + y.toFixed(1) + '" x2="' + (width - 8) + '" y2="' + y.toFixed(1) + '"></line>' +
        '<text class="axis" x="' + (left - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + ST.escapeHtml(axisMoney(value)) + "</text>";
    }).join("");
    const bars = rows.map(function (point, index) {
      const value = Number(point.cents);
      const x = left + 8 + index * slot;
      const y = yOf(value);
      const topY = Math.min(y, zeroY);
      const h = Math.max(2, Math.abs(zeroY - y));
      const cls = value > 0 ? "up" : value < 0 ? "down" : "flatbar";
      const tip = tipText(point.label, point.cents);
      const showLabel = rows.length <= 14 || index % 2 === 0;
      return '<rect class="hit" x="' + x.toFixed(1) + '" y="' + top + '" width="' + (slot - 8) + '" height="' + (height - top - bottom) + '" tabindex="0" data-tip="' + ST.escapeHtml(tip) + '" role="img" aria-label="' + ST.escapeHtml(tip) + '"><title>' + ST.escapeHtml(tip) + "</title></rect>" +
        '<rect class="' + cls + '" x="' + (x + 10).toFixed(1) + '" y="' + topY.toFixed(1) + '" width="16" height="' + h.toFixed(1) + '" rx="3"></rect>' +
        (showLabel ? '<text class="axis" x="' + (x + 18).toFixed(1) + '" y="' + (height - 14) + '" text-anchor="end" transform="rotate(-40 ' + (x + 18).toFixed(1) + " " + (height - 14) + ')">' + ST.escapeHtml(chartLabel(point.label)) + "</text>" : "");
    }).join("");
    return '<div class="chart-scroll"><svg class="bars" style="min-width:' + Math.max(280, width / 2) + 'px" viewBox="0 0 ' + width + " " + height + '" role="group" aria-label="' + ST.escapeHtml(title + ". Not account equity.") + '">' +
      guides + '<line class="zero" x1="' + left + '" y1="' + zeroY.toFixed(1) + '" x2="' + (width - 8) + '" y2="' + zeroY.toFixed(1) + '"></line>' + bars + "</svg></div>";
  }

  function curveSvg(curve, metrics) {
    if (!curve || curve.length < 2) {
      const why = !curve || !curve.length
        ? "No curve yet. A curve needs at least two closed days."
        : "One closed day is not enough to draw a curve. The totals above are that closed result, not a filled-in zero.";
      return '<p class="empty">' + why + " This is not account equity.</p>";
    }
    const width = 720;
    const height = 248;
    const left = 72;
    const right = 16;
    const top = 18;
    const bottom = 36;
    let min = 0;
    let max = 0;
    curve.forEach(function (point) {
      const value = Number(point.cents);
      if (value < min) min = value;
      if (value > max) max = value;
    });
    const head = Math.max((max - min) * 0.08, 100);
    const axis = niceAxis(min - head, max + head);
    min = axis.min;
    max = axis.max;
    const span = (max - min) || 1;
    function xOf(index) {
      return left + (index * (width - left - right)) / (curve.length - 1);
    }
    function yOf(value) {
      return top + ((max - value) * (height - top - bottom)) / span;
    }
    const peak = curve.reduce(function (best, point) { return point.cents > best ? point.cents : best; }, curve[0].cents);
    const zeroY = yOf(0);
    const peakY = yOf(Number(peak));
    const coords = curve.map(function (point, index) {
      return xOf(index).toFixed(1) + "," + yOf(Number(point.cents)).toFixed(1);
    }).join(" ");
    const area = xOf(0).toFixed(1) + "," + zeroY.toFixed(1) + " " + coords + " " + xOf(curve.length - 1).toFixed(1) + "," + zeroY.toFixed(1);
    let grid = "";
    axis.ticks.forEach(function (value) {
      const y = yOf(value);
      if (value !== 0) {
        grid += '<line class="grid" x1="' + left + '" y1="' + y.toFixed(1) + '" x2="' + (width - right) + '" y2="' + y.toFixed(1) + '"></line>';
      }
      grid += '<text class="axis" x="' + (left - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + ST.escapeHtml(axisMoney(value)) + "</text>";
    });
    grid += '<line class="zero" x1="' + left + '" y1="' + zeroY.toFixed(1) + '" x2="' + (width - right) + '" y2="' + zeroY.toFixed(1) + '"></line>';
    const labelCount = curve.length > 12 ? 5 : curve.length > 6 ? 4 : curve.length;
    const labelIndexes = [];
    for (let step = 0; step < labelCount; step++) {
      const index = Math.round(step * (curve.length - 1) / Math.max(1, labelCount - 1));
      if (labelIndexes.indexOf(index) === -1) labelIndexes.push(index);
    }
    const xLabels = labelIndexes.map(function (index) {
      return '<text class="axis" x="' + xOf(index).toFixed(1) + '" y="' + (height - 10) + '" text-anchor="middle">' + ST.escapeHtml(chartLabel(curve[index].date)) + "</text>";
    }).join("");
    const slot = (width - left - right) / curve.length;
    const hits = curve.map(function (point, index) {
      const tip = tipText(point.date, point.cents) + " cumulative";
      let x = xOf(index) - slot / 2;
      let w = slot;
      if (x < left) { w -= left - x; x = left; }
      if (x + w > width - right) w = width - right - x;
      return '<rect class="hit" x="' + x.toFixed(1) + '" y="' + top + '" width="' + Math.max(8, w).toFixed(1) + '" height="' + (height - top - bottom) + '" tabindex="0" data-tip="' + ST.escapeHtml(tip) + '" role="img" aria-label="' + ST.escapeHtml(tip) + '"><title>' + ST.escapeHtml(tip) + "</title></rect>";
    }).join("");
    const end = curve[curve.length - 1];
    let marks = "";
    const best = metrics && metrics.bestDay;
    const worst = metrics && metrics.worstDay;
    curve.forEach(function (point, index) {
      if (best && point.date === best.date && best.cents > 0n) {
        marks += '<circle class="mark-win" cx="' + xOf(index).toFixed(1) + '" cy="' + yOf(Number(point.cents)).toFixed(1) + '" r="5"></circle>';
      }
      if (worst && point.date === worst.date && worst.cents < 0n) {
        marks += '<circle class="mark-loss" cx="' + xOf(index).toFixed(1) + '" cy="' + yOf(Number(point.cents)).toFixed(1) + '" r="5"></circle>';
      }
    });
    const gid = "equityFill" + curve.length + String(end.cents);
    const label = "Cumulative closed-trade P/L from " + curve[0].date + " to " + end.date + ", ending at " + ST.formatCents(end.cents) + ". All-time high " + ST.formatCents(peak) + ". This is not account equity.";
    const legend = '<ul class="chart-legend"><li><span class="swatch ath"></span> High ' + ST.escapeHtml(ST.formatCents(peak, "plain")) + "</li>" +
      (best && best.cents > 0n ? '<li><span class="swatch win"></span> Best ' + ST.escapeHtml(chartLabel(best.date)) + "</li>" : "") +
      (worst && worst.cents < 0n ? '<li><span class="swatch loss"></span> Worst ' + ST.escapeHtml(chartLabel(worst.date)) + "</li>" : "") +
      "</ul>";
    return '<svg class="curve" viewBox="0 0 ' + width + " " + height + '" role="group" aria-label="' + ST.escapeHtml(label) + '">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B9F6CA" stop-opacity="0.38"></stop><stop offset="1" stop-color="#B9F6CA" stop-opacity="0"></stop></linearGradient></defs>' +
      grid +
      '<line class="ath" x1="' + left + '" y1="' + peakY.toFixed(1) + '" x2="' + (width - right) + '" y2="' + peakY.toFixed(1) + '"></line>' +
      '<polygon class="area" points="' + area + '" fill="url(#' + gid + ')"></polygon>' +
      '<polyline class="series" points="' + coords + '"></polyline>' +
      '<line class="crosshair" x1="0" y1="' + top + '" x2="0" y2="' + (height - bottom) + '" visibility="hidden"></line>' +
      marks + hits + xLabels + "</svg>" + legend;
  }

  function showChartTip(el, text) {
    const tip = document.getElementById("chartTip");
    if (!tip || !text) return;
    tip.hidden = false;
    tip.textContent = text;
    const rect = el.getBoundingClientRect();
    tip.style.left = (rect.left + rect.width / 2) + "px";
    tip.style.top = rect.top + "px";
    document.querySelectorAll("svg.curve .crosshair").forEach(function (line) {
      line.setAttribute("visibility", "hidden");
    });
    const svg = el.closest && el.closest("svg.curve");
    if (!svg || !el.classList || !el.classList.contains("hit")) return;
    const line = svg.querySelector(".crosshair");
    if (!line) return;
    const x = Number(el.getAttribute("x")) + Number(el.getAttribute("width")) / 2;
    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x));
    line.setAttribute("visibility", "visible");
  }

  function hideChartTip() {
    const tip = document.getElementById("chartTip");
    if (tip) tip.hidden = true;
    document.querySelectorAll("svg.curve .crosshair").forEach(function (line) {
      line.setAttribute("visibility", "hidden");
    });
  }

  function weekHtml(weeks) {
    const chips = weeks.map(function (week) {
      return '<div class="week"><span>' + ST.escapeHtml(week.label) + "</span>" + weekLine("T", week.tradeCents) + weekLine("M", week.manualCents) + "</div>";
    }).join("");
    return '<h3 class="section-title">Week totals</h3><div class="weeks">' + chips + "</div>";
  }

  function weekLine(mark, cents) {
    if (typeof cents !== "bigint") return '<strong class="none">' + mark + " —</strong>";
    return '<strong class="' + ST.pnlWord(cents) + '">' + mark + " " + ST.escapeHtml(ST.formatCents(cents)) + "</strong>";
  }

  function calendarHtml() {
    const heads = WEEKDAYS.map(function (name) { return '<div class="dow">' + name + "</div>"; }).join("");
    const weeks = ST.monthWeeks(state.year, state.month);
    const cells = weeks.map(function (week) {
      return week.map(function (day) {
        const detail = ST.dayDetail(state.data, day.key);
        const classes = ["day"];
        if (!day.inMonth) classes.push("out");
        if (detail.tradeCents != null) {
          classes.push(ST.pnlWord(detail.tradeCents));
          classes.push(heatClass(detail.tradeCents));
        }
        else if (detail.manualCents != null) classes.push(ST.pnlWord(detail.manualCents));
        else if (detail.adjustmentCents != null) classes.push("adjust");
        if (ST.sameDay(day.date, state.today)) classes.push("today");
        const lines = [];
        if (detail.tradeCents != null) lines.push('<span class="amt">' + ST.escapeHtml(ST.formatCellCents(detail.tradeCents)) + ' <span class="src">T</span></span>');
        if (detail.manualCents != null) lines.push('<span class="amt">' + ST.escapeHtml(ST.formatCellCents(detail.manualCents)) + ' <span class="src">M</span></span>');
        if (detail.adjustmentCents != null && detail.tradeCents == null && detail.manualCents == null) lines.push('<span class="amt"><span class="src">Adj</span></span>');
        return '<button type="button" class="' + classes.join(" ") + '" data-day="' + day.key + '" aria-label="' + ST.escapeHtml(daySpoken(day, detail)) + '"><span class="num">' + day.date.getDate() + "</span>" + lines.join("") + "</button>";
      }).join("");
    }).join("");
    return heads + cells;
  }

  function heatClass(cents) {
    const abs = cents < 0n ? -cents : cents;
    if (abs === 0n) return "heat-0";
    if (abs < 5000n) return "heat-1";
    if (abs < 25000n) return "heat-2";
    if (abs < 100000n) return "heat-3";
    return "heat-4";
  }

  function weekdayPoints(curve) {
    const sums = [null, null, null, null, null, null, null];
    (curve || []).forEach(function (point) {
      const date = ST.parseDateKey(point.date);
      if (!date || typeof point.dayCents !== "bigint") return;
      const index = date.getDay();
      sums[index] = sums[index] == null ? point.dayCents : sums[index] + point.dayCents;
    });
    return WEEKDAYS.map(function (name, index) {
      return sums[index] == null ? null : { label: name, cents: sums[index] };
    }).filter(Boolean);
  }

  function donutSvg(metrics) {
    const parts = [
      { n: metrics.wins, cls: "up", label: "Wins" },
      { n: metrics.losses, cls: "down", label: "Losses" },
      { n: metrics.breakevens, cls: "flat", label: "Breakeven" }
    ];
    const total = parts.reduce(function (sum, part) { return sum + part.n; }, 0);
    if (!total) return '<p class="empty">No closed trades for a win/loss split.</p>';
    const radius = 34;
    const circ = 2 * Math.PI * radius;
    let offset = 0;
    const arcs = parts.filter(function (part) { return part.n > 0; }).map(function (part) {
      const len = (part.n / total) * circ;
      const node = '<circle class="' + part.cls + '" cx="50" cy="50" r="' + radius + '" fill="none" stroke-width="10" stroke-linecap="butt" stroke-dasharray="' + len.toFixed(2) + " " + (circ - len).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '"></circle>';
      offset += len;
      return node;
    }).join("");
    const label = parts.map(function (part) { return part.label + " " + part.n; }).join(", ");
    const legend = '<ul class="chart-legend">' + parts.map(function (part) {
      return "<li><span class=\"swatch " + (part.cls === "up" ? "win" : part.cls === "down" ? "loss" : "ath") + '"></span>' + part.label + " " + part.n + "</li>";
    }).join("") + "</ul>";
    return '<div class="donut-wrap"><svg class="donut" viewBox="0 0 100 100" role="img" aria-label="' + ST.escapeHtml(label) + '">' + arcs + "</svg>" + legend + "</div>";
  }

  function compareBars(metrics) {
    if (typeof metrics.avgWinCents !== "bigint" || typeof metrics.avgLossCents !== "bigint") {
      return '<p class="empty">Need at least one win and one loss. Nothing is filled in as zero.</p>';
    }
    const win = Number(metrics.avgWinCents);
    const loss = Math.abs(Number(metrics.avgLossCents));
    const max = Math.max(win, loss, 1);
    function row(label, cents, width, cls) {
      return '<div class="compare-row"><span>' + label + "</span><span class=\"compare-track\"><span class=\"" + cls + "\" style=\"width:" + width.toFixed(1) + '%\"></span></span><strong class="' + ST.pnlWord(cents) + '">' + ST.escapeHtml(ST.formatCents(cents)) + "</strong></div>";
    }
    return row("Avg win", metrics.avgWinCents, (win / max) * 100, "up") + row("Avg loss", metrics.avgLossCents, (loss / max) * 100, "down");
  }

  function daySpoken(day, detail) {
    let spoken = ST.formatLongDate(day.date);
    if (detail.tradeCents == null && detail.manualCents == null && detail.adjustmentCents == null) return spoken + ", nothing logged";
    if (detail.tradeCents != null) spoken += ", closed trades " + ST.formatCents(detail.tradeCents) + " " + ST.pnlWord(detail.tradeCents);
    if (detail.manualCents != null) spoken += ", manual entry " + ST.formatCents(detail.manualCents) + " " + ST.pnlWord(detail.manualCents);
    if (detail.adjustmentCents != null) spoken += ", account adjustment " + ST.formatCents(detail.adjustmentCents);
    return spoken;
  }

  function dayTradesHtml(detail) {
    if (!detail.trades.length) return "<p>No closed trades with this exit date.</p>";
    const rows = detail.trades.map(function (result) {
      return "<li><span><strong>" + ST.escapeHtml(result.symbol) + "</strong> " + ST.escapeHtml(result.direction) + "</span>" + moneyHtml(result.netCents) + "</li>";
    }).join("");
    return "<h3>Closed trades</h3><ul class=\"perf-list\">" + rows + "</ul><p>Total " + ST.escapeHtml(ST.formatCents(detail.tradeCents)) + " " + ST.pnlWord(detail.tradeCents) + ". Edit a trade from Trades. This total is not added to the manual entry.</p>";
  }

  function updateTradeChrome() {
    const reviewing = tradeMode === "review";
    document.getElementById("tradeFields").disabled = reviewing;
    const status = document.getElementById("fieldStatus").value;
    const help = ST.STATUS_HELP[status] || ST.STATUS_HELP.open;
    const reason = document.getElementById("fieldExitReason").value;
    let lead = help.detail;
    if (status === "closed" && ST.EXIT_REASON_HELP[reason]) lead += " " + ST.EXIT_REASON_HELP[reason];
    document.getElementById("tradeStatusHelp").textContent = lead;
    const symbol = document.getElementById("fieldSymbol").value.trim();
    document.getElementById("tradeDialogTitle").textContent = reviewing
      ? "Review " + (symbol || "trade")
      : (editingId ? "Edit " + (symbol || "trade") : "Add trade");
    document.getElementById("tradeSaveBtn").hidden = reviewing;
    document.getElementById("tradeSaveBtn").disabled = reviewing;
    document.getElementById("tradeSaveBtn").textContent = editingId ? "Save changes" : "Add trade";
    document.getElementById("tradeEditBtn").hidden = !reviewing;
    document.getElementById("tradeDeleteBtn").hidden = !editingId;
    document.getElementById("tradeCloseBtn").hidden = reviewing || status !== "open";
    document.getElementById("tradeResult").hidden = false;
    document.getElementById("tradeResult").innerHTML = tradePreviewHtml();
    syncFillField();
    updateStatusPreview();
  }

  function tradePreviewHtml() {
    const draft = readTradeFields();
    draft.id = editingId || "draft";
    const books = ST.positionAccounting(draft);
    if (draft.exits && draft.exits.length) {
      const realized = books.realizedNetCents == null ? "N/A" : ST.formatCents(books.realizedNetCents) + " " + ST.pnlWord(books.realizedNetCents);
      const unrealized = books.unrealizedReason === "manual-mark"
        ? ST.formatCents(books.unrealizedCents) + " at a manual mark" + (books.markAsOf ? " as of " + books.markAsOf : "")
        : "N/A until you enter a manual mark";
      return "<h3>Average-cost exits</h3><p>Realized on the exits you listed: " + ST.escapeHtml(realized) + ". Remaining shares " +
        ST.escapeHtml(books.remainingQty == null ? "N/A" : ST.formatShares(books.remainingQty)) + ". Unrealized: " + ST.escapeHtml(unrealized) + ".</p>";
    }
    const result = ST.tradeResult(draft);
    if (result.reason === "incomplete") {
      return "<h3>Closed — incomplete</h3><p>A closing price, an entry price, and a share count are all needed before this counts as realized. Nothing was invented. Realized P/L: N/A.</p>";
    }
    if (!result.included) {
      const help = ST.STATUS_HELP[draft.status] || ST.STATUS_HELP.open;
      return "<h3>" + ST.escapeHtml(help.summary) + "</h3><p>" + ST.escapeHtml(help.detail) + " Realized P/L: N/A.</p>";
    }
    const basis = result.returnBasis === ST.SHORT_RETURN_BASIS
      ? "Short return uses sale proceeds (shares × entry price), not margin."
      : "Long return uses initial entry cost (shares × entry price).";
    const percent = result.returnPercent || "N/A";
    let extra = "";
    if (result.reason === "undated") extra += " No exit date is recorded, so this stays out of the calendar and dated totals.";
    if (result.feesAssumedZero) extra += " Fees were left blank, so net treats fees as $0.00.";
    if (result.dateNote) extra += " " + result.dateNote;
    if (result.entrySource === "average-cost") extra += " Entry price was blank, so average cost was used.";
    return "<h3>Recorded result</h3><p>Gross " + ST.escapeHtml(ST.formatCents(result.grossCents)) + " · fees " + ST.escapeHtml(ST.formatCents(result.feeCents)) + " · net " + ST.escapeHtml(ST.formatCents(result.netCents)) + " " + ST.pnlWord(result.netCents) + ". Return " + ST.escapeHtml(percent) + ". " + ST.escapeHtml(basis) + ST.escapeHtml(extra) + "</p>";
  }

  function onTradeSubmit(event) {
    event.preventDefault();
    if (tradeMode === "review") return;
    const result = handlers.saveTrade(readTradeFields(), editingId);
    if (result && result.error) {
      showFormError("tradeError", result.error);
      return;
    }
    document.getElementById("tradeDialog").close();
  }

  function readTradeFields() {
    return {
      symbol: valueOf("fieldSymbol"),
      exchange: valueOf("fieldExchange"),
      name: valueOf("fieldName"),
      exits: readExitRows(),
      markPrice: valueOf("fieldMark"),
      markAsOf: valueOf("fieldMarkAsOf"),
      direction: valueOf("fieldDirection"),
      status: valueOf("fieldStatus"),
      quantity: valueOf("fieldShares"),
      fees: valueOf("fieldFees"),
      entryPrice: valueOf("fieldEntry"),
      avgCost: valueOf("fieldAvg"),
      targetPrice: valueOf("fieldTarget"),
      hardStop: valueOf("fieldHardStop"),
      entryDate: valueOf("fieldEntryDate"),
      exitDate: valueOf("fieldExitDate"),
      exitPrice: valueOf("fieldExit"),
      exitReason: valueOf("fieldExitReason"),
      strategy: valueOf("fieldStrategy"),
      setup: valueOf("fieldSetup"),
      thesis: valueOf("fieldThesis"),
      lessons: valueOf("fieldLessons"),
      notes: valueOf("fieldNotes"),
      getIn: valueOf("fieldGetIn"),
      getOut: valueOf("fieldGetOut"),
      orderStatus: valueOf("fieldOrder"),
      fillPrice: valueOf("fieldFill"),
      close: valueOf("fieldClose")
    };
  }

  function onDaySubmit(event) {
    event.preventDefault();
    const manual = readDayPnl();
    if (manual && manual.error) {
      showFormError("dayError", manual.error);
      return;
    }
    const adjustment = readAdjustment();
    if (adjustment && adjustment.error) {
      showFormError("dayError", adjustment.error);
      return;
    }
    const collected = collectSplits();
    if (collected.error) {
      showFormError("dayError", collected.error);
      return;
    }
    const result = handlers.saveDay(editingDayKey, {
      manualPnl: manual ? manual.value : null,
      note: document.getElementById("dayNote").value,
      breakdown: collected.breakdown,
      adjustment: adjustment ? adjustment.value : null,
      adjustmentNote: document.getElementById("dayAdjustmentNote").value
    });
    if (result && result.error) {
      showFormError("dayError", result.error);
      return;
    }
    document.getElementById("dayDialog").close();
  }

  function readDayPnl() {
    const raw = document.getElementById("dayAmount").value;
    if (String(raw).trim() === "") return null;
    const typed = ST.parseCents(raw);
    if (typed == null) return { error: "Enter the manual amount as a number, or leave it blank." };
    const loss = document.getElementById("signLoss").getAttribute("aria-pressed") === "true" || String(raw).includes("-");
    const cents = loss ? (typed < 0n ? typed : -typed) : (typed < 0n ? -typed : typed);
    return { value: Number(ST.formatScaled(cents, 2)) };
  }

  function readAdjustment() {
    const raw = document.getElementById("dayAdjustment").value;
    if (String(raw).trim() === "") return null;
    const cents = ST.parseCents(raw);
    if (cents == null) return { error: "Enter the adjustment as a number, such as 25 or -10." };
    return { value: Number(ST.formatScaled(cents, 2)) };
  }

  function collectSplits() {
    const rows = [];
    const nodes = document.querySelectorAll("#splitRows .split-row");
    for (let i = 0; i < nodes.length; i++) {
      const input = nodes[i].querySelector("input[data-symbol]");
      const amountInput = nodes[i].querySelector("input[data-amount]");
      const symbol = input.value.trim();
      const raw = amountInput.value.trim();
      if (raw === "" && symbol === "") continue;
      const amount = ST.parseCents(raw);
      if (amount == null || !symbol) return { error: "Each manual split needs a ticker and an amount." };
      const known = state.data.trades.find(function (trade) { return trade.symbol === symbol.toUpperCase(); });
      rows.push({
        tickerId: known ? known.id : "",
        symbol: symbol,
        amount: Number(ST.formatScaled(amount, 2))
      });
    }
    return { breakdown: rows };
  }

  function updateSplitHint() {
    const hint = document.getElementById("splitHint");
    const collected = collectSplits();
    if (collected.error) { hint.textContent = collected.error; return; }
    if (!collected.breakdown.length) {
      hint.textContent = "Optional. The manual amount is what the manual total uses.";
      return;
    }
    const sum = collected.breakdown.reduce(function (total, row) { return total + (ST.parseCents(row.amount) || 0n); }, 0n);
    hint.textContent = "Manual split adds up to " + ST.formatCents(sum) + ". It does not change closed-trade totals.";
  }

  function renderSplits(rows) {
    document.getElementById("splitRows").innerHTML = (rows || []).map(splitRowHtml).join("");
  }

  function splitRowHtml(row) {
    const symbol = row && row.symbol ? row.symbol : "";
    const amount = row && typeof row.amount === "number" ? String(row.amount) : "";
    return '<div class="split-row"><input data-symbol aria-label="Manual split ticker" maxlength="10" autocapitalize="characters" value="' + ST.escapeHtml(symbol) + '" placeholder="SOFI" />' +
      '<input data-amount aria-label="Manual split amount" inputmode="decimal" autocomplete="off" placeholder="0.00 or -10" value="' + ST.escapeHtml(amount) + '" />' +
      '<button type="button" class="icon-btn" data-remove-split aria-label="Remove split">×</button></div>';
  }

  function updateImportMode() {
    const replace = document.querySelector('input[name="importMode"]:checked').value === "replace";
    document.getElementById("replaceConfirmLabel").hidden = !replace;
    document.getElementById("importApply").textContent = replace ? "Replace saved journal" : "Merge into this journal";
  }

  function onImportSubmit(event) {
    event.preventDefault();
    const mode = document.querySelector('input[name="importMode"]:checked').value;
    if (mode === "replace" && !document.getElementById("replaceConfirm").checked) {
      showFormError("importError", "Check the box to confirm replace. Nothing has been changed.");
      return;
    }
    const result = handlers.applyImport(importPlan, {
      mode: mode,
      overwriteIds: document.getElementById("importOverwrite").checked,
      importSimilar: document.getElementById("importSimilar").checked,
      days: document.querySelector('input[name="importDays"]:checked').value
    });
    if (result && result.error) {
      showFormError("importError", result.error);
      return;
    }
    document.getElementById("importDialog").close();
  }

  function readRisk() {
    return {
      accountSize: document.getElementById("riskAccount").value,
      riskPercent: document.getElementById("riskPercent").value,
      entryPrice: document.getElementById("riskEntry").value,
      stopPrice: document.getElementById("riskStop").value,
      direction: document.getElementById("riskDirection").value,
      targetPrice: document.getElementById("riskTarget").value,
      remember: document.getElementById("riskRemember").checked
    };
  }

  function syncFillField() {
    const filled = document.getElementById("fieldOrder").value === "filled";
    const input = document.getElementById("fieldFill");
    input.disabled = !filled || document.getElementById("tradeFields").disabled;
    input.placeholder = filled ? "if filled" : "only if filled";
  }

  function updateStatusPreview() {
    const trade = {
      direction: document.getElementById("fieldDirection").value,
      orderStatus: document.getElementById("fieldOrder").value,
      close: blankNumber("fieldClose"),
      getOut: blankNumber("fieldGetOut"),
      hardStop: blankNumber("fieldHardStop")
    };
    const status = ST.computeStatus(trade);
    const box = document.getElementById("statusPreview");
    if (!status) { box.hidden = true; return; }
    box.hidden = false;
    box.className = "status " + status.kind;
    document.getElementById("statusPreviewLine").textContent = status.text;
    document.getElementById("statusPreviewDetail").textContent = status.detail || "";
  }

  function blankNumber(id) {
    const value = document.getElementById(id).value;
    if (value === "") return null;
    const n = ST.priceNumber(value);
    return n;
  }

  function setSign(isLoss) {
    document.getElementById("signGain").setAttribute("aria-pressed", isLoss ? "false" : "true");
    document.getElementById("signLoss").setAttribute("aria-pressed", isLoss ? "true" : "false");
  }

  function setControl(id, value) {
    document.getElementById(id).value = value == null || value === false ? "" : String(value);
  }

  function valueOf(id) {
    return document.getElementById(id).value;
  }

  function formatAbs(value) {
    const cents = ST.parseCents(Math.abs(Number(value)));
    if (cents == null) return "";
    return ST.formatScaled(cents, 2).replace(/\.00$/, "");
  }

  function countPhrase(count, singular, plural) {
    return count + " " + (count === 1 ? singular : plural);
  }

  function setIfIdle(id, value) {
    const el = document.getElementById(id);
    if (!el || document.activeElement === el) return;
    el.value = value || "";
  }

  function readPositionQuery() {
    return {
      filter: valueOf("positionFilter"),
      symbol: valueOf("positionSymbol"),
      direction: valueOf("positionDirection"),
      strategy: valueOf("positionStrategy"),
      from: valueOf("positionFrom"),
      to: valueOf("positionTo")
    };
  }

  function readAnalyticsQuery() {
    return { symbol: valueOf("analyticsSymbol"), status: valueOf("analyticsStatus") };
  }

  function tradeInDateRange(trade, from, to) {
    const dates = [trade.entryDate, trade.exitDate].concat((trade.exits || []).map(function (exit) { return exit.date; })).filter(Boolean);
    if (!dates.length) return false;
    return dates.some(function (key) {
      if (from && key < from) return false;
      if (to && key > to) return false;
      return true;
    });
  }

  function exitRowHtml(exit) {
    const reason = exit && exit.reason || "";
    return '<div class="split-row exit-row">' +
      '<label>Shares<input class="exit-qty" inputmode="decimal" value="' + ST.escapeHtml(exit && exit.quantity != null ? exit.quantity : "") + '" /></label>' +
      '<label>Price<input class="exit-price" inputmode="decimal" value="' + ST.escapeHtml(exit && exit.price != null ? exit.price : "") + '" /></label>' +
      '<label>Date<input class="exit-date" type="date" value="' + ST.escapeHtml(exit && exit.date || "") + '" /></label>' +
      '<label>Fees<input class="exit-fees" inputmode="decimal" value="' + ST.escapeHtml(exit && exit.fees != null ? exit.fees : "") + '" /></label>' +
      '<label>Reason<select class="exit-reason">' +
        '<option value=""' + (reason === "" ? " selected" : "") + '>Not recorded</option>' +
        '<option value="target"' + (reason === "target" ? " selected" : "") + '>Recorded as target exit</option>' +
        '<option value="stop"' + (reason === "stop" ? " selected" : "") + '>Recorded as stop exit</option>' +
        '<option value="other"' + (reason === "other" ? " selected" : "") + '>Other</option>' +
      "</select></label>" +
      '<button type="button" data-remove-exit>Remove</button></div>';
  }

  function renderExitRows(exits) {
    document.getElementById("exitRows").innerHTML = (exits || []).map(exitRowHtml).join("");
    document.getElementById("partialDetails").open = !!(exits && exits.length);
  }

  function readExitRows() {
    const rows = [];
    document.querySelectorAll("#exitRows .exit-row").forEach(function (row) {
      const quantity = row.querySelector(".exit-qty").value;
      const price = row.querySelector(".exit-price").value;
      const date = row.querySelector(".exit-date").value;
      const fees = row.querySelector(".exit-fees").value;
      const reason = row.querySelector(".exit-reason").value;
      if (!String(quantity).trim() && !String(price).trim() && !String(date).trim()) return;
      rows.push({ quantity: quantity, price: price, date: date, fees: fees, reason: reason });
    });
    return rows;
  }

  const EXCHANGE_HINTS = { AAPL: "NASDAQ", NVDA: "NASDAQ", SOFI: "NASDAQ", TSLA: "NASDAQ", MSFT: "NASDAQ", AMD: "NASDAQ", QQQ: "NASDAQ", SPY: "AMEX" };

  function drawSymbolChrome() {
    const settings = state.data.settings || {};
    const fallback = state.data.trades.find(function (trade) { return trade.symbol; });
    const symbol = settings.selectedSymbol || (fallback && fallback.symbol) || "";
    const exchange = settings.selectedExchange || "";
    setIfIdle("symbolSearch", symbol);
    setIfIdle("symbolExchange", exchange);
    const hint = symbol ? EXCHANGE_HINTS[symbol] : "";
    const hintBtn = document.getElementById("exchangeHint");
    const hintText = document.getElementById("exchangeHintText");
    if (hint && !exchange) {
      hintBtn.hidden = false;
      hintBtn.setAttribute("data-exchange", hint);
      hintBtn.textContent = "Use " + hint;
      hintText.textContent = "Suggested exchange " + hint + " for " + symbol + ". It is a venue hint, not a quote.";
    } else {
      hintBtn.hidden = true;
      hintText.textContent = symbol ? "Exchange is saved with the watchlist. It is not a quote." : "Enter a ticker to see its journal.";
    }
    const symbols = { AAPL: true, NVDA: true, SOFI: true, TSLA: true, MSFT: true };
    state.data.trades.forEach(function (trade) { if (trade.symbol) symbols[trade.symbol] = true; });
    (settings.watchlist || []).forEach(function (item) { if (item.symbol) symbols[item.symbol] = true; });
    document.getElementById("symbolSuggestions").innerHTML = Object.keys(symbols).sort().map(function (item) {
      return '<option value="' + ST.escapeHtml(item) + '"></option>';
    }).join("");
  }

  function moneyOrNa(value) {
    return value == null ? "N/A" : ST.formatPlainMoney(value);
  }

  function levelItem(label, value) {
    if (value == null || value === "") return "";
    return "<li><span>" + ST.escapeHtml(label) + "</span><strong>" + ST.escapeHtml(moneyOrNa(value)) + "</strong></li>";
  }

  function drawSymbolDetail() {
    const settings = state.data.settings || {};
    const names = Object.create(null);
    state.data.trades.forEach(function (trade) { if (trade.symbol) names[trade.symbol] = true; });
    (settings.watchlist || []).forEach(function (item) { if (item.symbol) names[item.symbol] = true; });
    const fallback = state.data.trades.find(function (trade) { return trade.symbol; });
    const symbol = settings.selectedSymbol || (fallback && fallback.symbol) || "";
    const body = document.getElementById("symbolDetailBody");
    if (!symbol) {
      body.innerHTML = '<p class="empty" id="symbolDetailName">Choose a symbol from the watchlist or add a ticker.</p>';
      return;
    }
    const metrics = ST.analyze(state.data, { symbol: symbol });
    const trades = state.data.trades.filter(function (trade) { return trade.symbol === symbol; });
    const open = trades.filter(function (trade) { return trade.status === "open"; });
    let unrealized = null;
    trades.forEach(function (trade) {
      const books = ST.positionAccounting(trade);
      if (books.unrealizedReason === "manual-mark" && typeof books.unrealizedCents === "bigint") {
        unrealized = (unrealized == null ? 0n : unrealized) + books.unrealizedCents;
      }
    });
    const openHtml = open.length
      ? '<h3>Open positions</h3><ul class="perf-list">' + open.map(function (trade) {
        const books = ST.positionAccounting(trade);
        const bits = [
          trade.direction === "short" ? "Short" : "Long",
          books.remainingQty == null ? "quantity N/A" : ST.formatShares(books.remainingQty) + " left",
          "entry " + moneyOrNa(trade.entryPrice != null ? trade.entryPrice : trade.avgCost),
          trade.hardStop == null ? "stop not recorded" : "stop " + moneyOrNa(trade.hardStop),
          trade.targetPrice == null ? "target not recorded" : "target " + moneyOrNa(trade.targetPrice)
        ];
        return "<li><span><strong>" + ST.escapeHtml(trade.symbol) + "</strong> " + ST.escapeHtml(bits.join(" · ")) + "</span></li>";
      }).join("") + "</ul><p class=\"hint\">A stop or target is a plan, not a fill.</p>"
      : '<p class="empty">No open position for this symbol.</p>';
    const levels = [];
    trades.forEach(function (trade) {
      levels.push(levelItem("Entry", trade.entryPrice != null ? trade.entryPrice : trade.avgCost));
      levels.push(levelItem("Exit", trade.exitPrice));
      levels.push(levelItem("Target", trade.targetPrice));
      levels.push(levelItem("Stop", trade.hardStop));
      levels.push(levelItem("Manual mark", trade.markPrice));
    });
    const levelHtml = levels.filter(Boolean).length
      ? '<h3>Recorded levels</h3><ul class="perf-list">' + levels.filter(Boolean).join("") + "</ul>"
      : "";
    const rows = Object.keys(names).sort().map(function (name) {
      const row = ST.analyze(state.data, { symbol: name });
      const openCount = state.data.trades.filter(function (trade) { return trade.symbol === name && trade.status === "open"; }).length;
      const net = typeof row.realizedNetCents === "bigint" ? moneyHtml(row.realizedNetCents) : '<span class="na">N/A</span>';
      return '<tr><td data-label="Symbol"><button type="button" class="chip" data-pick-symbol="' + ST.escapeHtml(name) + '">' + ST.escapeHtml(name) + "</button></td>" +
        '<td class="num" data-label="Closed P/L">' + net + "</td>" +
        '<td class="num" data-label="Win rate">' + ST.escapeHtml(row.winRate || "N/A") + "</td>" +
        '<td class="num" data-label="Trades">' + row.tradeCount + "</td>" +
        '<td class="num" data-label="Open">' + openCount + "</td></tr>";
    }).join("");
    body.innerHTML = '<p class="meta" id="symbolDetailName"><strong>' + ST.escapeHtml(symbol) + "</strong>" +
      (settings.selectedExchange ? " · " + ST.escapeHtml(settings.selectedExchange) : "") + "</p>" +
      '<div class="primary-metrics">' +
        stat("Closed P/L", metrics.realizedNetCents, "id=\"symbolRealized\"") +
        '<div class="stat" id="symbolWinRate"><div class="label">Win rate</div><div class="value flat">' + ST.escapeHtml(metrics.winRate || "N/A") + "</div></div>" +
        '<div class="stat" id="symbolTrades"><div class="label">Trades</div><div class="value flat">' + metrics.tradeCount + "</div><p class=\"substat\">Closed only</p></div>" +
      "</div>" +
      (unrealized == null ? "" : '<p class="hint">Unrealized at your manual mark ' + ST.escapeHtml(ST.formatCents(unrealized)) + ".</p>") +
      openHtml + levelHtml +
      (trades.length ? "" : '<p class="empty">No saved trades for this symbol. Nothing is added until you save a trade.</p>') +
      (rows ? '<h3>All symbols</h3><div class="trade-scroll"><table class="trade-table"><thead><tr><th>Symbol</th><th class="num">Closed P/L</th><th class="num">Win rate</th><th class="num">Trades</th><th class="num">Open</th></tr></thead><tbody>' + rows + "</tbody></table></div>" : "");
  }

  function drawWatchlist() {
    const settings = state.data.settings || {};
    const held = Object.create(null);
    state.data.trades.forEach(function (trade) {
      if (trade.symbol) held[trade.symbol] = trade.exchange || held[trade.symbol] || "";
    });
    const chips = [];
    Object.keys(held).sort().forEach(function (symbol) {
      chips.push(chipHtml(symbol, held[symbol], "In journal", false));
    });
    (settings.watchlist || []).forEach(function (item) {
      if (held[item.symbol]) return;
      chips.push(chipHtml(item.symbol, item.exchange, "Watchlist", true));
    });
    const body = document.getElementById("watchlistBody");
    body.innerHTML = chips.length
      ? '<div class="chip-row">' + chips.join("") + "</div>"
      : '<p class="empty">No symbols yet. Add a trade or a watchlist ticker.</p>';
  }

  function chipHtml(symbol, exchange, label, removable) {
    const active = state.data.settings && state.data.settings.selectedSymbol === symbol;
    return '<button type="button" class="chip' + (active ? " active" : "") + '" data-pick-symbol="' + ST.escapeHtml(symbol) +
      '" data-exchange="' + ST.escapeHtml(exchange || "") + '">' + ST.escapeHtml(symbol) + " <span class=\"tag\">" + ST.escapeHtml(label) + "</span></button>" +
      (removable ? '<button type="button" data-remove-watch="' + ST.escapeHtml(symbol) + '" aria-label="Remove ' + ST.escapeHtml(symbol) + ' from watchlist">Remove</button>' : "");
  }

  function showFormError(id, message) {
    const el = document.getElementById(id);
    el.hidden = false;
    el.textContent = message;
  }

  function hideFormError(id) {
    const el = document.getElementById(id);
    el.hidden = true;
    el.textContent = "";
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
