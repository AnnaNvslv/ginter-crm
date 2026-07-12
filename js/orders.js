let currentOrders = [];
let orderFormType = 'glasses';

async function renderOrdersTab() {
  const { data, error } = await sb
    .from('orders')
    .select('*')
    .eq('patient_id', activePatientId)
    .is('deleted_at', null)
    .order('order_date', { ascending: false });

  if (error) { toast('Greška pri učitavanju porudžbina', true); return; }
  currentOrders = data;

  const html = `
    <button class="btn-primary" style="margin-bottom:20px;" onclick="openAddOrderModal()">+ Nova porudžbina</button>
    ${currentOrders.map(o => renderOrderCard(o)).join('') || '<div class="empty-state" style="height:auto;padding:30px;">Još nema porudžbina</div>'}
  `;
  document.getElementById('tab-content').innerHTML = html;
}

function renderOrderCard(o) {
  const isGlasses = o.order_type === 'glasses';
  const total = isGlasses
    ? (Number(o.frame_price) || 0) + lensTotal(o.lens_price_unit, o.lens_discount, o.lens_qty)
    : clTotal(o.cl_price, o.cl_qty);
  const surcharge = total - (Number(o.prepayment) || 0);

  return `
    <div class="list-card">
      <div class="list-card-header">
        <div class="title">${isGlasses ? '👓 Naočare' : '👁 Kontaktna sočiva'} — ${o.purpose || ''} ${o.envelope_number ? `<span class="badge">br. ${o.envelope_number}</span>` : ''}</div>
        <div class="actions">
          <span style="color:var(--text-light);font-size:14px;">${fmtDate(o.order_date)}</span>
          <button class="btn-secondary" onclick="openEditOrderModal('${o.id}')">Izm.</button>
          <button class="btn-secondary" style="color:#C0392B;border-color:#C0392B;" onclick="deleteOrder('${o.id}')">Obr.</button>
        </div>
      </div>
      ${isGlasses ? `
        <div class="kv-row">
          <span><b>Okvir:</b> ${o.frame_purpose || '—'} ${o.frame_is_client ? '(klijentov)' : `— ${fmtMoney(o.frame_price)}`}</span>
          <span><b>Sočiva:</b> ${o.lens_name || o.lens_purpose || '—'} × ${o.lens_qty} — ${fmtMoney(lensTotal(o.lens_price_unit, o.lens_discount, o.lens_qty))}</span>
        </div>
      ` : `
        <div class="kv-row">
          <span><b>Sočiva:</b> ${o.cl_name || '—'}</span>
          <span><b>BC:</b> ${o.cl_bc ?? '—'}</span>
          <span><b>Dioptrija:</b> ${o.cl_diopters || '—'}</span>
          <span><b>Zamena:</b> ${o.cl_replacement_period || '—'}</span>
          <span><b>Kol.:</b> ${o.cl_qty}</span>
        </div>
      `}
      <div class="total-box">
        <div class="row"><span>Iznos</span><span>${fmtMoney(total)}</span></div>
        <div class="row"><span>Avans</span><span>${fmtMoney(o.prepayment)}</span></div>
        <div class="row final"><span>Doplata</span><span>${fmtMoney(surcharge)}</span></div>
      </div>
      ${o.has_installment ? `<div style="margin-top:10px;"><span class="badge">Na rate</span></div>` : ''}
      ${o.comment ? `<div style="margin-top:10px;color:var(--text-light);">${o.comment}</div>` : ''}
    </div>
  `;
}

function setOrderType(type) {
  orderFormType = type;
  document.querySelectorAll('.type-toggle button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  document.getElementById('glasses-fields').style.display = type === 'glasses' ? 'block' : 'none';
  document.getElementById('cl-fields').style.display = type === 'contact_lenses' ? 'block' : 'none';
}

async function openAddOrderModal() {
  document.getElementById('order-modal-title').textContent = 'Nova porudžbina';
  document.getElementById('order-form').reset();
  document.getElementById('order-form-id').value = '';
  document.getElementById('order-form-date').value = todayISO();
  setOrderType('glasses');
  await populatePrescriptionSelect();
  toggleInstallmentFields(false);
  openModal('order-modal');
}

async function populatePrescriptionSelect() {
  const { data } = await sb.from('prescriptions').select('id, purpose, created_at').eq('patient_id', activePatientId).order('created_at', { ascending: false });
  const select = document.getElementById('order-form-prescription');
  select.innerHTML = '<option value="">— bez povezivanja —</option>' +
    (data || []).map(rx => `<option value="${rx.id}">${rx.purpose} (${fmtDate(rx.created_at?.slice(0,10))})</option>`).join('');
}

async function openEditOrderModal(id) {
  const o = currentOrders.find(x => x.id === id);
  document.getElementById('order-modal-title').textContent = 'Izmena porudžbine';
  document.getElementById('order-form-id').value = o.id;
  document.getElementById('order-form-date').value = o.order_date || todayISO();
  document.getElementById('order-form-envelope').value = o.envelope_number || '';
  document.getElementById('order-form-purpose').value = o.purpose || '';
  document.getElementById('order-form-comment').value = o.comment || '';
  document.getElementById('order-form-prepayment').value = o.prepayment || 0;

  await populatePrescriptionSelect();
  document.getElementById('order-form-prescription').value = o.prescription_id || '';

  setOrderType(o.order_type);

  document.getElementById('order-form-frame-purpose').value = o.frame_purpose || '';
  document.getElementById('order-form-frame-client').checked = o.frame_is_client;
  document.getElementById('order-form-frame-price').value = o.frame_price || 0;
  document.getElementById('order-form-lens-purpose').value = o.lens_purpose || '';
  document.getElementById('order-form-lens-name').value = o.lens_name || '';
  document.getElementById('order-form-lens-price').value = o.lens_price_unit || 0;
  document.getElementById('order-form-lens-discount').value = o.lens_discount || 0;
  document.getElementById('order-form-lens-qty').value = o.lens_qty || 2;

  document.getElementById('order-form-cl-name').value = o.cl_name || '';
  document.getElementById('order-form-cl-bc').value = o.cl_bc || '';
  document.getElementById('order-form-cl-diopters').value = o.cl_diopters || '';
  document.getElementById('order-form-cl-period').value = o.cl_replacement_period || '';
  document.getElementById('order-form-cl-price').value = o.cl_price || 0;
  document.getElementById('order-form-cl-qty').value = o.cl_qty || 1;

  toggleInstallmentFields(o.has_installment);
  document.getElementById('order-form-installment').checked = o.has_installment;

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
    purpose: document.getElementById('order-form-purpose').value || null,
    prescription_id: document.getElementById('order-form-prescription').value || null,
    prepayment: Number(document.getElementById('order-form-prepayment').value) || 0,
    has_installment: document.getElementById('order-form-installment').checked,
    comment: document.getElementById('order-form-comment').value.trim() || null,
  };

  if (orderFormType === 'glasses') {
    payload.frame_purpose = document.getElementById('order-form-frame-purpose').value || null;
    payload.frame_is_client = document.getElementById('order-form-frame-client').checked;
    payload.frame_price = Number(document.getElementById('order-form-frame-price').value) || 0;
    payload.lens_purpose = document.getElementById('order-form-lens-purpose').value || null;
    payload.lens_name = document.getElementById('order-form-lens-name').value.trim() || null;
    payload.lens_price_unit = Number(document.getElementById('order-form-lens-price').value) || 0;
    payload.lens_discount = Number(document.getElementById('order-form-lens-discount').value) || 0;
    payload.lens_qty = Number(document.getElementById('order-form-lens-qty').value) || 2;
    payload.total_amount = payload.frame_price + lensTotal(payload.lens_price_unit, payload.lens_discount, payload.lens_qty);
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
