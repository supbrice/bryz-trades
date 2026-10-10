# Bryz Trades

A local-first trading journal for any ticker. Static site, no build step, no account, no broker connection. Published at <https://supbrice.github.io/bryz-trades/> (GitHub Pages from `main`).

Bryz Trades records trades and manual day notes on this device. It does not place orders, load prices, or connect to a brokerage or charting service. The page's Content-Security-Policy blocks every outside request (`connect-src 'none'`), and fonts (Inter, `fonts/`, SIL Open Font License in `fonts/OFL.txt`) are self-hosted.

## Screens

One page, top to bottom:

- **Hero** with today's date and how many trades are in the journal.
- **How you're doing**: realized P/L, win rate, expectancy, and capital at risk on open positions, all computed by `js/calc.js`.
- **Log a trade**: symbol, side, type (equity, call, put), quantity, entry, exit, hard stop, dates, fees, an optional manual mark, and notes. Editing a trade keeps every stored field the form does not show (exit lots, strategy, thesis, average cost, and so on).
- **Recent trades** with All / Open / Closed / Cancelled filters, edit, close (a partial close adds an exit lot), and delete (with a confirm).
- **Green and red days**: a month calendar of closed-trade P/L by exit date. Tap a day to see its trades and to keep a manual result and note. Manual results are shown apart from trade P/L and never added to it.
- **Size every position**: the risk calculator (`js/calculateRisk.js`). "Remember" saves account size and risk percent into the journal settings.
- **Your data, your file**: export a JSON backup, import one, and download trades or days as CSV.

The sun/moon button switches light and dark and stores the choice under `stock-tracker-theme`. With no choice saved, the page follows the system setting.

A first visit starts empty. There is no sample data. Unrealized P/L appears only for an open trade where you typed a manual mark; otherwise it is N/A.

## Where the journal lives

`localStorage` on `supbrice.github.io`, so a journal saved by earlier versions of this site is picked up as-is:

- `ladder-journal-v3`: the current journal (`schemaVersion: 3`).
- `ladder-journal-v2`, `stock-tracker-v1`, `sofi-levels-card-v1`: older formats. They are migrated forward once and left in place. A pre-migration copy is stored under `ladder-journal-premigration` / `ladder-journal-premigration-v3` before the new journal is written.
- `ladder-journal-preimport`: written before an import replaces or merges into the journal. If it cannot be stored, the import is cancelled.
- `ladder-journal-v3-corrupt`: if the saved journal cannot be read, its text is copied here, a banner explains it, and saving stays paused until you choose "Start a new journal" or import a backup. Nothing is overwritten silently.

Storage, schema, migrations, and math (`js/money.js`, `js/schema.js`, `js/storage.js`, `js/calc.js`, `js/calculateRisk.js`) are the same modules the previous version used, so stored data and totals are unchanged.

Another device, another browser, or a private window does not have the journal. There is no cloud sync. Clearing site data deletes it. Export a file if the numbers matter.

## Backup

Export writes `bryz-trades-YYYY-MM-DD.json` with `app: "ladder"` and `schemaVersion: 3`. Older exports (`ladder-….json`, schema 2) still import. Import checks the file first and shows what it found. Merge skips ids you already have unless you tick overwrite, and skips closed trades that look the same unless you tick import similar. Manual days are kept or taken from the file, never summed. Replace swaps the whole journal after the pre-import copy is saved. A malformed file, duplicate ids, or a schema newer than 3 is rejected and the journal is left alone.

## Formulas

Money is calculated in integer cents. Prices and share counts are calculated at 4 decimal places. The product uses `BigInt`. Display rounding happens last.

For a long trade:

`Gross P/L = (Exit price − Entry price) × Quantity`

For a short trade:

`Gross P/L = (Entry price − Exit price) × Quantity`

Call and Put use the same formulas with a 100-share multiplier. Equity, and any saved trade with no type, does not. The type is optional. A missing type is read as Equity and is not written back onto the stored trade.

`Net realized P/L = Gross P/L − fees`

Entry price is the recorded entry price. If that field is blank and average entry cost is present, average entry cost is used instead, and the trade says so. When both are filled, average cost is kept as a note and is not the P/L price.

Fees left blank are treated as `$0.00` and the trade is labeled that way. A negative fee, a missing exit price, a missing entry, or a missing share count leaves a closed trade incomplete. Incomplete trades are saved and excluded. No result is invented.

Only closed trades with an entry, an exit price, a share count, and an exit date are included in realized totals, the KPIs, and the calendar’s closed-trade line. Open and cancelled trades are never included. A second copy of the same trade id is ignored.

### Return

Long return uses **initial entry cost**: `Quantity × entry price` (the price used for P/L). `Return = Net P/L ÷ that cost`. Call and Put include the same 100-share multiplier in the cost, so the percent is still the change in the premium.

Short return uses **short-sale proceeds**: `Quantity × entry price`. `Return = Net P/L ÷ those proceeds`. This is not a margin return. Bryz Trades does not assume a margin rate, because none is recorded. The long-cost label is not reused for shorts.

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

### Partial exits

Partial exits use the **average-cost** method, not FIFO. A trade has one recorded entry price (or average cost, when entry price is blank). Each exit lot uses that same price. Selling some shares does not change the average, and it does not close the rest.

`Remaining shares = position shares − shares in the exit lots`

For each lot, gross and net use the same long and short formulas as a full close, with that lot’s share count and that lot’s fees. A blank lot fee is `$0.00`. When lots are present, a fee typed on the trade itself is not added again.

Realized totals include each dated lot on that lot’s exit date. The position stays open until the lots cover every share and you mark it closed. Covering more shares than the position is rejected. A closed trade with no lots still uses the single exit price, so older records keep the same result.

### Unrealized results

Unrealized profit and loss is shown only when you type a **manual mark**. It is `(mark − entry) × remaining shares` for a long, and `(entry − mark) × remaining shares` for a short. No fee is subtracted, because the shares have not been exited. Next to the amount, the percent is unrealized ÷ (remaining shares × entry, ×100 for options), for example −$167.30 (−13.28%) for 70 shares bought at $18.00 and marked at $15.61. The dashboard line uses total unrealized ÷ total open cost of the marked positions. The percent is hidden when there is no mark or the cost is zero. The line is labeled as a manual mark and shows the as-of date when you entered one. With no mark, the value is **N/A**. The chart is not a mark.

### Portfolio value

Portfolio market value, cash, and holdings value are **N/A**. They are not inferred from trades or from the chart. Deposits and withdrawals stay on the account-adjustment line. “Recorded cost of open longs” is `remaining shares × recorded entry` for open long shares. It is not a market value.

### What is not added together

Manual day entries are the old hand-typed daily results, kept and labeled `manual`. Closed-trade totals do not include them. Manual totals do not include closed trades. If both exist on one day, the calendar shows both lines (T and M) and does not add them. An account adjustment is a deposit, withdrawal, or similar note. It is not trading P/L and is not added to either line.

The cumulative curve is closed-trade P/L by exit date. Same-day trades are summed before the peak is updated. Drawdown is how far that cumulative total sits below its previous peak, starting from zero. It is not account equity. Deposits, withdrawals, open positions, and margin are not inside it.

Gross profit is the sum of winning nets. Gross loss is the sum of losing nets as a positive amount. Profit factor is gross profit ÷ gross loss. A winning or losing trade is classified on net, after fees. A net of exactly zero is a breakeven: it counts in the win-rate denominator and in neither gross profit nor gross loss.

Each dated exit lot is its own closed result. A position that is only partly sold contributes one result per lot, and the unsold shares stay open.

Worked example, eight trades, all in cents:

| Trade | Result |
| --- | --- |
| Long 10 @ 100, exit 112, fee $2 | net +11800 |
| Short 5 @ 50, exit 40, fee $0 | net +5000 |
| Long 8 @ 25, exit 20, fee $1.25 | net −4125 |
| Long 3 @ 15, exit 15, fee $0 | net 0, breakeven |
| Long 10 @ 80, sell 4 @ 90 fee $1 and 2 @ 70 fee $0, 4 still open, stop 75 | lots +3900 and −2000; planned risk on the rest 2000 |
| Short 2 @ 60, exit 66, fee $0.50 | net −1250 |
| Open long 10 @ 100, stop 95 | not realized; planned risk 5000 |
| Open long 6 @ 12, no stop | not realized; left out of planned risk |

Realized net +13325. Three wins, three losses, one breakeven, so the win rate is 3/7 = 42.9%. Average win 6900. Average loss −2458. Profit factor 20700/7375 = 2.81. Cumulative peak is +16800 after the second win; the Feb 2 loss pulls the curve to +12675, a drawdown of 4125, which is the max. Planned risk on the two open stops is 7000. A manual day on the same date is not in any of those figures.

## Risk calculator

`Planned risk = Account size × risk percent`. Risk per share is `entry − stop` for a long (stop below entry) and `stop − entry` for a short (stop above entry). Quantity is planned risk ÷ risk per share, rounded to 4 decimals. It is a planning estimate, not financial advice, and a stop does not guarantee the maximum loss.

Capital at risk on the KPIs is the sum, over open positions, of remaining shares × distance from the recorded entry to the recorded hard stop, when the stop is on the losing side. Positions without a stop are skipped.

## Tests

Unit tests use Node's built-in runner and need no packages:

```sh
node --test tests/*.test.js
```

`tests/browser.check.js` drives the page in Chrome with fixture journals in every stored shape (v3, v2, v1, the SOFI card, and an exported backup). It checks the totals against `js/calc.js`, CRUD, reload persistence, import/export, the corrupt-journal banner, layout at 390/768/1440 px, console errors, and that no outside request is made. It needs `playwright-core` and Chrome (`CHROME=/path/to/chrome` if it is not at `/usr/bin/google-chrome`):

```sh
npm i --no-save playwright-core && node tests/browser.check.js
```

Not financial advice. Does not place trades.
