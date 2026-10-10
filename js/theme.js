/* Applies the saved theme before first paint. Same key as the previous Bryz Trades ("stock-tracker-theme"). */
(function () {
  var pref = null;
  try { pref = localStorage.getItem('stock-tracker-theme'); } catch (e) {}
  if (pref !== 'light' && pref !== 'dark') pref = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', pref);
})();
