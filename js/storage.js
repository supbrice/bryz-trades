/* localStorage load/save. Migration keeps the previous copy and a premigration backup. */
(function (root, factory) {
  const schema = (typeof module !== "undefined" && module.exports)
    ? require("./schema.js")
    : root.StockTracker;
  const api = factory(schema);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ST = root.StockTracker = root.StockTracker || {};
  Object.assign(ST, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (schema) {
  const KEYS = schema.KEYS;

  function createMemoryStorage(initial) {
    const map = new Map();
    Object.keys(initial || {}).forEach(function (key) {
      map.set(key, initial[key]);
    });
    return {
      getItem: function (key) { return map.has(key) ? map.get(key) : null; },
      setItem: function (key, value) { map.set(key, String(value)); },
      removeItem: function (key) { map.delete(key); }
    };
  }

  function writePremigration(storage, source, raw) {
    try {
      if (storage.getItem(KEYS.premigration)) return true;
      const payload = JSON.stringify({
        savedAt: new Date().toISOString(),
        source: source,
        reason: "before-schema-v2-migration",
        raw: raw
      });
      storage.setItem(KEYS.premigration, payload);
      return storage.getItem(KEYS.premigration) === payload;
    } catch (err) {
      return false;
    }
  }

  function saveJournal(storage, journal) {
    storage.setItem(KEYS.journal, JSON.stringify(schema.toStored(journal)));
  }

  function blocked(message) {
    return { data: schema.seedJournal(), warning: message, unsaved: true };
  }

  function recoverLegacy(storage) {
    const prem = storage.getItem(KEYS.premigration);
    if (prem) {
      try {
        const wrapped = JSON.parse(prem);
        if (wrapped && typeof wrapped.raw === "string") {
          const parsed = JSON.parse(wrapped.raw);
          if (parsed && parsed.schemaVersion === schema.SCHEMA_VERSION) {
            return schema.readStoredJournal(wrapped.raw).journal;
          }
          if (Array.isArray(parsed.tickers)) return schema.migrateV1(wrapped.raw);
          if (parsed && (parsed.getIn != null || parsed.orderStatus != null || parsed.hardStop != null)) {
            return schema.migrateSofiCard(wrapped.raw);
          }
        }
      } catch (err) { /* try the next copy */ }
    }
    const v1 = storage.getItem(KEYS.v1);
    if (v1) {
      try { return schema.migrateV1(v1); } catch (err) { /* keep going */ }
    }
    const sofi = storage.getItem(KEYS.sofi);
    if (sofi) {
      try { return schema.migrateSofiCard(sofi); } catch (err) { /* keep going */ }
    }
    return null;
  }

  function migrateKey(storage, key, convert) {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const backedUp = writePremigration(storage, key, raw);
    if (!backedUp) {
      let journal = null;
      try { journal = convert(raw); } catch (err) { journal = null; }
      return {
        data: journal || schema.seedJournal(),
        warning: "Couldn't store a safety copy, so the upgraded journal was not written. Your previous data is unchanged.",
        unsaved: true
      };
    }
    try {
      const journal = convert(raw);
      saveJournal(storage, journal);
      return { data: journal, warning: "" };
    } catch (err) {
      return {
        data: schema.seedJournal(),
        warning: "Couldn't upgrade saved data. Your previous copy is unchanged, and a backup is still in this browser.",
        unsaved: true
      };
    }
  }

  function loadJournal(storage) {
    let raw = null;
    try {
      raw = storage.getItem(KEYS.journal);
    } catch (err) {
      return blocked("This browser blocked saved data. Export a backup when you can.");
    }
    if (raw) {
      try {
        const read = schema.readStoredJournal(raw);
        const warning = read.warnings.length ? read.warnings[0] + " Your original copy is still in this browser." : "";
        return { data: read.journal, warning: warning };
      } catch (err) {
        try { storage.setItem(KEYS.corrupt, raw); } catch (e) { /* keep the original key */ }
        const recovered = recoverLegacy(storage);
        if (recovered) {
          try { saveJournal(storage, recovered); } catch (e) { /* leave the corrupt key in place */ }
          return {
            data: recovered,
            warning: "Saved data could not be read. A backup of that copy is still in this browser, and an earlier copy was loaded."
          };
        }
        return {
          data: schema.seedJournal(),
          warning: "Saved data could not be read, so nothing was overwritten. The unreadable copy is still in this browser.",
          unsaved: true
        };
      }
    }
    const fromV1 = migrateKey(storage, KEYS.v1, schema.migrateV1);
    if (fromV1) return fromV1;
    const fromSofi = migrateKey(storage, KEYS.sofi, schema.migrateSofiCard);
    if (fromSofi) return fromSofi;
    const seeded = schema.seedJournal();
    try { saveJournal(storage, seeded); } catch (err) { /* a blocked write still shows the seed */ }
    return { data: seeded, warning: "" };
  }

  function commitImport(storage, current, plan, choices) {
    if (!plan || !plan.ok) throw new Error(plan && plan.error || "Nothing to import.");
    const existing = storage.getItem(KEYS.journal);
    const backup = JSON.stringify({
      savedAt: new Date().toISOString(),
      source: KEYS.journal,
      reason: "before-import",
      raw: existing
    });
    storage.setItem(KEYS.preimport, backup);
    if (storage.getItem(KEYS.preimport) !== backup) {
      throw new Error("Couldn't store a backup, so nothing was changed.");
    }
    const next = schema.applyImport(current, plan, choices);
    saveJournal(storage, next);
    return next;
  }

  return {
    createMemoryStorage: createMemoryStorage,
    loadJournal: loadJournal,
    saveJournal: saveJournal,
    commitImport: commitImport,
    loadState: function () { return loadJournal(localStorage); },
    saveState: function (journal) { return saveJournal(localStorage, journal); }
  };
});
