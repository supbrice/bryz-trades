/* Number and date helpers. Dates are local calendar days, never UTC. */
(function (root) {
  const ST = root.StockTracker = root.StockTracker || {};

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  ST.formatLongDate = function (date) {
    return WEEKDAYS[date.getDay()] + ", " + MONTHS[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
  };

  ST.formatMonthYear = function (year, month) {
    return MONTHS[month] + " " + year;
  };

  ST.formatShortDate = function (date) {
    return MONTHS_SHORT[date.getMonth()] + " " + date.getDate();
  };

  ST.formatWeekLabel = function (start, end) {
    if (ST.dateKey(start) === ST.dateKey(end)) return ST.formatShortDate(start);
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return ST.formatShortDate(start) + "–" + end.getDate();
    }
    return ST.formatShortDate(start) + " – " + ST.formatShortDate(end);
  };

  ST.formatCents = ST.formatCents || function (cents) {
    return cents == null ? "N/A" : String(cents);
  };

  ST.formatCellCents = function (cents) {
    if (typeof cents !== "bigint") return "";
    const neg = cents < 0n;
    const abs = neg ? -cents : cents;
    const sign = cents > 0n ? "+" : cents < 0n ? "−" : "";
    if (abs >= 1000000n) return sign + "$" + (ST.divRound(abs, 100000n)).toString() + "k";
    if (abs >= 100000n) {
      const tenths = ST.divRound(abs, 10000n);
      const whole = tenths / 10n;
      const frac = tenths % 10n;
      const body = frac === 0n ? whole.toString() : whole.toString() + "." + frac.toString();
      return sign + "$" + body + "k";
    }
    const dollars = abs / 100n;
    const frac = abs % 100n;
    if (frac === 0n) return sign + "$" + dollars.toString();
    return sign + "$" + dollars.toString() + "." + frac.toString().padStart(2, "0");
  };

  ST.pnlWord = function (cents) {
    if (typeof cents !== "bigint") return "not recorded";
    if (cents > 0n) return "gain";
    if (cents < 0n) return "loss";
    return "flat";
  };

  ST.formatMoney = function (value) {
    const body = Math.abs(Number(value)).toLocaleString("en-US", { style: "currency", currency: "USD" });
    if (value > 0) return "+" + body;
    if (value < 0) return "-" + body;
    return body;
  };

  ST.formatPlainMoney = function (value) {
    return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
  };

  /* Short label for a calendar cell. Full dollars stay on the day screen and in summaries. */
  ST.formatCellMoney = function (value) {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    const abs = Math.abs(Number(value));
    if (abs >= 10000) return sign + "$" + Math.round(abs / 1000) + "k";
    if (abs >= 1000) {
      const scaled = Math.round(abs / 100) / 10;
      return sign + "$" + String(scaled).replace(/\.0$/, "") + "k";
    }
    const cents = Math.round(abs * 100);
    if (cents % 100 === 0) return sign + "$" + String(cents / 100);
    return sign + "$" + (cents / 100).toFixed(2);
  };

  ST.formatShares = function (value) {
    const n = Number(value);
    const rounded = Math.round(n * 10000) / 10000;
    const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
    return text + (n === 1 ? " share" : " shares");
  };

  ST.escapeHtml = function (value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch];
    });
  };

  ST.parseLooseNumber = function (raw) {
    if (raw == null) return null;
    const text = String(raw).trim().replace(/\u2212/g, "-").replace(/[$,\s]/g, "");
    if (text === "" || text === "+" || text === "-" || text === "." || text === "-." || text === "+.") return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
