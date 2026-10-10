const test = require("node:test");
const assert = require("node:assert/strict");
const schema = require("../js/schema.js");
const storage = require("../js/storage.js");
const L = require("../js/importlink.js");

// Fictional trades only (this repo is public).
const trade = { id: "link-test-1", symbol: "ACME", direction: "long", status: "open", quantity: 10, entryPrice: 50, entryDate: "2026-10-01", fees: 0, exits: [], markPrice: 45, markAsOf: "2026-10-02" };
const backup = (trades) => JSON.stringify({ schemaVersion: 3, app: "ladder", trades: trades, days: {} });
const hashFor = (text) => "#import=" + L.encodeBase64Url(text);

test("base64url round-trips, including non-ASCII text", () => {
  const s = '{"a":"héllo – ✓"}';
  assert.equal(L.decodeBase64Url(L.encodeBase64Url(s)), s);
  assert.ok(!/[+/=]/.test(L.encodeBase64Url(s)));
});

test("valid link: plans one new trade with the confirm text", () => {
  const r = L.planImportLink({ trades: [], days: {} }, hashFor(backup([trade])), schema.planImport);
  assert.equal(r.ok, true);
  assert.equal(r.newCount, 1);
  assert.equal(r.message, "Add 1 trade from this link? Your existing trades are kept.");
});

test("merge keeps existing trades and adds the new one; second time is a no-op", () => {
  const mem = storage.createMemoryStorage({});
  let journal = schema.applyImport({ trades: [], days: {} }, schema.planImport({ trades: [], days: {} }, backup([{ id: "mine", symbol: "XYZ", direction: "long", status: "closed", quantity: 5, entryPrice: 10, exitPrice: 12, entryDate: "2026-09-01", exitDate: "2026-09-02", fees: 0, exits: [] }])), { mode: "merge" });
  storage.saveJournal(mem, journal);
  const before = mem.getItem("ladder-journal-v3");
  const r = L.planImportLink(journal, hashFor(backup([trade])), schema.planImport);
  journal = storage.commitImport(mem, journal, r.plan, { mode: "merge", overwriteIds: false, importSimilar: false, days: "keep" });
  assert.deepEqual(journal.trades.map((t) => t.id), ["mine", "link-test-1"]);
  assert.equal(JSON.parse(mem.getItem("ladder-journal-preimport")).raw, before); // safety copy first
  const again = L.planImportLink(journal, hashFor(backup([trade])), schema.planImport);
  assert.equal(again.ok, true);
  assert.equal(again.newCount, 0); // duplicate id: nothing to add
  const merged = schema.applyImport(journal, again.plan, { mode: "merge" });
  assert.equal(merged.trades.length, 2);
});

test("malformed links change nothing and explain why", () => {
  const j = { trades: [], days: {} };
  for (const h of ["#import=", "#import=!!notbase64!!", "#import=a", hashFor("not json"), hashFor('{"hello":1}'), hashFor(backup([])),
    hashFor(JSON.stringify({ schemaVersion: 99, app: "ladder", trades: [trade], days: {} })), "#import=" + "A".repeat(L.MAX_LINK_CHARS + 1)]) {
    const r = L.planImportLink(j, h, schema.planImport);
    assert.equal(r.ok, false, h.slice(0, 40));
    assert.ok(/Nothing was changed|isn't a valid backup/.test(r.error), r.error);
  }
  assert.equal(L.planImportLink(j, "#other", schema.planImport).ok, false);
  assert.equal(L.hasImportHash("#import=abc"), true);
  assert.equal(L.hasImportHash("#imports=abc"), false);
});
