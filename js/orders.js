let currentOrders = [];
let orderFormType = 'glasses';
let orderFramesDraft = [];
let orderLensesDraft = [];
let orderPrescriptionsDraft = [];
let currentPrescriptionsForOrder = [];
let knownLensNames = [];
let knownLensIndexes = [];
let knownLensCoatings = [];
let knownLensPrices = {}; // naziv stakla (lowercase, trim) -> poslednja korišćena cena/kom

async function renderOrdersTab() {
  const { data: orders, error } = await sb
    .from('orders')
    .select('*')
    .eq('patient_id', activePatientId)
    .is('deleted_at', null)
    .order('order_date', { ascending: false });

  if (error) { toast('Greška pri učitavanju porudžbina', true); return; }
  currentOrders = orders;
  if (typeof updateTabCount === 'function') updateTabCount('orders', currentOrders.length);

  const orderIds = orders.map(o => o.id);
  let framesByOrder = {}, lensesByOrder = {}, installmentsByOrder = {}, rxByOrder = {};

  if (orderIds.length) {
    const [framesRes, lensesRes, instRes, opRes] = await Promise.all([
      sb.from('order_frames').select('*').in('order_id', orderIds),
      sb.from('order_lenses').select('*').in('order_id', orderIds),
      sb.from('installments').select('*').in('order_id', orderIds),
      sb.from('order_prescriptions').select('order_id, prescription_id').in('order_id', orderIds),
    ]);
    (framesRes.data || []).forEach(f => { (framesByOrder[f.order_id] ??= []).push(f); });
    (lensesRes.data || []).forEach(l => { (lensesByOrder[l.order_id] ??= []).push(l); });
    (instRes.data || []).forEach(p => { (installmentsByOrder[p.order_id] ??= []).push(p); });

    const rxIds = [...new Set((opRes.data || []).map(r => r.prescription_id))];
    let rxMap = {};
    if (rxIds.length) {
      const { data: rxs } = await sb.from('prescriptions').select('*').in('id', rxIds);
      (rxs || []).forEach(rx => { rxMap[rx.id] = rx; });
    }
    (opRes.data || []).forEach(link => {
      const rx = rxMap[link.prescription_id];
      if (rx) (rxByOrder[link.order_id] ??= []).push(rx);
    });
  }

  const html = `
    <button class="btn-primary" style="margin-bottom:20px;" onclick="openAddOrderModal()">+ Nova porudžbina</button>
    ${orders.map(o => renderOrderCard(
      o,
      framesByOrder[o.id] || [],
      lensesByOrder[o.id] || [],
      installmentsByOrder[o.id] || [],
      rxByOrder[o.id] || []
    )).join('') || '<div class="empty-state" style="height:auto;padding:30px;">Još nema porudžbina</div>'}
  `;
  document.getElementById('tab-content').innerHTML = html;
}

function applyDiscount(total, percent) {
  const p = Number(percent) || 0;
  if (!p) return Math.round(total);
  return Math.round(total - (total * p / 100));
}

function calcGlassesTotal(frames, lenses) {
  const framesTotal = frames.reduce((sum, f) => sum + (f.is_client ? 0 : Number(f.price) || 0), 0);
  const lensesTotal = lenses.reduce((sum, l) => sum + lensTotal(l.price_unit, l.discount, l.qty), 0);
  return Math.round(framesTotal + lensesTotal);
}

function lensDescriptor(l) {
  return [l.lens_name || '—', l.lens_index, l.lens_coating].filter(Boolean).join(' · ');
}

// Detaljan prikaz recepta po redovima (OD, OS, PD, BC/DIA) za karticu porudžbine —
// čitljivije od jednorednog sažetka koji se koristi u padajućim listama (rxSummaryLine).
function rxDetailLines(rx) {
  const odParts = [rx.od_sph && `Sph ${rx.od_sph}`, rx.od_cyl && `Cyl ${rx.od_cyl}`, rx.od_ax && `Ax ${rx.od_ax}`].filter(Boolean);
  const osParts = [rx.os_sph && `Sph ${rx.os_sph}`, rx.os_cyl && `Cyl ${rx.os_cyl}`, rx.os_ax && `Ax ${rx.os_ax}`].filter(Boolean);
  let lines = `<div>OD: ${odParts.join(' · ') || '—'}</div><div>OS: ${osParts.join(' · ') || '—'}</div>`;
  if (rx.pd) lines += `<div>PD: ${rx.pd}</div>`;
  if (rx.purpose === 'kontaktna sočiva' && (rx.bc || rx.dia)) lines += `<div>BC: ${rx.bc || '—'} · DIA: ${rx.dia || '—'}</div>`;
  if (rx.od_prism || rx.os_prism) lines += `<div>Prizma: OD ${rx.od_prism || '—'} · OS ${rx.os_prism || '—'}</div>`;
  return lines;
}

function renderOrderCard(o, frames, lenses, installments, rxLinks) {
  const isGlasses = o.order_type === 'glasses';
  const izrada = Number(o.izrada_price) || 0;
  const subtotal = isGlasses ? calcGlassesTotal(frames, lenses) + izrada : clTotal(o.cl_price, o.cl_qty);
  const discountPercent = Number(o.discount_percent) || 0;
  const total = discountPercent ? applyDiscount(subtotal, discountPercent) : subtotal;
  const paidViaInstallments = installments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = total - (Number(o.prepayment) || 0) - paidViaInstallments;

  let itemsHtml = '';
  if (isGlasses) {
    const purposeOrder = [];
    const seen = new Set();
    [...frames.map(f => f.purpose), ...lenses.map(l => l.purpose), ...rxLinks.map(r => r.purpose)].forEach(p => {
      if (p && !seen.has(p)) { seen.add(p); purposeOrder.push(p); }
    });

    itemsHtml = purposeOrder.map(purpose => {
      const rx = rxLinks.find(r => r.purpose === purpose) || null;
      const fList = frames.filter(f => f.purpose === purpose);
      const lList = lenses.filter(l => l.purpose === purpose);
      return `
        <div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;">
          <div style="font-weight:700;color:var(--accent);margin-bottom:8px;">${purpose}</div>
          ${rx ? `<div style="color:var(--text-light);font-size:15px;line-height:1.6;margin-bottom:10px;">${rxDetailLines(rx)}</div>` : `<div style="color:var(--text-light);font-size:14px;margin-bottom:10px;">Recept nije povezan</div>`}
          ${(fList.length || lList.length) ? `<div style="border-top:1px solid var(--border);padding-top:8px;">` : ''}
          ${fList.map(f => `<div class="item-row"><span>Okvir${f.frame_code ? ` (šifra ${f.frame_code})` : ''}:</span><span>${f.is_client ? 'klijentov okvir' : fmtMoney(f.price)}</span></div>`).join('')}
          ${lList.map(l => `<div class="item-row"><span>Stakla: ${lensDescriptor(l)} × ${l.qty}</span><span>${fmtMoney(lensTotal(l.price_unit, l.discount, l.qty))}</span></div>`).join('')}
          ${(fList.length || lList.length) ? `</div>` : ''}
          ${!fList.length && !lList.length ? `<div style="color:var(--text-light);font-size:14px;">Bez okvira i stakala za ovu namenu</div>` : ''}
        </div>
      `;
    }).join('') || '<div style="color:var(--text-light);font-size:15px;margin-bottom:10px;">Bez okvira i stakala</div>';
  }

  return `
    <div class="list-card">
      <div class="list-card-header">
        <div class="title">${isGlasses ? '👓 Naočare' : '👁 Kontaktna sočiva'} ${o.envelope_number ? `<span class="badge">br. ${o.envelope_number}</span>` : ''}</div>
        <div class="actions">
          <span style="color:var(--text-light);font-size:14px;">${fmtDate(o.order_date)}</span>
          <button class="btn-secondary" onclick="openEditOrderModal('${o.id}')">Izm.</button>
          <button class="btn-secondary" style="color:#C0392B;border-color:#C0392B;" onclick="deleteOrder('${o.id}')">Obr.</button>
        </div>
      </div>
      ${isGlasses ? `
        ${itemsHtml}
        ${izrada ? `<div class="item-row"><span>Izrada:</span><span>${fmtMoney(izrada)}</span></div>` : ''}
      ` : `
        <div class="kv-row">
          <span><b>Naziv:</b> ${o.cl_name || '—'}</span>
          <span><b>BC:</b> ${o.cl_bc ?? '—'}</span>
          <span><b>Dioptrija:</b> ${o.cl_diopters || '—'}</span>
          <span><b>Zamena:</b> ${o.cl_replacement_period || '—'}</span>
          <span><b>Kol.:</b> ${o.cl_qty}</span>
        </div>
      `}
      <div class="total-box">
        ${discountPercent ? `
        <div class="row" style="font-size:15px;color:var(--text-light);"><span>Cena pre popusta</span><span>${fmtMoney(subtotal)}</span></div>
        <div class="row" style="font-size:15px;color:var(--text-light);"><span>Popust ${discountPercent}%</span><span>-${fmtMoney(subtotal - total)}</span></div>
        ` : ''}
        <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:22px;font-weight:700;color:var(--accent);padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid var(--border);">
          <span>Ukupno</span><span>${fmtMoney(total)}</span>
        </div>
        <div class="row" style="font-size:15px;color:var(--text-light);"><span>Akontacija</span><span>${fmtMoney(o.prepayment)}</span></div>
        ${o.payment_method ? `<div class="row" style="font-size:15px;color:var(--text-light);"><span>Način plaćanja</span><span>${o.payment_method}</span></div>` : ''}
        ${o.has_installment ? `<div class="row" style="font-size:15px;color:var(--text-light);"><span>Uplaćeno na rate</span><span>${fmtMoney(paidViaInstallments)}</span></div>` : ''}
        ${remaining > 0.5 ? `<div class="row" style="font-size:14px;color:var(--text-light);margin-top:2px;"><span>Ostalo za uplatu</span><span>${fmtMoney(remaining)}</span></div>` : ''}
      </div>
      ${o.has_installment ? `
        <div style="margin-top:10px;">
          <button class="btn-secondary" style="padding:8px 14px;font-size:15px;" onclick="toggleQuickInstallment('${o.id}')">+ Dodaj uplatu</button>
          <div id="quick-installment-${o.id}" style="display:none;margin-top:12px;background:var(--section-bg);border-radius:14px;padding:14px;">
            <div class="field-grid" style="margin-bottom:10px;">
              <div><label>Datum</label><input type="date" id="quick-inst-date-${o.id}"></div>
              <div><label>Iznos</label><input type="number" id="quick-inst-amount-${o.id}" min="0"></div>
              <div>
                <label>Način plaćanja</label>
                <select id="quick-inst-type-${o.id}" style="width:100%;padding:14px;font-size:18px;border:1px solid var(--border);border-radius:14px;">
                  <option value="karticom">karticom</option>
                  <option value="gotovinom">gotovinom</option>
                  <option value="ček">ček</option>
                </select>
              </div>
            </div>
            <button class="btn-primary" onclick="saveQuickInstallment('${o.id}')">Sačuvaj uplatu</button>
          </div>
        </div>
      ` : ''}
      ${o.comment ? `<div style="margin-top:10px;color:var(--text-light);">${o.comment}</div>` : ''}
      ${o.created_by ? `<div class="entry-meta">Uneo/la: ${o.created_by} · ${fmtDate(o.order_date)}</div>` : ''}
    </div>
  `;
}

function toggleQuickInstallment(orderId) {
  const el = document.getElementById(`quick-installment-${orderId}`);
  const showing = el.style.display === 'block';
  el.style.display = showing ? 'none' : 'block';
  if (!showing) document.getElementById(`quick-inst-date-${orderId}`).value = todayISO();
}

async function saveQuickInstallment(orderId) {
  const amount = Number(document.getElementById(`quick-inst-amount-${orderId}`).value) || 0;
  const date = document.getElementById(`quick-inst-date-${orderId}`).value || todayISO();
  const type = document.getElementById(`quick-inst-type-${orderId}`).value;
  if (!amount) { toast('Unesite iznos', true); return; }

  const { error } = await sb.from('installments').insert({
    order_id: orderId, payment_date: date, amount, payment_type: type,
    created_by: getCurrentUser()?.name || null,
  });
  if (error) { toast('Greška pri dodavanju uplate', true); return; }
  toast('Uplata sačuvana');
  await renderOrdersTab();
}

// Sklopivi blok ispod iznosa (Akontacija, način plaćanja, rate, komentar) — retko se
// popunjava pri brzom unosu, pa je podrazumevano sklopljen da cela forma stane bez
// skrolovanja. Ako ga Ana sama otvori, ostaje otvoren i za sledeće porudžbine u ovoj
// sesiji (orderExtraSticky); pri izmeni porudžbine koja već ima nešto od tih podataka
// otvara se sam, da ne bi ostali sakriveni.
let orderExtraSticky = false;

function applyOrderExtra(open) {
  const body = document.getElementById('order-extra');
  const btn = document.getElementById('order-extra-toggle');
  if (body) body.hidden = !open;
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleOrderExtra() {
  const body = document.getElementById('order-extra');
  if (!body) return;
  orderExtraSticky = body.hidden;
  applyOrderExtra(body.hidden);
}

function setOrderType(type) {
  orderFormType = type;
  document.querySelectorAll('.type-toggle button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  document.getElementById('glasses-fields').style.display = type === 'glasses' ? 'block' : 'none';
  document.getElementById('cl-fields').style.display = type === 'contact_lenses' ? 'block' : 'none';
  // Izrada je sada u istom redu sa Popust (izvan #glasses-fields, radi kompaktnijeg
  // layouta), pa se vidljivost njenog polja prati posebno — i dalje samo za naočare.
  const izradaWrap = document.getElementById('izrada-field-wrap');
  if (izradaWrap) izradaWrap.style.display = type === 'glasses' ? 'block' : 'none';
}

function renderFrameRows() {
  document.getElementById('frames-container').innerHTML = orderFramesDraft.map((f, i) => `
    <div style="display:grid;grid-template-columns:1fr 100px 130px auto 34px;gap:6px;align-items:center;margin-bottom:6px;">
      <select onchange="orderFramesDraft[${i}].purpose=this.value" style="padding:10px;font-size:16px;border:1px solid var(--border);border-radius:10px;">
        ${purposeOptions(f.purpose)}
      </select>
      <input type="text" placeholder="šifra" maxlength="4" value="${f.frame_code || ''}" oninput="orderFramesDraft[${i}].frame_code=this.value" style="padding:10px;font-size:16px;">
      <input type="text" placeholder="cena" value="${f.price ?? ''}" oninput="orderFramesDraft[${i}].price=this.value;updateOrderFormTotal()" style="padding:10px;font-size:16px;text-align:right;">
      <label style="display:flex;align-items:center;gap:6px;font-size:14px;white-space:nowrap;">
        <input type="checkbox" ${f.is_client ? 'checked' : ''} onchange="orderFramesDraft[${i}].is_client=this.checked;updateOrderFormTotal()"> klijentov
      </label>
      <button type="button" onclick="removeFrameRow(${i})" style="color:#C0392B;padding:6px;">×</button>
    </div>
  `).join('') || '<div style="color:var(--text-light);font-size:15px;margin-bottom:4px;">Nema dodatih okvira</div>';
}

// Red stakla u dva reda: gore namena i naziv (sa listom predloga iz kataloga), dole
// indeks, premaz, cena/kom, popust i količina — tako ceo red staje u dva reda umesto
// tri, pa forma porudžbine ostaje bez skrolovanja.
// onfocus/onclick="openDatalist(this)" otvara našu listu predloga (vidi utils.js).
function renderLensRows() {
  document.getElementById('lens-container').innerHTML = orderLensesDraft.map((l, i) => `
    <div style="border:1px solid var(--border);border-radius:12px;padding:8px;margin-bottom:6px;">
      <div style="display:grid;grid-template-columns:130px 1fr 34px;gap:6px;align-items:center;margin-bottom:6px;">
        <select onchange="orderLensesDraft[${i}].purpose=this.value" style="padding:10px;font-size:16px;border:1px solid var(--border);border-radius:10px;">
          ${purposeOptions(l.purpose)}
        </select>
        <input type="text" id="lens-name-${i}" placeholder="naziv stakla" list="lens-name-list" value="${l.lens_name || ''}" oninput="onLensNameInput(${i}, this.value)" onkeydown="handleLensEnterJump(event, ${i})" onfocus="openDatalist(this)" onclick="openDatalist(this)" style="padding:10px;font-size:16px;width:100%;">
        <button type="button" onclick="removeLensRow(${i})" style="color:#C0392B;padding:6px;">×</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 0.8fr 0.6fr;gap:6px;">
        <input type="text" placeholder="indeks" list="lens-index-list" value="${l.lens_index || ''}" oninput="orderLensesDraft[${i}].lens_index=this.value" onfocus="openDatalist(this)" onclick="openDatalist(this)" style="padding:8px 10px;font-size:16px;">
        <input type="text" placeholder="premaz" list="lens-coating-list" value="${l.lens_coating || ''}" oninput="orderLensesDraft[${i}].lens_coating=this.value" onfocus="openDatalist(this)" onclick="openDatalist(this)" style="padding:8px 10px;font-size:16px;">
        <input type="text" id="lens-price-${i}" placeholder="cena/kom" value="${l.price_unit ?? ''}" oninput="orderLensesDraft[${i}].price_unit=this.value;updateOrderFormTotal()" onkeydown="handleLensEnterJump(event, ${i})" style="padding:8px 10px;font-size:16px;text-align:right;">
        <input type="text" placeholder="popust %" value="${l.discount ?? ''}" oninput="orderLensesDraft[${i}].discount=this.value;updateOrderFormTotal()" style="padding:8px 10px;font-size:16px;text-align:right;">
        <input type="text" placeholder="kol." value="${l.qty ?? 2}" oninput="orderLensesDraft[${i}].qty=this.value;updateOrderFormTotal()" style="padding:8px 10px;font-size:16px;text-align:right;">
      </div>
    </div>
  `).join('') || '<div style="color:var(--text-light);font-size:15px;margin-bottom:4px;">Nema dodatih stakala</div>';
}

// Poziva se pri kucanju u polje "naziv stakla". Ako se uneti naziv (case-insensitive)
// tačno poklapa sa nazivom iz kataloga koji ima zapamćenu cenu, i polje "cena/kom" je
// još uvek prazno, cena se automatski upisuje — ne treba je kucati ponovo za stakla
// koja se uvek naručuju po istoj ceni (npr. "CR-39 1.5 UNC"). Ako je cena već uneta
// (ručno ili iz prethodnog poklapanja), ne prepisuje se.
function onLensNameInput(i, name) {
  orderLensesDraft[i].lens_name = name;
  const known = knownLensPrices[name.trim().toLowerCase()];
  if (known != null && !orderLensesDraft[i].price_unit) {
    orderLensesDraft[i].price_unit = known;
    const priceEl = document.getElementById(`lens-price-${i}`);
    if (priceEl) priceEl.value = known;
  }
  updateOrderFormTotal();
}

// Enter u polju "naziv stakla" ili "cena/kom": ako je cena za taj red stakla već
// popunjena (bilo automatski iz kataloga preko onLensNameInput(), bilo ručno) — Enter
// preskače sva ostala polja (indeks, premaz, popust, kol., i sve posle) i ide pravo
// na "Sačuvaj", umesto da prolazi kroz njih jedno po jedno kao inače. Ako cena još
// nije uneta (nepoznato staklo), ne radi ništa posebno — Enter nastavlja normalan
// lanac navigacije (initEnterNavigation() u utils.js), da se cena može ručno uneti.
function handleLensEnterJump(e, i) {
  if (e.key !== 'Enter') return;
  const price = orderLensesDraft[i]?.price_unit;
  if (price === undefined || price === null || String(price).trim() === '') return;
  e.preventDefault();
  e.stopPropagation();
  document.querySelector('#order-form button[type="submit"]')?.focus();
}

function addFrameRow() {
  orderFramesDraft.push({ purpose: PURPOSES[0], frame_code: '', is_client: false, price: '' });
  renderFrameRows();
  updateOrderFormTotal();
}

function removeFrameRow(i) {
  orderFramesDraft.splice(i, 1);
  renderFrameRows();
  updateOrderFormTotal();
}

function addLensRow() {
  orderLensesDraft.push({ purpose: PURPOSES[0], lens_name: '', lens_index: '', lens_coating: '', price_unit: '', discount: '', qty: 2 });
  renderLensRows();
  updateOrderFormTotal();
}

function removeLensRow(i) {
  orderLensesDraft.splice(i, 1);
  renderLensRows();
  updateOrderFormTotal();
}

// Učitava predloge iz "čistog" kataloga (tabela lens_catalog) — ne iz istorije porudžbina,
// da stare, nekonzistentne unose ne bi zatrpavale <datalist>. Katalog se sam popunjava
// dalje kroz saveOrderForm() svaki put kad se sačuva nova vrednost.
async function loadLensAutocompleteData() {
  const { data } = await sb.from('lens_catalog').select('kind, value, default_price').order('value');
  const names = [], indexes = [], coatings = [], prices = {};
  (data || []).forEach(r => {
    if (r.kind === 'name') {
      names.push(r.value);
      if (r.default_price != null) prices[r.value.trim().toLowerCase()] = Number(r.default_price);
    }
    else if (r.kind === 'index') indexes.push(r.value);
    else if (r.kind === 'coating') coatings.push(r.value);
  });
  knownLensNames = names;
  knownLensIndexes = indexes;
  knownLensCoatings = coatings;
  knownLensPrices = prices;

  const esc = v => v.replace(/"/g, '&quot;');
  const nameList = document.getElementById('lens-name-list');
  if (nameList) nameList.innerHTML = knownLensNames.map(v => `<option value="${esc(v)}"></option>`).join('');
  const idxList = document.getElementById('lens-index-list');
  if (idxList) idxList.innerHTML = knownLensIndexes.map(v => `<option value="${esc(v)}"></option>`).join('');
  const coatList = document.getElementById('lens-coating-list');
  if (coatList) coatList.innerHTML = knownLensCoatings.map(v => `<option value="${esc(v)}"></option>`).join('');
}

// Dodaje u katalog svaku vrednost koja je upravo sačuvana u porudžbini, ako je tu već nema
// (ON CONFLICT DO NOTHING preko unique(kind, value)). Tako se predlozi grade postepeno
// iz stvarno korišćenih vrednosti, bez ručnog održavanja liste.
async function updateLensCatalog(lenses) {
  const rows = [];
  const seen = new Set();
  lenses.forEach(l => {
    [['name', l.lens_name], ['index', l.lens_index], ['coating', l.lens_coating]].forEach(([kind, raw]) => {
      const value = (raw || '').trim();
      if (!value) return;
      const key = kind + '::' + value;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ kind, value });
    });
  });
  if (!rows.length) return;
  await sb.from('lens_catalog').upsert(rows, { onConflict: 'kind,value', ignoreDuplicates: true });
}

// Pamti poslednju korišćenu cenu za svaki naziv stakla (kolona lens_catalog.default_price),
// da bi se sledeći put mogla automatski predložiti (vidi onLensNameInput()). Za razliku od
// updateLensCatalog() (koji samo dodaje nove nazive i ništa ne prepisuje), ovde se cena
// namerno ažurira pri svakom čuvanju — tako lista prati stvarno trenutne cene.
async function updateLensPriceMemory(lenses) {
  const rows = [];
  const seen = new Set();
  lenses.forEach(l => {
    const name = (l.lens_name || '').trim();
    const price = Number(l.price_unit);
    if (!name || !price) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ kind: 'name', value: name, default_price: price });
  });
  if (!rows.length) return;
  await sb.from('lens_catalog').upsert(rows, { onConflict: 'kind,value' });
}

// Dodaje po jedan red okvira i stakala za datu namenu, ali samo ako takva namena
// tu još ne postoji (da ne dupliramo redove koje je korisnik već ručno dodao).
function ensureFrameAndLensForPurpose(purpose) {
  if (!purpose) return;
  if (!orderFramesDraft.some(f => f.purpose === purpose)) {
    orderFramesDraft.push({ purpose, frame_code: '', is_client: false, price: '' });
  }
  if (!orderLensesDraft.some(l => l.purpose === purpose)) {
    orderLensesDraft.push({ purpose, lens_name: '', lens_index: '', lens_coating: '', price_unit: '', discount: '', qty: 2 });
  }
}

function rxSummaryLine(rx) {
  const od = [rx.od_sph, rx.od_cyl, rx.od_ax].filter(Boolean).join('/') || '—';
  const os = [rx.os_sph, rx.os_cyl, rx.os_ax].filter(Boolean).join('/') || '—';
  let line = `OD ${od} · OS ${os}`;
  if (rx.pd) line += ` · PD ${rx.pd}`;
  if (rx.purpose === 'kontaktna sočiva' && (rx.bc || rx.dia)) line += ` · BC ${rx.bc || '—'} · DIA ${rx.dia || '—'}`;
  return line;
}

function rxOptionLabel(rx) {
  return `${rx.purpose || 'recept'} — ${rxSummaryLine(rx)} (${fmtDate(rx.rx_date || rx.created_at?.slice(0,10))})`;
}

function renderPrescriptionRows() {
  const wrap = document.getElementById('order-form-prescriptions-list');
  if (!wrap) return;
  if (!currentPrescriptionsForOrder.length) {
    wrap.innerHTML = '<div style="color:var(--text-light);font-size:15px;">Pacijent još nema recepata</div>';
    return;
  }
  wrap.innerHTML = orderPrescriptionsDraft.map((rxId, i) => `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
      <select onchange="updatePrescriptionRow(${i}, this.value)" style="flex:1;padding:9px 12px;font-size:16px;border:1px solid var(--border);border-radius:12px;">
        ${currentPrescriptionsForOrder.map(rx => `<option value="${rx.id}" ${rx.id === rxId ? 'selected' : ''}>${rxOptionLabel(rx)}</option>`).join('')}
      </select>
      <button type="button" onclick="removePrescriptionRow(${i})" style="color:#C0392B;padding:6px;">×</button>
    </div>
  `).join('') || '<div style="color:var(--text-light);font-size:15px;">Nijedan recept nije povezan</div>';
}

// Kad se doda recept u porudžbinu, odmah se otvara po jedan red okvira i stakala
// sa istom namenom (npr. birate "za računar" recept — okvir i stakla se odmah
// postave na "za računar"), da ne treba ručno da se dodaju i podešavaju.
function addPrescriptionRow() {
  if (!currentPrescriptionsForOrder.length) { toast('Pacijent nema recepata', true); return; }
  const used = new Set(orderPrescriptionsDraft);
  const next = currentPrescriptionsForOrder.find(rx => !used.has(rx.id)) || currentPrescriptionsForOrder[0];
  orderPrescriptionsDraft.push(next.id);
  ensureFrameAndLensForPurpose(next.purpose);
  renderPrescriptionRows();
  renderFrameRows();
  renderLensRows();
  updateOrderFormTotal();
}

// Kad se promeni izbor recepta u postojećem redu, prebacuje odgovarajući okvir/stakla
// (ako nijedan drugi izabrani recept i dalje ne treba staru namenu) na novu namenu,
// i garantuje da za novu namenu postoji bar jedan red okvira i jedan red stakala.
function updatePrescriptionRow(i, newRxId) {
  const oldRx = currentPrescriptionsForOrder.find(rx => rx.id === orderPrescriptionsDraft[i]);
  const newRx = currentPrescriptionsForOrder.find(rx => rx.id === newRxId);
  orderPrescriptionsDraft[i] = newRxId;

  if (oldRx && newRx && oldRx.purpose !== newRx.purpose) {
    const stillNeedsOld = orderPrescriptionsDraft.some((id, idx) =>
      idx !== i && currentPrescriptionsForOrder.find(r => r.id === id)?.purpose === oldRx.purpose
    );
    if (!stillNeedsOld) {
      const f = orderFramesDraft.find(f => f.purpose === oldRx.purpose);
      if (f) f.purpose = newRx.purpose;
      const l = orderLensesDraft.find(l => l.purpose === oldRx.purpose);
      if (l) l.purpose = newRx.purpose;
    }
  }
  if (newRx) ensureFrameAndLensForPurpose(newRx.purpose);

  renderFrameRows();
  renderLensRows();
  updateOrderFormTotal();
}

function removePrescriptionRow(i) {
  orderPrescriptionsDraft.splice(i, 1);
  renderPrescriptionRows();
}

async function populatePrescriptionOptions() {
  const { data } = await sb.from('prescriptions').select('*').eq('patient_id', activePatientId).order('rx_date', { ascending: false });
  currentPrescriptionsForOrder = data || [];
  orderPrescriptionsDraft = orderPrescriptionsDraft.filter(id => currentPrescriptionsForOrder.some(rx => rx.id === id));
  renderPrescriptionRows();
}

function updateOrderFormTotal() {
  let subtotal;
  if (orderFormType === 'glasses') {
    const izrada = Number(document.getElementById('order-form-izrada')?.value) || 0;
    subtotal = calcGlassesTotal(orderFramesDraft, orderLensesDraft) + izrada;
  } else {
    const price = Number(document.getElementById('order-form-cl-price')?.value) || 0;
    const qty = Number(document.getElementById('order-form-cl-qty')?.value) || 0;
    subtotal = clTotal(price, qty);
  }
  const discountPercent = Number(document.getElementById('order-form-discount')?.value) || 0;
  const total = applyDiscount(subtotal, discountPercent);
  const prepayment = Number(document.getElementById('order-form-prepayment')?.value) || 0;
  const remaining = total - prepayment;

  const elTotal = document.getElementById('order-form-total-preview');
  if (elTotal) elTotal.textContent = fmtMoney(total);
  const elRemaining = document.getElementById('order-form-remaining-preview');
  if (elRemaining) elRemaining.textContent = fmtMoney(remaining);
}

// Fokusira polje "Broj porudžbine" umesto podrazumevanog prvog polja (Datum),
// pošto je datum već automatski popunjen i ne treba ga menjati u većini slučajeva.
function focusEnvelopeField() {
  setTimeout(() => {
    const el = document.getElementById('order-form-envelope');
    if (el) { el.focus(); el.select(); }
  }, 0);
}

// dateOverride: kada se porudžbina otvara odmah nakon kreiranja novog pacijenta
// (lanac Pacijent → Recept → Porudžbina), prosleđuje se datum posete pacijenta
// umesto današnjeg datuma. Van tog lanca uvek je današnji datum.
async function openAddOrderModal(dateOverride) {
  document.getElementById('order-modal-title').textContent = 'Nova porudžbina';
  document.getElementById('order-form').reset();
  document.getElementById('order-form-id').value = '';
  document.getElementById('order-form-date').value = dateOverride || todayISO();
  pendingQuickAddDate = null;
  orderFramesDraft = [];
  orderLensesDraft = [];
  orderPrescriptionsDraft = [];
  setOrderType('glasses');
  applyOrderExtra(orderExtraSticky);
  renderFrameRows();
  renderLensRows();
  await populatePrescriptionOptions();
  await loadLensAutocompleteData();
  toggleInstallmentFields(false);
  updateOrderFormTotal();
  openModal('order-modal');
  focusEnvelopeField();
}

async function openEditOrderModal(id) {
  const o = currentOrders.find(x => x.id === id);
  document.getElementById('order-modal-title').textContent = 'Izmena porudžbine';
  document.getElementById('order-form-id').value = o.id;
  document.getElementById('order-form-date').value = o.order_date || todayISO();
  document.getElementById('order-form-envelope').value = o.envelope_number || '';
  document.getElementById('order-form-comment').value = o.comment || '';
  document.getElementById('order-form-prepayment').value = o.prepayment || '';
  document.getElementById('order-form-payment-method').value = o.payment_method || '';
  document.getElementById('order-form-izrada').value = o.izrada_price || '';
  document.getElementById('order-form-discount').value = o.discount_percent || '';

  const [framesRes, lensesRes, opRes] = await Promise.all([
    sb.from('order_frames').select('*').eq('order_id', id),
    sb.from('order_lenses').select('*').eq('order_id', id),
    sb.from('order_prescriptions').select('prescription_id').eq('order_id', id),
  ]);
  orderFramesDraft = framesRes.data || [];
  orderLensesDraft = lensesRes.data || [];
  orderPrescriptionsDraft = (opRes.data || []).map(r => r.prescription_id);
  renderFrameRows();
  renderLensRows();
  await populatePrescriptionOptions();
  await loadLensAutocompleteData();

  setOrderType(o.order_type);

  document.getElementById('order-form-cl-name').value = o.cl_name || '';
  document.getElementById('order-form-cl-bc').value = o.cl_bc || '';
  document.getElementById('order-form-cl-diopters').value = o.cl_diopters || '';
  document.getElementById('order-form-cl-period').value = o.cl_replacement_period || '';
  document.getElementById('order-form-cl-price').value = o.cl_price || '';
  document.getElementById('order-form-cl-qty').value = o.cl_qty || 1;

  toggleInstallmentFields(o.has_installment);
  document.getElementById('order-form-installment').checked = o.has_installment;
  applyOrderExtra(orderExtraSticky || !!(Number(o.prepayment) || o.payment_method || o.has_installment || o.comment));

  updateOrderFormTotal();
  openModal('order-modal');
  focusEnvelopeField();
}

function toggleInstallmentFields(show) {
  document.getElementById('installment-fields').style.display = show ? 'block' : 'none';
  if (show) loadInstallments();
}

async function loadInstallments() {
  const id = document.getElementById('order-form-id').value;
  if (!id) { document.getElementById('installment-list').innerHTML = '<div style="color:var(--text-light);font-size:14px;">Sačuvajte porudžbinu da biste dodali uplate</div>'; return; }
  const { data } = await sb.from('installments').select('*').eq('order_id', id).order('payment_date');
  document.getElementById('installment-list').innerHTML = (data || []).map(p => `
    <div class="kv-row" style="margin-bottom:6px;">
      <span>${fmtDate(p.payment_date)}</span><span>${fmtMoney(p.amount)}</span><span>${p.payment_type || ''}</span>
      ${p.created_by ? `<span style="color:var(--text-light);font-size:13px;">${p.created_by}</span>` : ''}
      <button class="btn-secondary" style="padding:4px 10px;font-size:13px;" onclick="deleteInstallment('${p.id}')">×</button>
    </div>
  `).join('') || '<div style="color:var(--text-light);font-size:14px;">Još nema uplata</div>';
}

async function addInstallment() {
  const orderId = document.getElementById('order-form-id').value;
  if (!orderId) { toast('Prvo sačuvajte porudžbinu', true); return; }
  const payload = {
    order_id: orderId,
    payment_date: document.getElementById('installment-date').value || todayISO(),
    amount: Number(document.getElementById('installment-amount').value) || 0,
    payment_type: document.getElementById('installment-type').value,
    created_by: getCurrentUser()?.name || null,
  };
  const { error } = await sb.from('installments').insert(payload);
  if (error) { toast('Greška pri dodavanju uplate', true); return; }
  document.getElementById('installment-amount').value = '';
  await loadInstallments();
}

async function deleteInstallment(id) {
  await sb.from('installments').delete().eq('id', id);
  await loadInstallments();
}

async function saveOrderForm(e) {
  e.preventDefault();
  const id = document.getElementById('order-form-id').value;

  const payload = {
    patient_id: activePatientId,
    order_date: document.getElementById('order-form-date').value || todayISO(),
    envelope_number: document.getElementById('order-form-envelope').value.trim() || null,
    order_type: orderFormType,
    prepayment: Number(document.getElementById('order-form-prepayment').value) || 0,
    payment_method: document.getElementById('order-form-payment-method').value || null,
    has_installment: document.getElementById('order-form-installment').checked,
    discount_percent: Number(document.getElementById('order-form-discount').value) || 0,
    comment: document.getElementById('order-form-comment').value.trim() || null,
  };

  if (orderFormType === 'glasses') {
    payload.izrada_price = Number(document.getElementById('order-form-izrada').value) || 0;
    const subtotal = calcGlassesTotal(orderFramesDraft, orderLensesDraft) + payload.izrada_price;
    payload.total_amount = applyDiscount(subtotal, payload.discount_percent);
  } else {
    payload.cl_name = document.getElementById('order-form-cl-name').value.trim() || null;
    payload.cl_bc = document.getElementById('order-form-cl-bc').value || null;
    payload.cl_diopters = document.getElementById('order-form-cl-diopters').value.trim() || null;
    payload.cl_replacement_period = document.getElementById('order-form-cl-period').value.trim() || null;
    payload.cl_price = Number(document.getElementById('order-form-cl-price').value) || 0;
    payload.cl_qty = Number(document.getElementById('order-form-cl-qty').value) || 1;
    const subtotal = clTotal(payload.cl_price, payload.cl_qty);
    payload.total_amount = applyDiscount(subtotal, payload.discount_percent);
  }

  let error, savedId = id;
  if (id) {
    ({ error } = await sb.from('orders').update(payload).eq('id', id));
  } else {
    payload.created_by = getCurrentUser()?.name || null;
    const res = await sb.from('orders').insert(payload).select('id').single();
    error = res.error;
    savedId = res.data?.id;
  }

  if (error) { toast('Greška pri čuvanju porudžbine', true); return; }

  if (orderFormType === 'glasses') {
    await sb.from('order_frames').delete().eq('order_id', savedId);
    await sb.from('order_lenses').delete().eq('order_id', savedId);
    if (orderFramesDraft.length) {
      await sb.from('order_frames').insert(orderFramesDraft.map(f => ({
        order_id: savedId, purpose: f.purpose, frame_code: f.frame_code || null,
        is_client: !!f.is_client, price: Number(f.price) || 0,
      })));
    }
    if (orderLensesDraft.length) {
      await sb.from('order_lenses').insert(orderLensesDraft.map(l => ({
        order_id: savedId, purpose: l.purpose, lens_name: l.lens_name || null,
        lens_index: l.lens_index || null, lens_coating: l.lens_coating || null,
        price_unit: Number(l.price_unit) || 0, discount: Number(l.discount) || 0, qty: Number(l.qty) || 1,
      })));
      await updateLensCatalog(orderLensesDraft);
      await updateLensPriceMemory(orderLensesDraft);
    }
  }

  await sb.from('order_prescriptions').delete().eq('order_id', savedId);
  if (orderPrescriptionsDraft.length) {
    await sb.from('order_prescriptions').insert(orderPrescriptionsDraft.map(pid => ({
      order_id: savedId, prescription_id: pid,
    })));
  }

  document.getElementById('order-form-id').value = savedId;
  toast('Porudžbina sačuvana');

  closeModal('order-modal');
  await switchTab('orders');
}

async function deleteOrder(id) {
  if (!confirm('Obrisati porudžbinu?')) return;
  const { error } = await sb.from('orders').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast('Greška pri brisanju', true); return; }
  toast('Porudžbina obrisana');
  await renderOrdersTab();
}

let ordersLoaded = false;
let ordersSectionOffset = 0;
const ORDERS_PAGE = 50;
let ordersSectionRows = [];

const debouncedOrdersSearch = debounce(() => loadOrdersSection(true));

function clearOrdersFilters() {
  document.getElementById('orders-search-name').value = '';
  document.getElementById('orders-search-date').value = '';
  loadOrdersSection(true);
}

async function loadOrdersSection(reset = false) {
  ordersLoaded = true;
  if (reset) { ordersSectionOffset = 0; ordersSectionRows = []; }

  const nameFilter = document.getElementById('orders-search-name').value.trim();
  const dateFilter = document.getElementById('orders-search-date').value;

  let patientIds = null;
  if (nameFilter) {
    const { data: pts } = await sb.from('patients').select('id')
      .or(`first_name.ilike.%${nameFilter}%,last_name.ilike.%${nameFilter}%`).limit(200);
    patientIds = (pts || []).map(p => p.id);
    if (!patientIds.length) { ordersSectionRows = []; renderOrdersSectionTable(false); return; }
  }

  let query = sb.from('orders').select('*').is('deleted_at', null)
    .order('order_date', { ascending: false })
    .range(ordersSectionOffset, ordersSectionOffset + ORDERS_PAGE - 1);
  if (patientIds) query = query.in('patient_id', patientIds);
  if (dateFilter) query = query.eq('order_date', dateFilter);

  const { data, error } = await query;
  if (error) { toast('Greška pri učitavanju porudžbina', true); return; }

  const idsToFetch = [...new Set((data || []).map(o => o.patient_id))];
  let patientsMap = {};
  if (idsToFetch.length) {
    const { data: pts } = await sb.from('patients').select('id, first_name, last_name').in('id', idsToFetch);
    (pts || []).forEach(p => { patientsMap[p.id] = p; });
  }

  const enriched = (data || []).map(o => ({ order: o, patient: patientsMap[o.patient_id] || null }));
  ordersSectionRows = reset ? enriched : [...ordersSectionRows, ...enriched];
  ordersSectionOffset += (data || []).length;
  renderOrdersSectionTable(data && data.length === ORDERS_PAGE);
}

function renderOrdersSectionTable(hasMore = false) {
  const wrap = document.getElementById('orders-table-wrap');
  if (!ordersSectionRows.length) { wrap.innerHTML = '<div class="empty-state" style="height:auto;padding:40px;">Nema porudžbina</div>'; return; }
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Datum</th><th>Pacijent</th><th>Tip</th><th>Br.</th><th class="num">Iznos</th><th>Status</th></tr></thead>
      <tbody>
        ${ordersSectionRows.map(({ order: o, patient: p }) => `
          <tr onclick="goToPatient('${o.patient_id}','orders')">
            <td>${fmtDate(o.order_date)}</td>
            <td class="link">${p ? fullName(p) : '—'}</td>
            <td>${o.order_type === 'glasses' ? 'Naočare' : 'Sočiva'}</td>
            <td>${o.envelope_number || '—'}</td>
            <td class="num">${fmtMoney(o.total_amount)}</td>
            <td>${o.has_installment ? 'na rate' : 'plaćeno'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${hasMore ? `<button class="btn-secondary load-more" onclick="loadOrdersSection(false)">Učitaj još</button>` : ''}
  `;
}

let debtRecords = [];
let debtorPatientIds = new Set();

async function loadDebtsData() {
  const { data: orders, error } = await sb
    .from('orders')
    .select('*')
    .eq('has_installment', true)
    .is('deleted_at', null);

  if (error || !orders || !orders.length) { debtRecords = []; debtorPatientIds = new Set(); return; }

  const orderIds = orders.map(o => o.id);
  const { data: installments } = await sb.from('installments').select('*').in('order_id', orderIds);

  const paidByOrder = {};
  const lastPayByOrder = {};
  (installments || []).forEach(p => {
    paidByOrder[p.order_id] = (paidByOrder[p.order_id] || 0) + (Number(p.amount) || 0);
    if (!lastPayByOrder[p.order_id] || p.payment_date > lastPayByOrder[p.order_id]) lastPayByOrder[p.order_id] = p.payment_date;
  });

  const withRemaining = orders.map(o => {
    const paidInst = paidByOrder[o.id] || 0;
    const total = Number(o.total_amount) || 0;
    const prepayment = Number(o.prepayment) || 0;
    const remaining = total - prepayment - paidInst;
    return { order: o, total, paid: prepayment + paidInst, remaining, lastPayment: lastPayByOrder[o.id] || null };
  }).filter(r => r.remaining > 0.5);

  const patientIds = [...new Set(withRemaining.map(r => r.order.patient_id))];
  let patientsMap = {};
  if (patientIds.length) {
    const { data: pts } = await sb.from('patients').select('id, first_name, last_name, phone').in('id', patientIds);
    (pts || []).forEach(p => { patientsMap[p.id] = p; });
  }

  debtRecords = withRemaining
    .map(r => ({ ...r, patient: patientsMap[r.order.patient_id] || null }))
    .sort((a, b) => (a.order.order_date < b.order.order_date ? 1 : -1));

  debtorPatientIds = new Set(withRemaining.map(r => r.order.patient_id));
}

async function loadDebtsSection() {
  await loadDebtsData();
  renderDebtsTable();
  updateDebtsBadge();
  renderPatientList(document.getElementById('search-input')?.value || '');
}

async function initDebtBadge() {
  await loadDebtsData();
  updateDebtsBadge();
  renderPatientList(document.getElementById('search-input')?.value || '');
}

function updateDebtsBadge() {
  const el = document.getElementById('debts-count');
  if (!el) return;
  if (debtorPatientIds.size > 0) { el.style.display = 'inline-block'; el.textContent = debtorPatientIds.size; }
  else { el.style.display = 'none'; }
}

function renderDebtsTable() {
  const f = (document.getElementById('debts-search-name')?.value || '').trim().toLowerCase();
  const rows = debtRecords.filter(r => !f || fullName(r.patient || {}).toLowerCase().includes(f));
  const wrap = document.getElementById('debts-table-wrap');
  if (!rows.length) { wrap.innerHTML = '<div class="empty-state" style="height:auto;padding:40px;">Nema dugovanja</div>'; return; }
  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Br. porudžbine</th><th>Pacijent</th><th>Datum porudžbine</th><th class="num">Ukupno</th><th class="num">Plaćeno</th><th class="num">Ostalo</th><th>Poslednja uplata</th></tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr onclick="goToPatient('${r.order.patient_id}','orders')">
            <td class="link">${r.order.envelope_number || '—'}</td>
            <td>${r.patient ? fullName(r.patient) : '—'}</td>
            <td>${fmtDate(r.order.order_date)}</td>
            <td class="num">${fmtMoney(r.total)}</td>
            <td class="num">${fmtMoney(r.paid)}</td>
            <td class="num remaining-danger">${fmtMoney(r.remaining)}</td>
            <td>${r.lastPayment ? fmtDate(r.lastPayment) : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
