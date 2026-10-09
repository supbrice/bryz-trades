/* Draw the journal and the edit sheets. */
(function (root) {
  const ST = root.StockTracker = root.StockTracker || {};
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const TABS = ["dashboard", "positions", "calendar", "analytics", "settings"];

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
    document.getElementById("positionFilter").addEventListener("change", function () { handlers.setFilter(this.value); });
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
    document.getElementById("fieldSymbol").value = trade ? trade.symbol : "";
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

  function drawDashboard() {
    const todayKey = ST.dateKey(state.today);
    const ytd = ST.rangeForPreset("ytd", state.today);
    const ytdMetrics = ST.analyze(state.data, { start: ytd.start, end: ytd.end });
    const all = ST.analyze(state.data);
    const today = ST.dayDetail(state.data, todayKey);
    const openCount = state.data.trades.filter(function (trade) { return trade.status === "open"; }).length;
    const recent = all.curve.slice().reverse().slice(0, 1);
    const closed = state.data.trades.map(ST.tradeResult).filter(function (result) { return result.included; }).sort(function (a, b) {
      return (b.exitDate || "").localeCompare(a.exitDate || "");
    }).slice(0, 5);
    const recentHtml = closed.length
      ? '<h3 class="section-title">Recent closed trades</h3><ul class="perf-list">' + closed.map(function (result) {
        const trade = state.data.trades.find(function (item) { return item.id === result.id; });
        return "<li><span><strong>" + ST.escapeHtml(result.symbol) + "</strong> " + ST.escapeHtml(result.exitDate || "no exit date") + "</span>" + moneyHtml(result.netCents) + "</li>";
      }).join("") + "</ul>"
      : '<p class="empty">No closed trades yet. Open positions stay off realized profit and loss until you record an exit.</p>';
    document.getElementById("dashboardBody").innerHTML =
      '<div class="stats">' +
        stat("Year to date, closed trades", ytdMetrics.realizedNetCents, "id=\"dashYtd\"") +
        stat("All dated closes", all.realizedNetCents, "id=\"dashRealized\"") +
        '<div class="stat" id="dashOpen"><div class="label">Open trades</div><div class="value flat">' + openCount + ' <span class="tag">not realized</span></div></div>' +
        stat("Today, closed trades", today.tradeCents, "id=\"dashTodayTrades\"") +
        stat("Today, manual entry", today.manualCents, "id=\"dashTodayManual\"") +
        '<div class="stat record"><div class="label">Best and worst dated day, year to date</div><div class="extremes">' +
          extreme("Best", ytdMetrics.bestDay) + extreme("Worst", ytdMetrics.worstDay) +
        "</div></div></div>" + recentHtml +
      (recent.length ? "" : "");
  }

  function drawPositions() {
    document.getElementById("positionFilter").value = state.positionFilter || "all";
    const filter = state.positionFilter || "all";
    const trades = state.data.trades.filter(function (trade) { return filter === "all" || trade.status === filter; });
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
    const closeBtn = trade.status === "open"
      ? '<button type="button" data-close-trade="' + ST.escapeHtml(trade.id) + '">Close</button>'
      : "";
    return '<article class="stock-card"><h3>' + ST.escapeHtml(trade.symbol) +
      ' <span class="dir">' + (trade.direction === "short" ? "Short" : "Long") + "</span></h3>" +
      '<p class="pill ' + trade.status + '">' + ST.escapeHtml(help.summary) + "</p>" +
      '<p class="card-notes">' + ST.escapeHtml(help.detail) + "</p>" +
      '<p class="meta">' + ST.escapeHtml(bits.join(" · ")) + "</p>" +
      (plans.length ? '<p class="levels">' + ST.escapeHtml(plans.join(" · ")) + "</p>" : "") +
      (trade.name ? '<p class="meta">' + ST.escapeHtml(trade.name) + "</p>" : "") +
      pill +
      (trade.notes ? '<p class="card-notes">' + ST.escapeHtml(trade.notes) + "</p>" : "") +
      '<div class="card-actions">' +
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
    const metrics = ST.analyze(state.data, { start: start, end: end });
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
    body.push('<div class="metric wide"><h3>Cumulative closed-trade P/L</h3><p class="def">' + ST.escapeHtml(ST.METRIC_HELP.cumulative) + "</p>" + curveSvg(metrics.curve) + "</div>");
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
    const view = document.getElementById("view-settings");
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
    return "<h3>Closed trades</h3><ul class=\"perf-list\">" + rows + "</ul><p>Total " + ST.escapeHtml(ST.formatCents(detail.tradeCents)) + " " + ST.pnlWord(detail.tradeCents) + ". Edit a trade from Positions. This total is not added to the manual entry.</p>";
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
      name: valueOf("fieldName"),
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
