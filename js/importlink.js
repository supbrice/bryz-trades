/* One-tap import link: #import=<base64url of a Bryz Trades / Ladder backup JSON>.
   Decoding and checks only; the page validates with the same planImport the Import button uses
   and always MERGES (never replaces). No network. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ST = root.StockTracker = root.StockTracker || {};
  Object.keys(api).forEach(function (k) { ST[k] = api[k]; });
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const MAX_LINK_CHARS = 200000;
  const PREFIX = /^#import=/;

  function hasImportHash(hash) { return PREFIX.test(String(hash || "")); }

  function decodeBase64Url(s) {
    if (!/^[A-Za-z0-9_-]+={0,2}$/.test(s)) throw new Error("bad-chars");
    let b64 = s.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
    if (b64.length % 4 === 1) throw new Error("bad-length");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  function encodeBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // Returns { ok:false, error } or { ok:true, plan, newCount, message } (newCount may be 0: already added).
  function planImportLink(journal, hash, planImport) {
    const h = String(hash || "");
    if (!hasImportHash(h)) return { ok: false, error: "No import link." };
    const payload = h.replace(PREFIX, "");
    if (!payload || payload.length > MAX_LINK_CHARS) return { ok: false, error: "This import link is empty or too long. Nothing was changed." };
    let text;
    try { text = decodeBase64Url(payload); } catch (e) { return { ok: false, error: "This import link is damaged. Nothing was changed." }; }
    const plan = planImport(journal, text);
    if (!plan || !plan.ok) return { ok: false, error: "This import link isn't a valid backup: " + ((plan && plan.error) || "unreadable") };
    if (!plan.fileTrades) return { ok: false, error: "This import link has no trades. Nothing was changed." };
    const dup = Object.create(null);
    plan.duplicateIds.forEach(function (id) { dup[id] = true; });
    const similar = Object.create(null);
    plan.similar.forEach(function (s) { similar[s.importedId] = true; });
    const newCount = plan.journal.trades.filter(function (t) { return !dup[t.id] && !similar[t.id]; }).length;
    const message = "Add " + newCount + " trade" + (newCount === 1 ? "" : "s") + " from this link? Your existing trades are kept.";
    return { ok: true, plan: plan, newCount: newCount, message: message };
  }

  return { hasImportHash: hasImportHash, decodeBase64Url: decodeBase64Url, encodeBase64Url: encodeBase64Url, planImportLink: planImportLink, MAX_LINK_CHARS: MAX_LINK_CHARS };
});
