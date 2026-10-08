/* Number and date helpers. Dates are local calendar days, never UTC. */
(function (root) {
  const ST = root.StockTracker = root.StockTracker || {};

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  ST.roundCents = function (value) {
    const sign = value < 0 ? -1 : 1;
    return sign * Math.round(Math.abs(value) * 100) / 100;
  };

  ST.dateKey = function (date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return date.getFullYear() + "-" + month + "-" + day;
  };

  ST.parseDateKey = function (key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  };

  ST.addDays = function (date, days) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + days);
    return next;
  };

  ST.startOfWeek = function (date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    start.setDate(start.getDate() - start.getDay());
    return start;
  };

  ST.sameDay = function (a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  };

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
