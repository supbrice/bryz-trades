/* Bryz Trades UI. Uses the same journal, storage keys, migrations and P&L math as before
   (money.js, schema.js, storage.js, calc.js are unchanged). No network, no live prices. */
(function () {
  'use strict';
  var ST = window.StockTracker;
  var $ = function (id) { return document.getElementById(id); };
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var SHORT_M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var PAGE = 50;

  var loaded = ST.loadJournal(localStorage);
  var journal = loaded.data;
  var blocked = !!loaded.unsaved;
  var editingId = null, shown = PAGE, filter = 'all';
  var now = new Date(), calMonth = { y: now.getFullYear(), m: now.getMonth() };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function svgIcon(d) {
    var ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    d.forEach(function (p) { var e = document.createElementNS(ns, p[0]); Object.keys(p[1]).forEach(function (k) { e.setAttribute(k, p[1][k]); }); s.appendChild(e); });
    return el('div', { class: 'ic', 'aria-hidden': 'true' }, [s]);
  }
  function today() { return ST.dateKey(new Date()); }
  function fmtDate(iso) { if (!iso) return '—'; var p = iso.split('-'); return SHORT_M[+p[1] - 1] + ' ' + (+p[2]); }
  function fmtLong(iso) { var p = iso.split('-'); return SHORT_M[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0]; }
  function signClass(c) { return typeof c !== 'bigint' ? '' : c > 0n ? 'pos' : c < 0n ? 'neg' : ''; }
  function money(c) { return typeof c === 'bigint' ? ST.formatCents(c).replace(/^-/, '\u2212') : '—'; }
  // "-13.28%" -> " (−13.28%)", "13.28%" -> " (+13.28%)"; empty when there is no percent.
  function pctNote(p) {
    if (typeof p !== 'string' || !p) return '';
    return ' (' + (p.charAt(0) === '-' ? '\u2212' + p.slice(1) : (/^0(\.0+)?%$/.test(p) ? p : '+' + p)) + ')';
  }
  function plain(c) { return typeof c === 'bigint' ? ST.formatCents(c, 'plain').replace(/^-/, '\u2212') : '—'; }
  function price(v) {
    if (v == null || v === '') return '—';
    var n = Number(v);
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  function qty(v) { return v == null || v === '' ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 4 }); }
  function str(v) { return v == null ? '' : String(v); }
  function findTrade(id) { return journal.trades.find(function (t) { return t.id === id; }); }

  /* ---------- save / messages ---------- */
  var toastTimer;
  function toast(msg, bad) {
    var t = $('toast'); t.textContent = msg; t.hidden = false; t.className = 'toast' + (bad ? ' bad' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3400);
  }
  function banner(msg, showFresh) {
    $('bannerText').textContent = msg || '';
    $('banner').hidden = !msg;
    $('startFresh').hidden = !showFresh;
  }
  function persist() {
    if (blocked) { toast('Not saved: saving is paused until you choose “Start saving again”.', true); return false; }
    try { ST.saveJournal(localStorage, journal); $('saveState').textContent = 'Saved on this device · No account · Back up anytime'; return true; }
    catch (e) { $('saveState').textContent = 'Not saved'; toast('Couldn’t save on this device. Export a backup if you can.', true); return false; }
  }
  // Apply a change to a copy; keep it only if it saved.
  function change(mutator, msg) {
    var before = journal;
    var next = { schemaVersion: journal.schemaVersion, trades: journal.trades.slice(), days: Object.assign({}, journal.days), settings: Object.assign({}, journal.settings) };
    mutator(next);
    journal = next;
    if (!persist()) { journal = before; renderAll(); return false; }
    renderAll();
    if (msg) toast(msg);
    return true;
  }

  /* ---------- KPIs ---------- */
  function kpiCard(icon, label, value, valueClass, sub) {
    return el('div', { class: 'card' }, [icon, el('div', { class: 'k', text: label }),
      el('div', { class: 'v ' + (valueClass || ''), text: value }), el('p', { class: 's', text: sub })]);
  }
  function renderKpis() {
    var m = ST.analyze(journal, {}), ex = ST.expectancy(m), cap = ST.activeCapitalAtRisk(journal), snap = ST.portfolioSnapshot(journal);
    var box = $('kpis'); box.textContent = '';
    var n = m.tradeCount;
    box.appendChild(kpiCard(svgIcon([['path', { d: 'M4 17l5-5 4 4 7-8' }]]), 'Realized P&L',
      n ? money(m.realizedNetCents) : '—', n ? signClass(m.realizedNetCents) : 'empty-v',
      n ? 'From ' + n + ' closed trade' + (n === 1 ? '' : 's') + ', net of fees.' : 'No closed trades yet.'));
    box.appendChild(kpiCard(svgIcon([['circle', { cx: 12, cy: 12, r: 8 }], ['path', { d: 'M12 4a8 8 0 0 1 8 8' }]]), 'Win rate',
      m.winRate || '—', m.winRate ? '' : 'empty-v',
      m.winRate ? m.wins + ' of ' + n + ' closed' + (m.breakevens ? ' · ' + m.breakevens + ' breakeven' : '') + '.' : 'Close a trade to see it.'));
    var eVal = '—', eSub = 'Needs closed trades.', eCls = 'empty-v';
    if (ex.ready) {
      eVal = ex.rr ? ex.rr + ' R' : money(ex.perTradeCents);
      eCls = ex.rr ? '' : signClass(ex.perTradeCents);
      eSub = money(ex.perTradeCents) + ' per trade' + (ex.rr ? ' · avg win ' + plain(ex.avgWinCents) + ' vs loss ' + plain(ex.avgLossCents) : ' · ' + ex.reason.toLowerCase().replace(/\.$/, '')) + '.';
    }
    box.appendChild(kpiCard(svgIcon([['path', { d: 'M5 12h14M12 5l7 7-7 7' }]]), 'Expectancy', eVal, eCls, eSub));
    var capSub = cap.included ? 'Open cost basis · ' + cap.included + ' open position' + (cap.included === 1 ? '' : 's') : 'No open positions';
    if (typeof snap.unrealizedCents === 'bigint') capSub += ' · unrealized ' + money(snap.unrealizedCents) + pctNote(snap.unrealizedPercent) + ' from your marks';
    box.appendChild(kpiCard(svgIcon([['path', { d: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z' }]]), 'Capital at risk',
      cap.included ? plain(cap.cents) : '$0.00', cap.included ? '' : 'empty-v', capSub + '.'));
    var notes = [];
    if (m.undated) notes.push(m.undated + ' closed trade' + (m.undated === 1 ? ' has' : 's have') + ' no exit date (' + money(m.undatedNetCents) + ', not in the totals above)');
    if (m.incomplete) notes.push(m.incomplete + ' trade' + (m.incomplete === 1 ? ' is' : 's are') + ' missing a price or quantity, so ' + (m.incomplete === 1 ? 'it is' : 'they are') + ' left out');
    if (m.partialOpen) notes.push(m.partialOpen + ' open trade' + (m.partialOpen === 1 ? ' has' : 's have') + ' partial exits; the exited part is counted');
    $('kpiNote').hidden = !notes.length;
    $('kpiNote').textContent = notes.join(' · ') + (notes.length ? '.' : '');
    var count = journal.trades.length;
    $('heroCount').textContent = count === 1 ? '1 trade' : count + ' trades';
    $('heroDate').textContent = fmtLong(today());
  }

  /* ---------- Trades table ---------- */
  var LABELS = { 'OPEN': ['Open', 'open'], 'OPEN - PARTIAL': ['Partial', 'open'], 'CLOSED - WIN': ['Win', 'win'], 'CLOSED - LOSS': ['Loss', 'loss'], 'CLOSED - BREAKEVEN': ['Breakeven', 'breakeven'], 'CLOSED': ['Closed', 'breakeven'], 'CANCELLED': ['Cancelled', 'breakeven'] };
  var ICONS = { edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4', close: 'M5 12.5l4.5 4.5L19 7.5', del: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13' };
  function iconBtn(kind, label, fn) {
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), path = document.createElementNS(ns, 'path');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); path.setAttribute('d', ICONS[kind]); svg.appendChild(path);
    return el('button', { type: 'button', class: 'ib ' + kind, 'aria-label': label, title: label.replace(/ trade$/, ''), onclick: fn }, [svg]);
  }
  function tradeDate(t) { return t.exitDate || t.entryDate || ''; }
  function renderChips() {
    var c = { all: journal.trades.length, open: 0, closed: 0, cancelled: 0 };
    journal.trades.forEach(function (t) { if (c[t.status] != null) c[t.status]++; });
    var box = $('chips'); box.textContent = '';
    [['all', 'All'], ['open', 'Open'], ['closed', 'Closed'], ['cancelled', 'Cancelled']].forEach(function (p) {
      if (p[0] === 'cancelled' && !c.cancelled) return;
      box.appendChild(el('button', { type: 'button', class: 'chip', 'aria-pressed': String(filter === p[0]), onclick: function () { filter = p[0]; shown = PAGE; renderChips(); renderTrades(); } }, [p[1] + ' ', el('b', { text: String(c[p[0]]) })]));
    });
  }
  function renderTrades() {
    var body = $('tradeRows'); body.textContent = '';
    var list = journal.trades.filter(function (t) { return filter === 'all' || t.status === filter; }).slice().sort(function (a, b) {
      var da = tradeDate(a), db = tradeDate(b);
      return da < db ? 1 : da > db ? -1 : 0;
    });
    $('tradesBadge').textContent = journal.trades.length === 1 ? '1 trade' : journal.trades.length + ' trades';
    $('tradesEmpty').hidden = list.length > 0;
    $('tradesEmpty').textContent = journal.trades.length ? 'No trades match this filter.' : 'No trades yet. Log your first one above, or import a backup below.';
    $('moreRow').hidden = list.length <= shown;
    $('moreBtn').textContent = 'Show more (' + Math.max(0, list.length - shown) + ' left)';
    list.slice(0, shown).forEach(function (t) {
      var res = ST.tradeResult(t), books = ST.positionAccounting(t), badge = ST.statusBadge(t);
      var lab = LABELS[badge.label] || [badge.label, 'breakeven'];
      var pnlText = '—', pnlCls = 'dim', pnlTitle = '';
      if (typeof res.netCents === 'bigint') {
        pnlText = money(res.netCents); pnlCls = signClass(res.netCents);
        if (res.reason === 'partial') pnlTitle = 'Realized on exited shares so far';
        if (res.reason === 'undated') pnlTitle = 'No exit date, so not in the totals';
      } else if (typeof books.unrealizedCents === 'bigint') {
        pnlText = money(books.unrealizedCents) + pctNote(books.unrealizedPercent); pnlCls = 'dim mark'; pnlTitle = 'Unrealized from the mark you typed' + (books.markAsOf ? ' on ' + fmtDate(books.markAsOf) : '');
      }
      var exits = Array.isArray(t.exits) ? t.exits : [];
      var exitText = exits.length ? exits.length + ' exit' + (exits.length === 1 ? '' : 's') : price(t.exitPrice);
      var open = t.status === 'open';
      var actions = el('div', { class: 'actions' }, [
        iconBtn('edit', 'Edit ' + t.symbol + ' trade', function () { startEdit(t.id); }),
        open ? iconBtn('close', 'Close ' + t.symbol + ' trade', function () { openClose(t.id); }) : null,
        iconBtn('del', 'Delete ' + t.symbol + ' trade', function () { confirmDelete(t.id); })
      ]);
      body.appendChild(el('tr', { class: t.id === editingId ? 'editing' : '' }, [
        el('td', { text: fmtDate(tradeDate(t)) }),
        el('td', { class: 'sym' }, [el('b', { text: t.symbol })]),
        el('td', { text: (t.direction === 'short' ? 'Short' : 'Long') + ' · ' + ST.assetLabel(t) }),
        el('td', { class: 'r', text: qty(t.quantity) }),
        el('td', { class: 'r', text: price(ST.effectiveEntry(t)) }),
        el('td', { class: 'r' + (exitText === '—' ? ' dim' : ''), text: exitText }),
        el('td', { class: 'r ' + pnlCls, text: pnlText, title: pnlTitle || null }),
        el('td', {}, [el('span', { class: 'pill ' + lab[1], text: lab[0], title: badge.note })]),
        el('td', { class: 'r' }, [actions])
      ]));
    });
  }
  $('moreBtn').addEventListener('click', function () { shown += PAGE * 2; renderTrades(); });

  /* ---------- Calendar ---------- */
  function renderCalendar() {
    var y = calMonth.y, m = calMonth.m, grid = $('calGrid');
    var sum = ST.monthSummary(journal, y, m, new Date());
    grid.textContent = '';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function (d) { grid.appendChild(el('div', { class: 'dow', role: 'columnheader', text: d })); });
    var first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), tdy = today();
    for (var i = 0; i < first; i++) grid.appendChild(el('div', { class: 'day blank', 'aria-hidden': 'true' }));
    for (var d = 1; d <= days; d++) {
      var key = y + '-' + (m < 9 ? '0' : '') + (m + 1) + '-' + (d < 10 ? '0' : '') + d;
      var det = ST.dayDetail(journal, key), cls = 'day', amt = '', label = MONTHS[m] + ' ' + d;
      var v = det.tradeCents;
      if (typeof v === 'bigint') { cls += v > 0n ? ' up' : v < 0n ? ' down' : ' flat'; amt = ST.formatCellCents(v) || '$0'; label += ', ' + money(v); }
      else if (typeof det.manualCents === 'bigint') { cls += ' manual'; amt = ST.formatCellCents(det.manualCents) || '$0'; label += ', manual ' + money(det.manualCents); }
      else label += ', no closed trades';
      if (journal.days[key]) { cls += ' has-note'; label += ', has a manual entry'; }
      if (key === tdy) cls += ' today';
      grid.appendChild(el('button', { type: 'button', class: cls, role: 'gridcell', title: typeof v === 'bigint' ? money(v) : '', 'aria-label': label, 'data-key': key, onclick: openDayFromEvent }, [
        el('span', { class: 'd', text: String(d) }), el('span', { class: 'p', text: amt })]));
    }
    $('calTitle').textContent = MONTHS[m] + ' ' + y;
    $('calTotal').textContent = sum.tradeDays ? money(sum.tradeCents) + ' · ' + sum.tradeDays + ' trading day' + (sum.tradeDays === 1 ? '' : 's') : 'No closed trades this month';
    $('calTotal').className = sum.tradeDays ? signClass(sum.tradeCents) : '';
    var foot = [];
    if (sum.manualDays) foot.push('Manual entries ' + money(sum.manualCents) + ' on ' + sum.manualDays + ' day' + (sum.manualDays === 1 ? '' : 's') + ' (shown in gray, not added to trade totals)');
    if (typeof sum.adjustmentCents === 'bigint') foot.push('Account adjustments ' + money(sum.adjustmentCents));
    if (typeof sum.ytdTradeCents === 'bigint') foot.push(sum.ytdLabel + ' ' + money(sum.ytdTradeCents));
    $('calFoot').textContent = foot.join(' · ');
  }
  function openDayFromEvent(e) { openDay(e.currentTarget.getAttribute('data-key')); }
  $('calPrev').addEventListener('click', function () { calMonth.m--; if (calMonth.m < 0) { calMonth.m = 11; calMonth.y--; } renderCalendar(); });
  $('calNext').addEventListener('click', function () { calMonth.m++; if (calMonth.m > 11) { calMonth.m = 0; calMonth.y++; } renderCalendar(); });

  var dayKey = null;
  function openDay(key) {
    dayKey = key;
    var det = ST.dayDetail(journal, key), day = journal.days[key] || null;
    $('dayTitle').textContent = fmtLong(key);
    var box = $('dayTrades'); box.textContent = '';
    if (det.trades.length) {
      box.appendChild(el('p', { class: 's', text: 'Closed trades: ' + money(det.tradeCents) }));
      box.appendChild(el('ul', { class: 'mini' }, det.trades.map(function (r) { return el('li', {}, [el('b', { text: r.symbol }), ' ' + (r.direction === 'short' ? 'short' : 'long') + ' · ', el('span', { class: signClass(r.netCents), text: money(r.netCents) })]); })));
    } else box.appendChild(el('p', { class: 's', text: 'No closed trades on this day.' }));
    $('d-manual').value = day && day.manualPnl != null ? String(day.manualPnl) : '';
    $('d-note').value = day ? str(day.note) : '';
    $('de-manual').textContent = '';
    var extra = [];
    if (day && day.adjustment != null) extra.push('Account adjustment ' + money(ST.parseCents(day.adjustment)) + (day.adjustmentNote ? ' (' + day.adjustmentNote + ')' : '') + ' is kept.');
    if (day && day.breakdown && day.breakdown.length) extra.push(day.breakdown.length + ' ticker breakdown row' + (day.breakdown.length === 1 ? ' is' : 's are') + ' kept.');
    $('dayExtra').textContent = extra.join(' ');
    $('dayClear').hidden = !day;
    $('dayDlg').showModal();
  }
  $('dayForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var existing = journal.days[dayKey] || {};
    var built = ST.dayFromFields(Object.assign({}, existing, { manualPnl: $('d-manual').value.trim(), note: $('d-note').value }));
    if (built.error) { $('de-manual').textContent = built.error; $('d-manual').focus(); return; }
    var day = built.day;
    var empty = day.manualPnl == null && !day.note && !(day.breakdown && day.breakdown.length) && day.adjustment == null && !day.adjustmentNote;
    var key = dayKey;
    if (change(function (j) { if (empty) delete j.days[key]; else j.days[key] = day; }, 'Day saved.')) $('dayDlg').close();
  });
  $('dayClear').addEventListener('click', function () {
    var key = dayKey;
    if (!window.confirm('Remove the manual entry and account adjustment for this day? Closed trades stay.')) return;
    if (change(function (j) { delete j.days[key]; }, 'Day cleared.')) $('dayDlg').close();
  });

  function renderAll() { renderKpis(); renderChips(); renderTrades(); renderCalendar(); }

  /* ---------- Log / edit form ---------- */
  var form = $('tradeForm');
  var FIELDS = ['symbol', 'quantity', 'entryPrice', 'exitPrice', 'hardStop', 'entryDate', 'exitDate', 'fees', 'markPrice'];
  function val(name) { var e = form.elements[name]; if (!e) return ''; if (e instanceof RadioNodeList) return e.value; return String(e.value || '').trim(); }
  function setRadio(name, v) { var r = form.querySelector('input[name="' + name + '"][value="' + v + '"]'); if (r) r.checked = true; }
  function editingTrade() { return editingId ? findTrade(editingId) : null; }
  function showErrors(errors) {
    FIELDS.forEach(function (f) {
      var e = $('e-' + f); if (e) e.textContent = errors[f] || '';
      var inp = form.elements[f];
      if (inp && inp.tagName === 'INPUT') { if (errors[f]) { inp.setAttribute('aria-invalid', 'true'); inp.setAttribute('aria-describedby', 'e-' + f); } else inp.removeAttribute('aria-invalid'); }
    });
    var sum = $('formSummary');
    sum.hidden = !errors.form; sum.textContent = errors.form || '';
  }
  function num(v, parser) { return v === '' ? null : parser(v); }
  // Build a trade from the form. Existing fields the form doesn't show (exits, strategy, thesis, checklist…) are kept.
  function buildFromForm() {
    var e = {}, existing = editingTrade();
    var symbol = val('symbol').replace(/^\$/, '').toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) e.symbol = 'Enter a ticker like AAPL or BRK.B.';
    var q = num(val('quantity'), ST.qtyNumber);
    if (val('quantity') === '' && !(existing && existing.quantity == null)) e.quantity = 'Enter how many.';
    else if (val('quantity') !== '' && (q == null || q <= 0)) e.quantity = 'Enter a number above zero (up to 4 decimals).';
    var entryRaw = val('entryPrice'), entry = num(entryRaw, ST.priceNumber);
    var keepAvg = existing && existing.entryPrice == null && existing.avgCost != null && entryRaw === str(existing.avgCost);
    if (entryRaw === '' && !(existing && ST.effectiveEntry(existing) == null)) e.entryPrice = 'Enter the entry price.';
    else if (entryRaw !== '' && (entry == null || entry <= 0)) e.entryPrice = 'Enter a price above zero.';
    var hasExits = existing && Array.isArray(existing.exits) && existing.exits.length;
    var exitRaw = hasExits ? '' : val('exitPrice'), exit = num(exitRaw, ST.priceNumber);
    if (exitRaw !== '' && (exit == null || exit <= 0)) e.exitPrice = 'Enter an exit price above zero, or leave it empty.';
    ['hardStop', 'markPrice'].forEach(function (f) { var r = val(f); if (r !== '' && (ST.priceNumber(r) == null || ST.priceNumber(r) < 0)) e[f] = 'Enter a price, or leave it empty.'; });
    if (val('fees') !== '' && (ST.moneyNumber(val('fees')) == null || ST.moneyNumber(val('fees')) < 0)) e.fees = 'Enter fees like 1.25, or leave it empty.';
    var entryDate = val('entryDate');
    if (entryDate === '' && !existing) e.entryDate = 'Pick the trade date.';
    if (Object.keys(e).length) return { errors: e };
    var t = existing ? JSON.parse(JSON.stringify(existing)) : {};
    t.symbol = symbol;
    t.direction = val('direction') === 'short' ? 'short' : 'long';
    t.assetType = val('assetType');
    t.quantity = val('quantity') === '' ? null : val('quantity');
    if (!keepAvg) t.entryPrice = entryRaw === '' ? null : entryRaw;
    t.hardStop = val('hardStop') === '' ? null : val('hardStop');
    t.entryDate = entryDate;
    t.fees = val('fees') === '' ? null : val('fees');
    t.notes = form.elements.notes.value;
    if (!hasExits) {
      if (exitRaw !== '') { t.status = 'closed'; t.exitPrice = exitRaw; t.exitDate = val('exitDate') || entryDate || today(); }
      else { if (!existing || existing.status !== 'cancelled') t.status = 'open'; t.exitPrice = null; t.exitDate = ''; }
    }
    var markRaw = t.status === 'open' ? val('markPrice') : '';
    var prevMark = existing && existing.markPrice != null ? str(existing.markPrice) : '';
    if (markRaw === '') { t.markPrice = null; t.markAsOf = ''; }
    else { t.markPrice = markRaw; if (markRaw !== prevMark || !t.markAsOf) t.markAsOf = today(); }
    var built = ST.tradeFromFields(t, existing ? existing.id : '');
    if (built.error) return { errors: { form: built.error } };
    return { trade: built.trade };
  }
  function syncFormHints() {
    var opt = val('assetType') !== '';
    $('qtyLabel').textContent = opt ? 'Contracts' : 'Shares';
    $('entryHint').textContent = opt ? 'premium' : 'per share';
    var existing = editingTrade(), hasExits = existing && Array.isArray(existing.exits) && existing.exits.length;
    $('closeDateField').hidden = hasExits || val('exitPrice') === '';
    $('markField').hidden = val('exitPrice') !== '' || (existing && existing.status !== 'open');
    var prev = '', q = ST.qtyNumber(val('quantity')), en = ST.priceNumber(val('entryPrice'));
    if (q && en) {
      var mult = opt ? 100n : 1n;
      var basis = ST.divRound(ST.parsePriceTicks(val('entryPrice')) * ST.parseQtyTicks(val('quantity')) * mult, 1000000n);
      prev = 'Cost basis ' + plain(basis);
      if (!hasExits && ST.priceNumber(val('exitPrice'))) {
        var g = ST.grossPnlCents(val('direction') === 'short' ? 'short' : 'long', val('entryPrice'), val('exitPrice'), val('quantity'), Number(mult));
        var net = ST.netPnlCents(g, val('fees') || null);
        if (typeof net === 'bigint') prev += ' · P&L ' + money(net);
      }
    }
    $('formPreview').textContent = prev;
  }
  form.addEventListener('input', syncFormHints);
  form.addEventListener('change', syncFormHints);
  function resetForm() {
    form.reset(); editingId = null;
    form.elements.exitPrice.disabled = false;
    $('f-date').value = today();
    $('submitBtn').textContent = 'Log trade';
    $('cancelEdit').hidden = true;
    $('exitsNote').hidden = true;
    $('h-log').textContent = 'Log a trade.';
    showErrors({}); syncFormHints();
  }
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var r = buildFromForm();
    if (r.errors) {
      showErrors(r.errors);
      var firstBad = FIELDS.filter(function (f) { return r.errors[f]; })[0];
      if (firstBad && form.elements[firstBad]) form.elements[firstBad].focus();
      toast(r.errors.form || 'Check the highlighted fields.', true);
      return;
    }
    var t = r.trade, id = editingId;
    var ok = change(function (j) {
      if (id) j.trades = j.trades.map(function (x) { return x.id === id ? t : x; });
      else j.trades.push(t);
    }, t.symbol + (id ? ' trade updated.' : ' logged. Prices are the ones you typed.'));
    if (ok) resetForm();
  });
  $('cancelEdit').addEventListener('click', function () { resetForm(); renderTrades(); });

  function startEdit(id) {
    var t = findTrade(id); if (!t) return;
    resetForm();
    editingId = id;
    $('f-symbol').value = t.symbol;
    setRadio('direction', t.direction === 'short' ? 'short' : 'long');
    setRadio('assetType', t.assetType === 'call' || t.assetType === 'put' ? t.assetType : '');
    $('f-qty').value = str(t.quantity);
    $('f-entry').value = str(ST.effectiveEntry(t));
    $('f-stop').value = str(t.hardStop);
    $('f-date').value = t.entryDate || '';
    $('f-fees').value = str(t.fees);
    $('f-mark').value = str(t.markPrice);
    form.elements.notes.value = str(t.notes);
    var exits = Array.isArray(t.exits) ? t.exits : [];
    if (exits.length) {
      form.elements.exitPrice.value = ''; form.elements.exitPrice.disabled = true;
      $('exitsNote').hidden = false;
      $('exitsNote').textContent = 'This trade has ' + exits.length + ' partial exit' + (exits.length === 1 ? '' : 's') + ' (' + exits.map(function (x) { return qty(x.quantity) + ' @ ' + price(x.price) + (x.date ? ' on ' + fmtDate(x.date) : ''); }).join(', ') + '). They are kept exactly as recorded.';
    } else {
      $('f-exit').value = str(t.exitPrice);
      $('f-closeDate').value = t.exitDate || '';
    }
    if (t.status === 'cancelled') { $('exitsNote').hidden = false; $('exitsNote').textContent = 'This trade is cancelled. It stays cancelled unless you enter an exit.'; }
    $('submitBtn').textContent = 'Save changes';
    $('cancelEdit').hidden = false;
    $('h-log').textContent = 'Edit ' + t.symbol + '.';
    showErrors({}); syncFormHints(); renderTrades();
    $('log').scrollIntoView({ block: 'start' });
    $('f-symbol').focus({ preventScroll: true });
  }

  /* ---------- Close + delete ---------- */
  var closeId = null;
  function openClose(id) {
    var t = findTrade(id); if (!t) return;
    closeId = id;
    var books = ST.positionAccounting(t);
    var unit = ST.assetTypeOf(t) === 'equity' ? '' : ' ' + ST.assetLabel(t);
    $('closeSub').textContent = (t.direction === 'short' ? 'Short ' : 'Long ') + qty(books.remainingQty != null ? books.remainingQty : t.quantity) + ' ' + t.symbol + unit + ' @ ' + price(ST.effectiveEntry(t)) + (books.partial ? ' (remaining after partial exits)' : '');
    $('c-exit').value = ''; $('c-fees').value = ''; $('c-date').value = today();
    $('ce-exit').textContent = ''; $('ce-date').textContent = '';
    $('closeDlg').showModal(); $('c-exit').focus();
  }
  $('closeForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var t = findTrade(closeId); if (!t) { $('closeDlg').close(); return; }
    var px = $('c-exit').value.trim(), date = $('c-date').value, fees = $('c-fees').value.trim();
    var n = ST.priceNumber(px);
    $('ce-exit').textContent = px === '' ? 'Enter the exit price.' : (n == null || n <= 0 ? 'Enter a price above zero.' : '');
    $('ce-date').textContent = date ? '' : 'Pick the close date.';
    if ($('ce-exit').textContent || $('ce-date').textContent) return;
    var next = JSON.parse(JSON.stringify(t));
    var exits = Array.isArray(next.exits) ? next.exits : [];
    if (exits.length) {
      var books = ST.positionAccounting(t);
      if (!(books.remainingQty > 0)) { $('ce-exit').textContent = 'Nothing left to close.'; return; }
      exits.push({ quantity: books.remainingQty, price: px, date: date, fees: fees === '' ? null : fees, reason: '' });
      next.exits = exits;
    } else {
      next.exitPrice = px; next.exitDate = date;
      if (fees !== '') next.fees = fees;
    }
    next.status = 'closed'; next.markPrice = null; next.markAsOf = '';
    var built = ST.tradeFromFields(next, t.id);
    if (built.error) { $('ce-exit').textContent = built.error; return; }
    if (change(function (j) { j.trades = j.trades.map(function (x) { return x.id === t.id ? built.trade : x; }); })) {
      $('closeDlg').close();
      toast(t.symbol + ' closed · ' + money(ST.tradeResult(built.trade).netCents));
    }
  });
  var delId = null;
  function confirmDelete(id) {
    var t = findTrade(id); if (!t) return;
    delId = id;
    $('confirmSub').textContent = t.symbol + ' · ' + fmtDate(tradeDate(t)) + '. This removes it from your totals and can’t be undone (export a backup first if you need it).';
    $('confirmDlg').returnValue = '';
    $('confirmDlg').showModal();
    $('confirmDlg').querySelector('[data-cancel]').focus();
  }
  $('confirmDlg').addEventListener('close', function () {
    if ($('confirmDlg').returnValue === 'ok' && delId) {
      var id = delId, t = findTrade(id);
      if (editingId === id) resetForm();
      change(function (j) { j.trades = j.trades.filter(function (x) { return x.id !== id; }); }, (t ? t.symbol : 'Trade') + ' deleted.');
    }
    delId = null;
  });
  document.querySelectorAll('dialog [data-cancel]').forEach(function (b) {
    b.addEventListener('click', function () { b.closest('dialog').close('cancel'); });
  });

  /* ---------- Position size (same math as before) ---------- */
  var sizeForm = $('sizeForm');
  function renderSize(ev) {
    var fd = new FormData(sizeForm), mode = fd.get('mode');
    $('s-entryLabel').textContent = mode === 'options' ? 'Premium' : 'Entry';
    var input = { capital: fd.get('account'), riskPercent: fd.get('risk'), entry: fd.get('entry'), stop: fd.get('stop'), assetType: mode };
    var r = ST.calculateRisk(input);
    var out = $('sizeOut'); out.textContent = '';
    function res(label, v, sub) { return el('div', { class: 'card' }, [el('p', { class: 's', text: label }), el('div', { class: 'v', text: v }), sub ? el('p', { class: 's', text: sub }) : null]); }
    if (!r.ok) { out.appendChild(el('p', { class: 'note', text: r.error })); return; }
    out.appendChild(res(mode === 'options' ? 'Max contracts' : 'Max shares', r.maxUnits, r.unitLabel));
    out.appendChild(res('Capital at risk', plain(r.capitalAtRiskCents), 'If the stop is hit'));
    out.appendChild(res('Account drawdown', r.maxDrawdownPercent || '—', 'At the stop'));
    if (r.note) out.appendChild(el('p', { class: 'note warn', text: r.note }));
    out.appendChild(el('p', { class: 'note', text: ST.RISK_DISCLAIMER }));
    if ($('s-remember').checked && ev && ev.type === 'change') {
      var account = ST.moneyNumber(input.capital), pct = ST.scaledToNumber(ST.parseScaledDigits(input.riskPercent, 2), 2);
      var s = journal.settings || {};
      if (account !== s.accountSize || pct !== s.riskPercent) change(function (j) { j.settings = Object.assign({}, j.settings, { accountSize: account, riskPercent: pct }); });
    }
  }
  sizeForm.addEventListener('input', renderSize);
  sizeForm.addEventListener('change', renderSize);
  sizeForm.addEventListener('submit', function (e) { e.preventDefault(); });
  (function prefillSize() {
    var s = journal.settings || {};
    $('s-account').value = s.accountSize != null ? String(s.accountSize) : '';
    $('s-risk').value = s.riskPercent != null ? String(s.riskPercent) : '';
    $('s-remember').checked = s.accountSize != null || s.riskPercent != null;
  })();

  /* ---------- Backup ---------- */
  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = el('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  $('exportBtn').addEventListener('click', function () { download('bryz-trades-' + today() + '.json', ST.exportJson(journal), 'application/json'); toast('Backup downloaded (' + journal.trades.length + ' trades).'); });
  $('csvTradesBtn').addEventListener('click', function () { download('bryz-trades-trades-' + today() + '.csv', ST.tradesToCsv(journal), 'text/csv'); toast('Trades CSV downloaded.'); });
  $('csvDaysBtn').addEventListener('click', function () { download('bryz-trades-days-' + today() + '.csv', ST.dailyToCsv(journal), 'text/csv'); toast('Days CSV downloaded.'); });
  var pendingPlan = null;
  $('importFile').addEventListener('change', function (ev) {
    var f = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast('That file is too big (max 2 MB).', true); return; }
    f.text().then(function (txt) {
      var plan = ST.planImport(journal, txt);
      if (!plan.ok) { toast(plan.error || 'Couldn’t read that file. Nothing was changed.', true); return; }
      pendingPlan = plan;
      var lines = ['This file has ' + plan.fileTrades + ' trade' + (plan.fileTrades === 1 ? '' : 's') + ' and ' + plan.fileDays + ' manual day' + (plan.fileDays === 1 ? '' : 's') + '. You have ' + journal.trades.length + ' saved.'];
      if (plan.duplicateIds.length) lines.push(plan.duplicateIds.length + ' share an id with a saved trade (merge keeps your saved copy unless you tick overwrite).');
      if (plan.similar.length) lines.push(plan.similar.length + ' closed trade' + (plan.similar.length === 1 ? ' looks' : 's look') + ' like one already saved (skipped unless you tick below).');
      if (plan.dayOverlaps.length) lines.push(plan.dayOverlaps.length + ' manual day' + (plan.dayOverlaps.length === 1 ? '' : 's') + ' overlap.');
      lines.push('A safety copy of your current journal is kept in this browser first.');
      $('importSummary').textContent = lines.join(' ');
      $('i-overwrite').checked = false; $('i-similar').checked = false; $('i-days').checked = false;
      $('importDlg').returnValue = '';
      $('importDlg').showModal();
    }, function () { toast('Couldn’t read that file.', true); });
  });
  $('importDlg').addEventListener('close', function () {
    var mode = $('importDlg').returnValue, plan = pendingPlan; pendingPlan = null;
    if (!plan || (mode !== 'merge' && mode !== 'replace')) return;
    if (mode === 'replace' && !window.confirm('Replace all ' + journal.trades.length + ' saved trades with the ' + plan.fileTrades + ' in this file? A safety copy is kept in this browser.')) return;
    try {
      journal = ST.commitImport(localStorage, journal, plan, { mode: mode, overwriteIds: $('i-overwrite').checked, importSimilar: $('i-similar').checked, days: $('i-days').checked ? 'file' : 'keep' });
      blocked = false; banner('');
    } catch (err) { toast(err.message || 'Import failed. Nothing was changed.', true); return; }
    resetForm(); renderAll();
    toast(mode === 'replace' ? 'Journal replaced. The previous copy is backed up in this browser.' : 'Import merged. Matching trades were not counted twice.');
  });
  $('startFresh').addEventListener('click', function () {
    if (!window.confirm('Start saving again? What you see now becomes your saved journal. The unreadable or older copy stays in this browser untouched.')) return;
    blocked = false; banner(''); persist();
  });

  /* ---------- Theme (same key as before) ---------- */
  function syncThemeBtn() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    $('themeBtn').textContent = dark ? 'Light mode' : 'Dark mode';
    $('themeBtn').setAttribute('aria-pressed', String(dark));
  }
  $('themeBtn').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('stock-tracker-theme', next); } catch (e) { /* private mode */ }
    syncThemeBtn();
  });
  $('heroLog').addEventListener('click', function () { setTimeout(function () { $('f-symbol').focus({ preventScroll: true }); }, 350); });

  resetForm(); renderAll(); renderSize(); syncThemeBtn();
  if (blocked) { banner(loaded.warning || 'Saving is paused so nothing is overwritten.', true); $('saveState').textContent = 'Not saved'; }
  else if (loaded.warning) banner(loaded.warning, false);
})();
