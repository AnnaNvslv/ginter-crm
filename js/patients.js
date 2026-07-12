let currentPatients = [];
let activePatientId = null;
let activeTab = 'info';

async function loadPatients() {
  const { data, error } = await sb
    .from('patients')
    .select('*')
    .is('deleted_at', null)
    .order('name');

  if (error) { toast('Ошибка загрузки пациентов', true); return; }
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
      <div class="name">${p.name}${p.tkt ? ' <span class="badge">ТКТ</span>' : ''}</div>
      <div class="meta">${p.phone || 'без телефона'} · ${fmtDate(p.visit_date)}</div>
    </div>
  `).join('') || '<div class="empty-state" style="height:auto;padding:40px 20px;">Пациенты не найдены</div>';
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
          ${patient.age ? `<span class="badge">${patient.age} лет</span>` : ''}
          ${patient.tkt ? `<span class="badge">ТКТ</span>` : ''}
          ${patient.phone ? `<span class="badge">${patient.phone}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-secondary" onclick="openEditPatientModal()">Редактировать</button>
        <button class="btn-secondary" style="color:#C0392B;border-color:#C0392B;" onclick="deletePatient()">Удалить</button>
      </div>
    </div>

    <div class="tabs">
      <div class="tab ${activeTab === 'info' ? 'active' : ''}" onclick="switchTab('info')">Инфо</div>
      <div class="tab ${activeTab === 'prescriptions' ? 'active' : ''}" onclick="switchTab('prescriptions')">Рецепты</div>
      <div class="tab ${activeTab === 'orders' ? 'active' : ''}" onclick="switchTab('orders')">Заказы</div>
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
        <span><b>Дата обращения:</b> ${fmtDate(patient.visit_date)}</span>
        <span><b>Возраст:</b> ${patient.age || '—'}</span>
        <span><b>Телефон:</b> ${patient.phone || '—'}</span>
        <span><b>ТКТ:</b> ${patient.tkt ? 'да' : 'нет'}</span>
      </div>
      ${patient.notes ? `<div style="margin-top:14px;"><b>Заметки:</b> ${patient.notes}</div>` : ''}
    </div>
  `;
}

function openAddPatientModal() {
  document.getElementById('patient-modal-title').textContent = 'Новый пациент';
  document.getElementById('patient-form').reset();
  document.getElementById('patient-form-id').value = '';
  document.getElementById('patient-form-visit-date').value = todayISO();
  openModal('patient-modal');
}

function openEditPatientModal() {
  const patient = currentPatients.find(p => p.id === activePatientId);
  document.getElementById('patient-modal-title').textContent = 'Редактировать пациента';
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

  if (!payload.name) { toast('Введите имя пациента', true); return; }

  let error;
  if (id) {
    ({ error } = await sb.from('patients').update(payload).eq('id', id));
  } else {
    ({ error } = await sb.from('patients').insert(payload));
  }

  if (error) { toast('Ошибка сохранения', true); return; }

  closeModal('patient-modal');
  toast('Сохранено');
  await loadPatients();
  if (id) await renderPatientCard();
}

async function deletePatient() {
  if (!confirm('Удалить пациента? Это можно будет восстановить только через базу данных.')) return;
  const { error } = await sb.from('patients').update({ deleted_at: new Date().toISOString() }).eq('id', activePatientId);
  if (error) { toast('Ошибка удаления', true); return; }
  activePatientId = null;
  document.getElementById('content').innerHTML = '<div class="empty-state">Выберите пациента слева</div>';
  toast('Пациент удалён');
  await loadPatients();
}
