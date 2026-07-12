let currentPatients = [];
let activePatientId = null;
let activeTab = 'info';

async function loadPatients() {
  const { data, error } = await sb
    .from('patients')
    .select('*')
    .is('deleted_at', null)
    .order('name');

  if (error) { toast('Greška pri učitavanju pacijenata', true); return; }
  currentPatients = data;
  renderPatientList();
}

function renderPatientList(filter = '') {
  const list = document.getElementById('patient-list');
  const f = filter.trim().toLowerCase();
  const filtered = f
    ? currentPatients.filter(p => p.name.toLowerCase().includes(f) || (p.phone || '').includes(f))
    : currentPatients;

  list.innerHTML = filtered.map(p => `
    <div class="patient-item ${p.id === activePatientId ? 'active' : ''}" onclick="openPatient('${p.id}')">
      <div class="name">${p.name}${p.tkt ? ' <span class="badge">TKT</span>' : ''}</div>
      <div class="meta">${p.phone || 'bez telefona'} · ${fmtDate(p.visit_date)}</div>
    </div>
  `).join('') || '<div class="empty-state" style="height:auto;padding:40px 20px;">Pacijenti nisu pronađeni</div>';
}

async function openPatient(id) {
  activePatientId = id;
  activeTab = 'info';
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
        <h2>${patient.name}</h2>
        <div class="badges">
          ${patient.age ? `<span class="badge">${patient.age} god.</span>` : ''}
          ${patient.tkt ? `<span class="badge">TKT</span>` : ''}
          ${patient.phone ? `<span class="badge">${patient.phone}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-secondary" onclick="openEditPatientModal()">Izmeni</button>
        <button class="btn-secondary" style="color:#C0392B;border-color:#C0392B;" onclick="deletePatient()">Obriši</button>
      </div>
    </div>

    <div class="tabs">
      <div class="tab ${activeTab === 'info' ? 'active' : ''}" onclick="switchTab('info')">Info</div>
      <div class="tab ${activeTab === 'prescriptions' ? 'active' : ''}" onclick="switchTab('prescriptions')">Recepti</div>
      <div class="tab ${activeTab === 'orders' ? 'active' : ''}" onclick="switchTab('orders')">Porudžbine</div>
    </div>

    <div id="tab-content"></div>
  `;

  await renderActiveTab();
}

async function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach((el, i) => {
    el.classList.toggle('active', ['info', 'prescriptions', 'orders'][i] === tab);
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
  document.getElementById('patient-form-name').value = patient.name;
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
    name: document.getElementById('patient-form-name').value.trim(),
    age: document.getElementById('patient-form-age').value || null,
    tkt: document.getElementById('patient-form-tkt').checked,
    phone: document.getElementById('patient-form-phone').value.trim() || null,
    visit_date: document.getElementById('patient-form-visit-date').value || todayISO(),
    notes: document.getElementById('patient-form-notes').value.trim() || null,
  };

  if (!payload.name) { toast('Unesite ime pacijenta', true); return; }

  let error;
  if (id) {
    ({ error } = await sb.from('patients').update(payload).eq('id', id));
  } else {
    ({ error } = await sb.from('patients').insert(payload));
  }

  if (error) { toast('Greška pri čuvanju', true); return; }

  closeModal('patient-modal');
  toast('Sačuvano');
  await loadPatients();
  if (id) await renderPatientCard();
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
