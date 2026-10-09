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

  ST.bind = function (next) {
    handlers = next;
    document.getElementById("addTradeBtn").addEventListener("click", function () { handlers.addTrade(); });
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
      const tab = event.target.closest("[data-tab]");
      if (tab) { handlers.setTab(tab.dataset.tab); return; }
      const day = event.target.closest("[data-day]");
      if (day) { handlers.openDay(day.dataset.day); return; }
      const review = event.target.closest("[data-review]");
      if (review) { handlers.reviewTrade(review.dataset.review); return; }
      const edit = event.target.closest("[data-edit]");
      if (edit) { handlers.editTrade(edit.dataset.edit); return; }
      const closeTrade = event.target.closest("[data-close-trade]");
      if (closeTrade) { handlers.closeTrade(closeTrade.dataset.closeTrade); return; }
      const remove = event.target.closest("[data-remove]");
      if (remove) handlers.removeTrade(remove.dataset.remove);
      const period = event.target.closest("[data-period]");
      if (period) { handlers.setPeriod(period.dataset.period); return; }
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
      if (dropWatch) handlers.removeWatch(dropWatch.dataset.removeWatch);
    });
    document.addEventListener("ladder-theme", function () {
      if (state) syncWidgets(state);
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
    syncWidgets(state);
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
    TABS.forEach(function (tab) {
      const on = state.tab === tab;
      const view = document.getElementById("view-" + tab);
      const btn = document.getElementById("tab-" + tab);
      view.classList.toggle("active", on);
      view.hidden = !on;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
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
    const closed = [];
    state.data.trades.forEach(function (trade) {
      ST.realizedEvents(trade).forEach(function (result) {
        if (!result.included) return;
        if (bounds.ready && bounds.start && result.exitDate < bounds.start) return;
        if (bounds.ready && bounds.end && result.exitDate > bounds.end) return;
        closed.push(result);
      });
    });
    closed.sort(function (a, b) { return (b.exitDate || "").localeCompare(a.exitDate || ""); });
    const recent = closed.slice(0, 5);
    const unrealized = books.unrealizedCents == null
      ? '<div class="stat" id="dashUnrealized"><div class="label">Unrealized P/L, estimate</div><div class="value na">N/A <span class="tag">no manual mark</span></div></div>'
      : stat("Unrealized P/L, estimate", books.unrealizedCents, "id=\"dashUnrealized\"");
    const plannedHtml = planned.cents == null
      ? '<div class="stat" id="dashPlanned"><div class="label">Planned risk, open positions</div><div class="value na">N/A <span class="tag">' +
        (planned.skipped ? "stop or entry missing" : "no open plan") + "</span></div></div>"
      : '<div class="stat" id="dashPlanned"><div class="label">Planned risk, open positions</div><div class="value flat">' +
        ST.escapeHtml(ST.formatCents(planned.cents, "plain")) + ' <span class="tag">plan' +
        (planned.equityPercent ? " · " + planned.equityPercent + " of saved account" : "") +
        (planned.skipped ? " · " + planned.skipped + " skipped" : "") + "</span></div></div>";
    const winHtml = !metrics || metrics.winRate == null
      ? '<div class="stat" id="dashWinRate"><div class="label">Win rate</div><div class="value na">N/A <span class="tag">no closed trades in period</span></div></div>'
      : '<div class="stat" id="dashWinRate"><div class="label">Win rate</div><div class="value flat">' + ST.escapeHtml(metrics.winRate) + ' <span class="tag">closed trades</span></div></div>';
    const emptyJournal = !state.data.trades.length;
    const periodNote = bounds.ready
      ? bounds.label + (bounds.start ? " · " + bounds.start + " through " + bounds.end : "") + ". " + ST.METRIC_HELP.cumulative
      : bounds.message;
    const recentHtml = recent.length
      ? '<h3 class="section-title">Recent completed trades</h3><ul class="perf-list">' + recent.map(function (result) {
        return "<li><span><strong>" + ST.escapeHtml(result.symbol) + "</strong> " + ST.escapeHtml(result.exitDate || "no exit date") + "</span>" + moneyHtml(result.netCents) + "</li>";
      }).join("") + "</ul>"
      : '<h3 class="section-title">Recent completed trades</h3><p class="empty">No completed trades in this period. Open positions stay off realized profit and loss until you record an exit.</p>';
    const openHtml = openTrades.length
      ? '<h3 class="section-title">Open positions</h3><ul class="perf-list">' + openTrades.slice(0, 6).map(function (trade) {
        const row = ST.positionAccounting(trade);
        return "<li><span><strong>" + ST.escapeHtml(trade.symbol) + "</strong> " + ST.escapeHtml(trade.direction === "short" ? "Short" : "Long") +
          "</span><span>" + ST.escapeHtml(row.remainingQty == null ? "quantity N/A" : ST.formatShares(row.remainingQty) + " left") + "</span></li>";
      }).join("") + "</ul>"
      : '<h3 class="section-title">Open positions</h3><p class="empty">No open positions. A closed trade is realized only from the exit you recorded.</p>';
    document.getElementById("dashboardBody").innerHTML =
      (emptyJournal ? '<p class="empty">No trades recorded yet. Log a trade to see realized results. This dashboard does not invent sample performance.</p>' : "") +
      '<div class="stats">' +
        stat("Realized P/L", metrics ? metrics.realizedNetCents : null, "id=\"dashRealized\"") +
        '<div class="stat" id="dashOpen"><div class="label">Open positions</div><div class="value flat">' + openTrades.length + ' <span class="tag">not realized</span></div></div>' +
        plannedHtml +
        winHtml +
        unrealized +
        '<div class="stat" id="dashPortfolio"><div class="label">Portfolio market value</div><div class="value na">N/A <span class="tag">not inferred</span></div></div>' +
        '<div class="stat" id="dashCash"><div class="label">Cash balance</div><div class="value na">N/A <span class="tag">not tracked</span></div></div>' +
        stat("Today, closed trades", today.tradeCents, "id=\"dashTodayTrades\"") +
        stat("Today, manual entry", today.manualCents, "id=\"dashTodayManual\"") +
      "</div>" +
      '<div class="chart-block"><h3>Realized P/L over time</h3><p class="hint">' + ST.escapeHtml(periodNote) + "</p>" +
        curveSvg(metrics ? metrics.curve : []) +
        '<h3 class="section-title">Daily realized P/L</h3>' + barSvg(metrics ? metrics.curve.map(function (point) { return { label: point.date, cents: point.dayCents }; }) : [], "Daily realized profit and loss") +
        '<h3 class="section-title">By month</h3>' + barSvg(monthPoints(metrics ? metrics.curve : []), "Monthly realized profit and loss") +
        '<h3 class="section-title">By ticker</h3>' + barSvg((metrics ? metrics.byTicker : []).map(function (row) { return { label: row.label, cents: row.netCents }; }), "Realized profit and loss by ticker") +
      "</div>" +
      recentHtml + openHtml;
    drawSymbolDetail();
    drawWatchlist();
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
      list.innerHTML = '<p class="empty">No trades yet. Add one to record a ticker, direction, and plan. Nothing is sent to a broker.</p>';
      return;
    }
    if (!trades.length) {
      list.innerHTML = '<p class="empty">Nothing in this filter.</p>';
      return;
    }
    list.innerHTML = trades.map(tradeCard).join("");
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
      ? label + ": exit dates from " + start + " through " + end + ", inclusive. Results are placed on the exit date, not the entry date."
      : "All closed trades that have an exit date. Trades without an exit date are listed separately and are not in the totals.";
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
    const body = [];
    body.push('<div class="metrics">');
    body.push(metric("Realized net P/L", metrics.realizedNetCents, ST.METRIC_HELP.realizedNet, "metric-realized"));
    body.push(metricCount("Winning trades", metrics.tradeCount ? metrics.wins : null, ST.METRIC_HELP.wins));
    body.push(metricCount("Losing trades", metrics.tradeCount ? metrics.losses : null, ST.METRIC_HELP.losses));
    body.push(metricCount("Breakeven trades", metrics.tradeCount ? metrics.breakevens : null, ST.METRIC_HELP.breakeven));
    body.push(metricText("Win rate", metrics.winRate, ST.METRIC_HELP.winRate));
    body.push(metric("Average winning trade", metrics.avgWinCents, ST.METRIC_HELP.avgWin));
    body.push(metric("Average losing trade", metrics.avgLossCents, ST.METRIC_HELP.avgLoss));
    body.push(metric("Average P/L per closed trade", metrics.avgTradeCents, ST.METRIC_HELP.avgTrade));
    body.push(metric("Gross profit", metrics.grossProfitCents, ST.METRIC_HELP.grossProfit));
    body.push(metricMagnitude("Gross loss", metrics.grossLossCents, ST.METRIC_HELP.grossLoss, "sum of losses"));
    body.push(metricText("Profit factor", metrics.profitFactor, ST.METRIC_HELP.profitFactor));
    body.push('<div class="metric"><h3>Best day</h3>' + extremeValue(metrics.bestDay) + '<p class="def">' + ST.escapeHtml(ST.METRIC_HELP.bestDay) + "</p></div>");
    body.push('<div class="metric"><h3>Worst day</h3>' + extremeValue(metrics.worstDay) + '<p class="def">' + ST.escapeHtml(ST.METRIC_HELP.worstDay) + "</p></div>");
    body.push(metric("Cumulative realized P/L", metrics.cumulativeCents, ST.METRIC_HELP.cumulative, "metric-cumulative"));
    body.push(metricMagnitude("Drawdown from peak", metrics.currentDrawdownCents, ST.METRIC_HELP.drawdown, "below peak"));
    body.push(metricMagnitude("Max drawdown", metrics.maxDrawdownCents, ST.METRIC_HELP.maxDrawdown, "below peak"));
    body.push(groupHtml("By ticker", metrics.byTicker, ST.METRIC_HELP.byTicker));
    body.push(groupHtml("By strategy", metrics.byStrategy, ST.METRIC_HELP.byStrategy));
    body.push(groupHtml("By direction", metrics.byDirection, ST.METRIC_HELP.byDirection));
    body.push('<div class="metric wide"><h3>Cumulative closed-trade P/L</h3><p class="def">' + ST.escapeHtml(ST.METRIC_HELP.cumulative) + "</p>" + curveSvg(metrics.curve) + "</div>");
    body.push('<div class="metric wide"><h3>Daily realized P/L</h3><p class="def">Each bar is that exit date’s net. Manual days and account adjustments are not included.</p>' + barSvg(metrics.curve.map(function (point) { return { label: point.date, cents: point.dayCents }; }), "Daily realized profit and loss") + "</div>");
    body.push('<div class="metric wide"><h3>By month</h3><p class="def">Closed-trade net grouped by exit month. This is not cash flow.</p>' + barSvg(monthPoints(metrics.curve), "Monthly realized profit and loss") + "</div>");
    body.push("</div>");
    const notes = [];
    if (metrics.excludedOpen) notes.push(metrics.excludedOpen + " open " + (metrics.excludedOpen === 1 ? "trade is" : "trades are") + " excluded.");
    if (metrics.excludedCancelled) notes.push(metrics.excludedCancelled + " cancelled " + (metrics.excludedCancelled === 1 ? "trade is" : "trades are") + " excluded.");
    if (metrics.incomplete) notes.push(metrics.incomplete + " closed " + (metrics.incomplete === 1 ? "trade is" : "trades are") + " missing a price or quantity, so no result was invented.");
    if (metrics.undated) notes.push(metrics.undated + " closed " + (metrics.undated === 1 ? "trade has" : "trades have") + " no exit date (" + ST.formatCents(metrics.undatedNetCents) + "). Saved, but not in these totals.");
    if (metrics.feesAssumedZero) notes.push(metrics.feesAssumedZero + " counted " + (metrics.feesAssumedZero === 1 ? "trade treats" : "trades treat") + " blank fees as $0.00.");
    if (notes.length) body.push('<p class="hint">' + ST.escapeHtml(notes.join(" ")) + "</p>");
    document.getElementById("analyticsBody").innerHTML = body.join("");
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
    return '<div class="metric"' + (id ? ' id="' + id + '"' : "") + "><h3>" + ST.escapeHtml(label) + "</h3>" + moneyHtml(cents) + '<p class="def">' + ST.escapeHtml(help) + "</p></div>";
  }

  function metricCount(label, count, help) {
    const value = count == null
      ? '<div class="value na">N/A <span class="tag">not enough data</span></div>'
      : '<div class="value flat">' + count + "</div>";
    return '<div class="metric"><h3>' + ST.escapeHtml(label) + "</h3>" + value + '<p class="def">' + ST.escapeHtml(help) + "</p></div>";
  }

  function metricMagnitude(label, cents, help, tag) {
    if (typeof cents !== "bigint") return metric(label, null, help);
    const word = cents === 0n ? "none" : tag;
    const cls = cents === 0n ? "flat" : "loss";
    return '<div class="metric"><h3>' + ST.escapeHtml(label) + '</h3><div class="value ' + cls + '">' +
      ST.escapeHtml(ST.formatCents(cents, "plain")) + ' <span class="tag">' + ST.escapeHtml(word) + "</span></div><p class=\"def\">" +
      ST.escapeHtml(help) + "</p></div>";
  }

  function metricText(label, text, help) {
    const value = text == null
      ? '<div class="value na">N/A <span class="tag">not enough data</span></div>'
      : '<div class="value flat">' + ST.escapeHtml(text) + "</div>";
    return '<div class="metric"><h3>' + ST.escapeHtml(label) + "</h3>" + value + '<p class="def">' + ST.escapeHtml(help) + "</p></div>";
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
      return '<div class="metric wide"><h3>' + ST.escapeHtml(title) + '</h3><div class="value na">N/A <span class="tag">not enough data</span></div><p class="def">' + ST.escapeHtml(help) + "</p></div>";
    }
    const items = rows.map(function (row) {
      return "<li><span><strong>" + ST.escapeHtml(row.label) + "</strong> <span class=\"tag\">" + row.trades + " " + (row.trades === 1 ? "trade" : "trades") + "</span></span>" + moneyHtml(row.netCents) + "</li>";
    }).join("");
    return '<div class="metric wide"><h3>' + ST.escapeHtml(title) + '</h3><p class="def">' + ST.escapeHtml(help) + '</p><ul class="perf-list">' + items + "</ul></div>";
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

  function barSvg(points, title) {
    const rows = (points || []).filter(function (point) { return typeof point.cents === "bigint"; });
    if (!rows.length) {
      return '<p class="def">N/A — not enough dated closed trades to draw this chart. Totals above are recorded results, not account equity.</p>';
    }
    const width = 640;
    const height = 148;
    const pad = 8;
    let min = 0;
    let max = 0;
    rows.forEach(function (point) {
      const value = Number(point.cents);
      if (value < min) min = value;
      if (value > max) max = value;
    });
    const span = (max - min) || 1;
    const gap = 3;
    const barWidth = Math.max(2, ((width - pad * 2) - gap * (rows.length - 1)) / rows.length);
    const zeroY = pad + ((max - 0) * (height - pad * 2)) / span;
    const rects = rows.map(function (point, index) {
      const value = Number(point.cents);
      const yValue = pad + ((max - value) * (height - pad * 2)) / span;
      const top = Math.min(yValue, zeroY);
      const barHeight = Math.max(1, Math.abs(zeroY - yValue));
      const x = pad + index * (barWidth + gap);
      const cls = value > 0 ? "up" : value < 0 ? "down" : "flatbar";
      return '<rect class="' + cls + '" x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + barHeight.toFixed(1) + '"><title>' +
        ST.escapeHtml(point.label + " " + ST.formatCents(point.cents)) + "</title></rect>";
    }).join("");
    const label = title + " from " + rows[0].label + " to " + rows[rows.length - 1].label + ". Realized closed-trade results only. Not account equity.";
    return '<svg class="bars" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="' + ST.escapeHtml(label) + '"><line class="zero" x1="' + pad + '" y1="' + zeroY.toFixed(1) + '" x2="' + (width - pad) + '" y2="' + zeroY.toFixed(1) + '"></line>' + rects + "</svg>";
  }

  function curveSvg(curve) {
    if (!curve || curve.length < 2) {
      return '<p class="def">N/A — at least two dated closed-trade days are needed to draw a curve. Any total above is cumulative closed-trade P/L, not account equity.</p>';
    }
    const width = 640;
    const height = 140;
    const pad = 10;
    let min = 0;
    let max = 0;
    curve.forEach(function (point) {
      const value = Number(point.cents);
      if (value < min) min = value;
      if (value > max) max = value;
    });
    const span = (max - min) || 1;
    const coords = curve.map(function (point, index) {
      const x = pad + (index * (width - pad * 2)) / (curve.length - 1);
      const y = pad + ((max - Number(point.cents)) * (height - pad * 2)) / span;
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    const zeroY = pad + ((max - 0) * (height - pad * 2)) / span;
    const end = curve[curve.length - 1];
    const label = "Cumulative closed-trade P/L from " + curve[0].date + " to " + end.date + ", ending at " + ST.formatCents(end.cents) + ". This is not account equity.";
    return '<svg class="curve" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="' + ST.escapeHtml(label) + '"><line class="zero" x1="' + pad + '" y1="' + zeroY.toFixed(1) + '" x2="' + (width - pad) + '" y2="' + zeroY.toFixed(1) + '"></line><polyline points="' + coords + '"></polyline></svg>';
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
        if (detail.tradeCents != null) classes.push(ST.pnlWord(detail.tradeCents));
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

  function drawSymbolChrome() {
    const settings = state.data.settings || {};
    const fallback = state.data.trades.find(function (trade) { return trade.symbol; });
    const symbol = settings.selectedSymbol || (fallback && fallback.symbol) || "";
    const exchange = settings.selectedExchange || "";
    setIfIdle("symbolSearch", symbol);
    setIfIdle("symbolExchange", exchange);
    const hint = symbol && ST.EXCHANGE_HINTS ? ST.EXCHANGE_HINTS[symbol] : "";
    const hintBtn = document.getElementById("exchangeHint");
    const hintText = document.getElementById("exchangeHintText");
    if (hint && !exchange) {
      hintBtn.hidden = false;
      hintBtn.setAttribute("data-exchange", hint);
      hintBtn.textContent = "Use " + hint;
      hintText.textContent = "Suggested exchange " + hint + " for " + symbol + ". It is a venue hint, not a quote.";
    } else {
      hintBtn.hidden = true;
      hintText.textContent = symbol ? "Exchange is optional. A blank exchange sends the ticker alone." : "Enter a ticker to load a chart.";
    }
    const symbols = { AAPL: true, NVDA: true, SOFI: true, TSLA: true, MSFT: true };
    state.data.trades.forEach(function (trade) { if (trade.symbol) symbols[trade.symbol] = true; });
    (settings.watchlist || []).forEach(function (item) { if (item.symbol) symbols[item.symbol] = true; });
    document.getElementById("symbolSuggestions").innerHTML = Object.keys(symbols).sort().map(function (item) {
      return '<option value="' + ST.escapeHtml(item) + '"></option>';
    }).join("");
    document.querySelectorAll("[data-period]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.dataset.period === (settings.chartPeriod || "6M") ? "true" : "false");
    });
  }

  function drawSymbolDetail() {
    const settings = state.data.settings || {};
    const fallback = state.data.trades.find(function (trade) { return trade.symbol; });
    const symbol = settings.selectedSymbol || (fallback && fallback.symbol) || "";
    const body = document.getElementById("symbolDetailBody");
    if (!symbol) {
      body.innerHTML = '<p class="empty" id="symbolDetailName">Choose a symbol. Market value stays N/A.</p>';
      return;
    }
    const metrics = ST.analyze(state.data, { symbol: symbol });
    const trades = state.data.trades.filter(function (trade) { return trade.symbol === symbol; });
    let unrealized = null;
    let unmarked = 0;
    trades.forEach(function (trade) {
      const books = ST.positionAccounting(trade);
      if (books.unrealizedReason === "manual-mark" && typeof books.unrealizedCents === "bigint") {
        unrealized = (unrealized == null ? 0n : unrealized) + books.unrealizedCents;
      } else if (books.remainingQty != null && books.remainingQty > 0) unmarked += 1;
    });
    body.innerHTML = '<p class="meta" id="symbolDetailName"><strong>' + ST.escapeHtml(symbol) + "</strong>" +
      (settings.selectedExchange ? " · " + ST.escapeHtml(settings.selectedExchange) : "") + "</p>" +
      '<div class="stats">' +
        stat("Realized, this symbol", metrics.realizedNetCents, "id=\"symbolRealized\"") +
        '<div class="stat" id="symbolUnrealized"><div class="label">Unrealized, manual marks</div>' +
          (unrealized == null ? '<div class="value na">N/A <span class="tag">no manual mark</span></div>' : moneyHtml(unrealized)) +
        "</div>" +
        '<div class="stat"><div class="label">Market price</div><div class="value na">N/A <span class="tag">not read from the chart</span></div></div></div>' +
      '<p class="hint">' + (unmarked
        ? ST.escapeHtml(unmarked + " open position" + (unmarked === 1 ? " has" : "s have") + " no manual mark.")
        : "Unrealized P/L uses only a mark you type.") + "</p>" +
      (trades.length
        ? '<ul class="perf-list">' + trades.map(function (trade) {
          const books = ST.positionAccounting(trade);
          return "<li><span><strong>" + ST.escapeHtml(trade.symbol) + "</strong> " + ST.escapeHtml(trade.status) + " " + ST.escapeHtml(trade.direction) +
            "</span><span>" + ST.escapeHtml(books.remainingQty == null ? "quantity N/A" : ST.formatShares(books.remainingQty) + " left") + "</span></li>";
        }).join("") + "</ul>"
        : '<p class="empty">No saved trades for this symbol. The chart can still load. Nothing is added until you save a trade.</p>');
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

  function tapeItems(journal) {
    const settings = journal.settings || {};
    if (settings.watchlist && settings.watchlist.length) return settings.watchlist.slice(0, 12);
    const items = [];
    const seen = Object.create(null);
    (journal.trades || []).forEach(function (trade) {
      if (!trade.symbol || seen[trade.symbol] || items.length >= 12) return;
      seen[trade.symbol] = true;
      items.push({ symbol: trade.symbol, exchange: trade.exchange || (ST.EXCHANGE_HINTS && ST.EXCHANGE_HINTS[trade.symbol]) || "" });
    });
    return items;
  }

  function syncWidgets(current) {
    if (!current || current.tab !== "markets" || !ST.mountChart) return;
    const settings = current.data.settings || {};
    const fallback = current.data.trades.find(function (trade) { return trade.symbol; });
    const symbol = settings.selectedSymbol || (fallback && fallback.symbol) || "";
    const exchange = settings.selectedExchange || (symbol && ST.EXCHANGE_HINTS && ST.EXCHANGE_HINTS[symbol]) || "";
    const theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    const chart = document.getElementById("chartMount");
    if (!symbol) {
      chart.innerHTML = '<div class="chart-fallback" role="status"><p><strong>No symbol selected</strong></p><p>Enter a ticker to load a chart. No price is invented.</p></div>';
      chart.setAttribute("data-widget-state", "empty");
      chart.removeAttribute("data-widget-config");
    } else {
      const config = ST.chartWidgetConfig(symbol, exchange, settings.chartPeriod || "6M", theme);
      chart.setAttribute("aria-label", "Price chart for " + config.symbol);
      ST.mountChart(chart, config);
    }
    const items = tapeItems(current.data);
    ST.mountTape(document.getElementById("tapeMount"), ST.tapeWidgetConfig(items, theme));
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
