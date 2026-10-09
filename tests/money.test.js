const test = require("node:test");
const assert = require("node:assert/strict");
const money = require("../js/money.js");

test("rounds half away from zero at cents and price ticks", () => {
  assert.equal(money.parseCents("1.005"), 101n);
  assert.equal(money.parseCents("-1.005"), -101n);
  assert.equal(money.parseCents("1.004"), 100n);
  assert.equal(money.parseCents(0), 0n);
  assert.equal(money.parseCents("0.001"), 0n);
  assert.equal(money.parsePriceTicks("10.00005"), 100001n);
  assert.equal(money.formatCents(101n, "signed"), "+$1.01");
  assert.equal(money.formatCents(-101n, "plain"), "-$1.01");
  assert.equal(money.formatCents(0n), "$0.00");
  assert.equal(money.formatCents(null), "N/A");
});

test("parses currency text and rejects junk", () => {
  assert.equal(money.parseCents("-$1,234.50"), -123450n);
  assert.equal(money.parseCents("\u2212$2.00"), -200n);
  assert.equal(money.parseCents(""), null);
  assert.equal(money.parseCents("abc"), null);
  assert.equal(money.parseCents(Number.NaN), null);
  assert.equal(money.parseCents(1 / 0), null);
});

test("decimal string round-trip avoids binary residue at the storage scale", () => {
  const ticks = money.parsePriceTicks(0.1 + 0.2);
  assert.equal(ticks, 3000n);
  assert.equal(money.formatScaled(ticks, 4), "0.3000");
  assert.equal(money.moneyNumber("10.10"), 10.1);
  assert.equal(money.priceNumber("16.92"), 16.92);
});
