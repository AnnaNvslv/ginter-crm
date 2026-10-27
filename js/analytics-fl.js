// ═══ Analitika: Okviri i stakla po periodima ═══
// Blok na dnu sekcije Analitika: promet po mesecima/godinama razložen na okvire,
// stakla, sočiva i izradu; prosečna cena okvira i para stakala; poređenje sa istim
// periodom prošle godine; udeo okvira i stakala po cenovnim razredima.
// Koristi iste podatke koje loadAnalyticsSection() već učitava — nema novih upita.

let flPeriod = 'month';   // 'month' | 'year'
let flData = null;        // { rows, frameItems, lensItems }
let flChart = null;

const FL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Avg', 'Sep', 'Okt', 'Nov', 'Dec'];
const FL_FRAME_BUCKETS = [
  { label: 'do 3.000', max: 2999 }, { label: '3.000–5.999', max: 5999 }, { label: '6.000–8.999', max: 8999 },
  { label: '9.000–12.999', max: 12999 }, { label: '13.000+', max: Infinity },
];
const FL_LENS_BUCKETS = [
  { label: 'do 1.000', max: 1000 }, { label: '1.001–1.600', max: 1600 }, { label: '1.601–3.000', max: 3000 },
  { label: '3.001–5.000', max: 5000 }, { label: '5.001–10.000', max: 10000 }, { label: '10.000+', max: Infinity },
];
const FL_BLUES = ['#B5D4F4', '#85B7EB', '#378ADD', '#185FA5', '#0C447C', '#062b4f'];
const FL_TEALS = ['#E1F5EE', '#9FE1CB', '#5DCAA5', '#1D9E75', '#0F6E56', '#085041'];

// Priprema: jedan red po porudžbini (sa poznatim datumom) + pojedinačni okviri i stakla.
// Porudžbina sa samo godinom ulazi samo u godišnji prikaz; bez datuma — nigde.
function prepareFlData({ orders, framesByOrder, lensesByOrder }) {
  const rows = [], frameItems = [], lensItems = [];
  orders.forEach(o => {
    const prec = o.order_date_prec || 'day';
    if (!o.order_date || prec === 'unknown') return;
    const y = o.order_date.slice(0, 4);
    const ym = prec === 'year' ? null : o.order_date.slice(0, 7);
    const fr = framesByOrder[o.id] || [];
    const ls = lensesByOrder[o.id] || [];
    let fp = 0, fn = 0, fc = 0, w = Number(o.izrada_price) || 0;
    fr.forEach(f => {
      w += Number(f.work_price) || 0;
      if (f.is_client) { fc++; return; }
      const p = Number(f.price) || 0;
      fp += p;
      if (p > 0) { fn++; frameItems.push({ y, ym, p }); }
    });
    let ln = 0, lq = 0;
    ls.forEach(l => {
      const q = Number(l.qty) || 0;
      ln += lensTotal(l.price_unit, l.discount, l.qty);
      lq += q;
      const pu = Number(l.price_unit) || 0;
      if (pu > 0 && q > 0) lensItems.push({ y, ym, pu, q });
    });
    const tot = Number(o.total_amount) || 0;
    let cl = 0;
    if (o.order_type === 'contact_lenses') cl = tot;
    else if (o.order_type === 'combined') cl = Math.min(tot, applyDiscount(Number(o.cl_amount) || 0, o.discount_percent));
    rows.push({ date: o.order_date, exact: prec === 'day', y, ym, type: o.order_type, fp, fn, fc, ln, lq, cl, w, tot });
  });
  return { rows, frameItems, lensItems };
}

function flAgg(list) {
  const a = { orders: list.length, cl_orders: 0, fp: 0, fn: 0, fc: 0, ln: 0, lq: 0, cl: 0, w: 0, tot: 0, paid: 0 };
  list.forEach(r => {
    if (r.type === 'contact_lenses') a.cl_orders++;
    a.fp += r.fp; a.fn += r.fn; a.fc += r.fc; a.ln += r.ln; a.lq += r.lq; a.cl += r.cl; a.w += r.w; a.tot += r.tot;
    if (r.tot > 0) a.paid++;
  });
  a.check = a.paid ? Math.round(a.tot / a.paid) : null;
  a.frameAvg = a.fn ? Math.round(a.fp / a.fn) : null;
  a.lensPair = a.lq ? Math.round(a.ln * 2 / a.lq) : null;
  return a;
}

function flPeriodLabel(key) {
  return key.length === 7 ? `${FL_MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : key;
}

// Ključevi perioda: mesečno — poslednja 24 meseca (sa 0 gde nema porudžbina), godišnje — sve godine.
function flPeriodKeys(period) {
  if (period === 'year') return [...new Set(flData.rows.map(r => r.y))].sort();
  const keys = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function renderFlBlock(ctx) {
  flData = prepareFlData(ctx);
  const wrap = document.getElementById('analytics-content');
  if (!wrap) return;
  let host = document.getElementById('analytics-fl');
  if (!host) {
    wrap.insertAdjacentHTML('beforeend', '<div id="analytics-fl"></div>');
    host = document.getElementById('analytics-fl');
  }
  renderFl();
}

function setFlPeriod(p) {
  flPeriod = p;
  renderFl();
}

function flDelta(cur, prev) {
  if (cur == null || !prev) return '<small>—</small>';
  const d = (cur / prev - 1) * 100;
  const color = d >= 0 ? '#1D9E75' : 'var(--danger)';
  return `<small style="color:${color};">${d > 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')}% · bilo ${fmtMoney(prev).replace(' RSD', '')}</small>`;
}

function renderFl() {
  const host = document.getElementById('analytics-fl');
  if (!host || !flData) return;

  // ── Ova godina do danas vs isti period prošle godine (samo porudžbine sa tačnim datumom ili mesecom) ──
  const today = new Date();
  const cy = String(today.getFullYear()), py = String(today.getFullYear() - 1);
  const mmdd = today.toISOString().slice(5, 10);
  const dated = flData.rows.filter(r => r.ym);
  const cur = flAgg(dated.filter(r => r.y === cy && r.date.slice(5, 10) <= mmdd));
  const prev = flAgg(dated.filter(r => r.y === py && r.date.slice(5, 10) <= mmdd));
  const asOf = `${mmdd.slice(3, 5)}.${mmdd.slice(0, 2)}.`;

  // ── Tabela i grafikon po periodima ──
  const keys = flPeriodKeys(flPeriod);
  const keyOf = r => (flPeriod === 'year' ? r.y : r.ym);
  const byKey = {};
  flData.rows.forEach(r => { const k = keyOf(r); if (k) (byKey[k] ??= []).push(r); });
  const aggs = keys.map(k => ({ key: k, ...flAgg(byKey[k] || []) }));

  // ── Cenovni razredi: godišnje — po godinama, mesečno — poslednjih 12 meseci ──
  const segKeys = flPeriod === 'year' ? keys.filter(k => k >= '2024') : keys.slice(-12);
  const segKeyOf = it => (flPeriod === 'year' ? it.y : it.ym);
  const frameSeg = flSegRows(flData.frameItems, segKeys, segKeyOf, FL_FRAME_BUCKETS, it => it.p, () => 1);
  const lensSeg = flSegRows(flData.lensItems, segKeys, segKeyOf, FL_LENS_BUCKETS, it => it.pu, it => it.q);

  const n = v => (v == null ? '—' : fmtMoney(v).replace(' RSD', ''));
  host.innerHTML = `
    <div class="analytics-section-title" style="margin-top:36px;">Okviri i stakla po periodima <span class="sub">— cene okvira i stakala, mesečno i godišnje</span></div>
    <div class="type-toggle" style="max-width:280px;margin-bottom:16px;">
      <button type="button" class="${flPeriod === 'month' ? 'active' : ''}" onclick="setFlPeriod('month')">Mesečno</button>
      <button type="button" class="${flPeriod === 'year' ? 'active' : ''}" onclick="setFlPeriod('year')">Godišnje</button>
    </div>

    <div class="analytics-trend-note" style="margin-bottom:10px;">${cy}. od 1. januara do ${asOf} u poređenju sa istim periodom ${py}. godine</div>
    <div class="metric-grid">
      <div class="metric-card"><div class="label">Promet</div><div class="value">${n(cur.tot)}</div>${flDelta(cur.tot, prev.tot)}</div>
      <div class="metric-card"><div class="label">Broj porudžbina</div><div class="value">${cur.orders}</div>${flDelta(cur.orders, prev.orders).replace(/ · bilo [\d.]+/, ` · bilo ${prev.orders}`)}</div>
      <div class="metric-card"><div class="label">Prosečna porudžbina</div><div class="value">${n(cur.check)}</div>${flDelta(cur.check, prev.check)}</div>
      <div class="metric-card"><div class="label">Prosečna cena okvira</div><div class="value">${n(cur.frameAvg)}</div>${flDelta(cur.frameAvg, prev.frameAvg)}</div>
      <div class="metric-card"><div class="label">Prosečna cena para stakala</div><div class="value">${n(cur.lensPair)}</div>${flDelta(cur.lensPair, prev.lensPair)}</div>
    </div>

    <div class="analytics-section-title">Promet: okviri, stakla, sočiva, izrada <span class="sub">— ${flPeriod === 'year' ? 'po godinama' : 'poslednja 24 meseca'}; po cenovniku, popust na celu porudžbinu nije oduzet</span></div>
    <div class="chart-wrap" style="height:260px;"><canvas id="analytics-fl-chart" role="img" aria-label="Promet po periodima: okviri, stakla, sočiva, izrada"></canvas></div>
    <div class="legend-row">
      <span><span class="legend-dot" style="background:#eb6834;"></span>Okviri</span>
      <span><span class="legend-dot" style="background:#1A6DB5;"></span>Stakla</span>
      <span><span class="legend-dot" style="background:#1baf7a;"></span>Sočiva</span>
      <span><span class="legend-dot" style="background:#9CA3AF;"></span>Izrada</span>
    </div>

    <div class="analytics-section-title">Po ${flPeriod === 'year' ? 'godinama' : 'mesecima'}</div>
    <div style="overflow-x:auto;">
    <table class="data-table" style="min-width:900px;">
      <thead><tr>
        <th>${flPeriod === 'year' ? 'Godina' : 'Mesec'}</th><th class="num">Porudžbina</th><th class="num">od toga sočiva</th><th class="num">Promet</th><th class="num">Prosečna porudžbina</th>
        <th class="num">Prodato okvira</th><th class="num">Klijentovih okvira</th><th class="num">Okviri, ukupno</th><th class="num">Prosečan okvir</th>
        <th class="num">Stakla, ukupno</th><th class="num">Prosečan par stakala</th><th class="num">Sočiva, ukupno</th><th class="num">Izrada</th>
      </tr></thead>
      <tbody>
        ${[...aggs].reverse().filter(a => a.orders).map(a => `<tr style="cursor:default;">
          <td>${flPeriodLabel(a.key)}</td><td class="num">${a.orders}</td><td class="num">${a.cl_orders}</td><td class="num">${n(a.tot)}</td><td class="num">${n(a.check)}</td>
          <td class="num">${a.fn}</td><td class="num">${a.fc}</td><td class="num">${n(a.fp)}</td><td class="num">${n(a.frameAvg)}</td>
          <td class="num">${n(a.ln)}</td><td class="num">${n(a.lensPair)}</td><td class="num">${n(a.cl)}</td><td class="num">${n(a.w)}</td>
        </tr>`).join('') || '<tr><td colspan="13">Nema podataka</td></tr>'}
      </tbody>
    </table>
    </div>
    ${flPeriod === 'year' ? '<div class="analytics-trend-note" style="margin-top:8px;">Pre 2024. — pojedinačne porudžbine unete naknadno.</div>' : ''}

    <div class="analytics-grid-2" style="margin-top:8px;">
      <div>
        <div class="analytics-section-title">Okviri po ceni <span class="sub">— udeo prodatih okvira (bez klijentovih)</span></div>
        ${flSegHtml(frameSeg, FL_FRAME_BUCKETS, FL_BLUES, 'okvira')}
      </div>
      <div>
        <div class="analytics-section-title">Stakla po ceni za 1 kom. <span class="sub">— udeo stakala (komada)</span></div>
        ${flSegHtml(lensSeg, FL_LENS_BUCKETS, FL_TEALS, 'kom.')}
      </div>
    </div>
  `;
  renderFlChart(aggs);
}

function flSegRows(items, keys, keyOf, buckets, priceOf, weightOf) {
  return keys.map(k => {
    const counts = buckets.map(() => 0);
    let total = 0;
    items.forEach(it => {
      if (keyOf(it) !== k) return;
      const p = priceOf(it), w = weightOf(it);
      const i = buckets.findIndex(b => p <= b.max);
      counts[i] += w; total += w;
    });
    return { key: k, counts, total };
  }).filter(r => r.total > 0);
}

function flSegHtml(rows, buckets, colors, unit) {
  if (!rows.length) return '<div class="analytics-trend-note">Nema podataka</div>';
  const bars = rows.map(r => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <div style="width:72px;flex-shrink:0;font-size:13px;color:var(--text-light);">${flPeriodLabel(r.key)}</div>
      <div style="flex:1;display:flex;height:22px;border-radius:6px;overflow:hidden;background:var(--section-bg);">
        ${r.counts.map((c, i) => {
          if (!c) return '';
          const pct = c / r.total * 100;
          const dark = i >= 2;
          return `<div title="${buckets[i].label}: ${Math.round(pct)}% (${c} ${unit})" style="width:${pct}%;background:${colors[i]};color:${dark ? '#fff' : '#1F2937'};font-size:11px;display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap;">${pct >= 9 ? Math.round(pct) + '%' : ''}</div>`;
        }).join('')}
      </div>
      <div style="width:44px;flex-shrink:0;text-align:right;font-size:12px;color:var(--text-light);">${r.total}</div>
    </div>`).join('');
  const legend = buckets.map((b, i) => `<span><span class="legend-dot" style="background:${colors[i]};"></span>${b.label}</span>`).join('');
  return bars + `<div class="legend-row">${legend}</div>`;
}

function renderFlChart(aggs) {
  const ctx = document.getElementById('analytics-fl-chart');
  if (!ctx) return;
  if (flChart) flChart.destroy();
  const labels = aggs.map(a => (flPeriod === 'year' ? a.key : `${FL_MONTHS[Number(a.key.slice(5, 7)) - 1]} ${a.key.slice(2, 4)}`));
  const ds = (label, key, color) => ({ label, data: aggs.map(a => Math.round(a[key])), backgroundColor: color, maxBarThickness: 32, stack: 's' });
  flChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [ds('Okviri', 'fp', '#eb6834'), ds('Stakla', 'ln', '#1A6DB5'), ds('Sočiva', 'cl', '#1baf7a'), ds('Izrada', 'w', '#9CA3AF')] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ${fmtMoney(c.parsed.y)}`,
            footer: (items) => {
              const a = aggs[items[0].dataIndex];
              return `Promet: ${fmtMoney(a.tot)} · porudžbina: ${a.orders}`;
            },
          },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: '#6B7280', maxRotation: 0, autoSkip: true } },
        y: { stacked: true, grid: { color: '#DCE6F2' }, ticks: { color: '#6B7280', callback: (v) => (v / 1000) + 'k' } },
      },
    },
  });
}
