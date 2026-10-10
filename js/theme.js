/* Applies the saved theme before first paint. Same key as the previous Bryz Trades ("stock-tracker-theme"). */
(function () {
  var pref = null;
  try { pref = localStorage.getItem('stock-tracker-theme'); } catch (e) {}
  // Light is the default for everyone (system dark setting is not used); dark only when chosen with the toggle.
  if (pref !== 'dark') pref = 'light';
  document.documentElement.setAttribute('data-theme', pref);
})();
