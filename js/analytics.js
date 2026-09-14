let analyticsLoaded = false;
let analyticsPeriod = 'month'; // 'month' = poslednjih 12 meseci, 'year' = po kalendarskim godinama
let analyticsTrendChart = null;
let analyticsPurposeChart = null;
let analyticsSplitChart = null;

// Podaci potrebni za graf prometa (mesečno/godišnje) pamte se ovde da se pri
// prebacivanju perioda samo ponovo iscrta graf, bez ponovnog upita ka bazi.
let analyticsTrendData = { monthLabels: [], monthValues: [], yearLabels: [], yearValues: [] };

async function loadAnalyticsSection() {
  analyticsLoaded = true;
  const wrap = document.getElementById('analytics-content');
  wrap.innerHTML = '<div class="empty-state" style="height:auto;padding:60px;">Učitavanje analitike...</div>';

  const [ordersRes, framesRes, lensesRes, opRes, rxRes, patientsRes] = await Promise.all([
    sb.from('orders').select('id, patient_id, order_date, order_type, total_amount, discount_percent, izrada_price, payment_method').is('deleted_at', null),
    sb.from('order_frames').select('order_id, purpose, price, is_client'),
    sb.from('order_lenses').select('order_id, purpose, lens_name, price_unit, discount, qty'),
    sb.from('order_prescriptions').select('order_id, prescription_id'),
    sb.from('prescriptions').select('id, patient_id, purpose, rx_date'),
    sb.from('patients').select('id, first_name, last_name').is('deleted_at', null),
  ]);

  if (ordersRes.error) {
    wrap.innerHTML = '<div class="empty-state" style="height:auto;padding:60px;">Greška pri učitavanju analitike</div>';
    toast('Greška pri učitavanju analitike', true);
    return;
  }

  const orders = ordersRes.data || [];
  const orderIds = new Set(orders.map(o => o.id));
  // order_frames/order_lenses se učitavaju bez filtera po porudžbini, pa se ovde
  // isključuju stavke obrisanih porudžbina (deleted_at nije null).
  const frames = (framesRes.data || []).filter(f => orderIds.has(f.order_id));
  const lenses = (lensesRes.data || []).filter(l => orderIds.has(l.order_id));
  const opLinks = opRes.data || [];
  const prescriptions = rxRes.data || [];
  const patientsMap = {};
  (patientsRes.data || []).forEach(p => { patientsMap[p.id] = p; });

  const framesByOrder = {};
  frames.forEach(f => { (framesByOrder[f.order_id] ??= []).push(f); });
  const lensesByOrder = {};
  lenses.forEach(l => { (lensesByOrder[l.order_id] ??= []).push(l); });

  const rxById = {};
  prescriptions.forEach(rx => { rxById[rx.id] = rx; });
  const rxDatesByOrder = {};
  const linkedPrescriptionIds = new Set();
  opLinks.forEach(link => {
    linkedPrescriptionIds.add(link.prescription_id);
    const rx = rxById[link.prescription_id];
    if (!rx || !rx.rx_date) return;
    (rxDatesByOrder[link.order_id] ??= []).push(rx.rx_date);
  });

  const stats = computeAnalytics({ orders, frames, lenses, framesByOrder, lensesByOrder, patientsMap, prescriptions, rxDatesByOrder, linkedPrescriptionIds });
  renderAnalytics(stats);
}

function computeAnalytics(ctx) {
  const { orders, frames, lenses, framesByOrder, lensesByOrder, patientsMap, prescriptions, rxDatesByOrder, linkedPrescriptionIds } = ctx;

  const totalRevenue = orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  const orderCount = orders.length;
  const avgOrder = orderCount ? Math.round(totalRevenue / orderCount) : 0;

  const glassesOrders = orders.filter(o => o.order_type === 'glasses');
  const clOrders = orders.filter(o => o.order_type === 'contact_lenses');
  const clientFrameOrders = glassesOrders.filter(o => (framesByOrder[o.id] || []).some(f => f.is_client));
  const clientFramePct = glassesOrders.length ? Math.round(clientFrameOrders.length / glassesOrders.length * 100) : 0;

  // ── Promet po mesecima (poslednjih 12) i po godinama ──
  const monthMap = {};
  const yearMap = {};
  orders.forEach(o => {
    if (!o.order_date) return;
    const ym = o.order_date.slice(0, 7);
    const y = o.order_date.slice(0, 4);
    monthMap[ym] = (monthMap[ym] || 0) + (Number(o.total_amount) || 0);
    yearMap[y] = (yearMap[y] || 0) + (Number(o.total_amount) || 0);
  });
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Avg', 'Sep', 'Okt', 'Nov', 'Dec'];
  const now = new Date();
  const monthKeys = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const monthLabels = monthKeys.map(k => monthNames[Number(k.slice(5, 7)) - 1]);
  const monthValues = monthKeys.map(k => monthMap[k] || 0);
  const yearLabels = Object.keys(yearMap).sort();
  const yearValues = yearLabels.map(y => yearMap[y]);

  // ── Promet po nameni ──
  const purposeRevenue = {};
  const addPurpose = (p, amount) => { if (p) purposeRevenue[p] = (purposeRevenue[p] || 0) + amount; };
  frames.forEach(f => { if (!f.is_client) addPurpose(f.purpose, Number(f.price) || 0); });
  lenses.forEach(l => addPurpose(l.purpose, lensTotal(l.price_unit, l.discount, l.qty)));
  clOrders.forEach(o => addPurpose('kontaktna sočiva', Number(o.total_amount) || 0));
  const purposeEntries = Object.entries(purposeRevenue).sort((a, b) => b[1] - a[1]);

  // ── Okviri / stakla / izrada ──
  const framesTotal = frames.reduce((s, f) => s + (f.is_client ? 0 : (Number(f.price) || 0)), 0);
  const lensesTotalSum = lenses.reduce((s, l) => s + lensTotal(l.price_unit, l.discount, l.qty), 0);
  const izradaTotal = glassesOrders.reduce((s, o) => s + (Number(o.izrada_price) || 0), 0);

  // ── Top 5 stakla po prometu ──
  const lensByName = {};
  lenses.forEach(l => {
    const name = (l.lens_name || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!lensByName[key]) lensByName[key] = { name, revenue: 0, count: 0 };
    lensByName[key].revenue += lensTotal(l.price_unit, l.discount, l.qty);
    lensByName[key].count += Number(l.qty) || 0;
  });
  const topLenses = Object.values(lensByName).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // ── Naočare / kontaktna sočiva ──
  const glassesRevenue = glassesOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  const clRevenue = clOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

  // ── Način plaćanja ──
  const paymentRevenue = {};
  orders.forEach(o => {
    const key = o.payment_method || 'Nije upisano';
    paymentRevenue[key] = (paymentRevenue[key] || 0) + (Number(o.total_amount) || 0);
  });
  const paymentEntries = Object.entries(paymentRevenue).sort((a, b) => b[1] - a[1]);

  // ── Povratak pacijenata ──
  const ordersByPatient = {};
  orders.forEach(o => { (ordersByPatient[o.patient_id] ??= []).push(o); });
  const patientIds = Object.keys(ordersByPatient);
  const repeatCount = patientIds.filter(pid => ordersByPatient[pid].length >= 2).length;
  const retentionPct = patientIds.length ? Math.round(repeatCount / patientIds.length * 100) : 0;
  const topPatients = patientIds.map(pid => {
    const list = ordersByPatient[pid];
    const total = list.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const p = patientsMap[pid];
    return { patientId: pid, name: p ? fullName(p) : '—', count: list.length, total };
  }).sort((a, b) => b.total - a.total).slice(0, 8);

  // ── Recepti bez porudžbine ──
  const unlinkedRx = prescriptions
    .filter(rx => !linkedPrescriptionIds.has(rx.id) && patientsMap[rx.patient_id])
    .sort((a, b) => (b.rx_date || '').localeCompare(a.rx_date || ''))
    .slice(0, 15);

  // ── Od pregleda do porudžbine ──
  let lagSum = 0, lagCount = 0;
  orders.forEach(o => {
    const dates = rxDatesByOrder[o.id];
    if (!dates || !dates.length || !o.order_date) return;
    const earliest = [...dates].sort()[0];
    const lag = (new Date(o.order_date) - new Date(earliest)) / 86400000;
    if (lag >= 0 && lag < 3650) { lagSum += lag; lagCount++; }
  });
  const avgLag = lagCount ? Math.round(lagSum / lagCount) : null;

  // ── Popusti ──
  const discountedOrders = orders.filter(o => (Number(o.discount_percent) || 0) > 0);
  const discountPct = orderCount ? Math.round(discountedOrders.length / orderCount * 100) : 0;
  const avgDiscount = discountedOrders.length
    ? discountedOrders.reduce((s, o) => s + (Number(o.discount_percent) || 0), 0) / discountedOrders.length
    : 0;
  let lostTotal = 0;
  discountedOrders.forEach(o => {
    const d = Number(o.discount_percent) || 0;
    const total = Number(o.total_amount) || 0;
    if (d >= 100) return;
    const subtotal = total / (1 - d / 100);
    lostTotal += (subtotal - total);
  });

  return {
    totalRevenue, orderCount, avgOrder, clientFramePct, clientFrameOrdersCount: clientFrameOrders.length, glassesOrdersCount: glassesOrders.length,
    monthLabels, monthValues, yearLabels, yearValues,
    purposeEntries,
    framesTotal, lensesTotalSum, izradaTotal,
    topLenses,
    glassesOrdersCount2: glassesOrders.length, glassesRevenue, clOrdersCount: clOrders.length, clRevenue,
    paymentEntries,
    retentionPct, repeatCount, patientWithOrdersCount: patientIds.length, topPatients,
    unlinkedRx, patientsMap,
    avgLag,
    discountPct, avgDiscount, lostTotal,
  };
}

function renderAnalytics(s) {
  analyticsTrendData = { monthLabels: s.monthLabels, monthValues: s.monthValues, yearLabels: s.yearLabels, yearValues: s.yearValues };

  const purposeLabels = s.purposeEntries.map(([p]) => p);
  const purposeValues = s.purposeEntries.map(([, v]) => v);

  const wrap = document.getElementById('analytics-content');
  wrap.innerHTML = `
    <div class="type-toggle" style="max-width:280px;margin-bottom:20px;">
      <button type="button" id="analytics-period-month" class="active" onclick="setAnalyticsPeriod('month')">Mesečno</button>
      <button type="button" id="analytics-period-year" onclick="setAnalyticsPeriod('year')">Godišnje</button>
    </div>

    <div class="metric-grid">
      <div class="metric-card"><div class="label">Ukupan promet</div><div class="value">${fmtMoney(s.totalRevenue)}</div></div>
      <div class="metric-card"><div class="label">Broj porudžbina</div><div class="value">${s.orderCount}</div></div>
      <div class="metric-card"><div class="label">Prosečna vrednost porudžbine</div><div class="value">${fmtMoney(s.avgOrder)}</div></div>
      <div class="metric-card"><div class="label">Porudžbine sa klijentovim okvirom</div><div class="value">${s.clientFramePct}% <small>(${s.clientFrameOrdersCount} od ${s.glassesOrdersCount})</small></div></div>
    </div>

    <div class="analytics-section-title">Promet po mesecima</div>
    <div class="chart-wrap" style="height:240px;margin-bottom:8px;">
      <canvas id="analytics-chart-trend" role="img" aria-label="Promet po mesecima ili po godinama"></canvas>
    </div>

    <div class="analytics-grid-2">
      <div>
        <div class="analytics-section-title">Promet po nameni</div>
        <div class="chart-wrap" style="height:260px;"><canvas id="analytics-chart-purpose" role="img" aria-label="Promet po nameni recepta"></canvas></div>
      </div>
      <div>
        <div class="analytics-section-title">Okviri, stakla, izrada</div>
        <div class="chart-wrap" style="height:220px;"><canvas id="analytics-chart-split" role="img" aria-label="Udeo prometa: stakla, okviri, izrada"></canvas></div>
        <div class="legend-row">
          <span><span class="legend-dot" style="background:#1A6DB5;"></span>Stakla ${fmtMoney(s.lensesTotalSum)}</span>
          <span><span class="legend-dot" style="background:#eb6834;"></span>Okviri ${fmtMoney(s.framesTotal)}</span>
          <span><span class="legend-dot" style="background:#1baf7a;"></span>Izrada ${fmtMoney(s.izradaTotal)}</span>
        </div>
      </div>
    </div>

    <div class="analytics-grid-2">
      <div>
        <div class="analytics-section-title">Naočare / kontaktna sočiva</div>
        <table class="data-table"><tbody>
          <tr><td>Naočare</td><td class="num">${s.glassesOrdersCount2} · ${fmtMoney(s.glassesRevenue)}</td></tr>
          <tr><td>Kontaktna sočiva</td><td class="num">${s.clOrdersCount} · ${fmtMoney(s.clRevenue)}</td></tr>
        </tbody></table>
      </div>
      <div>
        <div class="analytics-section-title">Način plaćanja</div>
        <table class="data-table"><tbody>
          ${s.paymentEntries.map(([k, v]) => `<tr><td>${k}</td><td class="num">${fmtMoney(v)}</td></tr>`).join('') || '<tr><td>Nema podataka</td></tr>'}
        </tbody></table>
      </div>
    </div>

    <div class="analytics-section-title">Top 5 stakla po prometu</div>
    <table class="data-table">
      <thead><tr><th>Naziv</th><th class="num">Kol.</th><th class="num">Promet</th></tr></thead>
      <tbody>
        ${s.topLenses.map(l => `<tr><td>${l.name}</td><td class="num">${l.count}</td><td class="num">${fmtMoney(l.revenue)}</td></tr>`).join('') || '<tr><td colspan="3">Nema podataka</td></tr>'}
      </tbody>
    </table>

    <div class="analytics-section-title">Povratak pacijenata</div>
    <div class="metric-grid" style="margin-bottom:14px;">
      <div class="metric-card"><div class="label">Pacijenti sa više od 1 porudžbine</div><div class="value">${s.retentionPct}% <small>(${s.repeatCount} od ${s.patientWithOrdersCount})</small></div></div>
    </div>
    <table class="data-table">
      <thead><tr><th>Pacijent</th><th class="num">Broj porudžbina</th><th class="num">Ukupno potrošeno</th></tr></thead>
      <tbody>
        ${s.topPatients.map(p => `<tr onclick="goToPatient('${p.patientId}','orders')"><td class="link">${p.name}</td><td class="num">${p.count}</td><td class="num">${fmtMoney(p.total)}</td></tr>`).join('') || '<tr><td colspan="3">Nema podataka</td></tr>'}
      </tbody>
    </table>

    <div class="analytics-section-title">Recepti bez porudžbine <span class="sub">— potencijalni pozivi</span></div>
    <table class="data-table">
      <thead><tr><th>Pacijent</th><th>Namena</th><th>Datum recepta</th></tr></thead>
      <tbody>
        ${s.unlinkedRx.map(rx => `<tr onclick="goToPatient('${rx.patient_id}','prescriptions')"><td class="link">${fullName(s.patientsMap[rx.patient_id])}</td><td>${rx.purpose || '—'}</td><td>${fmtDate(rx.rx_date)}</td></tr>`).join('') || '<tr><td colspan="3">Nema recepata bez porudžbine</td></tr>'}
      </tbody>
    </table>

    <div class="analytics-section-title">Od pregleda do porudžbine, i popusti</div>
    <div class="metric-grid">
      <div class="metric-card"><div class="label">Prosečno od pregleda do porudžbine</div><div class="value">${s.avgLag !== null ? s.avgLag + ' d' : '—'}</div></div>
      <div class="metric-card"><div class="label">Porudžbine sa popustom</div><div class="value">${s.discountPct}%</div></div>
      <div class="metric-card"><div class="label">Prosečan popust</div><div class="value">${s.avgDiscount.toFixed(1)}%</div></div>
      <div class="metric-card"><div class="label">Izgubljeno na popustima</div><div class="value">${fmtMoney(s.lostTotal)}</div></div>
    </div>
  `;

  renderTrendChart();
  renderPurposeChart(purposeLabels, purposeValues);
  renderSplitChart(s.lensesTotalSum, s.framesTotal, s.izradaTotal);
}

function setAnalyticsPeriod(period) {
  analyticsPeriod = period;
  document.getElementById('analytics-period-month').classList.toggle('active', period === 'month');
  document.getElementById('analytics-period-year').classList.toggle('active', period === 'year');
  renderTrendChart();
}

function renderTrendChart() {
  const ctx = document.getElementById('analytics-chart-trend');
  if (!ctx) return;
  if (analyticsTrendChart) analyticsTrendChart.destroy();
  const isMonth = analyticsPeriod === 'month';
  const labels = isMonth ? analyticsTrendData.monthLabels : analyticsTrendData.yearLabels;
  const values = isMonth ? analyticsTrendData.monthValues : analyticsTrendData.yearValues;
  analyticsTrendChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: '#1A6DB5', borderRadius: 4, maxBarThickness: 32 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmtMoney(c.parsed.y) } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#6B7280', autoSkip: false, maxRotation: 0 } },
        y: { grid: { color: '#DCE6F2' }, ticks: { color: '#6B7280', callback: (v) => (v / 1000) + 'k' } }
      }
    }
  });
}

function renderPurposeChart(labels, values) {
  const ctx = document.getElementById('analytics-chart-purpose');
  if (!ctx) return;
  if (analyticsPurposeChart) analyticsPurposeChart.destroy();
  analyticsPurposeChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: '#1A6DB5', borderRadius: 4, maxBarThickness: 18 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmtMoney(c.parsed.x) } } },
      scales: {
        x: { grid: { color: '#DCE6F2' }, ticks: { color: '#6B7280', callback: (v) => (v / 1000) + 'k' } },
        y: { grid: { display: false }, ticks: { color: '#1F2937', font: { size: 12 } } }
      }
    }
  });
}

function renderSplitChart(lensesTotal, framesTotal, izradaTotal) {
  const ctx = document.getElementById('analytics-chart-split');
  if (!ctx) return;
  if (analyticsSplitChart) analyticsSplitChart.destroy();
  analyticsSplitChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Stakla', 'Okviri', 'Izrada'],
      datasets: [{ data: [lensesTotal, framesTotal, izradaTotal], backgroundColor: ['#1A6DB5', '#eb6834', '#1baf7a'], borderColor: '#fff', borderWidth: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${fmtMoney(c.parsed)}` } } },
      cutout: '65%'
    }
  });
}
