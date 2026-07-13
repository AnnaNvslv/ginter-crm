let currentOrders = [];
let orderFormType = 'glasses';
let orderFramesDraft = [];
let orderLensesDraft = [];

async function renderOrdersTab() {
  const { data: orders, error } = await sb
    .from('orders')
    .select('*')
    .eq('patient_id', activePatientId)
    .is('deleted_at', null)
    .order('order_date', { ascending: false });

  if (error) { toast('Greška pri učitavanju porudžbina', true); return; }
  currentOrders = orders;

  const orderIds = orders.map(o => o.id);
  let framesByOrder = {}, lensesByOrder = {}, installmentsByOrder = {};

  if (orderIds.length) {
    const [framesRes, lensesRes, instRes] = await Promise.all([
      sb.from('order_frames').select('*').in('order_id', orderIds),
      sb.from('order_lenses').select('*').in('order_id', orderIds),
      sb.from('installments').select('*').in('order_id', orderIds),
    ]);
    (framesRes.data || []).forEach(f => { (framesByOrder[f.order_id] ??= []).push(f); });
    (lensesRes.data || []).forEach(l => { (lensesByOrder[l.order_id] ??= []).push(l); });
    (instRes.data || []).forEach(p => { (installmentsByOrder[p.order_id] ??= []).push(p); });
  }

  const html = `
    <button class="btn-primary" style="margin-bottom:20px;" onclick="openAddOrderModal()">+ Nova porudžbina</button>
    ${orders.map(o => renderOrderCard(
      o,
      framesByOrder[o.id] || [],
      lensesByOrder[o.id] || [],
      installmentsByOrder[o.id] || []
    )).join('') || '<div class="empty-state" style="height:auto;padding:30px;">Još nema porudžbina</div>'}
  `;
  document.getElementById('tab-content').innerHTML = html;
}

function calcGlassesTotal(frames, lenses) {
  const framesTotal = frames.reduce((sum, f) => sum + (f.is_client ? 0 : Number(f.price) || 0), 0);
  const lensesTotal = lenses.reduce((sum, l) => sum + lensTotal(l.price_unit, l.discount, l.qty), 0);
  return Math.round(framesTotal + lensesTotal);
}

function renderOrderCard(o, frames, lenses, installments) {
  const isGlasses = o.order_type === 'glasses';
  const total = isGlasses ? calcGlassesTotal(frames, lenses) : clTotal(o.cl_price, o.cl_qty);
  const paidViaInstallments = installments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = total - (Number(o.prepayment) || 0) - paidViaInstallments;

  const framesHtml = frames.map(f => `
    <div>${f.purpose}${f.frame_code ? ` (šifra ${f.frame_code})` : ''} — ${f.is_client ? 'klijentov okvir' : fmtMoney(f.price)}</div>
  `).join('');

  const lensesHtml = lenses.map(l => `
    <div>${l.purpose}: ${l.lens_name || '—'} × ${l.qty} — ${fmtMoney(lensTotal(l.price_unit, l.discount, l.qty))}</div>
  `).join('');

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
        <div style="margin-bottom:6px;"><b style="color:var(--text-light);">Okviri:</b>${framesHtml || ' —'}</div>
        <div><b style="color:var(--text-light);">Stakla:</b>${lensesHtml || ' —'}</div>
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
        <div class="row"><span>Iznos</span><span>${fmtMoney(total)}</span></div>
        <div class="row"><span>Avans</span><span>${fmtMoney(o.prepayment)}</span></div>
        ${o.has_installment ? `
          <div class="row"><span>Uplaćeno na rate</span><span>${fmtMoney(paidViaInstallments)}</span></div>
          <div class="row final" style="color:#C0392B;"><span>Ostalo za uplatu</span><span>${fmtMoney(remaining)}</span></div>
        ` : `
          <div class="row final"><span>Doplata</span><span>${fmtMoney(remaining)}</span></div>
        `}
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

  const { error } = await sb.from('installments').insert({ order_id: orderId, payment_date: date, amount, payment_type: type });
  if (error) { toast('Greška pri dodavanju uplate', true); return; }
  toast('Uplata sačuvana');
  await renderOrdersTab();
}

function setOrderType(type) {
  orderFormType = type;
  document.querySelectorAll('.type-toggle button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  document.getElementById('glasses-fields').style.display = type === 'glasses' ? 'block' : 'none';
  document.getElementById('cl-fields').style.display = type === 'contact_lenses' ? 'block' : 'none';
}

function renderFrameRows() {
  document.getElementById('frames-container').innerHTML = orderFramesDraft.map((f, i) => `
    <div style="display:grid;grid-template-columns:1fr 100px 130px auto 40px;gap:8px;align-items:center;margin-bottom:8px;">
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
  `).join('') || '<div style="color:var(--text-light);font-size:15px;margin-bottom:8px;">Nema dodatih okvira</div>';
}

function renderLensRows() {
  document.getElementById('lens-container').innerHTML = orderLensesDraft.map((l, i) => `
    <div style="display:grid;grid-template-columns:110px 1fr 90px 70px 60px 40px;gap:8px;align-items:center;margin-bottom:8px;">
      <select onchange="orderLensesDraft[${i}].purpose=this.value" style="padding:10px;font-size:16px;border:1px solid var(--border);border-radius:10px;">
        ${purposeOptions(l.purpose)}
      </select>
      <input type="text" placeholder="naziv stakla" value="${l.lens_name || ''}" oninput="orderLensesDraft[${i}].lens_name=this.value" style="padding:10px;font-size:16px;">
      <input type="text" placeholder="cena/kom" value="${l.price_unit ?? ''}" oninput="orderLensesDraft[${i}].price_unit=this.value;updateOrderFormTotal()" style="padding:10px;font-size:16px;text-align:right;">
      <input type="text" placeholder="popust %" value="${l.discount ?? ''}" oninput="orderLensesDraft[${i}].discount=this.value;updateOrderFormTotal()" style="padding:10px;font-size:16px;text-align:right;">
      <input type="text" placeholder="kol." value="${l.qty ?? 2}" oninput="orderLensesDraft[${i}].qty=this.value;updateOrderFormTotal()" style="padding:10px;font-size:16px;text-align:right;">
      <button type="button" onclick="removeLensRow(${i})" style="color:#C0392B;padding:6px;">×</button>
    </div>
  `).join('') || '<div style="color:var(--text-light);font-size:15px;margin-bottom:8px;">Nema dodatih stakala</div>';
}

function addFrameRow() {
  orderFramesDraft.push({ purpose: PURPOSES[0], frame_code: '', is_client: false, price: 0 });
  renderFrameRows();
  updateOrderFormTotal();
}

function removeFrameRow(i) {
  orderFramesDraft.splice(i, 1);
  renderFrameRows();
  updateOrderFormTotal();
}

function addLensRow() {
  orderLensesDraft.push({ purpose: PURPOSES[0], lens_name: '', price_unit: 0, discount: 0, qty: 2 });
  renderLensRows();
  updateOrderFormTotal();
}

function removeLensRow(i) {
  orderLensesDraft.splice(i, 1);
  renderLensRows();
  updateOrderFormTotal();
}

function updateOrderFormTotal() {
  let total;
  if (orderFormType === 'glasses') {
    total = calcGlassesTotal(orderFramesDraft, orderLensesDraft);
  } else {
    const price = Number(document.getElementById('order-form-cl-price')?.value) || 0;
    const qty = Number(document.getElementById('order-form-cl-qty')?.value) || 0;
    total = clTotal(price, qty);
  }
  const el = document.getElementById('order-form-total-preview');
  if (el) el.textContent = fmtMoney(total);
}

async function openAddOrderModal() {
  document.getElementById('order-modal-title').textContent = 'Nova porudžbina';
  document.getElementById('order-form').reset();
  document.getElementById('order-form-id').value = '';
  document.getElementById('order-form-date').value = todayISO();
  orderFramesDraft = [];
  orderLensesDraft = [];
  setOrderType('glasses');
  renderFrameRows();
  renderLensRows();
  await populatePrescriptionSelect();
  toggleInstallmentFields(false);
  updateOrderFormTotal();
  openModal('order-modal');
}

async function populatePrescriptionSelect() {
  const { data } = await sb.from('prescriptions').select('id, purpose, created_at').eq('patient_id', activePatientId).order('created_at', { ascending: false });
  const select = document.getElementById('order-form-prescription');
  select.innerHTML = '<option value="">— bez povezivanja —</option>' +
    (data || []).map(rx => `<option value="${rx.id}">${rx.purpose || 'recept'} (${fmtDate(rx.created_at?.slice(0,10))})</option>`).join('');
}

async function openEditOrderModal(id) {
  const o = currentOrders.find(x => x.id === id);
  document.getElementById('order-modal-title').textContent = 'Izmena porudžbine';
  document.getElementById('order-form-id').value = o.id;
  document.getElementById('order-form-date').value = o.order_date || todayISO();
  document.getElementById('order-form-envelope').value = o.envelope_number || '';
  document.getElementById('order-form-comment').value = o.comment || '';
  document.getElementById('order-form-prepayment').value = o.prepayment || 0;

  await populatePrescriptionSelect();
  document.getElementById('order-form-prescription').value = o.prescription_id || '';

  setOrderType(o.order_type);

  const [framesRes, lensesRes] = await Promise.all([
    sb.from('order_frames').select('*').eq('order_id', id),
    sb.from('order_lenses').select('*').eq('order_id', id),
  ]);
  orderFramesDraft = framesRes.data || [];
  orderLensesDraft = lensesRes.data || [];
  renderFrameRows();
  renderLensRows();

  document.getElementById('order-form-cl-name').value = o.cl_name || '';
  document.getElementById('order-form-cl-bc').value = o.cl_bc || '';
  document.getElementById('order-form-cl-diopters').value = o.cl_diopters || '';
  document.getElementById('order-form-cl-period').value = o.cl_replacement_period || '';
  document.getElementById('order-form-cl-price').value = o.cl_price || 0;
  document.getElementById('order-form-cl-qty').value = o.cl_qty || 1;

  toggleInstallmentFields(o.has_installment);
  document.getElementById('order-form-installment').checked = o.has_installment;

  updateOrderFormTotal();
  openModal('order-modal');
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
    prescription_id: document.getElementById('order-form-prescription').value || null,
    prepayment: Number(document.getElementById('order-form-prepayment').value) || 0,
    has_installment: document.getElementById('order-form-installment').checked,
    comment: document.getElementById('order-form-comment').value.trim() || null,
  };

  if (orderFormType === 'glasses') {
    payload.total_amount = calcGlassesTotal(orderFramesDraft, orderLensesDraft);
  } else {
    payload.cl_name = document.getElementById('order-form-cl-name').value.trim() || null;
    payload.cl_bc = document.getElementById('order-form-cl-bc').value || null;
    payload.cl_diopters = document.getElementById('order-form-cl-diopters').value.trim() || null;
    payload.cl_replacement_period = document.getElementById('order-form-cl-period').value.trim() || null;
    payload.cl_price = Number(document.getElementById('order-form-cl-price').value) || 0;
    payload.cl_qty = Number(document.getElementById('order-form-cl-qty').value) || 1;
    payload.total_amount = clTotal(payload.cl_price, payload.cl_qty);
  }

  let error, savedId = id;
  if (id) {
    ({ error } = await sb.from('orders').update(payload).eq('id', id));
  } else {
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
        price_unit: Number(l.price_unit) || 0, discount: Number(l.discount) || 0, qty: Number(l.qty) || 1,
      })));
    }
  }

  document.getElementById('order-form-id').value = savedId;
  toast('Porudžbina sačuvana');

  if (payload.has_installment) {
    await loadInstallments();
  } else {
    closeModal('order-modal');
  }
  await renderOrdersTab();
}

async function deleteOrder(id) {
  if (!confirm('Obrisati porudžbinu?')) return;
  const { error } = await sb.from('orders').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast('Greška pri brisanju', true); return; }
  toast('Porudžbina obrisana');
  await renderOrdersTab();
}
