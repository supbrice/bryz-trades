/* Decimal-safe money, price, and quantity math.
   Values are scaled integers (BigInt). Rounding is half away from zero.
   Prices and quantities use 4 decimal places. Currency uses cents. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const ST = root.StockTracker = root.StockTracker || {};
  Object.assign(ST, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PRICE_DECIMALS = 4;
  const QTY_DECIMALS = 4;
  const MONEY_DECIMALS = 2;
  const ROUNDING = "half-away-from-zero";
  const MAX_INPUT_LENGTH = 40;

  function divRound(numerator, denominator) {
    if (denominator === 0n) return null;
    const negDenom = denominator < 0n;
    const den = negDenom ? -denominator : denominator;
    const num = negDenom ? -numerator : numerator;
    const neg = num < 0n;
    const abs = neg ? -num : num;
    const q = abs / den;
    const r = abs % den;
    const rounded = r * 2n >= den ? q + 1n : q;
    return neg ? -rounded : rounded;
  }

  function expandScientific(text) {
    const match = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text);
    if (!match) return null;
    const sign = match[1] === "-" ? "-" : "";
    const digits = (match[2] + (match[3] || "")).replace(/^0+/, "") || "0";
    const exp = Number(match[4]) - (match[3] ? match[3].length : 0);
    if (!Number.isFinite(exp)) return null;
    let body;
    if (exp >= 0) {
      body = digits + "0".repeat(exp);
    } else {
      const point = digits.length + exp;
      if (point > 0) body = digits.slice(0, point) + "." + digits.slice(point);
      else body = "0." + "0".repeat(-point) + digits;
    }
    return sign + body;
  }

  function decimalStringFromNumber(value) {
    if (!Number.isFinite(value)) return null;
    if (Object.is(value, -0)) return "0";
    const text = value.toString();
    if (/[eE]/.test(text)) return expandScientific(text);
    return text;
  }

  function normalizeText(value) {
    if (value == null || value === "") return null;
    if (typeof value === "boolean") return null;
    let text;
    if (typeof value === "number") text = decimalStringFromNumber(value);
    else if (typeof value === "bigint") text = value.toString();
    else text = String(value).trim().replace(/\u2212/g, "-").replace(/[$,\s]/g, "");
    if (text == null || text === "") return null;
    if (/[eE]/.test(text)) text = expandScientific(text);
    if (text == null || text.length > MAX_INPUT_LENGTH) return null;
    return text;
  }

  function parseScaledDigits(value, digits) {
    const text = normalizeText(value);
    if (text == null) return null;
    const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(text);
    if (!match) return null;
    const neg = match[1] === "-";
    const whole = match[2].replace(/^0+(?=\d)/, "");
    const frac = match[3] || "";
    const needed = digits;
    let fracDigits = frac.slice(0, needed);
    while (fracDigits.length < needed) fracDigits += "0";
    const next = frac.length > needed ? frac.charCodeAt(needed) : 48;
    let scaled;
    try {
      scaled = BigInt(whole) * (10n ** BigInt(needed)) + BigInt(fracDigits || "0");
    } catch (err) {
      return null;
    }
    if (next >= 53) scaled += 1n;
    if (neg && scaled !== 0n) scaled = -scaled;
    return scaled;
  }

  function parseCents(value) {
    return parseScaledDigits(value, MONEY_DECIMALS);
  }

  function parsePriceTicks(value) {
    return parseScaledDigits(value, PRICE_DECIMALS);
  }

  function parseQtyTicks(value) {
    return parseScaledDigits(value, QTY_DECIMALS);
  }

  function formatScaled(scaled, digits) {
    if (typeof scaled !== "bigint") return null;
    const neg = scaled < 0n;
    const abs = neg ? -scaled : scaled;
    const base = 10n ** BigInt(digits);
    const whole = (abs / base).toString();
    if (digits === 0) return neg ? "-" + whole : whole;
    const frac = (abs % base).toString().padStart(digits, "0");
    return (neg ? "-" : "") + whole + "." + frac;
  }

  function groupDigits(intText) {
    return intText.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function formatCents(cents, style) {
    if (typeof cents !== "bigint") return "N/A";
    const neg = cents < 0n;
    const abs = neg ? -cents : cents;
    const whole = groupDigits((abs / 100n).toString());
    const frac = (abs % 100n).toString().padStart(2, "0");
    const body = "$" + whole + "." + frac;
    if (style === "plain") return (neg ? "-" : "") + body;
    if (cents > 0n) return "+" + body;
    if (cents < 0n) return "-" + body;
    return body;
  }

  function scaledToNumber(scaled, digits) {
    const text = formatScaled(scaled, digits);
    if (text == null) return null;
    return Number(text);
  }

  function moneyNumber(value) {
    const scaled = parseCents(value);
    if (scaled == null) return null;
    return scaledToNumber(scaled, MONEY_DECIMALS);
  }

  function priceNumber(value) {
    const scaled = parsePriceTicks(value);
    if (scaled == null) return null;
    return scaledToNumber(scaled, PRICE_DECIMALS);
  }

  function qtyNumber(value) {
    const scaled = parseQtyTicks(value);
    if (scaled == null) return null;
    return scaledToNumber(scaled, QTY_DECIMALS);
  }

  function roundCents(value) {
    const n = moneyNumber(value);
    return n == null ? null : n;
  }

  return {
    PRICE_DECIMALS: PRICE_DECIMALS,
    QTY_DECIMALS: QTY_DECIMALS,
    MONEY_DECIMALS: MONEY_DECIMALS,
    ROUNDING: ROUNDING,
    divRound: divRound,
    parseScaledDigits: parseScaledDigits,
    parseCents: parseCents,
    parsePriceTicks: parsePriceTicks,
    parseQtyTicks: parseQtyTicks,
    formatScaled: formatScaled,
    formatCents: formatCents,
    scaledToNumber: scaledToNumber,
    moneyNumber: moneyNumber,
    priceNumber: priceNumber,
    qtyNumber: qtyNumber,
    roundCents: roundCents
  };
});
