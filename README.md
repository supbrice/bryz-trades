# Bryz Trades

A local-first trading journal for any ticker. Static site, no build step, no account, and no broker connection. The GitHub Pages address stays `sofi-levels-card`.

Bryz Trades records trades and manual day notes on this device. It does not place orders or connect to a brokerage. A target or stop is a plan you wrote down. A closed trade uses the exit you entered. Nothing here claims the market touched a price.

The only external script is TradingView’s official chart embed, loaded when Markets is open. It is not an API key, and Bryz Trades does not read prices out of it. Performance charts on Overview and Analytics are drawn from the journal in the page. They are not TradingView, and they do not use a chart library.

## Screens

Overview, Markets, Trades, Risk, Analytics, Calendar, and Settings. On a phone the section list scrolls in the bottom bar. On a wider screen it sits in the side list. Dark is the default palette. The sun and moon button still switches to light and stores the choice under `stock-tracker-theme`. If you have not chosen, the page follows the system setting. Light mode uses the same layout with darker green and red text so the figures stay readable.

The first visit starts with SOFI as an open long at the old checklist levels ($18.00 / $18.00 / $16.92). If this browser still has the previous tracker or the original SOFI card, those records are migrated forward. The old copy is left in place, and a pre-migration backup is stored in this browser before the new journal is written.

## Symbols, watchlist, and filters

Any ticker or ETF that fits a symbol such as `AAPL`, `BRK.B`, or `SOFI` can be recorded. The chart box also accepts an optional exchange (`NASDAQ`, `NYSE`). A few well-known tickers have a suggested exchange. That suggestion is only a venue hint. It is not a quote, and you can change it or leave it blank.

The Markets watchlist is the symbols in your journal, plus any symbol you add without a trade. Clicking a symbol loads its chart and the symbol detail. Detail shows realized results for that symbol. Market price and portfolio market value stay **N/A**. Unrealized profit and loss stays **N/A** until you type a manual mark and, if you want, an as-of date. A missing mark is unavailable, not a live quote.

Trades filter by status, symbol, direction, strategy, and date. A date filter keeps a trade when its entry date, exit date, or a partial-exit date falls in the range. Analytics uses the same symbol and status filters on top of the exit-date range. Filtering does not delete anything. Open is the status for a position that is not realized, including one that only has a plan.

## Chart

Markets loads TradingView’s Advanced Chart from `https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js` only, and the watchlist tape from `https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js` only. Nothing else is loaded from a CDN. No chart library is vendored.

The price chart is created when Markets is showing. Period buttons are 1D, 5D, 1M, 6M, YTD, 1Y, 5Y, and MAX. The widget theme follows the light or dark theme. The chart is attributed to TradingView, and the data may be delayed. The embed runs in a sandboxed frame so it cannot read or clear the journal in this page’s storage. If the script is blocked or does not paint within 8 seconds, the page shows a fallback and leaves your trades alone. Chart prices are never copied into an entry, an exit, or a mark.

Overview and Analytics draw realized P/L over time, daily bars, and by-ticker or by-month bars as inline SVG from closed trades. Those charts are not prices, and they are not account equity.

## Statuses

These describe the journal, not the market.

- **Open — not realized.** The trade is still in the journal. It is excluded from realized profit and loss. The target and hard stop are plans.
- **Closed — recorded exit.** Realized results use the exit price, share count, fees, and exit date you entered. Bryz Trades does not know whether a target or stop was reached in the market.
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

Unrealized profit and loss is shown only when you type a **manual mark**. It is `(mark − entry) × remaining shares` for a long, and `(entry − mark) × remaining shares` for a short. No fee is subtracted, because the shares have not been exited. The line is labeled as a manual mark and shows the as-of date when you entered one. With no mark, the value is **N/A**. The chart is not a mark.

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

`Planned risk = Account size × risk percent`

Per share, a long uses `entry − stop` and the stop must be below the entry. A short uses `stop − entry` and the stop must be above the entry. Quantity is planned risk ÷ risk per share, rounded to 4 decimal shares, half away from zero.

The result is a planning estimate. It is not financial advice and it does not place an order. A stop does not guarantee the maximum loss. Actual losses can be larger because of gaps, slippage, fees, and execution. An optional target shows potential reward and reward-to-risk when it sits on the profitable side of the entry. A missing or unusable target does not change the size. Remembering account size and risk percent merges those two fields into the saved settings. It does not replace the watchlist or the selected symbol, and it does not change a risk limit on its own.

Planned risk on Overview is the sum, for open positions, of remaining shares times the distance from the recorded entry to the recorded hard stop, when the stop is on the correct side. Positions missing an entry, a stop, or a share count are skipped and labeled. That figure is a plan. It is not a live stop, and Bryz Trades does not check whether the market traded there. If you have saved an account size, the page also shows that sum as a percent of it.

## Backup

Settings exports a JSON file with `schemaVersion: 3` and `app: "ladder"`, plus CSV files for trades and daily summaries. The downloaded names are `bryz-trades-….json`, `bryz-trades-trades-….csv`, and `bryz-trades-days-….csv`. A file saved earlier as `ladder-….json` still imports. Import reads the file contents, not the file name. Import checks the file first. Schema 2 files are upgraded on import. A malformed file, a duplicate id inside the file, or a schema newer than 3 is rejected and the saved journal is left as it was. Merge skips ids you already have unless you choose overwrite, and it skips closed trades that look the same unless you choose to import them. Manual days on the same date are kept or replaced, never summed. Replace asks you to confirm, and writes a pre-import backup in this browser before it swaps the journal. If that backup cannot be stored, nothing is changed.

The current journal lives in this browser’s local storage (`ladder-journal-v3`). A schema 2 journal under `ladder-journal-v2` is copied forward once. The version 2 text is left in place, and a pre-migration backup is stored under `ladder-journal-premigration-v3` before the new key is written. If that backup cannot be stored, the upgraded journal is not written. Version 1 and the original SOFI card still migrate, with their own pre-migration backup, and are not deleted.

Another device, another browser, or a private window does not have the journal. There is no cloud sync. Private browsing may drop it when the window closes. Clearing site data deletes it. Export a file first if the numbers matter. Bryz Trades does not send the journal anywhere unless you move an exported file yourself. No API key and no backend are required.

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
