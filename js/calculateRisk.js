/* Position size from numbers the user types. No DOM, no quotes, no stored journal.
   Shares: floor(capital * risk% / |entry - stop|)
   Contracts: floor(capital * risk% / (|entry - stop| * 100)) */
(function (root, factory) {
  const money = (typeof module !== "undefined" && module.exports)
    ? require("./money.js")
    : root.StockTracker;
  const api = factory(money);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ST = root.StockTracker = root.StockTracker || {};
  Object.assign(ST, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (money) {
  function fail(message) {
    return {
      ok: false,
      error: message,
      maxUnits: null,
      capitalAtRiskCents: null,
      maxDrawdownPercent: null,
      unitLabel: "",
      note: ""
    };
  }

  function blank(value) {
    return value == null || String(value).trim() === "";
  }

  function formatDrawdown(numerator, denominator) {
    if (typeof numerator !== "bigint" || typeof denominator !== "bigint" || denominator === 0n) return null;
    const scale = 100n;
    const scaled = money.divRound(numerator * 100n * scale, denominator);
    if (scaled == null) return null;
    const neg = scaled < 0n;
    const abs = neg ? -scaled : scaled;
    const whole = abs / scale;
    const frac = (abs % scale).toString().padStart(2, "0");
    return (neg ? "-" : "") + whole.toString() + "." + frac + "%";
  }

  function isOptions(value) {
    const raw = String(value || "shares").trim().toLowerCase();
    return raw === "options" || raw === "option" || raw === "contracts" || raw === "contract" || raw === "call" || raw === "put";
  }

  function calculateRisk(input) {
    const src = input || {};
    const capitalRaw = src.capital != null ? src.capital : src.accountSize;
    const riskRaw = src.riskPercent;
    const entryRaw = src.entry != null ? src.entry : src.entryPrice;
    const stopRaw = src.stop != null ? src.stop : src.stopPrice;
    const options = isOptions(src.assetType);
    if (blank(capitalRaw) || blank(riskRaw) || blank(entryRaw) || blank(stopRaw)) {
      return fail("Enter account capital, risk percent, entry, and stop.");
    }
    const capital = money.parseCents(capitalRaw);
    const percent = money.parseScaledDigits(riskRaw, 2);
    const entry = money.parsePriceTicks(entryRaw);
    const stop = money.parsePriceTicks(stopRaw);
    if (capital == null || percent == null || entry == null || stop == null) {
      return fail("Enter numbers for account capital, risk percent, entry, and stop.");
    }
    if (capital < 0n || percent < 0n || entry < 0n || stop < 0n) {
      return fail("Capital, risk percent, entry, and stop can't be negative.");
    }
    if (percent > 10000n) return fail("Risk percent can't be above 100.");
    if (capital === 0n) return fail("Account capital must be above zero.");
    if (percent === 0n) return fail("Risk percent must be above zero.");
    if (entry === 0n || stop === 0n) return fail("Entry and stop must be above zero.");
    if (entry === stop) return fail("Entry and stop are the same, so size can't be calculated.");
    const diff = entry > stop ? entry - stop : stop - entry;
    const denom = diff * (options ? 10000n : 100n);
    if (denom === 0n) return fail("Entry and stop are the same, so size can't be calculated.");
    const maxUnits = (capital * percent) / denom;
    const mult = options ? 100n : 1n;
    const capitalAtRiskCents = money.divRound(maxUnits * diff * mult, 100n);
    if (typeof capitalAtRiskCents !== "bigint") return fail("Size could not be calculated from those numbers.");
    const unitLabel = options ? (maxUnits === 1n ? "contract" : "contracts") : (maxUnits === 1n ? "share" : "shares");
    return {
      ok: true,
      error: "",
      maxUnits: maxUnits.toString(),
      capitalAtRiskCents: capitalAtRiskCents,
      maxDrawdownPercent: formatDrawdown(capitalAtRiskCents, capital),
      unitLabel: unitLabel,
      assetType: options ? "options" : "shares",
      note: maxUnits === 0n ? "The risk budget does not cover 1 " + (options ? "contract" : "share") + "." : ""
    };
  }

  return { calculateRisk: calculateRisk };
});
