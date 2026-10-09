# Ladder

A personal stock tracker for daily use. Static site, no build step, no account, and no broker connection. The GitHub Pages address stays `sofi-levels-card`.

- Track more than one ticker: symbol, shares, average cost, an optional note, and optional get-in / get-out / hard-stop levels
- Keep the old daily **close** checklist on any ticker that needs it
- Tap a day on the month calendar and enter a realized gain or loss in dollars (losses are negative)
- A note and a per-ticker split are optional — one daily total is enough
- Month total, week totals, year-to-date, win days vs loss days, and best and worst day
- Data stays in this browser (`localStorage`), with **Export** and **Import** JSON backups
- Dark mode is the default. Use the theme button to switch to light mode; the choice is remembered on this device. If you have not chosen yet, the page follows your system light or dark setting.

On a phone, use the Calendar and Positions tabs. On a wider screen both show at once. The first visit starts with SOFI at the old default levels ($18.00 / $18.00 / $16.92). If this browser already had the old SOFI card saved, those saved levels are kept. Edit or remove SOFI whenever you want.

## Close checklist

Set a ticker's limit status to use the same rules as the old card:

- Waiting or cancelled → **Waiting**
- Filled, and no close pasted yet → **Filled — hold**
- Filled, and the close is under the hard stop → **Hard stop hit**
- Filled, and the close is under get-out → **Get-out hit (close under get-out)**
- Otherwise → **Filled — hold**

Hard stop wins if both it and get-out are hit. Only the close you paste is used. Nothing here places or cancels an order.

## Backup

**Export** downloads a JSON file. **Import** replaces the stocks and days on this device with that file. Clearing site data deletes the tracker, so keep a backup if the numbers matter.

Open `index.html`, or use the GitHub Pages site. No install.

Not financial advice. Does not place trades.
