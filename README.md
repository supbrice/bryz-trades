# Ladder

A local-first trading journal. Static site, no build step, no account, no broker connection, and no external fonts or libraries. The GitHub Pages address stays `sofi-levels-card`.

Ladder records trades and manual day notes on this device. It does not place orders, connect to a brokerage, or fetch prices. A target or stop is a plan you wrote down. A closed trade uses the exit you entered. Nothing here claims the market touched a price.

## Screens

Dashboard, Positions, Calendar, Analytics, and Settings. On a phone they sit in the bottom bar. On a wider screen they sit in the side list. Dark is the default. The theme button switches to light and stores the choice under `stock-tracker-theme`. If you have not chosen, the page follows the system setting.

The first visit starts with SOFI as an open long at the old checklist levels ($18.00 / $18.00 / $16.92). If this browser still has the previous tracker or the original SOFI card, those records are migrated forward. The old copy is left in place, and a pre-migration backup is stored in this browser before the new journal is written.

## Statuses

These describe the journal, not the market.

- **Open — not realized.** The trade is still in the journal. It is excluded from realized profit and loss. The target and hard stop are plans.
- **Closed — recorded exit.** Realized results use the exit price, share count, fees, and exit date you entered. Ladder does not know whether a target or stop was reached in the market.
- **Cancelled — not realized.** Excluded from realized profit and loss.

An exit reason of “recorded as target exit” or “recorded as stop exit” is your note. It is not a market check.

The optional levels checklist compares a close you paste with get-in, get-out, and hard stop. Hard stop is checked first. A close equal to a level is not under it. The wording says the pasted close is under a level. It does not say the market hit that level. The checklist is not applied to short trades. A pasted close is never treated as an exit price.

## Formulas

Money is calculated in integer cents. Prices and share counts are calculated at 4 decimal places. The product uses `BigInt`. Display rounding happens last.

For a long trade:

`Gross P/L = (Exit price − Entry price) × Quantity`

For a short trade:

`Gross P/L = (Entry price − Exit price) × Quantity`

`Net realized P/L = Gross P/L − fees`

Entry price is the recorded entry price. If that field is blank and average entry cost is present, average entry cost is used instead, and the trade says so. When both are filled, average cost is kept as a note and is not the P/L price.

Fees left blank are treated as `$0.00` and the trade is labeled that way. A negative fee, a missing exit price, a missing entry, or a missing share count leaves a closed trade incomplete. Incomplete trades are saved and excluded. No result is invented.

Only closed trades with an entry, an exit price, a share count, and an exit date are included in realized totals, the calendar’s closed-trade line, analytics, and the curve. Open and cancelled trades are never included. A second copy of the same trade id is ignored.

### Return

Long return uses **initial entry cost**: `Quantity × entry price` (the price used for P/L). `Return = Net P/L ÷ that cost`.

Short return uses **short-sale proceeds**: `Quantity × entry price`. `Return = Net P/L ÷ those proceeds`. This is not a margin return. Ladder does not assume a margin rate, because none is recorded. The long-cost label is not reused for shorts.

If the share count or the entry price is zero, or the basis rounds to zero, the return is N/A.

### Rounding

Half away from zero at the stored scale.

- Currency results and fees: cents (2 decimal places).
- Prices and quantities: 4 decimal places.
- Win rate: 1 decimal percent.
- Return and profit factor: 2 decimal places.
- A profit factor is N/A when gross loss is zero, including an all-winning set. It is not shown as infinity.
- Win rate is winning trades ÷ (winning + losing + breakeven). N/A when that set is empty.
- A month or range with no counted trades is N/A, not `$0.00`. `$0.00` means a recorded flat.

### Trade date

Realized P/L is placed on the **exit date**, a calendar date `YYYY-MM-DD`. It is not an instant, and it is not parsed as UTC. The entry date does not receive the P/L. Weeks on the calendar are Sunday through Saturday in the local calendar. A week that crosses a month counts only the days inside the month being viewed, and those week rows add up to that month.

Year to date is 1 January through today when the year is the current year, otherwise the full year. Analytics “this month” is the full calendar month. Custom ranges include both ends. A closed trade with no exit date is saved, shown apart from the totals, and left off the calendar until you add a date.

### What is not added together

Manual day entries are the old hand-typed daily results, kept and labeled `manual`. Closed-trade totals do not include them. Manual totals do not include closed trades. If both exist on one day, the calendar shows both lines (T and M) and does not add them. An account adjustment is a deposit, withdrawal, or similar note. It is not trading P/L and is not added to either line.

The cumulative curve is closed-trade P/L by exit date. Same-day trades are summed before the peak is updated. Drawdown is how far that cumulative total sits below its previous peak, starting from zero. It is not account equity. Deposits, withdrawals, open positions, and margin are not inside it.

Gross profit is the sum of winning nets. Gross loss is the sum of losing nets as a positive amount. Profit factor is gross profit ÷ gross loss. A winning or losing trade is classified on net, after fees.

## Risk calculator

`Planned risk = Account size × risk percent`

Per share, a long uses `entry − stop` and the stop must be below the entry. A short uses `stop − entry` and the stop must be above the entry. Quantity is planned risk ÷ risk per share, rounded to 4 decimal shares, half away from zero.

The result is a planning estimate. It is not financial advice and it does not place an order. Actual losses can be larger because of gaps, slippage, fees, and execution.

## Backup

Settings exports a JSON file with `schemaVersion: 2` and `app: "ladder"`, plus CSV files for trades and daily summaries. Import checks the file first. A malformed file, a duplicate id inside the file, or a newer schema version is rejected and the saved journal is left as it was. Merge skips ids you already have unless you choose overwrite, and it skips closed trades that look the same unless you choose to import them. Manual days on the same date are kept or replaced, never summed. Replace asks you to confirm, and writes a pre-import backup in this browser before it swaps the journal. If that backup cannot be stored, nothing is changed.

The journal lives in this browser’s local storage (`ladder-journal-v2`). Another device, another browser, or a private window does not have it. Private browsing may drop it when the window closes. Clearing site data deletes it. Export a file first if the numbers matter. Ladder does not send the journal anywhere unless you move an exported file yourself.

## Tests

Unit tests use Node’s built-in runner and do not install packages:

```sh
node --test tests/*.test.js
```

Browser checks live in `tests/browser.check.js`. The page does not load that folder. They need Playwright and a Chromium build on the machine running them:

```sh
node tests/browser.check.js
```

Not financial advice. Does not place trades.
