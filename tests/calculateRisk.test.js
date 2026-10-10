const test = require("node:test");
const assert = require("node:assert/strict");
const risk = require("../js/calculateRisk.js");

function finiteResult(result) {
  assert.equal(result.ok, true);
  assert.equal(result.error, "");
  assert.match(result.maxUnits, /^\d+$/);
  assert.equal(typeof result.capitalAtRiskCents, "bigint");
  assert.match(result.maxDrawdownPercent, /^\d+\.\d{2}%$/);
  const text = [result.maxUnits, result.maxDrawdownPercent, result.error, result.note].join(" ");
  assert.equal(text.includes("NaN"), false);
  assert.equal(text.includes("Infinity"), false);
}

test("shares floor the risk budget and report capital at risk", () => {
  const sized = risk.calculateRisk({ capital: 10000, riskPercent: 1, entry: 50, stop: 48, assetType: "shares" });
  finiteResult(sized);
  assert.equal(sized.maxUnits, "50");
  assert.equal(sized.unitLabel, "shares");
  assert.equal(sized.capitalAtRiskCents, 10000n);
  assert.equal(sized.maxDrawdownPercent, "1.00%");
});

test("options contracts use the 100x multiplier", () => {
  const tooSmall = risk.calculateRisk({ capital: 10000, riskPercent: 1, entry: 50, stop: 48, assetType: "options" });
  finiteResult(tooSmall);
  assert.equal(tooSmall.maxUnits, "0");
  assert.equal(tooSmall.unitLabel, "contracts");
  assert.equal(tooSmall.capitalAtRiskCents, 0n);
  assert.equal(tooSmall.maxDrawdownPercent, "0.00%");
  assert.match(tooSmall.note, /does not cover 1 contract/);
  const sized = risk.calculateRisk({ capital: 10000, riskPercent: 10, entry: 50, stop: 48, assetType: "call" });
  finiteResult(sized);
  assert.equal(sized.maxUnits, "5");
  assert.equal(sized.capitalAtRiskCents, 100000n);
  assert.equal(sized.maxDrawdownPercent, "10.00%");
  const flipped = risk.calculateRisk({ capital: 10000, riskPercent: 1, entry: 48, stop: 50, assetType: "shares" });
  assert.equal(flipped.maxUnits, "50");
});

test("invalid size inputs explain the problem and never return NaN", () => {
  assert.match(risk.calculateRisk({ capital: "", riskPercent: 1, entry: 50, stop: 48 }).error, /Enter account capital/);
  assert.match(risk.calculateRisk({ capital: 10000, riskPercent: 1, entry: "", stop: 48 }).error, /Enter account capital/);
  assert.match(risk.calculateRisk({ capital: -1, riskPercent: 1, entry: 50, stop: 48 }).error, /negative/);
  assert.match(risk.calculateRisk({ capital: 10000, riskPercent: -2, entry: 50, stop: 48 }).error, /negative/);
  assert.match(risk.calculateRisk({ capital: 10000, riskPercent: 1, entry: -5, stop: 48 }).error, /negative/);
  assert.match(risk.calculateRisk({ capital: 10000, riskPercent: 1, entry: 50, stop: 50 }).error, /same/);
  assert.match(risk.calculateRisk({ capital: 10000, riskPercent: 101, entry: 50, stop: 48 }).error, /above 100/);
  assert.match(risk.calculateRisk({ capital: 10000, riskPercent: "nope", entry: 50, stop: 48 }).error, /numbers/);
  const full = risk.calculateRisk({ capital: 10000, riskPercent: 100, entry: 50, stop: 48, assetType: "shares" });
  finiteResult(full);
  assert.equal(full.maxUnits, "5000");
  const failures = [
    risk.calculateRisk({}),
    risk.calculateRisk({ capital: 10000, riskPercent: 1, entry: 50, stop: 50 }),
    risk.calculateRisk({ capital: -10, riskPercent: 1, entry: 50, stop: 48 }),
    risk.calculateRisk({ capital: 10000, riskPercent: 150, entry: 50, stop: 48 })
  ];
  failures.forEach((result) => {
    assert.equal(result.ok, false);
    assert.equal(result.maxUnits, null);
    assert.equal(result.capitalAtRiskCents, null);
    assert.equal(result.maxDrawdownPercent, null);
    assert.equal(result.error.includes("NaN"), false);
    assert.equal(result.error.includes("Infinity"), false);
  });
});
