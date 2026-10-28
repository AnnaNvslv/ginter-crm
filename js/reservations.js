// ═══ REZERVACIJE SA SAJTA ═══
// Tabela public.frame_reservations — upisuje je Edge funkcija sa sajta (service role).
// Zaposleni ovde menjaju status, ostavljaju komentar i iz "Kupljena" prave porudžbinu.

let reservationsLoaded = false;
let reservationRows = [];
let reservationFilter = 'aktivne';
let activeReservationId = null;
let pendingReservationId = null; // rezervacija za koju se upravo pravi porudžbina

const RES_STATUSES = {
  nova:        { label: 'Nova',        cls: 'res-nova' },
  kontaktirani:{ label: 'Kontaktirani',cls: 'res-kontaktirani' },
  odlozena:    { label: 'Odložena',    cls: 'res-odlozena' },
  kupljena:    { label: 'Kupljena',    cls: 'res-kupljena' },
  otkazana:    { label: 'Otkazana',    cls: 'res-otkazana' },
};
const RES_ACTIVE = ['nova', 'kontaktirani', 'odlozena'];

function resStatusPill(s) {
  const st = RES_STATUSES[s] || { label: s, cls: '' };
  return `<span class="res-pill ${st.cls}">${st.label}</span>`;
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function resClientName(r) {
  return `${r.first_name || ''} ${r.last_name || ''}`.trim();
}

function telHref(phone) {
  return 'tel:' + (phone || '').replace(/[^\d+]/g, '');
}

async function loadReservationsSection() {
  reservationsLoaded = true;
  const { data, error } = await sb.from('frame_reservations').select('*').is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(500);
  if (error) { toast('Greška pri učitavanju rezervacija', true); return; }
  reservationRows = data || [];
  updateReservationsBadge();
  renderReservationsSection();
}

function setReservationFilter(f) {
  reservationFilter = f;
  renderReservationsSection();
}

function renderReservationsSection() {
  const counts = {};
  reservationRows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const activeCount = reservationRows.filter(r => RES_ACTIVE.includes(r.status)).length;

  const pill = (key, label, n) => `
    <button type="button" class="res-filter ${reservationFilter === key ? 'active' : ''}" onclick="setReservationFilter('${key}')">
      ${label}${n ? ` <span>${n}</span>` : ''}</button>`;
  document.getElementById('res-filters').innerHTML =
    pill('aktivne', 'Sve aktivne', activeCount) +
    Object.entries(RES_STATUSES).map(([k, v]) => pill(k, v.label, counts[k])).join('') +
    pill('sve', 'Sve', reservationRows.length);

  const rows = reservationRows.filter(r =>
    reservationFilter === 'sve' ? true :
    reservationFilter === 'aktivne' ? RES_ACTIVE.includes(r.status) : r.status === reservationFilter);

  const wrap = document.getElementById('res-table-wrap');
  if (!rows.length) {
    wrap.innerHTML = `<div class="empty-state" style="height:auto;padding:40px;">${reservationRows.length ? 'Nema rezervacija u ovom statusu' : 'Još nema rezervacija sa sajta'}</div>`;
    return;
  }
  wrap.innerHTML = `
    <table class="data-table res-table">
      <thead><tr><th class="res-thumb"></th><th>Okvir</th><th>Klijent</th><th>Primljeno</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr onclick="openReservationModal('${r.id}')">
            <td class="res-thumb">${r.frame_photo ? `<img src="${escapeHtml(r.frame_photo)}" alt="" loading="lazy">` : ''}</td>
            <td><div class="res-strong">${escapeHtml(`${r.frame_brand || ''} ${r.frame_model || ''}`.trim() || '—')}</div>
                <div class="res-sub">šifra ${escapeHtml(r.frame_code || '—')} · ${fmtMoney(r.frame_price)}</div></td>
            <td><div>${escapeHtml(resClientName(r))}</div>
                <div class="res-sub res-phone">${escapeHtml(r.phone || '')}</div></td>
            <td class="res-sub">${fmtDateTime(r.created_at)}</td>
            <td>${resStatusPill(r.status)}${r.order_id ? ' <span class="res-sub">· porudžbina</span>' : ''}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function openReservationModal(id) {
  const r = reservationRows.find(x => x.id === id);
  if (!r) return;
  activeReservationId = id;
  const statusBtns = Object.entries(RES_STATUSES).map(([k, v]) => `
    <button type="button" class="res-status-btn ${v.cls} ${r.status === k ? 'active' : ''}" onclick="setReservationStatus('${k}')">${v.label}</button>
  `).join('');

  const orderBlock = r.order_id
    ? `<button type="button" class="btn-secondary" onclick="openReservationOrder()">Otvori porudžbinu</button>`
    : r.status === 'kupljena'
      ? `<button type="button" class="btn-primary" onclick="createOrderFromReservation()">+ Kreiraj porudžbinu</button>`
      : `<span class="res-sub">Dugme „Kreiraj porudžbinu" pojavljuje se kad je status Kupljena.</span>`;

  document.getElementById('res-modal-content').innerHTML = `
    <div class="res-detail">
      <div class="res-detail-photo">${r.frame_photo ? `<img src="${escapeHtml(r.frame_photo)}" alt="">` : ''}</div>
      <div class="res-detail-info">
        <div class="res-strong" style="font-size:19px;">${escapeHtml(`${r.frame_brand || ''} ${r.frame_model || ''}`.trim())}</div>
        <div class="res-sub">šifra ${escapeHtml(r.frame_code || '—')} · ${fmtMoney(r.frame_price)}</div>
        <div style="margin-top:12px;font-size:17px;">${escapeHtml(resClientName(r))}</div>
        <a class="res-phone-link" href="${telHref(r.phone)}">${escapeHtml(r.phone || '')}</a>
        <div class="res-sub" style="margin-top:4px;">Primljeno ${fmtDateTime(r.created_at)} · jezik sajta ${escapeHtml((r.lang || '').toUpperCase() || '—')}</div>
      </div>
    </div>
    <label style="margin-top:14px;">Status</label>
    <div class="res-status-row">${statusBtns}</div>
    <label>Komentar</label>
    <div style="display:flex;gap:10px;align-items:flex-start;">
      <textarea id="res-comment" rows="2" style="flex:1;font-family:inherit;font-size:17px;padding:12px;border:1px solid var(--border);border-radius:14px;">${escapeHtml(r.staff_comment || '')}</textarea>
      <button type="button" class="btn-secondary" onclick="saveReservationComment()">Sačuvaj</button>
    </div>
    <div style="margin-top:16px;">${orderBlock}</div>
  `;
  openModal('res-modal');
}

async function setReservationStatus(status) {
  const r = reservationRows.find(x => x.id === activeReservationId);
  if (!r || r.status === status) return;
  const prevStatus = r.status;
  const { error } = await sb.from('frame_reservations')
    .update({ status, status_changed_at: new Date().toISOString() }).eq('id', r.id);
  if (error) { toast('Greška pri promeni statusa', true); return; }
  r.status = status;

  // Kupljen okvir se automatski skida sa sajta.
  if (status === 'kupljena' && r.frame_id) {
    const { error: fe } = await sb.from('frames').update({ is_sold: true, updated_at: new Date().toISOString() }).eq('id', r.frame_id);
    if (!fe) {
      toast('Status: Kupljena — okvir skinut sa sajta');
      catalogLoaded = false;
    }
  } else if (prevStatus === 'kupljena' && r.frame_id
    && !reservationRows.some(x => x.id !== r.id && x.frame_id === r.frame_id && x.status === 'kupljena')) {
    // Status vraćen sa „Kupljena" — okvir se vraća na sajt.
    const { error: fe } = await sb.from('frames').update({ is_sold: false, updated_at: new Date().toISOString() }).eq('id', r.frame_id);
    toast(fe ? 'Status promenjen, ali okvir nije vraćen na sajt' : `Status: ${RES_STATUSES[status].label} — okvir vraćen na sajt`, !!fe);
    if (!fe) catalogLoaded = false;
  } else {
    toast(`Status: ${RES_STATUSES[status].label}`);
  }
  updateReservationsBadge();
  renderReservationsSection();
  openReservationModal(r.id);
}

async function saveReservationComment() {
  const r = reservationRows.find(x => x.id === activeReservationId);
  if (!r) return;
  const staff_comment = document.getElementById('res-comment').value.trim() || null;
  const { error } = await sb.from('frame_reservations').update({ staff_comment }).eq('id', r.id);
  if (error) { toast('Greška pri čuvanju komentara', true); return; }
  r.staff_comment = staff_comment;
  toast('Komentar sačuvan');
}

// Pacijent se traži po telefonu (poslednjih 8 cifara — pokriva +381 / 0 / razmake).
function findPatientByPhone(phone) {
  const tail = normalizePhoneDigits(phone).slice(-8);
  if (tail.length < 6) return null;
  return currentPatients.find(p => normalizePhoneDigits(p.phone).slice(-8) === tail) || null;
}

async function createOrderFromReservation() {
  const r = reservationRows.find(x => x.id === activeReservationId);
  if (!r) return;

  let patient = findPatientByPhone(r.phone);
  if (patient && !confirm(`Pacijent sa ovim telefonom već postoji: ${fullName(patient)}.\nNapraviti porudžbinu za njega?\n\n(Otkaži = napravi novog pacijenta)`)) {
    patient = null;
  }

  if (!patient) {
    const { data, error } = await sb.from('patients').insert({
      first_name: r.first_name, last_name: r.last_name, phone: r.phone,
      visit_date: todayISO(), notes: 'Rezervacija sa sajta',
    }).select('*').single();
    if (error) { toast('Greška pri kreiranju pacijenta', true); return; }
    patient = data;
    await loadPatients();
  }

  await sb.from('frame_reservations').update({ patient_id: patient.id }).eq('id', r.id);
  r.patient_id = patient.id;

  closeModal('res-modal');
  await goToPatient(patient.id, 'orders');
  await openAddOrderModal();

  pendingReservationId = r.id;
  document.getElementById('order-modal-title').textContent = 'Nova porudžbina — rezervacija sa sajta';
  orderFramesDraft = [{
    ...newFrame('za daljinu'),
    frame_code: r.frame_code || '',
    price: r.frame_price ?? '',
    comment: `${r.frame_brand || ''} ${r.frame_model || ''}`.trim() + ' (sajt)',
  }];
  renderFrameRows();
  updateOrderFormTotal();
}

// Poziva se iz saveOrderFormInner posle uspešnog čuvanja nove porudžbine.
async function linkReservationToOrder(orderId, patientId) {
  const resId = pendingReservationId;
  pendingReservationId = null;
  if (!resId) return;
  await sb.from('frame_reservations').update({
    order_id: orderId, patient_id: patientId, status: 'kupljena',
    status_changed_at: new Date().toISOString(),
  }).eq('id', resId);
  const r = reservationRows.find(x => x.id === resId);
  if (r) { r.order_id = orderId; r.patient_id = patientId; r.status = 'kupljena'; }
  refreshReservationsBadge();
}

async function openReservationOrder() {
  const r = reservationRows.find(x => x.id === activeReservationId);
  if (!r) return;
  closeModal('res-modal');
  const { data } = await sb.from('orders').select('patient_id').eq('id', r.order_id).single();
  const pid = data?.patient_id || r.patient_id;
  if (pid) await goToPatient(pid, 'orders');
}

// ── Brojač novih rezervacija na kartici ──

function updateReservationsBadge(n) {
  const count = typeof n === 'number' ? n : reservationRows.filter(r => r.status === 'nova').length;
  const el = document.getElementById('res-count');
  if (!el) return;
  el.textContent = count;
  el.style.display = count ? '' : 'none';
}

async function refreshReservationsBadge() {
  const { count } = await sb.from('frame_reservations').select('id', { count: 'exact', head: true })
    .eq('status', 'nova').is('deleted_at', null);
  if (typeof count === 'number') updateReservationsBadge(count);
}

function initReservationsBadge() {
  refreshReservationsBadge();
  setInterval(() => {
    if (document.hidden) return;
    if (currentSection === 'rezervacije' && !document.querySelector('.modal-overlay.active')) loadReservationsSection();
    else refreshReservationsBadge();
  }, 60000);
}

// ── Veza sa porudžbinama (bez izmena u orders.js) ──
// Omotači oko postojećih globalnih funkcija iz orders.js: one se pozivaju preko
// globalnog imena, pa omotač važi i za pozive iz samog orders.js.

(function wrapOrdersForReservations() {
  const origOpenAdd = openAddOrderModal;
  openAddOrderModal = async function (...args) {
    pendingReservationId = null;
    return origOpenAdd.apply(this, args);
  };

  const origOpenEdit = openEditOrderModal;
  openEditOrderModal = async function (...args) {
    pendingReservationId = null;
    return origOpenEdit.apply(this, args);
  };

  // Nova porudžbina iz rezervacije: posle uobičajenog čuvanja označi je kao "sa sajta"
  // i poveži sa rezervacijom (status → Kupljena).
  const origSaveInner = saveOrderFormInner;
  saveOrderFormInner = async function (e) {
    const wasNew = !document.getElementById('order-form-id').value;
    const resId = pendingReservationId;
    await origSaveInner.call(this, e);
    const newId = document.getElementById('order-form-id').value;
    if (!wasNew || !resId || !newId) return;
    const { error } = await sb.from('orders').update({ source: 'sajt', reservation_id: resId }).eq('id', newId);
    if (error) { toast('Porudžbina sačuvana, ali nije označena kao „sa sajta"', true); return; }
    pendingReservationId = resId;
    await linkReservationToOrder(newId, activePatientId);
    if (activeTab === 'orders' && currentSection === 'clients') await renderOrdersTab();
  };

  const origCard = renderOrderCard;
  renderOrderCard = function (o, ...rest) {
    const html = origCard.call(this, o, ...rest);
    if (o?.source !== 'sajt') return html;
    return html.replace('<div class="title">', '<div class="title"><span class="badge badge-site">🌐 Sa sajta</span> ');
  };

  const origTable = renderOrdersSectionTable;
  renderOrdersSectionTable = function (...args) {
    origTable.apply(this, args);
    document.querySelectorAll('#orders-table-wrap tbody tr').forEach((tr, i) => {
      if (ordersSectionRows[i]?.order?.source === 'sajt' && tr.cells[2]) {
        tr.cells[2].insertAdjacentHTML('beforeend', ' <span class="badge badge-site">🌐 sajt</span>');
      }
    });
  };
})();
