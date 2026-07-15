let currentPatients = [];
let activePatientId = null;
let activeTab = 'prescriptions';

async function loadPatients() {
  const { data, error } = await sb
    .from('patients')
    .select('*')
    .is('deleted_at', null)
    .order('last_name');

  if (error) { toast('Greška pri učitavanju pacijenata', true); return; }
  currentPatients = data;
  renderPatientList();
}

function fullName(p) {
  return [p.first_name, p.last_name].filter(Boolean).join(' ');
}

function initials(p) {
  return ((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || '');
}

function sortKey(p) {
  return (p.last_name || p.first_name || '').trim();
}

function groupPatients(list) {
  const groups = {};
  list.forEach(p => {
    const key = sortKey(p);
    const letter = key ? key[0].toUpperCase() : '#';
    (groups[letter] ??= []).push(p);
  });
  return groups;
}

function renderPatientList(filter = '') {
  const f = filter.trim().toLowerCase();
  const filtered = f
    ? currentPatients.filter(p => fullName(p).toLowerCase().includes(f) || (p.phone || '').includes(f))
    : currentPatients;

  const sorted = [...filtered].sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'sr'));
  const groups = groupPatients(sorted);
  const letters = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'sr'));

  const indexEl = document.getElementById('letter-index');
  indexEl.innerHTML = letters.map(l => `<a onclick="scrollToLetter('${l}')">${l}</a>`).join('');

  const debtors = (typeof debtorPatientIds !== 'undefined') ? debtorPatientIds : new Set();

  const list = document.getElementById('patient-list');
  list.innerHTML = letters.map(l => `
    <div class="letter-group-header" id="letter-${l}">${l} · ${groups[l].length} ${groups[l].length === 1 ? 'pacijent' : 'pacijenta'}</div>
    ${groups[l].map(p => `
      <div class="patient-item ${p.id === activePatientId ? 'active' : ''}" onclick="openPatient('${p.id}')">
        <div class="patient-avatar">${initials(p)}</div>
        <div style="flex:1;min-width:0;">
          <div class="name">${fullName(p)}${p.tkt ? ' <span class="badge">TKT</span>' : ''}${debtors.has(p.id) ? ' <span class="debt-badge">dug</span>' : ''}</div>
          <div class="meta">${p.phone || 'bez telefona'}</div>
        </div>
        <div class="visit">poslednja poseta<br>${fmtDate(p.visit_date)}</div>
      </div>
    `).join('')}
  `).join('') || '<div class="empty-state" style="height:auto;padding:40px 20px;">Pacijenti nisu pronađeni</div>';
}

function scrollToLetter(l) {
  document.getElementById(`letter-${l}`)?.scrollIntoView({ block: 'start' });
}

async function openPatient(id) {
  activePatientId = id;
  activeTab = 'prescriptions';
  renderPatientList(document.getElementById('search-input').value);
  await renderPatientCard();
}

async function renderPatientCard() {
  const patient = currentPatients.find(p => p.id === activePatientId);
  if (!patient) return;

  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="card-header">
      <div>
        <h2>${fullName(patient)}</h2>
        <div class="badges">
          ${patient.age ? `<span class="badge">${patient.age} god.</span>` : ''}
          ${patient.tkt ? `<span class="badge">TKT</span>` : ''}
          ${patient.phone ? `<span class="badge">${patient.phone}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-primary" onclick="quickAddPrescription()">+ Recept</button>
        <button class="btn-primary" onclick="quickAddOrder()">+ Porudžbina</button>
        <button class="btn-secondary" onclick="openEditPatientModal()">Izmeni</button>
        <button class="btn-secondary" style="color:#C0392B;border-color:#C0392B;" onclick="deletePatient()">Obriši</button>
      </div>
    </div>

    <div class="tabs">
      <div class="tab ${activeTab === 'prescriptions' ? 'active' : ''}" data-tab="prescriptions" onclick="switchTab('prescriptions')">Recepti</div>
      <div class="tab ${activeTab === 'orders' ? 'active' : ''}" data-tab="orders" onclick="switchTab('orders')">Porudžbine</div>
      <div class="tab ${activeTab === 'info' ? 'active' : ''}" data-tab="info" onclick="switchTab('info')">Info</div>
    </div>

    <div id="tab-content"></div>
  `;

  await renderActiveTab();
}

async function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  await renderActiveTab();
}

async function renderActiveTab() {
  if (activeTab === 'info') renderInfoTab();
  else if (activeTab === 'prescriptions') await renderPrescriptionsTab();
  else if (activeTab === 'orders') await renderOrdersTab();
}

function renderInfoTab() {
  const patient = currentPatients.find(p => p.id === activePatientId);
  document.getElementById('tab-content').innerHTML = `
    <div class="list-card">
      <div class="kv-row">
        <span><b>Datum posete:</b> ${fmtDate(patient.visit_date)}</span>
        <span><b>Godine:</b> ${patient.age || '—'}</span>
        <span><b>Telefon:</b> ${patient.phone || '—'}</span>
        <span><b>TKT:</b> ${patient.tkt ? 'da' : 'ne'}</span>
      </div>
      ${patient.notes ? `<div style="margin-top:14px;"><b>Napomene:</b> ${patient.notes}</div>` : ''}
    </div>
  `;
}

function openAddPatientModal() {
  document.getElementById('patient-modal-title').textContent = 'Novi pacijent';
  document.getElementById('patient-form').reset();
  document.getElementById('patient-form-id').value = '';
  document.getElementById('patient-form-visit-date').value = todayISO();
  openModal('patient-modal');
}

function openEditPatientModal() {
  const patient = currentPatients.find(p => p.id === activePatientId);
  document.getElementById('patient-modal-title').textContent = 'Izmena pacijenta';
  document.getElementById('patient-form-id').value = patient.id;
  document.getElementById('patient-form-first-name').value = patient.first_name || '';
  document.getElementById('patient-form-last-name').value = patient.last_name || '';
  document.getElementById('patient-form-age').value = patient.age || '';
  document.getElementById('patient-form-tkt').checked = patient.tkt;
  document.getElementById('patient-form-phone').value = patient.phone || '';
  document.getElementById('patient-form-visit-date').value = patient.visit_date || todayISO();
  document.getElementById('patient-form-notes').value = patient.notes || '';
  openModal('patient-modal');
}

async function savePatientForm(e) {
  e.preventDefault();
  const id = document.getElementById('patient-form-id').value;
  const payload = {
    first_name: document.getElementById('patient-form-first-name').value.trim(),
    last_name: document.getElementById('patient-form-last-name').value.trim(),
    age: document.getElementById('patient-form-age').value || null,
    tkt: document.getElementById('patient-form-tkt').checked,
    phone: document.getElementById('patient-form-phone').value.trim() || null,
    visit_date: document.getElementById('patient-form-visit-date').value || todayISO(),
    notes: document.getElementById('patient-form-notes').value.trim() || null,
  };

  if (!payload.first_name && !payload.last_name) { toast('Unesite ime ili prezime pacijenta', true); return; }

  let error, savedId = id;
  if (id) {
    ({ error } = await sb.from('patients').update(payload).eq('id', id));
  } else {
    const res = await sb.from('patients').insert(payload).select('id').single();
    error = res.error;
    savedId = res.data?.id;
  }

  if (error) { toast('Greška pri čuvanju', true); return; }

  closeModal('patient-modal');
  toast('Sačuvano');
  await loadPatients();

  if (savedId) {
    await openPatient(savedId);
    if (!id) {
      await switchTab('prescriptions');
      openAddPrescriptionModal();
    }
  }
}

async function quickAddPrescription() {
  await switchTab('prescriptions');
  openAddPrescriptionModal();
}

async function quickAddOrder() {
  await switchTab('orders');
  await openAddOrderModal();
}

async function deletePatient() {
  if (!confirm('Obrisati pacijenta? Ovo se može vratiti samo preko baze podataka.')) return;
  const { error } = await sb.from('patients').update({ deleted_at: new Date().toISOString() }).eq('id', activePatientId);
  if (error) { toast('Greška pri brisanju', true); return; }
  activePatientId = null;
  document.getElementById('content').innerHTML = '<div class="empty-state">Izaberite pacijenta sa leve strane</div>';
  toast('Pacijent obrisan');
  await loadPatients();
}
