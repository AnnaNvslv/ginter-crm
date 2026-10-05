let currentOrders = [];
// Delovi porudžbine — naočare i/ili kontaktna sočiva (oba = order_type 'combined').
let orderHasGlasses = true;
let orderHasCl = false;
let orderFramesDraft = [];
let orderLensesDraft = [];
let orderClDraft = [];
let orderPrescriptionsDraft = [];
let currentPrescriptionsForOrder = [];
let knownLensNames = [];
let knownLensIndexes = [];
let knownLensCoatings = [];
let knownLensPrices = {};  // naziv stakla (lowercase, trim) -> poslednja korišćena cena/kom
let knownFramePrices = {}; // šifra okvira (lowercase, trim) -> poslednja korišćena cena
let knownClNames = [];
let knownClPrices = {};    // naziv sočiva (lowercase, trim) -> poslednja korišćena cena/kom
let lensPairSeq = 0;       // brojač za povezivanje redova OD/OS istog para stakala

function currentOrderType() {
  if (orderHasGlasses && orderHasCl) return 'combined';
  return orderHasCl ? 'contact_lenses' : 'glasses';
}

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
  let framesByOrder = {}, lensesByOrder = {}, installmentsByOrder = {}, rxByOrder = {}, clByOrder = {};

  if (orderIds.length) {
    const [framesRes, lensesRes, instRes, opRes, clRes] = await Promise.all([
      sb.from('order_frames').select('*').in('order_id', orderIds).order('created_at'),
      sb.from('order_lenses').select('*').in('order_id', orderIds).order('created_at'),
      sb.from('installments').select('*').in('order_id', orderIds),
      sb.from('order_prescriptions').select('order_id, prescription_id').in('order_id', orderIds),
      sb.from('order_cl_items').select('*').in('order_id', orderIds).order('created_at'),
    ]);
    (framesRes.data || []).forEach(f => { (framesByOrder[f.order_id] ??= []).push(f); });
    (lensesRes.data || []).forEach(l => { (lensesByOrder[l.order_id] ??= []).push(l); });
    (clRes.data || []).forEach(c => { (clByOrder[c.order_id] ??= []).push(c); });
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
    <button class="btn-primary" style="margin-bottom:20px;" onclick="quickAddOrder()">+ Nova porudžbina</button>
    ${orders.map(o => renderOrderCard(
      o,
      framesByOrder[o.id] || [],
      lensesByOrder[o.id] || [],
      installmentsByOrder[o.id] || [],
      rxByOrder[o.id] || [],
      clByOrder[o.id] || []
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

// Ukupno za stavke kontaktnih sočiva (jedno ili više pakovanja, svako sa svojom cenom).
function clItemsTotal(items) {
  return items.reduce((s, c) => s + clTotal(c.price, c.qty), 0);
}

// Deo za sočiva u porudžbini (pre popusta): iz order_cl_items; za stare porudžbine
// (pre 2026-10) iz kolona orders.cl_price × cl_qty.
function orderClSubtotal(o, clItems) {
  if (clItems.length) return clItemsTotal(clItems);
  if (o.order_type === 'contact_lenses') return clTotal(o.cl_price, o.cl_qty);
  return 0;
}

function orderTypeLabel(type) {
  if (type === 'combined') return '👓 Naočare + 👁 Sočiva';
  return type === 'contact_lenses' ? '👁 Kontaktna sočiva' : '👓 Naočare';
}

function eyeLabel(eye) {
  return eye === 'OD' || eye === 'OS' ? eye : 'OD+OS';
}

function renderOrderCard(o, frames, lenses, installments, rxLinks, clItems = []) {
  const hasGlasses = o.order_type === 'glasses' || o.order_type === 'combined';
  const hasCl = o.order_type === 'contact_lenses' || o.order_type === 'combined';
  const izrada = hasGlasses ? (Number(o.izrada_price) || 0) : 0;
  const subtotal = (hasGlasses ? calcGlassesTotal(frames, lenses) + izrada : 0) + (hasCl ? orderClSubtotal(o, clItems) : 0);
  const discountPercent = Number(o.discount_percent) || 0;
  const total = discountPercent ? applyDiscount(subtotal, discountPercent) : subtotal;
  const paidViaInstallments = installments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = total - (Number(o.prepayment) || 0) - paidViaInstallments;

  let itemsHtml = '';
  if (hasGlasses) {
    const purposeOrder = [];
    const seen = new Set();
    [...frames.map(f => f.purpose), ...lenses.map(l => l.purpose), ...rxLinks.filter(r => r.purpose !== 'kontaktna sočiva').map(r => r.purpose)].forEach(p => {
      if (p && !seen.has(p)) { seen.add(p); purposeOrder.push(p); }
    });

    itemsHtml = purposeOrder.map(purpose => {
      const rx = rxLinks.find(r => r.purpose === purpose) || null;
      const fList = frames.filter(f => f.purpose === purpose);
      const lList = lenses.filter(l => l.purpose === purpose);
      const lensComments = lList.map(l => l.comment).filter(Boolean);
      return `
        <div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;">
          <div style="font-weight:700;color:var(--accent);margin-bottom:8px;">${purpose}</div>
          ${rx ? `<div style="color:var(--text-light);font-size:15px;line-height:1.6;margin-bottom:10px;">${rxDetailLines(rx)}</div>` : `<div style="color:var(--text-light);font-size:14px;margin-bottom:10px;">Recept nije povezan</div>`}
          ${(fList.length || lList.length) ? `<div style="border-top:1px solid var(--border);padding-top:8px;">` : ''}
          ${fList.map(f => `<div class="item-row"><span>Okvir${f.frame_code ? ` (šifra ${f.frame_code})` : ''}:</span><span>${f.is_client ? 'klijentov okvir' : fmtMoney(f.price)}</span></div>${f.comment ? `<div style="color:var(--text-light);font-size:14px;margin:-2px 0 6px;">${escapeHtml(f.comment)}</div>` : ''}`).join('')}
          ${lList.map(l => `<div class="item-row"><span>Stakla${l.eye ? ` ${l.eye}` : ''}: ${lensDescriptor(l)}${l.eye ? '' : ` × ${l.qty}`}</span><span>${fmtMoney(lensTotal(l.price_unit, l.discount, l.qty))}</span></div>`).join('')}
          ${lensComments.map(c => `<div style="color:var(--text-light);font-size:14px;margin:-2px 0 6px;">${escapeHtml(c)}</div>`).join('')}
          ${(fList.length || lList.length) ? `</div>` : ''}
          ${!fList.length && !lList.length ? `<div style="color:var(--text-light);font-size:14px;">Bez okvira i stakala za ovu namenu</div>` : ''}
        </div>
      `;
    }).join('') || '<div style="color:var(--text-light);font-size:15px;margin-bottom:10px;">Bez okvira i stakala</div>';
  }

  let clHtml = '';
  if (hasCl) {
    if (clItems.length) {
      clHtml = `
        <div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;">
          <div style="font-weight:700;color:var(--accent);margin-bottom:8px;">kontaktna sočiva</div>
          ${clItems.map(c => `
            <div class="item-row"><span>${clItems.length > 1 || c.eye ? `${eyeLabel(c.eye)}: ` : ''}${c.cl_name || '—'} × ${c.qty}</span><span>${fmtMoney(clTotal(c.price, c.qty))}</span></div>
            ${(c.cl_bc || c.cl_diopters || c.cl_replacement_period) ? `<div style="color:var(--text-light);font-size:14px;margin:-2px 0 6px;">${[c.cl_bc && `BC ${c.cl_bc}`, c.cl_diopters, c.cl_replacement_period && `zamena: ${c.cl_replacement_period}`].filter(Boolean).join(' · ')}</div>` : ''}
          `).join('')}
        </div>`;
    } else {
      clHtml = `
        <div class="kv-row">
          <span><b>Naziv:</b> ${o.cl_name || '—'}</span>
          <span><b>BC:</b> ${o.cl_bc ?? '—'}</span>
          <span><b>Dioptrija:</b> ${o.cl_diopters || '—'}</span>
          <span><b>Zamena:</b> ${o.cl_replacement_period || '—'}</span>
          <span><b>Kol.:</b> ${o.cl_qty}</span>
        </div>`;
    }
  }

  return `
    <div class="list-card">
      <div class="list-card-header">
        <div class="title">${orderTypeLabel(o.order_type)} ${o.envelope_number ? `<span class="badge">br. ${o.envelope_number}</span>` : ''}</div>
        <div class="actions">
          <span style="color:var(--text-light);font-size:14px;">${fmtDate(o.order_date)}</span>
          <button class="btn-secondary" onclick="openEditOrderModal('${o.id}')">Izm.</button>
          <button class="btn-secondary" style="color:#C0392B;border-color:#C0392B;" onclick="deleteOrder('${o.id}')">Obr.</button>
        </div>
      </div>
      ${hasGlasses ? `
        ${itemsHtml}
        ${izrada ? `<div class="item-row"><span>Izrada:</span><span>${fmtMoney(izrada)}</span></div>` : ''}
      ` : ''}
      ${clHtml}
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

// Tip porudžbine: 'glasses' | 'contact_lenses' | 'combined' (naočare + sočiva u istoj porudžbini).
function setOrderType(type) {
  orderHasGlasses = type === 'glasses' || type === 'combined';
  orderHasCl = type === 'contact_lenses' || type === 'combined';
  if (orderHasCl && !orderClDraft.length) { orderClDraft.push(newClItem()); renderClRows(); }
  applyOrderTypeUI();
  updateOrderFormTotal();
}

function applyOrderTypeUI() {
  const type = currentOrderType();
  document.querySelectorAll('#order-modal .type-toggle button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  document.getElementById('glasses-fields').style.display = orderHasGlasses ? 'block' : 'none';
  document.getElementById('cl-fields').style.display = orderHasCl ? 'block' : 'none';
  // Izrada je u istom redu sa Popust (izvan #glasses-fields) — vidljiva samo kad ima naočara.
  const izradaWrap = document.getElementById('izrada-field-wrap');
  if (izradaWrap) izradaWrap.style.display = orderHasGlasses ? 'block' : 'none';
}

function escAttr(v) {
  return v === undefined || v === null ? '' : escapeHtml(String(v));
}

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function focusEl(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.focus();
  if (typeof el.select === 'function') { try { el.select(); } catch (_) {} }
  return true;
}

function focusOrderSubmit() {
  document.querySelector('#order-form button[type="submit"]')?.focus();
}

// Zajednička logika "zapamćene cene" (stakla po nazivu, okvir po šifri, sočiva po nazivu):
// ako je cena prazna — upisuje zapamćenu; ako je cena već bila automatski upisana (_autoPrice)
// a korisnik nastavi da kuca naziv/šifru — prati novo poklapanje (ili briše cenu ako ga nema).
// Ručno upisana cena se nikad ne prepisuje.
function applyRememberedPrice(obj, field, known, inputId) {
  if (known != null && (isBlank(obj[field]) || obj._autoPrice)) {
    obj[field] = known;
    obj._autoPrice = true;
  } else if (known == null && obj._autoPrice) {
    obj[field] = '';
    obj._autoPrice = false;
  } else {
    return false;
  }
  const el = document.getElementById(inputId);
  if (el) el.value = obj[field];
  return true;
}

// ═══ OKVIRI ═══

function newFrame(purpose) {
  return { purpose, frame_code: '', is_client: false, price: '', comment: '', _autoPrice: false };
}

// Red okvira: namena · šifra · cena · klijentov · ×, a ispod polje za komentar.
// Namena, "klijentov" i komentar imaju enter-skip — Enter ide šifra → cena → sledeće.
function renderFrameRows() {
  document.getElementById('frames-container').innerHTML = orderFramesDraft.map((f, i) => `
    <div style="margin-bottom:8px;">
      <div style="display:grid;grid-template-columns:1fr 100px 130px auto 34px;gap:6px;align-items:center;">
        <select class="enter-skip" onchange="orderFramesDraft[${i}].purpose=this.value" style="padding:10px;font-size:16px;border:1px solid var(--border);border-radius:10px;">
          ${purposeOptions(f.purpose)}
        </select>
        <input type="text" id="frame-code-${i}" placeholder="šifra" maxlength="4" value="${escAttr(f.frame_code)}" oninput="onFrameCodeInput(${i}, this.value)" style="padding:10px;font-size:16px;">
        <input type="text" id="frame-price-${i}" placeholder="cena" value="${escAttr(f.price)}" oninput="orderFramesDraft[${i}].price=this.value;orderFramesDraft[${i}]._autoPrice=false;updateOrderFormTotal()" style="padding:10px;font-size:16px;text-align:right;">
        <label style="display:flex;align-items:center;gap:6px;font-size:14px;white-space:nowrap;">
          <input type="checkbox" class="enter-skip" ${f.is_client ? 'checked' : ''} onchange="orderFramesDraft[${i}].is_client=this.checked;updateOrderFormTotal()"> klijentov
        </label>
        <button type="button" onclick="removeFrameRow(${i})" style="color:#C0392B;padding:6px;">×</button>
      </div>
      <input type="text" class="enter-skip row-comment" placeholder="komentar za okvir (nije obavezno)" value="${escAttr(f.comment)}" oninput="orderFramesDraft[${i}].comment=this.value">
    </div>
  `).join('') || '<div style="color:var(--text-light);font-size:15px;margin-bottom:4px;">Nema dodatih okvira</div>';
}

function onFrameCodeInput(i, code) {
  const f = orderFramesDraft[i];
  f.frame_code = code;
  applyRememberedPrice(f, 'price', knownFramePrices[code.trim().toLowerCase()], `frame-price-${i}`);
  updateOrderFormTotal();
}

function addFrameRow() {
  orderFramesDraft.push(newFrame(PURPOSES[0]));
  renderFrameRows();
  updateOrderFormTotal();
}

function removeFrameRow(i) {
  orderFramesDraft.splice(i, 1);
  renderFrameRows();
  updateOrderFormTotal();
}

// ═══ STAKLA — par OD/OS, po 1 kom ═══
//
// Svaki par stakala su dva reda u orderLensesDraft (eye 'OD' i 'OS', qty 1, isti _pair).
// Sve što se upiše za OD odmah se prepisuje i u OS, dok god OS nije ručno menjan (_linked).
// Ručna izmena bilo kog polja OS prekida vezu; dugme "= OD" je ponovo uspostavlja.
// Stari redovi (pre 2026-10, bez eye) se prikazuju kao jedan red sa količinom.
const LENS_COPY_FIELDS = ['lens_name', 'lens_index', 'lens_coating', 'price_unit', 'discount'];

function newLensRow(pair, eye, purpose) {
  return { _pair: pair, eye, purpose, lens_name: '', lens_index: '', lens_coating: '', price_unit: '', discount: '', qty: 1, comment: '', _autoPrice: false, _linked: eye === 'OS' };
}

function newLensPair(purpose) {
  const pair = ++lensPairSeq;
  return [newLensRow(pair, 'OD', purpose), newLensRow(pair, 'OS', purpose)];
}

// Grupe redova po paru, redom pojavljivanja: [{ pair, rows: [indeksi u orderLensesDraft] }]
function lensGroups() {
  const groups = [];
  const byPair = {};
  orderLensesDraft.forEach((l, i) => {
    if (!l._pair) l._pair = ++lensPairSeq;
    if (!byPair[l._pair]) { byPair[l._pair] = { pair: l._pair, rows: [] }; groups.push(byPair[l._pair]); }
    byPair[l._pair].rows.push(i);
  });
  return groups;
}

function lensInput(i, field, placeholder, extraClass = '') {
  const l = orderLensesDraft[i];
  const list = { lens_name: 'lens-name-list', lens_index: 'lens-index-list', lens_coating: 'lens-coating-list' }[field];
  const num = field === 'price_unit' || field === 'discount' || field === 'qty';
  const jump = field === 'lens_name' || field === 'price_unit';
  return `<input type="text" id="lens-${field}-${i}" placeholder="${placeholder}" class="${extraClass}"
    ${list ? `list="${list}" onfocus="openDatalist(this)" onclick="openDatalist(this)"` : ''}
    value="${escAttr(l[field])}" oninput="onLensFieldInput(${i}, '${field}', this.value)"
    ${jump ? `onkeydown="handleLensEnterJump(event, ${i})"` : ''}
    style="padding:8px 10px;font-size:16px;width:100%;min-width:0;${num ? 'text-align:right;' : ''}">`;
}

function lensEyeRow(i) {
  const l = orderLensesDraft[i];
  const linkedOs = l.eye === 'OS' && l._linked;
  return `
    <div class="lens-eye-row${linkedOs ? ' linked' : ''}" style="display:grid;grid-template-columns:40px 2fr 1fr 1fr 1fr 0.8fr;gap:6px;align-items:center;margin-bottom:6px;">
      <div style="font-weight:700;color:var(--accent);font-size:15px;">
        ${l.eye}${l.eye === 'OS' && !l._linked ? `<button type="button" title="Ponovo isto kao OD" onclick="relinkOs(${i})" style="display:block;font-size:12px;color:var(--text-light);padding:0;">= OD</button>` : ''}
      </div>
      ${lensInput(i, 'lens_name', 'naziv stakla')}
      ${lensInput(i, 'lens_index', 'indeks')}
      ${lensInput(i, 'lens_coating', 'premaz')}
      ${lensInput(i, 'price_unit', 'cena/kom')}
      ${lensInput(i, 'discount', 'pop. %', 'enter-skip')}
    </div>`;
}

function renderLensRows() {
  const html = lensGroups().map(g => {
    const first = orderLensesDraft[g.rows[0]];
    const odIdx = g.rows.find(r => orderLensesDraft[r].eye === 'OD');
    const head = `
      <div style="display:grid;grid-template-columns:1fr 34px;gap:6px;align-items:center;margin-bottom:6px;">
        <select class="enter-skip" onchange="setLensGroupPurpose(${g.pair}, this.value)" style="padding:10px;font-size:16px;border:1px solid var(--border);border-radius:10px;max-width:220px;">
          ${purposeOptions(first.purpose)}
        </select>
        <button type="button" onclick="removeLensGroup(${g.pair})" style="color:#C0392B;padding:6px;">×</button>
      </div>`;
    let body;
    if (odIdx !== undefined) {
      body = g.rows.map(lensEyeRow).join('');
    } else {
      // stari red (bez OD/OS) — sa poljem za količinu
      const i = g.rows[0];
      body = `
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 0.8fr 0.6fr;gap:6px;margin-bottom:6px;">
          ${lensInput(i, 'lens_name', 'naziv stakla')}
          ${lensInput(i, 'lens_index', 'indeks')}
          ${lensInput(i, 'lens_coating', 'premaz')}
          ${lensInput(i, 'price_unit', 'cena/kom')}
          ${lensInput(i, 'discount', 'pop. %', 'enter-skip')}
          ${lensInput(i, 'qty', 'kol.')}
        </div>`;
    }
    const commentIdx = odIdx !== undefined ? odIdx : g.rows[0];
    return `
      <div style="border:1px solid var(--border);border-radius:12px;padding:8px;margin-bottom:6px;">
        ${head}${body}
        <input type="text" class="enter-skip row-comment" placeholder="komentar za stakla (nije obavezno)" value="${escAttr(orderLensesDraft[commentIdx].comment)}" oninput="orderLensesDraft[${commentIdx}].comment=this.value">
      </div>`;
  }).join('');
  document.getElementById('lens-container').innerHTML = html || '<div style="color:var(--text-light);font-size:15px;margin-bottom:4px;">Nema dodatih stakala</div>';
}

function onLensFieldInput(i, field, value) {
  const l = orderLensesDraft[i];
  l[field] = value;
  if (field === 'price_unit') l._autoPrice = false;
  if (field === 'lens_name') applyRememberedPrice(l, 'price_unit', knownLensPrices[value.trim().toLowerCase()], `lens-price_unit-${i}`);
  if (l.eye === 'OS' && l._linked) {
    l._linked = false;
    const row = document.getElementById(`lens-${field}-${i}`)?.closest('.lens-eye-row');
    if (row) row.classList.remove('linked');
  }
  if (l.eye === 'OD') syncLinkedOs(i);
  updateOrderFormTotal();
}

function lensOsIndexFor(odIdx) {
  const pair = orderLensesDraft[odIdx]._pair;
  return orderLensesDraft.findIndex(r => r._pair === pair && r.eye === 'OS');
}

function syncLinkedOs(odIdx) {
  const od = orderLensesDraft[odIdx];
  const osIdx = lensOsIndexFor(odIdx);
  if (osIdx < 0) return;
  const os = orderLensesDraft[osIdx];
  if (!os._linked) return;
  LENS_COPY_FIELDS.forEach(f => {
    os[f] = od[f];
    const el = document.getElementById(`lens-${f}-${osIdx}`);
    if (el) el.value = od[f] ?? '';
  });
  os._autoPrice = od._autoPrice;
}

function relinkOs(osIdx) {
  const os = orderLensesDraft[osIdx];
  const odIdx = orderLensesDraft.findIndex(r => r._pair === os._pair && r.eye === 'OD');
  os._linked = true;
  if (odIdx >= 0) syncLinkedOs(odIdx);
  renderLensRows();
  updateOrderFormTotal();
}

function setLensGroupPurpose(pair, purpose) {
  orderLensesDraft.forEach(l => { if (l._pair === pair) l.purpose = purpose; });
}

function removeLensGroup(pair) {
  orderLensesDraft = orderLensesDraft.filter(l => l._pair !== pair);
  renderLensRows();
  updateOrderFormTotal();
}

// Enter u "naziv stakla" ili "cena/kom" kad je cena za taj red već poznata (zapamćena ili
// upisana): preskače ostala polja reda. Posle OD — ako je OS i dalje isti kao OD, preskače
// i ceo OS; ide na sledeći par, pa na sočiva (kombinovana porudžbina), pa na "Sačuvaj".
// Ako cena još nije uneta, Enter ide normalno na sledeće polje.
function handleLensEnterJump(e, i) {
  if (e.key !== 'Enter') return;
  if (isBlank(orderLensesDraft[i]?.price_unit)) return;
  e.preventDefault();
  e.stopPropagation();
  focusAfterLensRow(i);
}

function focusAfterLensRow(i) {
  const l = orderLensesDraft[i];
  const groups = lensGroups();
  const gIdx = groups.findIndex(g => g.pair === l._pair);
  if (l.eye === 'OD') {
    const osIdx = lensOsIndexFor(i);
    if (osIdx >= 0 && !orderLensesDraft[osIdx]._linked && focusEl(`lens-lens_name-${osIdx}`)) return;
  }
  const nextG = groups[gIdx + 1];
  if (nextG && focusEl(`lens-lens_name-${nextG.rows[0]}`)) return;
  if (orderHasCl && orderClDraft.length && focusEl('cl-name-0')) return;
  focusOrderSubmit();
}

function addLensRow() {
  orderLensesDraft.push(...newLensPair(PURPOSES[0]));
  renderLensRows();
  updateOrderFormTotal();
}

// Redovi iz baze → draft: OD + OS iste namene postaju par; stari red "× 2" (bez oka)
// se pretvara u par OD/OS po 1 kom (isti iznos); ostali stari redovi ostaju kakvi jesu.
function pairLensRowsFromDb(rows) {
  const out = [];
  const used = new Set();
  rows.forEach((r, idx) => {
    if (used.has(idx)) return;
    used.add(idx);
    const row = { ...r, comment: r.comment || '', _autoPrice: false };
    if (r.eye === 'OD') {
      row._pair = ++lensPairSeq;
      out.push(row);
      const osIdx = rows.findIndex((x, j) => !used.has(j) && x.eye === 'OS' && x.purpose === r.purpose);
      if (osIdx >= 0) {
        used.add(osIdx);
        const os = { ...rows[osIdx], comment: '', _pair: row._pair, _autoPrice: false };
        os._linked = LENS_COPY_FIELDS.every(f => String(os[f] ?? '') === String(row[f] ?? ''));
        out.push(os);
      }
    } else if (!r.eye && Number(r.qty) === 2) {
      const [od, os] = newLensPair(r.purpose);
      LENS_COPY_FIELDS.forEach(f => { od[f] = r[f] ?? ''; os[f] = r[f] ?? ''; });
      od.comment = r.comment || '';
      out.push(od, os);
    } else {
      row._pair = ++lensPairSeq;
      out.push(row);
    }
  });
  return out;
}

// ═══ KONTAKTNA SOČIVA — jedno ili više pakovanja ═══
//
// Enter: Naziv → Cena po komadu → Količina → (sledeće pakovanje) → Sačuvaj.
// BC, dioptrija i rok zamene su u sklopljenom bloku "Detalji" i ne ulaze u Enter-lanac.
function newClItem(eye = '') {
  return { eye, cl_name: '', cl_bc: '', cl_diopters: '', cl_replacement_period: '', price: '', qty: 1, _autoPrice: false, _open: false };
}

function renderClRows() {
  const wrap = document.getElementById('cl-items-container');
  if (!wrap) return;
  const multi = orderClDraft.length > 1;
  wrap.innerHTML = orderClDraft.map((c, i) => {
    const details = [c.cl_bc && `BC ${c.cl_bc}`, c.cl_diopters, c.cl_replacement_period].filter(v => !isBlank(v)).join(' · ');
    return `
    <div class="cl-item">
      <div style="display:grid;grid-template-columns:${multi ? '100px ' : ''}1fr 130px 90px${multi ? ' 34px' : ''};gap:6px;align-items:end;">
        ${multi ? `<div><label>Oko</label><select class="enter-skip" onchange="orderClDraft[${i}].eye=this.value" style="width:100%;">
          ${['', 'OD', 'OS'].map(e => `<option value="${e}" ${(c.eye || '') === e ? 'selected' : ''}>${eyeLabel(e)}</option>`).join('')}
        </select></div>` : ''}
        <div><label>Naziv</label><input type="text" id="cl-name-${i}" list="cl-name-list" onfocus="openDatalist(this)" onclick="openDatalist(this)" value="${escAttr(c.cl_name)}" oninput="onClFieldInput(${i}, 'cl_name', this.value)"></div>
        <div><label>Cena po komadu</label><input type="number" id="cl-price-${i}" min="0" value="${escAttr(c.price)}" oninput="onClFieldInput(${i}, 'price', this.value)"></div>
        <div><label>Količina</label><input type="number" id="cl-qty-${i}" min="1" value="${escAttr(c.qty)}" oninput="onClFieldInput(${i}, 'qty', this.value)" onkeydown="handleClQtyEnter(event, ${i})"></div>
        ${multi ? `<button type="button" onclick="removeClItem(${i})" style="color:#C0392B;padding:6px;margin-bottom:10px;">×</button>` : ''}
      </div>
      <button type="button" class="cl-details-toggle" onclick="toggleClDetails(${i})">
        <span>${c._open ? '▴' : '▾'} BC, dioptrija, rok zamene</span>${!c._open && details ? `<span class="cl-details-summary">${escapeHtml(details)}</span>` : ''}
      </button>
      <div class="cl-details" ${c._open ? '' : 'hidden'}>
        <div><label>BC</label><input type="text" class="enter-skip" value="${escAttr(c.cl_bc)}" oninput="orderClDraft[${i}].cl_bc=this.value"></div>
        <div><label>Dioptrija</label><input type="text" class="enter-skip" value="${escAttr(c.cl_diopters)}" oninput="orderClDraft[${i}].cl_diopters=this.value"></div>
        <div><label>Rok zamene</label><input type="text" class="enter-skip" placeholder="npr. 1 mesec" value="${escAttr(c.cl_replacement_period)}" oninput="orderClDraft[${i}].cl_replacement_period=this.value"></div>
      </div>
    </div>`;
  }).join('');
}

function onClFieldInput(i, field, value) {
  const c = orderClDraft[i];
  c[field] = value;
  if (field === 'price') c._autoPrice = false;
  if (field === 'cl_name') applyRememberedPrice(c, 'price', knownClPrices[value.trim().toLowerCase()], `cl-price-${i}`);
  updateOrderFormTotal();
}

function handleClQtyEnter(e, i) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  e.stopPropagation();
  if (i < orderClDraft.length - 1 && focusEl(`cl-name-${i + 1}`)) return;
  focusOrderSubmit();
}

function toggleClDetails(i) {
  orderClDraft[i]._open = !orderClDraft[i]._open;
  renderClRows();
}

// Drugo pakovanje (npr. jedno oko torično, drugo sferno — različita cena):
// prvo pakovanje postaje OD, novo OS.
function addClItem() {
  if (orderClDraft.length === 1 && !orderClDraft[0].eye) orderClDraft[0].eye = 'OD';
  orderClDraft.push(newClItem(orderClDraft.length === 1 ? 'OS' : ''));
  renderClRows();
  updateOrderFormTotal();
  focusEl(`cl-name-${orderClDraft.length - 1}`);
}

function removeClItem(i) {
  orderClDraft.splice(i, 1);
  if (!orderClDraft.length) orderClDraft.push(newClItem());
  if (orderClDraft.length === 1) orderClDraft[0].eye = '';
  renderClRows();
  updateOrderFormTotal();
}

// BC i dioptrija iz recepta za kontaktna sočiva → prvo pakovanje (samo prazna polja).
function prefillClFromRx(rx) {
  if (!orderClDraft.length) orderClDraft.push(newClItem());
  const c = orderClDraft[0];
  if (isBlank(c.cl_bc) && rx.bc) c.cl_bc = rx.bc;
  if (isBlank(c.cl_diopters)) c.cl_diopters = rxSummaryLine({ ...rx, purpose: null, pd: null });
}

// Učitava predloge iz "čistog" kataloga (tabela lens_catalog) — ne iz istorije porudžbina,
// da stare, nekonzistentne unose ne bi zatrpavale <datalist>. Katalog se sam popunjava
// dalje kroz saveOrderForm() svaki put kad se sačuva nova vrednost.
// Vrste: name/index/coating (stakla), frame (šifra okvira → cena), cl (naziv sočiva → cena).
async function loadLensAutocompleteData() {
  const { data } = await sb.from('lens_catalog').select('kind, value, default_price').order('value');
  const names = [], indexes = [], coatings = [], prices = {}, framePrices = {}, clNames = [], clPrices = {};
  (data || []).forEach(r => {
    const key = r.value.trim().toLowerCase();
    if (r.kind === 'name') {
      names.push(r.value);
      if (r.default_price != null) prices[key] = Number(r.default_price);
    }
    else if (r.kind === 'index') indexes.push(r.value);
    else if (r.kind === 'coating') coatings.push(r.value);
    else if (r.kind === 'frame') { if (r.default_price != null) framePrices[key] = Number(r.default_price); }
    else if (r.kind === 'cl') {
      clNames.push(r.value);
      if (r.default_price != null) clPrices[key] = Number(r.default_price);
    }
  });
  knownLensNames = names;
  knownLensIndexes = indexes;
  knownLensCoatings = coatings;
  knownLensPrices = prices;
  knownFramePrices = framePrices;
  knownClNames = clNames;
  knownClPrices = clPrices;

  const esc = v => v.replace(/"/g, '&quot;');
  const fill = (id, values) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = values.map(v => `<option value="${esc(v)}"></option>`).join('');
  };
  fill('lens-name-list', knownLensNames);
  fill('lens-index-list', knownLensIndexes);
  fill('lens-coating-list', knownLensCoatings);
  fill('cl-name-list', knownClNames);
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

// Pamti poslednju korišćenu cenu po ključu (kolona lens_catalog.default_price), da bi se
// sledeći put mogla automatski predložiti. Cena se namerno ažurira pri svakom čuvanju —
// tako memorija prati stvarno trenutne cene. Koristi se za stakla (naziv), okvire (šifra)
// i kontaktna sočiva (naziv).
async function rememberPrices(kind, items) {
  const rows = [];
  const seen = new Set();
  items.forEach(([rawKey, rawPrice]) => {
    const value = (rawKey || '').trim();
    const price = Number(rawPrice);
    if (!value || !price) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ kind, value, default_price: price });
  });
  if (!rows.length) return;
  await sb.from('lens_catalog').upsert(rows, { onConflict: 'kind,value' });
}

function updateLensPriceMemory(lenses) {
  return rememberPrices('name', lenses.map(l => [l.lens_name, l.price_unit]));
}

function updateFramePriceMemory(frames) {
  return rememberPrices('frame', frames.filter(f => !f.is_client).map(f => [f.frame_code, f.price]));
}

// Sočiva: naziv ulazi u listu predloga i bez cene, a cena se pamti kad je uneta.
async function updateClMemory(items) {
  const names = [...new Set(items.map(c => (c.cl_name || '').trim()).filter(Boolean))];
  if (names.length) {
    await sb.from('lens_catalog').upsert(names.map(value => ({ kind: 'cl', value })), { onConflict: 'kind,value', ignoreDuplicates: true });
  }
  await rememberPrices('cl', items.map(c => [c.cl_name, c.price]));
}

// Dodaje po jedan red okvira i par stakala za datu namenu, ali samo ako takva namena
// tu još ne postoji (da ne dupliramo redove koje je korisnik već ručno dodao).
// Kontaktna sočiva nemaju okvir/stakla — za njih se ne dodaje ništa.
function ensureFrameAndLensForPurpose(purpose) {
  if (!purpose || purpose === 'kontaktna sočiva') return;
  if (!orderFramesDraft.some(f => f.purpose === purpose)) orderFramesDraft.push(newFrame(purpose));
  if (!orderLensesDraft.some(l => l.purpose === purpose)) orderLensesDraft.push(...newLensPair(purpose));
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

// Padajuće liste povezanih recepata imaju enter-skip — Enter iz "Broj porudžbine" ide
// pravo na šifru okvira (ili na naziv sočiva).
function renderPrescriptionRows() {
  const wrap = document.getElementById('order-form-prescriptions-list');
  if (!wrap) return;
  if (!currentPrescriptionsForOrder.length) {
    wrap.innerHTML = '<div style="color:var(--text-light);font-size:15px;">Pacijent još nema recepata</div>';
    return;
  }
  wrap.innerHTML = orderPrescriptionsDraft.map((rxId, i) => `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
      <select class="enter-skip" onchange="updatePrescriptionRow(${i}, this.value)" style="flex:1;padding:9px 12px;font-size:16px;border:1px solid var(--border);border-radius:12px;">
        ${currentPrescriptionsForOrder.map(rx => `<option value="${rx.id}" ${rx.id === rxId ? 'selected' : ''}>${rxOptionLabel(rx)}</option>`).join('')}
      </select>
      <button type="button" onclick="removePrescriptionRow(${i})" style="color:#C0392B;padding:6px;">×</button>
    </div>
  `).join('') || '<div style="color:var(--text-light);font-size:15px;">Nijedan recept nije povezan</div>';
}

function glassesPartIsEmpty() {
  return !orderFramesDraft.some(f => !isBlank(f.frame_code) || !isBlank(f.price) || f.is_client)
    && !orderLensesDraft.some(l => !isBlank(l.lens_name) || !isBlank(l.price_unit));
}

function linkedPrescriptions() {
  return orderPrescriptionsDraft.map(id => currentPrescriptionsForOrder.find(r => r.id === id)).filter(Boolean);
}

// Posle povezivanja recepata: za svaki recept za naočare — red okvira + par stakala te
// namene; za recept za sočiva — uključuje se deo "Kontaktna sočiva" (BC/dioptrija iz
// recepta). Ako su povezani i jedni i drugi — porudžbina je kombinovana. Delovi se samo
// uključuju; jedino prazan (nepopunjen) deo za naočare bez ijednog recepta za naočare se
// isključuje, da porudžbina samo za sočiva ne nosi prazne redove okvira.
function applyRxToOrderParts(rxs) {
  const clRx = rxs.filter(r => r.purpose === 'kontaktna sočiva');
  const glRx = rxs.filter(r => r.purpose !== 'kontaktna sočiva');
  let gl = orderHasGlasses || glRx.length > 0;
  let cl = orderHasCl || clRx.length > 0;
  if (clRx.length && !linkedPrescriptions().some(r => r.purpose !== 'kontaktna sočiva') && glassesPartIsEmpty()) gl = false;
  glRx.forEach(r => ensureFrameAndLensForPurpose(r.purpose));
  if (!gl) { orderFramesDraft = []; orderLensesDraft = []; }
  orderHasGlasses = gl;
  orderHasCl = cl;
  if (cl && !orderClDraft.length) orderClDraft.push(newClItem());
  clRx.forEach(prefillClFromRx);
  applyOrderTypeUI();
  renderPrescriptionRows();
  renderFrameRows();
  renderLensRows();
  renderClRows();
  updateOrderFormTotal();
}

// "+ Postojeći recept": povezuje sledeći još nepovezan recept pacijenta.
function addPrescriptionRow() {
  if (!currentPrescriptionsForOrder.length) { toast('Pacijent nema recepata', true); return; }
  const used = new Set(orderPrescriptionsDraft);
  const next = currentPrescriptionsForOrder.find(rx => !used.has(rx.id)) || currentPrescriptionsForOrder[0];
  orderPrescriptionsDraft.push(next.id);
  applyRxToOrderParts([next]);
}

// Kad se promeni izbor recepta u postojećem redu, prebacuje odgovarajući okvir/stakla
// (ako nijedan drugi izabrani recept i dalje ne treba staru namenu) na novu namenu,
// i garantuje da za novu namenu postoji bar jedan red okvira i jedan par stakala.
function updatePrescriptionRow(i, newRxId) {
  const oldRx = currentPrescriptionsForOrder.find(rx => rx.id === orderPrescriptionsDraft[i]);
  const newRx = currentPrescriptionsForOrder.find(rx => rx.id === newRxId);
  orderPrescriptionsDraft[i] = newRxId;

  const isCl = p => p === 'kontaktna sočiva';
  if (oldRx && newRx && oldRx.purpose !== newRx.purpose && !isCl(oldRx.purpose) && !isCl(newRx.purpose)) {
    const stillNeedsOld = orderPrescriptionsDraft.some((id, idx) =>
      idx !== i && currentPrescriptionsForOrder.find(r => r.id === id)?.purpose === oldRx.purpose
    );
    if (!stillNeedsOld) {
      const f = orderFramesDraft.find(f => f.purpose === oldRx.purpose);
      if (f) f.purpose = newRx.purpose;
      const l = orderLensesDraft.find(l => l.purpose === oldRx.purpose);
      if (l) setLensGroupPurpose(l._pair, newRx.purpose);
    }
  }
  if (newRx) applyRxToOrderParts([newRx]);
}

function removePrescriptionRow(i) {
  orderPrescriptionsDraft.splice(i, 1);
  renderPrescriptionRows();
}

async function populatePrescriptionOptions() {
  const { data } = await sb.from('prescriptions').select('*').eq('patient_id', activePatientId)
    .order('rx_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  currentPrescriptionsForOrder = data || [];
  orderPrescriptionsDraft = orderPrescriptionsDraft.filter(id => currentPrescriptionsForOrder.some(rx => rx.id === id));
  renderPrescriptionRows();
}

// "+ Novi recept" u formi porudžbine: otvara uobičajen unos recepta preko porudžbine;
// posle "Sačuvaj" recept(i) se vraćaju ovde — vidi attachNewPrescriptionsToOrder().
function openNewPrescriptionFromOrder() {
  openAddPrescriptionModal({ fromOrder: true, date: document.getElementById('order-form-date').value });
}

async function attachNewPrescriptionsToOrder(ids) {
  await populatePrescriptionOptions();
  ids.forEach(id => { if (!orderPrescriptionsDraft.includes(id)) orderPrescriptionsDraft.push(id); });
  const rxs = ids.map(id => currentPrescriptionsForOrder.find(r => r.id === id)).filter(Boolean);
  applyRxToOrderParts(rxs);
}

// Otvara novu porudžbinu sa već povezanim receptima (lanac posle unosa recepta,
// dugme "Primeni recept", "+ Porudžbina" sa poslednjim receptom).
async function openOrderWithPrescriptions(rxIds = [], dateOverride) {
  await switchTab('orders');
  await openAddOrderModal(dateOverride);
  const rxs = rxIds.map(id => currentPrescriptionsForOrder.find(r => r.id === id)).filter(Boolean);
  if (!rxs.length) return;
  orderPrescriptionsDraft = rxs.map(r => r.id);
  applyRxToOrderParts(rxs);
}

function updateOrderFormTotal() {
  let subtotal = 0;
  if (orderHasGlasses) {
    const izrada = Number(document.getElementById('order-form-izrada')?.value) || 0;
    subtotal += calcGlassesTotal(orderFramesDraft, orderLensesDraft) + izrada;
  }
  if (orderHasCl) subtotal += clItemsTotal(orderClDraft);
  const discountPercent = Number(document.getElementById('order-form-discount')?.value) || 0;
  const total = applyDiscount(subtotal, discountPercent);
  const prepayment = Number(document.getElementById('order-form-prepayment')?.value) || 0;
  const remaining = total - prepayment;

  const elTotal = document.getElementById('order-form-total-preview');
  if (elTotal) elTotal.textContent = fmtMoney(total);
  const elRemaining = document.getElementById('order-form-remaining-preview');
  if (elRemaining) elRemaining.textContent = fmtMoney(remaining);
}

// Prvo aktivno polje je "Datum porudžbine"; Enter → Broj porudžbine → Enter → šifra
// okvira (ili naziv sočiva) — recepti i namene se preskaču (enter-skip).
function focusOrderDateField() {
  setTimeout(() => focusEl('order-form-date'), 0);
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
  orderClDraft = [];
  orderPrescriptionsDraft = [];
  setOrderType('glasses');
  applyOrderExtra(orderExtraSticky);
  renderFrameRows();
  renderLensRows();
  renderClRows();
  await populatePrescriptionOptions();
  await loadLensAutocompleteData();
  toggleInstallmentFields(false);
  updateOrderFormTotal();
  openModal('order-modal');
  focusOrderDateField();
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

  const [framesRes, lensesRes, opRes, clRes] = await Promise.all([
    sb.from('order_frames').select('*').eq('order_id', id).order('created_at'),
    sb.from('order_lenses').select('*').eq('order_id', id).order('created_at'),
    sb.from('order_prescriptions').select('prescription_id').eq('order_id', id),
    sb.from('order_cl_items').select('*').eq('order_id', id).order('created_at'),
  ]);
  orderFramesDraft = (framesRes.data || []).map(f => ({ ...f, comment: f.comment || '', _autoPrice: false }));
  orderLensesDraft = pairLensRowsFromDb(lensesRes.data || []);
  orderPrescriptionsDraft = (opRes.data || []).map(r => r.prescription_id);

  const clItems = clRes.data || [];
  if (clItems.length) {
    orderClDraft = clItems.map(c => ({
      eye: c.eye || '', cl_name: c.cl_name || '', cl_bc: c.cl_bc || '', cl_diopters: c.cl_diopters || '',
      cl_replacement_period: c.cl_replacement_period || '', price: c.price ?? '', qty: c.qty ?? 1,
      _autoPrice: false, _open: false,
    }));
  } else if (o.order_type === 'contact_lenses') {
    // stara porudžbina sočiva (podaci u kolonama orders.cl_*) → jedno pakovanje
    orderClDraft = [{
      eye: '', cl_name: o.cl_name || '', cl_bc: o.cl_bc || '', cl_diopters: o.cl_diopters || '',
      cl_replacement_period: o.cl_replacement_period || '', price: o.cl_price ?? '', qty: o.cl_qty || 1,
      _autoPrice: false, _open: false,
    }];
  } else {
    orderClDraft = [];
  }

  renderFrameRows();
  renderLensRows();
  await populatePrescriptionOptions();
  await loadLensAutocompleteData();

  setOrderType(o.order_type);
  renderClRows();

  toggleInstallmentFields(o.has_installment);
  document.getElementById('order-form-installment').checked = o.has_installment;
  applyOrderExtra(orderExtraSticky || !!(Number(o.prepayment) || o.payment_method || o.has_installment || o.comment));

  updateOrderFormTotal();
  openModal('order-modal');
  focusOrderDateField();
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

let savingOrder = false;

async function saveOrderForm(e) {
  e.preventDefault();
  // Zaštita od dvostrukog unosa: ako je klik na "Sačuvaj" (ili Enter u polju)
  // registrovan dvaput pre nego što prvi upit stigne do baze — pri brzom unosu
  // više porudžbina zaredom to se dešavalo — druga prijava se ovde tiho ignoriše.
  if (savingOrder) return;
  savingOrder = true;
  try {
    await saveOrderFormInner(e);
  } finally {
    savingOrder = false;
  }
}

async function saveOrderFormInner(e) {
  const id = document.getElementById('order-form-id').value;
  const hasGlasses = orderHasGlasses;
  const hasCl = orderHasCl;

  const payload = {
    patient_id: activePatientId,
    order_date: document.getElementById('order-form-date').value || todayISO(),
    envelope_number: document.getElementById('order-form-envelope').value.trim() || null,
    order_type: currentOrderType(),
    prepayment: Number(document.getElementById('order-form-prepayment').value) || 0,
    payment_method: document.getElementById('order-form-payment-method').value || null,
    has_installment: document.getElementById('order-form-installment').checked,
    discount_percent: Number(document.getElementById('order-form-discount').value) || 0,
    comment: document.getElementById('order-form-comment').value.trim() || null,
  };

  // Prazni redovi (bez šifre/cene, bez naziva/cene) se ne čuvaju.
  const frames = hasGlasses ? orderFramesDraft.filter(f => !isBlank(f.frame_code) || !isBlank(f.price) || f.is_client || !isBlank(f.comment)) : [];
  const lenses = hasGlasses ? orderLensesDraft.filter(l => !isBlank(l.lens_name) || !isBlank(l.price_unit) || !isBlank(l.comment)) : [];
  const clItems = hasCl ? orderClDraft.filter(c => !isBlank(c.cl_name) || !isBlank(c.price)) : [];

  payload.izrada_price = hasGlasses ? (Number(document.getElementById('order-form-izrada').value) || 0) : 0;
  const glassesSubtotal = hasGlasses ? calcGlassesTotal(frames, lenses) + payload.izrada_price : 0;
  const clSubtotal = clItemsTotal(clItems);
  payload.cl_amount = hasCl ? clSubtotal : null;
  payload.total_amount = applyDiscount(glassesSubtotal + clSubtotal, payload.discount_percent);

  // Stare kolone orders.cl_* se i dalje popunjavaju (prvo pakovanje; nazivi svih pakovanja)
  // radi kompatibilnosti — stvarne stavke su u order_cl_items.
  const first = clItems[0];
  const joinVals = key => clItems.map(c => (c[key] || '').toString().trim()).filter(Boolean).join(' / ') || null;
  payload.cl_name = hasCl ? joinVals('cl_name') : null;
  payload.cl_bc = first ? ((first.cl_bc || '').trim() || null) : null;
  payload.cl_diopters = hasCl ? joinVals('cl_diopters') : null;
  payload.cl_replacement_period = first ? ((first.cl_replacement_period || '').trim() || null) : null;
  payload.cl_price = first ? (Number(first.price) || 0) : null;
  payload.cl_qty = first ? (Number(first.qty) || 1) : null;

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

  const errors = [];
  const check = res => { if (res?.error) errors.push(res.error); };

  check(await sb.from('order_frames').delete().eq('order_id', savedId));
  check(await sb.from('order_lenses').delete().eq('order_id', savedId));
  check(await sb.from('order_cl_items').delete().eq('order_id', savedId));

  if (frames.length) {
    check(await sb.from('order_frames').insert(frames.map(f => ({
      order_id: savedId, purpose: f.purpose, frame_code: (f.frame_code || '').trim() || null,
      is_client: !!f.is_client, price: Number(f.price) || 0, comment: (f.comment || '').trim() || null,
    }))));
    await updateFramePriceMemory(frames);
  }
  if (lenses.length) {
    check(await sb.from('order_lenses').insert(lenses.map(l => ({
      order_id: savedId, purpose: l.purpose, eye: l.eye || null, lens_name: l.lens_name || null,
      lens_index: l.lens_index || null, lens_coating: l.lens_coating || null,
      price_unit: Number(l.price_unit) || 0, discount: Number(l.discount) || 0, qty: Number(l.qty) || 1,
      comment: (l.comment || '').trim() || null,
    }))));
    await updateLensCatalog(lenses);
    await updateLensPriceMemory(lenses);
  }
  if (clItems.length) {
    check(await sb.from('order_cl_items').insert(clItems.map(c => ({
      order_id: savedId, eye: c.eye || null, cl_name: (c.cl_name || '').trim() || null,
      cl_bc: (c.cl_bc || '').trim() || null, cl_diopters: (c.cl_diopters || '').trim() || null,
      cl_replacement_period: (c.cl_replacement_period || '').trim() || null,
      price: Number(c.price) || 0, qty: Number(c.qty) || 1,
    }))));
    await updateClMemory(clItems);
  }

  check(await sb.from('order_prescriptions').delete().eq('order_id', savedId));
  if (orderPrescriptionsDraft.length) {
    check(await sb.from('order_prescriptions').insert(orderPrescriptionsDraft.map(pid => ({
      order_id: savedId, prescription_id: pid,
    }))));
  }

  document.getElementById('order-form-id').value = savedId;
  if (errors.length) {
    console.error('Greške pri čuvanju stavki porudžbine', errors);
    toast('Porudžbina sačuvana, ali neke stavke nisu — proveri porudžbinu', true);
  } else {
    toast('Porudžbina sačuvana');
  }

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
  document.getElementById('orders-search-ordernum').value = '';
  loadOrdersSection(true);
}

async function loadOrdersSection(reset = false) {
  ordersLoaded = true;
  if (reset) { ordersSectionOffset = 0; ordersSectionRows = []; }

  const nameFilter = document.getElementById('orders-search-name').value.trim();
  const dateFilter = document.getElementById('orders-search-date').value;
  const orderNumFilter = document.getElementById('orders-search-ordernum').value.trim();

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
  if (orderNumFilter) query = query.ilike('envelope_number', `%${orderNumFilter}%`);

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
            <td>${o.order_type === 'glasses' ? 'Naočare' : o.order_type === 'combined' ? 'Naočare + sočiva' : 'Sočiva'}</td>
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
