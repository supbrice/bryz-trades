/* Wire the journal to this browser. No network and no orders. */
(function (root) {
  const ST = root.StockTracker;
  const now = new Date();
  const state = {
    data: ST.emptyJournal(),
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    year: now.getFullYear(),
    month: now.getMonth(),
    tab: "dashboard",
    positionFilter: "all",
    positionSymbol: "",
    positionDirection: "all",
    positionStrategy: "",
    positionFrom: "",
    positionTo: "",
    overviewPreset: "ytd",
    overviewFrom: "",
    overviewTo: "",
    analyticsSymbol: "",
    analyticsStatus: "all",
    analyticsPane: "overview",
    rangePreset: "ytd",
    rangeFrom: "",
    rangeTo: ""
  };

  function persist() {
    try {
      ST.saveState(state.data);
      ST.setSaveState("Saved on this device");
    } catch (err) {
      ST.setSaveState("Not saved");
      ST.showBanner("Couldn't save on this device. Export a backup from Settings if you can.", true);
    }
  }

  function refresh() {
    ST.draw(state);
  }

  function findTrade(id) {
    return state.data.trades.find(function (trade) { return trade.id === id; });
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type: type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function stamp() {
    return ST.dateKey(state.today);
  }

  ST.bind({
    setTab: function (tab) {
      state.tab = tab;
      refresh();
    },
    setFilter: function (filter) {
      if (filter && typeof filter === "object") {
        if (filter.filter != null) state.positionFilter = filter.filter || "all";
        if (filter.symbol != null) state.positionSymbol = filter.symbol || "";
        if (filter.direction != null) state.positionDirection = filter.direction || "all";
        if (filter.strategy != null) state.positionStrategy = filter.strategy || "";
        if (filter.from != null) state.positionFrom = filter.from || "";
        if (filter.to != null) state.positionTo = filter.to || "";
      } else {
        state.positionFilter = filter;
      }
      state.tab = "positions";
      refresh();
    },
    setOverview: function (range) {
      if (range.preset) state.overviewPreset = range.preset;
      if (range.from != null) state.overviewFrom = range.from;
      if (range.to != null) state.overviewTo = range.to;
      state.tab = "dashboard";
      refresh();
    },
    setAnalyticsPane: function (pane) {
      const allowed = { overview: true, symbol: true, strategy: true, time: true };
      if (!allowed[pane]) return;
      state.analyticsPane = pane;
      state.tab = "analytics";
      refresh();
    },
    setAnalytics: function (query) {
      state.analyticsSymbol = query && query.symbol || "";
      state.analyticsStatus = query && query.status || "all";
      state.tab = "analytics";
      refresh();
    },
    selectSymbol: function (input) {
      const symbol = String(input && input.symbol || "").trim().replace(/^\$/, "").toUpperCase();
      const exchange = String(input && input.exchange || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
      if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) {
        ST.showBanner("Enter a ticker like AAPL or BRK.B.", true);
        return;
      }
      state.data.settings = Object.assign({}, state.data.settings, {
        selectedSymbol: symbol,
        selectedExchange: exchange
      });
      state.tab = "markets";
      persist();
      refresh();
    },
    setPeriod: function (period) {
      const allowed = { "1D": true, "5D": true, "1M": true, "6M": true, YTD: true, "1Y": true, "5Y": true, MAX: true };
      if (!allowed[period]) return;
      state.data.settings = Object.assign({}, state.data.settings, { chartPeriod: period });
      state.tab = "markets";
      persist();
      refresh();
    },
    addWatch: function (input) {
      const symbol = String(input && input.symbol || "").trim().replace(/^\$/, "").toUpperCase();
      const exchange = String(input && input.exchange || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
      if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) {
        ST.showBanner("Enter a ticker before adding it to the watchlist.", true);
        return;
      }
      const settings = Object.assign({}, state.data.settings);
      const watch = (settings.watchlist || []).slice();
      if (!watch.some(function (item) { return item.symbol === symbol; })) {
        watch.push({ symbol: symbol, exchange: exchange });
      }
      settings.watchlist = watch;
      settings.selectedSymbol = symbol;
      settings.selectedExchange = exchange;
      state.data.settings = settings;
      state.tab = "markets";
      persist();
      refresh();
    },
    removeWatch: function (symbol) {
      const settings = Object.assign({}, state.data.settings);
      settings.watchlist = (settings.watchlist || []).filter(function (item) { return item.symbol !== symbol; });
      state.data.settings = settings;
      persist();
      refresh();
    },
    setRange: function (range) {
      if (range.preset) state.rangePreset = range.preset;
      if (range.from != null) state.rangeFrom = range.from;
      if (range.to != null) state.rangeTo = range.to;
      state.tab = "analytics";
      refresh();
    },
    addTrade: function () {
      ST.openTradeDialog(null, "create");
    },
    editTrade: function (id) {
      const trade = findTrade(id);
      if (trade) ST.openTradeDialog(trade, "edit");
    },
    reviewTrade: function (id) {
      const trade = findTrade(id);
      if (trade) ST.openTradeDialog(trade, "review");
    },
    closeTrade: function (id) {
      const trade = findTrade(id);
      if (trade) ST.openTradeDialog(trade, "close");
    },
    removeTrade: function (id) {
      const trade = findTrade(id);
      if (!trade) return { ok: false };
      const ok = window.confirm("Delete " + trade.symbol + "? This removes the trade from realized totals. It does not place an order.");
      if (!ok) return { cancelled: true };
      state.data.trades = state.data.trades.filter(function (item) { return item.id !== id; });
      state.tab = "positions";
      persist();
      refresh();
      return { ok: true };
    },
    saveTrade: function (fields, existingId) {
      const built = ST.tradeFromFields(fields, existingId);
      if (built.error) return built;
      if (existingId) {
        state.data.trades = state.data.trades.map(function (item) {
          return item.id === existingId ? built.trade : item;
        });
      } else {
        state.data.trades.push(built.trade);
      }
      state.tab = "positions";
      persist();
      refresh();
      return { ok: true };
    },
    shiftMonth: function (delta) {
      const next = new Date(state.year, state.month + delta, 1);
      state.year = next.getFullYear();
      state.month = next.getMonth();
      state.tab = "calendar";
      refresh();
    },
    goToday: function () {
      state.year = state.today.getFullYear();
      state.month = state.today.getMonth();
      state.tab = "calendar";
      refresh();
    },
    openDay: function (key) {
      ST.openDayDialog(key, state.data.days[key] || null);
    },
    saveDay: function (key, fields) {
      const built = ST.dayFromFields(fields);
      if (built.error) return built;
      const day = built.day;
      const empty = day.manualPnl == null && !day.note && !(day.breakdown && day.breakdown.length) && day.adjustment == null && !day.adjustmentNote;
      if (empty) delete state.data.days[key];
      else state.data.days[key] = day;
      const date = ST.parseDateKey(key);
      if (date) {
        state.year = date.getFullYear();
        state.month = date.getMonth();
      }
      state.tab = "calendar";
      persist();
      refresh();
      return { ok: true };
    },
    clearDay: function (key) {
      if (!state.data.days[key]) return { ok: true };
      const ok = window.confirm("Remove the manual entry and account adjustment for this day? Closed trades stay.");
      if (!ok) return { cancelled: true };
      delete state.data.days[key];
      persist();
      refresh();
      return { ok: true };
    },
    exportJson: function () {
      download("bryz-trades-" + stamp() + ".json", ST.exportJson(state.data), "application/json");
      ST.showBanner("JSON backup downloaded. It stays on this device unless you move the file.");
    },
    exportTradesCsv: function () {
      download("bryz-trades-trades-" + stamp() + ".csv", ST.tradesToCsv(state.data), "text/csv");
      ST.showBanner("Trades CSV downloaded.");
    },
    exportDaysCsv: function () {
      download("bryz-trades-days-" + stamp() + ".csv", ST.dailyToCsv(state.data), "text/csv");
      ST.showBanner("Daily summary CSV downloaded.");
    },
    importText: function (text) {
      const plan = ST.planImport(state.data, text);
      if (!plan.ok) {
        ST.showBanner(plan.error || "Couldn't read that file. Nothing was changed.", true);
        return;
      }
      ST.openImportDialog(plan);
    },
    applyImport: function (plan, choices) {
      try {
        state.data = ST.commitImport(localStorage, state.data, plan, choices);
      } catch (err) {
        return { error: err.message || "Import failed. Nothing was changed." };
      }
      state.tab = "dashboard";
      refresh();
      ST.setSaveState("Saved on this device");
      ST.showBanner(choices.mode === "replace" ? "Journal replaced. The previous copy is still backed up in this browser." : "Import merged. Matching trades were not counted twice.");
      return { ok: true };
    },
    calculateRisk: function (input) {
      const result = ST.positionRisk(input);
      const box = document.getElementById("riskResult");
      if (!result.ok) {
        box.innerHTML = '<p class="form-error">' + ST.escapeHtml(result.error) + "</p>";
        return;
      }
      let reward = "";
      if (result.rewardCents != null) {
        reward = "<p>Potential reward " + ST.escapeHtml(ST.formatCents(result.rewardCents)) +
          ". Reward per share " + ST.escapeHtml(ST.formatCents(result.rewardPerShareCents)) +
          ". Reward to risk " + ST.escapeHtml(result.rewardToRisk || "N/A") + ".</p>";
      } else if (result.rewardNote) {
        reward = "<p>" + ST.escapeHtml(result.rewardNote) + "</p>";
      }
      box.innerHTML = "<h3>Estimated size</h3><p>Planned risk " + ST.escapeHtml(ST.formatCents(result.plannedRiskCents)) +
        (result.equityPercent ? " (" + ST.escapeHtml(result.equityPercent) + " of the account size you entered)" : "") +
        ". Risk per share " + ST.escapeHtml(ST.formatCents(result.perShareRiskCents)) +
        ". Quantity " + ST.escapeHtml(result.quantityText) + " shares.</p>" + reward +
        "<p>" + ST.escapeHtml(result.disclaimer) + "</p>";
      if (input.remember) {
        const account = ST.moneyNumber(input.accountSize);
        const percent = ST.scaledToNumber(ST.parseScaledDigits(input.riskPercent, 2), 2);
        state.data.settings = Object.assign({}, state.data.settings, {
          accountSize: account,
          riskPercent: percent
        });
        persist();
      }
    }
  });

  const loaded = ST.loadState();
  state.data = loaded.data;
  if (loaded.unsaved) ST.setSaveState("Not saved");
  refresh();
  if (loaded.warning) ST.showBanner(loaded.warning, true);
})(typeof globalThis !== "undefined" ? globalThis : this);
