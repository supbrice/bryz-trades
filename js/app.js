/* Wire the page to localStorage. No network, no orders. */
(function (root) {
  const ST = root.StockTracker;
  const now = new Date();
  const state = {
    data: { version: 1, tickers: [], days: {} },
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    year: now.getFullYear(),
    month: now.getMonth(),
    tab: "calendar"
  };

  function persist() {
    try {
      ST.saveState(state.data);
    } catch (err) {
      ST.showBanner("Couldn't save on this device. Export a backup if you can.", true);
    }
  }

  function refresh() {
    ST.draw(state);
  }

  function showMonthOf(key) {
    const date = ST.parseDateKey(key);
    if (!date) return;
    state.year = date.getFullYear();
    state.month = date.getMonth();
    state.tab = "calendar";
  }

  ST.bind({
    setTab: function (tab) {
      state.tab = tab;
      refresh();
    },
    addTicker: function () {
      ST.openTickerDialog(null);
    },
    editTicker: function (id) {
      const ticker = state.data.tickers.find(function (item) { return item.id === id; });
      if (ticker) ST.openTickerDialog(ticker);
    },
    removeTicker: function (id) {
      const ticker = state.data.tickers.find(function (item) { return item.id === id; });
      if (!ticker) return;
      const ok = window.confirm("Remove " + ticker.symbol + " from the tracker? Past calendar days stay. This does not sell shares.");
      if (!ok) return;
      state.data.tickers = state.data.tickers.filter(function (item) { return item.id !== id; });
      persist();
      refresh();
    },
    saveTicker: function (fields, existingId) {
      const built = ST.tickerFromFields(fields, existingId);
      if (built.error) return built;
      const duplicate = state.data.tickers.some(function (item) {
        return item.symbol === built.ticker.symbol && item.id !== built.ticker.id;
      });
      if (duplicate) return { error: built.ticker.symbol + " is already on the list." };
      if (existingId) {
        state.data.tickers = state.data.tickers.map(function (item) {
          return item.id === existingId ? built.ticker : item;
        });
      } else {
        state.data.tickers.push(built.ticker);
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
      refresh();
    },
    goToday: function () {
      state.year = state.today.getFullYear();
      state.month = state.today.getMonth();
      state.tab = "calendar";
      refresh();
    },
    openDay: function (key) {
      ST.openDayDialog(key, state.data.days[key] || null, state.data.tickers);
    },
    saveDay: function (key, fields) {
      const built = ST.dayFromFields(fields);
      if (built.error) return built;
      state.data.days[key] = built.day;
      showMonthOf(key);
      persist();
      refresh();
      return { ok: true };
    },
    clearDay: function (key) {
      if (!state.data.days[key]) return { ok: true };
      const ok = window.confirm("Remove the result for this day?");
      if (!ok) return { cancelled: true };
      delete state.data.days[key];
      persist();
      refresh();
      return { ok: true };
    },
    exportData: function () {
      const json = ST.exportJson(state.data);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "stock-tracker-" + ST.dateKey(state.today) + ".json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      ST.showBanner("Backup downloaded.");
    },
    importText: function (text) {
      let data;
      try {
        data = ST.parseImport(text);
      } catch (err) {
        ST.showBanner(err.message || "Couldn't read that file.", true);
        return;
      }
      const stocks = data.tickers.length;
      const dayCount = Object.keys(data.days).length;
      const ok = window.confirm(
        "Replace everything in this browser with the backup (" + stocks + " stocks, " + dayCount + " days)?"
      );
      if (!ok) return;
      state.data = data;
      const keys = Object.keys(data.days).sort();
      const monthPrefix = ST.dateKey(state.today).slice(0, 7);
      if (keys.some(function (key) { return key.indexOf(monthPrefix) === 0; })) {
        state.year = state.today.getFullYear();
        state.month = state.today.getMonth();
      } else if (keys.length) {
        showMonthOf(keys[keys.length - 1]);
      }
      state.tab = "calendar";
      persist();
      refresh();
      ST.showBanner("Backup restored.");
    }
  });

  const loaded = ST.loadState();
  state.data = loaded.data;
  refresh();
  if (loaded.warning) ST.showBanner(loaded.warning, true);
})(typeof globalThis !== "undefined" ? globalThis : this);
