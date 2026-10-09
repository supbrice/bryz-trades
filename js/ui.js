/* Draw the positions list, calendar, and the two edit sheets. */
(function (root) {
  const ST = root.StockTracker = root.StockTracker || {};
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  let handlers = {};
  let state = null;
  let editingId = null;
  let editingDayKey = null;
  let currentTickers = [];
  let bannerTimer = 0;

  ST.bind = function (next) {
    handlers = next;

    document.getElementById("addTickerBtn").addEventListener("click", function () {
      handlers.addTicker();
    });
    document.getElementById("prevMonth").addEventListener("click", function () {
      handlers.shiftMonth(-1);
    });
    document.getElementById("nextMonth").addEventListener("click", function () {
      handlers.shiftMonth(1);
    });
    document.getElementById("todayBtn").addEventListener("click", function () {
      handlers.goToday();
    });
    document.getElementById("logTodayBtn").addEventListener("click", function () {
      handlers.openDay(ST.dateKey(state.today));
    });
    document.getElementById("exportBtn").addEventListener("click", function () {
      handlers.exportData();
    });
    document.getElementById("importBtn").addEventListener("click", function () {
      document.getElementById("importFile").click();
    });
    document.getElementById("importFile").addEventListener("change", function () {
      const file = this.files && this.files[0];
      this.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () { handlers.importText(String(reader.result || "")); };
      reader.onerror = function () { ST.showBanner("Couldn't read that file.", true); };
      reader.readAsText(file);
    });

    document.getElementById("tickerForm").addEventListener("submit", onTickerSubmit);
    document.getElementById("dayForm").addEventListener("submit", onDaySubmit);
    document.getElementById("clearDayBtn").addEventListener("click", function () {
      const result = handlers.clearDay(editingDayKey);
      if (result && result.ok) document.getElementById("dayDialog").close();
    });
    document.getElementById("signGain").addEventListener("click", function () {
      setSign(false);
      updateSplitHint();
    });
    document.getElementById("signLoss").addEventListener("click", function () {
      setSign(true);
      updateSplitHint();
    });
    document.getElementById("dayAmount").addEventListener("input", function () {
      if (String(this.value).trim().startsWith("-")) setSign(true);
      updateSplitHint();
    });
    document.getElementById("addSplitBtn").addEventListener("click", function () {
      if (!currentTickers.length) {
        showFormError("dayError", "Add a stock first if you want a split. The daily total can be saved on its own.");
        return;
      }
      document.getElementById("splitRows").insertAdjacentHTML("beforeend", splitRowHtml(currentTickers, null));
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

    ["fieldOrder", "fieldClose", "fieldGetOut", "fieldHardStop"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", function () {
        syncFillField();
        updateStatusPreview();
      });
      document.getElementById(id).addEventListener("change", function () {
        syncFillField();
        updateStatusPreview();
      });
    });

    document.addEventListener("click", function (event) {
      const closer = event.target.closest("[data-close-dialog]");
      if (closer) {
        const dialog = closer.closest("dialog");
        if (dialog) dialog.close();
        return;
      }
      const tab = event.target.closest("[data-tab]");
      if (tab) {
        handlers.setTab(tab.dataset.tab);
        return;
      }
      const day = event.target.closest("[data-day]");
      if (day) {
        handlers.openDay(day.dataset.day);
        return;
      }
      const edit = event.target.closest("[data-edit]");
      if (edit) {
        handlers.editTicker(edit.dataset.edit);
        return;
      }
      const remove = event.target.closest("[data-remove]");
      if (remove) handlers.removeTicker(remove.dataset.remove);
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
    drawPositions();
    drawCalendar();
  };

  ST.showBanner = function (message, isError) {
    const el = document.getElementById("banner");
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle("error", !!isError);
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(function () { el.hidden = true; }, isError ? 7000 : 3200);
  };

  ST.openTickerDialog = function (ticker) {
    editingId = ticker ? ticker.id : null;
    document.getElementById("tickerDialogTitle").textContent = ticker ? "Edit " + ticker.symbol : "Add stock";
    document.getElementById("tickerSaveBtn").textContent = ticker ? "Save changes" : "Add stock";
    document.getElementById("fieldSymbol").value = ticker ? ticker.symbol : "";
    setNumber("fieldShares", ticker && ticker.shares);
    setNumber("fieldAvg", ticker && ticker.avgCost);
    document.getElementById("fieldNotes").value = ticker ? ticker.notes || "" : "";
    setNumber("fieldGetIn", ticker && ticker.getIn);
    setNumber("fieldGetOut", ticker && ticker.getOut);
    setNumber("fieldHardStop", ticker && ticker.hardStop);
    document.getElementById("fieldOrder").value = ticker && ticker.orderStatus ? ticker.orderStatus : "";
    setNumber("fieldFill", ticker && ticker.fillPrice);
    setNumber("fieldClose", ticker && ticker.close);
    const used = !!(ticker && (
      ticker.getIn != null || ticker.getOut != null || ticker.hardStop != null ||
      ticker.orderStatus || ticker.fillPrice != null || ticker.close != null
    ));
    document.getElementById("levelsDetails").open = used;
    hideFormError("tickerError");
    syncFillField();
    updateStatusPreview();
    document.getElementById("tickerDialog").showModal();
    document.getElementById("fieldSymbol").focus();
  };

  ST.openDayDialog = function (key, entry, tickers) {
    editingDayKey = key;
    currentTickers = tickers || [];
    const date = ST.parseDateKey(key);
    document.getElementById("dayDialogTitle").textContent = date ? ST.formatLongDate(date) : key;
    const amount = document.getElementById("dayAmount");
    if (entry) {
      amount.value = formatAbs(entry.pnl);
      setSign(entry.pnl < 0);
      document.getElementById("dayNote").value = entry.note || "";
      renderSplits(entry.breakdown || []);
    } else {
      amount.value = "";
      setSign(false);
      document.getElementById("dayNote").value = "";
      renderSplits([]);
    }
    document.getElementById("clearDayBtn").hidden = !entry;
    document.getElementById("addSplitBtn").disabled = currentTickers.length === 0;
    hideFormError("dayError");
    updateSplitHint();
    document.getElementById("dayDialog").showModal();
    amount.focus();
  };

  function drawTabs() {
    document.getElementById("positionsView").classList.toggle("active", state.tab === "positions");
    document.getElementById("calendarView").classList.toggle("active", state.tab === "calendar");
    document.querySelectorAll("[data-tab]").forEach(function (btn) {
      const on = btn.dataset.tab === state.tab;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function drawPositions() {
    const list = document.getElementById("positionsList");
    const tickers = state.data.tickers;
    if (!tickers.length) {
      list.innerHTML = '<p class="empty">No stocks yet. Add one to track shares, average cost, and optional levels.</p>';
      return;
    }
    list.innerHTML = tickers.map(function (ticker) {
      const status = ST.computeStatus(ticker);
      const bits = [];
      if (ticker.shares != null) bits.push(ST.escapeHtml(ST.formatShares(ticker.shares)));
      if (ticker.avgCost != null) bits.push("avg " + ST.escapeHtml(ST.formatPlainMoney(ticker.avgCost)));
      if (ticker.shares != null && ticker.avgCost != null) {
        bits.push("basis " + ST.escapeHtml(ST.formatPlainMoney(ticker.shares * ticker.avgCost)));
      }
      if (ticker.close != null) bits.push("close " + ST.escapeHtml(ST.formatPlainMoney(ticker.close)));
      const meta = bits.length ? bits.join(" · ") : "No share count yet";
      const hasLevels = ticker.getIn != null || ticker.getOut != null || ticker.hardStop != null;
      const levels = hasLevels
        ? '<p class="levels">Get-in ' + moneyOrDash(ticker.getIn) + " · Get-out " + moneyOrDash(ticker.getOut) + " · Hard stop " + moneyOrDash(ticker.hardStop) + "</p>"
        : "";
      const pill = status ? '<p class="pill ' + status.kind + '">' + ST.escapeHtml(status.text) + "</p>" : "";
      const notes = ticker.notes ? '<p class="card-notes">' + ST.escapeHtml(ticker.notes) + "</p>" : "";
      return '<article class="stock-card">' +
        '<h3>' + ST.escapeHtml(ticker.symbol) + "</h3>" +
        '<p class="meta">' + meta + "</p>" +
        levels + pill + notes +
        '<div class="card-actions">' +
          '<button type="button" data-edit="' + ST.escapeHtml(ticker.id) + '">Edit</button>' +
          '<button type="button" data-remove="' + ST.escapeHtml(ticker.id) + '">Remove</button>' +
        "</div></article>";
    }).join("");
  }

  function drawCalendar() {
    const summary = ST.summarizeMonth(state.data.days, state.year, state.month, state.today);
    document.getElementById("monthLabel").textContent = ST.formatMonthYear(state.year, state.month);
    const onThisMonth = state.year === state.today.getFullYear() && state.month === state.today.getMonth();
    document.getElementById("todayBtn").hidden = onThisMonth;
    const todayKey = ST.dateKey(state.today);
    document.getElementById("logTodayBtn").textContent = state.data.days[todayKey] ? "Edit today" : "Log today";
    document.getElementById("summary").innerHTML = summaryHtml(summary);
    document.getElementById("weekList").innerHTML = weekHtml(summary.weeks);
    document.getElementById("calendarGrid").setAttribute("aria-label", ST.formatMonthYear(state.year, state.month));
    document.getElementById("calendarGrid").innerHTML = calendarHtml();
  }

  function summaryHtml(summary) {
    const record = countPhrase(summary.wins, "win day", "win days") + " · " +
      countPhrase(summary.losses, "loss day", "loss days") +
      (summary.flats ? " · " + countPhrase(summary.flats, "flat day", "flat days") : "");
    return '<div class="stats">' +
      statCard("This month", summary.monthTotal) +
      statCard(summary.ytdLabel, summary.ytdTotal) +
      '<div class="stat record"><div class="label">Record</div><p class="record-line">' + ST.escapeHtml(record) + "</p>" +
        '<div class="extremes">' + extreme("Best", summary.best) + extreme("Worst", summary.worst) + "</div></div>" +
      "</div>";
  }

  function statCard(label, total) {
    return '<div class="stat"><div class="label">' + ST.escapeHtml(label) + '</div><div class="value ' + pnlClass(total) + '">' +
      ST.escapeHtml(ST.formatMoney(total)) + "</div></div>";
  }

  function extreme(label, item) {
    if (!item) {
      return '<div><span>' + label + '</span><strong>—</strong></div>';
    }
    const date = ST.parseDateKey(item.key);
    const text = (date ? ST.formatShortDate(date) : item.key) + " · " + ST.formatMoney(item.pnl);
    return '<div><span>' + label + '</span><strong class="' + pnlClass(item.pnl) + '">' + ST.escapeHtml(text) + "</strong></div>";
  }

  function weekHtml(weeks) {
    const chips = weeks.map(function (week) {
      const cls = week.logged ? pnlClass(week.total) : "none";
      return '<div class="week ' + cls + '"><span>' + ST.escapeHtml(week.label) + "</span><strong>" +
        ST.escapeHtml(ST.formatMoney(week.total)) + "</strong></div>";
    }).join("");
    return '<h3 class="section-title">Week totals</h3><div class="weeks">' + chips + "</div>";
  }

  function calendarHtml() {
    const heads = WEEKDAYS.map(function (name) {
      return '<div class="dow">' + name + "</div>";
    }).join("");
    const weeks = ST.monthWeeks(state.year, state.month);
    const cells = weeks.map(function (week) {
      return week.map(function (day) {
        const entry = state.data.days[day.key];
        const pnl = entry ? entry.pnl : null;
        const classes = ["day"];
        if (!day.inMonth) classes.push("out");
        if (pnl != null) classes.push(pnlClass(pnl));
        if (ST.sameDay(day.date, state.today)) classes.push("today");
        const amount = pnl == null ? "" : '<span class="amt">' + ST.escapeHtml(ST.formatCellMoney(pnl)) + "</span>";
        const spoken = ST.formatLongDate(day.date) + (pnl == null ? ", nothing logged" : ", " + ST.formatMoney(pnl));
        return '<button type="button" class="' + classes.join(" ") + '" data-day="' + day.key + '" aria-label="' +
          ST.escapeHtml(spoken) + '"><span class="num">' + day.date.getDate() + "</span>" + amount + "</button>";
      }).join("");
    }).join("");
    return heads + cells;
  }

  function onTickerSubmit(event) {
    event.preventDefault();
    const fields = {
      symbol: document.getElementById("fieldSymbol").value,
      shares: document.getElementById("fieldShares").value,
      avgCost: document.getElementById("fieldAvg").value,
      notes: document.getElementById("fieldNotes").value,
      getIn: document.getElementById("fieldGetIn").value,
      getOut: document.getElementById("fieldGetOut").value,
      hardStop: document.getElementById("fieldHardStop").value,
      orderStatus: document.getElementById("fieldOrder").value,
      fillPrice: document.getElementById("fieldFill").value,
      close: document.getElementById("fieldClose").value
    };
    const result = handlers.saveTicker(fields, editingId);
    if (result && result.error) {
      showFormError("tickerError", result.error);
      return;
    }
    document.getElementById("tickerDialog").close();
  }

  function onDaySubmit(event) {
    event.preventDefault();
    const pnl = readDayPnl();
    if (pnl == null) {
      showFormError("dayError", "Enter the day's gain or loss.");
      document.getElementById("dayAmount").focus();
      return;
    }
    const collected = collectSplits();
    if (collected.error) {
      showFormError("dayError", collected.error);
      return;
    }
    const result = handlers.saveDay(editingDayKey, {
      pnl: pnl,
      note: document.getElementById("dayNote").value,
      breakdown: collected.breakdown
    });
    if (result && result.error) {
      showFormError("dayError", result.error);
      return;
    }
    document.getElementById("dayDialog").close();
  }

  function readDayPnl() {
    const raw = document.getElementById("dayAmount").value;
    const typed = ST.parseLooseNumber(raw);
    if (typed == null) return null;
    const loss = document.getElementById("signLoss").getAttribute("aria-pressed") === "true" || String(raw).includes("-");
    return ST.roundCents(loss ? -Math.abs(typed) : Math.abs(typed));
  }

  function collectSplits() {
    const rows = [];
    const nodes = document.querySelectorAll("#splitRows .split-row");
    for (let i = 0; i < nodes.length; i++) {
      const select = nodes[i].querySelector("select");
      const input = nodes[i].querySelector("input");
      const raw = input.value.trim();
      if (raw === "") continue;
      const amount = ST.parseLooseNumber(raw);
      if (amount == null) return { error: "Each split needs a dollar amount." };
      const ticker = currentTickers.find(function (item) { return item.id === select.value; });
      const symbol = ticker ? ticker.symbol : (select.selectedOptions[0] ? select.selectedOptions[0].textContent.trim() : "");
      if (!symbol) return { error: "Each split needs a stock." };
      rows.push({
        tickerId: ticker ? ticker.id : "",
        symbol: symbol,
        amount: ST.roundCents(amount)
      });
    }
    return { breakdown: rows };
  }

  function updateSplitHint() {
    const hint = document.getElementById("splitHint");
    const collected = collectSplits();
    if (collected.error) {
      hint.textContent = collected.error;
      return;
    }
    const rows = collected.breakdown;
    if (!rows.length) {
      hint.textContent = currentTickers.length
        ? "Optional. The amount above is what the calendar uses."
        : "Optional. Add a stock if you want to split this day by ticker.";
      return;
    }
    const sum = ST.roundCents(rows.reduce(function (total, row) { return total + row.amount; }, 0));
    let text = "Split adds up to " + ST.formatMoney(sum) + ".";
    const pnl = readDayPnl();
    if (pnl != null && Math.abs(ST.roundCents(pnl - sum)) >= 0.01) {
      text += " The calendar still uses " + ST.formatMoney(pnl) + ".";
    }
    hint.textContent = text;
  }

  function renderSplits(rows) {
    const html = (rows || []).map(function (row) {
      return splitRowHtml(currentTickers, row);
    }).join("");
    document.getElementById("splitRows").innerHTML = html;
  }

  function splitRowHtml(tickers, row) {
    const known = row && tickers.some(function (ticker) {
      return ticker.id === row.tickerId || ticker.symbol === row.symbol;
    });
    const orphan = row && row.symbol && !known
      ? '<option value="" selected>' + ST.escapeHtml(row.symbol) + "</option>"
      : "";
    const options = tickers.map(function (ticker) {
      const selected = row && (row.tickerId === ticker.id || (!row.tickerId && row.symbol === ticker.symbol));
      return '<option value="' + ST.escapeHtml(ticker.id) + '"' + (selected ? " selected" : "") + ">" +
        ST.escapeHtml(ticker.symbol) + "</option>";
    }).join("");
    const amount = row && typeof row.amount === "number" ? String(row.amount) : "";
    return '<div class="split-row"><select aria-label="Stock">' + orphan + options + "</select>" +
      '<input aria-label="Split amount" inputmode="decimal" autocomplete="off" placeholder="0.00 or -10" value="' +
      ST.escapeHtml(amount) + '" />' +
      '<button type="button" class="icon-btn" data-remove-split aria-label="Remove split">×</button></div>';
  }

  function setSign(isLoss) {
    document.getElementById("signGain").setAttribute("aria-pressed", isLoss ? "false" : "true");
    document.getElementById("signLoss").setAttribute("aria-pressed", isLoss ? "true" : "false");
  }

  function setNumber(id, value) {
    document.getElementById(id).value = value == null || value === false ? "" : String(value);
  }

  function formatAbs(value) {
    const abs = Math.abs(value);
    if (Number.isInteger(abs)) return String(abs);
    return String(ST.roundCents(abs));
  }

  function syncFillField() {
    const filled = document.getElementById("fieldOrder").value === "filled";
    const input = document.getElementById("fieldFill");
    input.disabled = !filled;
    input.placeholder = filled ? "if filled" : "only if filled";
  }

  function updateStatusPreview() {
    const ticker = {
      orderStatus: document.getElementById("fieldOrder").value,
      close: blankNumber("fieldClose"),
      getOut: blankNumber("fieldGetOut"),
      hardStop: blankNumber("fieldHardStop")
    };
    const status = ST.computeStatus(ticker);
    const box = document.getElementById("statusPreview");
    if (!status) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.className = "status " + status.kind;
    document.getElementById("statusPreviewLine").textContent = status.text;
  }

  function blankNumber(id) {
    const value = document.getElementById(id).value;
    if (value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function moneyOrDash(value) {
    return value == null ? "—" : ST.escapeHtml(ST.formatPlainMoney(value));
  }

  function pnlClass(value) {
    if (value > 0) return "gain";
    if (value < 0) return "loss";
    return "flat";
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
