/* Dark is the default. A saved choice beats the system theme. */
(function (root) {
  const ST = root.StockTracker = root.StockTracker || {};
  const KEY = "stock-tracker-theme";

  ST.applyTheme = function (theme, options) {
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "light" ? "#F3F6F3" : "#090B0A");
    const btn = document.getElementById("themeToggle");
    if (btn) {
      const dark = next === "dark";
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
      btn.setAttribute("aria-label", dark ? "Dark mode, switch to light mode" : "Light mode, switch to dark mode");
      btn.setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
      const label = document.getElementById("themeToggleLabel");
      if (label) label.textContent = dark ? "Dark" : "Light";
    }
    if (options && options.persist) {
      try { localStorage.setItem(KEY, next); } catch (err) { /* private mode can block storage */ }
    }
    try {
      document.dispatchEvent(new CustomEvent("ladder-theme", { detail: next }));
    } catch (err) { /* document can be missing in tests */ }
  };

  function savedTheme() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (err) { /* ignore */ }
    return null;
  }

  const initial = document.documentElement.getAttribute("data-theme") || savedTheme() || "dark";
  ST.applyTheme(initial);

  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
      ST.applyTheme(current === "dark" ? "light" : "dark", { persist: true });
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
