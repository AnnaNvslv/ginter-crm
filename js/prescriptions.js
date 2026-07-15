let currentPrescriptions = [];

async function renderPrescriptionsTab() {
  const { data, error } = await sb
    .from('prescriptions')
    .select('*')
    .eq('patient_id', activePatientId)
    .order('created_at', { ascending: false });

  if (error) { toast('Greška pri učitavanju recepata', true); return; }
  currentPrescriptions = data;

  const html = `
    <button class="btn-primary" style="margin-bottom:20px;" onclick="openAddPrescriptionModal()">+ Dodaj recept</button>
    ${currentPrescriptions.map(rx => `
      <div class="list-card">
        <div class="list-card-header">
          <div class="title">${rx.purpose || '—'}${rx.is_client_rx ? ' <span class="badge">klijentov recept</span>' : ''}</div>
          <div class="actions">
            <span style="color:var(--text-light);font-size:14px;">${fmtDate(rx.created_at?.slice(0,10))}</span>
            <button class="btn-secondary" onclick="openEditPrescriptionModal('${rx.id}')">Izm.</button>
            <button class="btn-secondary" style="color:#C0392B;border-color:#C0392B;" onclick="deletePrescription('${rx.id}')">Obr.</button>
          </div>
        </div>
        <table class="rx-table">
          <thead>
            <tr><th></th><th>Sph</th><th>Cyl</th><th>Ax</th><th>Add</th><th>Degr</th><th>PD</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>OD</td><td>${rx.od_sph || '—'}</td><td>${rx.od_cyl || '—'}</td><td>${rx.od_ax || '—'}</td>
              <td rowspan="2" style="vertical-align:middle;">${rx.add || '—'}</td>
              <td rowspan="2" style="vertical-align:middle;">${rx.degr || '—'}</td>
              <td rowspan="2" style="vertical-align:middle;">${rx.pd || '—'}</td>
            </tr>
            <tr>
              <td>OS</td><td>${rx.os_sph || '—'}</td><td>${rx.os_cyl || '—'}</td><td>${rx.os_ax || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `).join('') || '<div class="empty-state" style="height:auto;padding:30px;">Još nema recepata</div>'}
  `;

  document.getElementById('tab-content').innerHTML = html;
}

function openAddPrescriptionModal() {
  document.getElementById('rx-modal-title').textContent = 'Novi recept';
  document.getElementById('rx-form').reset();
  document.getElementById('rx-form-id').value = '';
  openModal('rx-modal');
}

function openEditPrescriptionModal(id) {
  const rx = currentPrescriptions.find(r => r.id === id);
  document.getElementById('rx-modal-title').textContent = 'Izmena recepta';
  document.getElementById('rx-form-id').value = rx.id;
  document.getElementById('rx-form-purpose').value = rx.purpose || '';
  document.getElementById('rx-form-client').checked = rx.is_client_rx;
  ['od_sph','od_cyl','od_ax','os_sph','os_cyl','os_ax','add','degr','pd'].forEach(f => {
    document.getElementById(`rx-form-${f}`).value = rx[f] ?? '';
  });
  openModal('rx-modal');
}

async function savePrescriptionForm(e) {
  e.preventDefault();
  const id = document.getElementById('rx-form-id').value;
  const payload = {
    patient_id: activePatientId,
    purpose: document.getElementById('rx-form-purpose').value.trim() || null,
    is_client_rx: document.getElementById('rx-form-client').checked,
  };
  ['od_sph','od_cyl','od_ax','os_sph','os_cyl','os_ax','add','degr','pd'].forEach(f => {
    const v = document.getElementById(`rx-form-${f}`).value.trim();
    payload[f] = v || null;
  });

  let error, savedId = id;
  if (id) {
    ({ error } = await sb.from('prescriptions').update(payload).eq('id', id));
  } else {
    const res = await sb.from('prescriptions').insert(payload).select('id').single();
    error = res.error;
    savedId = res.data?.id;
  }

  if (error) { toast('Greška pri čuvanju recepta', true); return; }
  closeModal('rx-modal');
  toast('Recept sačuvan');
  await renderPrescriptionsTab();

  if (savedId && confirm('Recept sačuvan. Da li odmah unosite porudžbinu?')) {
    await switchTab('orders');
    await openAddOrderModal();
    const sel = document.getElementById('order-form-prescription');
    if (sel) sel.value = savedId;
  }
}

async function deletePrescription(id) {
  if (!confirm('Obrisati recept?')) return;
  const { error } = await sb.from('prescriptions').delete().eq('id', id);
  if (error) { toast('Greška pri brisanju', true); return; }
  toast('Recept obrisan');
  await renderPrescriptionsTab();
}

let examsLoaded = false;
let examsSectionOffset = 0;
const EXAMS_PAGE = 50;
let examsSectionRows = [];

const debouncedExamsSearch = debounce(() => loadExamsSection(true));

function clearExamsFilters() {
  document.getElementById('exams-search-name').value = '';
  document.getElementById('exams-search-date').value = '';
  loadExamsSection(true);
}

async function loadExamsSection(reset = false) {
  examsLoaded = true;
  if (reset) { examsSectionOffset = 0; examsSectionRows = []; }

  const nameFilter = document.getElementById('exams-search-name').value.trim();
  const dateFilter = document.getElementById('exams-search-date').value;

  let patientIds = null;
  if (nameFilter) {
    const { data: pts } = await sb.from('patients').select('id')
      .or(`first_name.ilike.%${nameFilter}%,last_name.ilike.%${nameFilter}%`).limit(200);
    patientIds = (pts || []).map(p => p.id);
    if (!patientIds.length) { examsSectionRows = []; renderExamsSectionTable(false); return; }
  }

  let query = sb.from('prescriptions').select('*')
    .order('created_at', { ascending: false })
    .range(examsSectionOffset, examsSectionOffset + EXAMS_PAGE - 1);
  if (patientIds) query = query.in('patient_id', patientIds);
  if (dateFilter) query = query.gte('created_at', dateFilter + 'T00:00:00').lte('created_at', dateFilter + 'T23:59:59');

  const { data, error } = await query;
  if (error) { toast('Greška pri učitavanju pregleda', true); return; }

  const idsToFetch = [...new Set((data || []).map(r => r.patient_id))];
  let patientsMap = {};
  if (idsToFetch.length) {
    const { data: pts } = await sb.from('patients').select('id, first_name, last_name').in('id', idsToFetch);
    (pts || []).forEach(p => { patientsMap[p.id] = p; });
  }

  const enriched = (data || []).map(r => ({ rx: r, patient: patientsMap[r.patient_id] || null }));
  examsSectionRows = reset ? enriched : [...examsSectionRows, ...enriched];
  examsSectionOffset += (data || []).length;
  renderExamsSectionTable(data && data.length === EXAMS_PAGE);
}

function renderExamsSectionTable(hasMore = false) {
  const wrap = document.getElementById('exams-table-wrap');
  if (!examsSectionRows.length) { wrap.innerHTML = '<div class="empty-state" style="height:auto;padding:40px;">Nema pregleda</div>'; return; }
  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Datum</th><th>Pacijent</th><th>Namena</th><th class="num">OD sph/cyl/ax</th><th class="num">OS sph/cyl/ax</th><th class="num">PD</th></tr></thead>
      <tbody>
        ${examsSectionRows.map(({ rx, patient: p }) => `
          <tr onclick="goToPatient('${rx.patient_id}','prescriptions')">
            <td>${fmtDate(rx.created_at?.slice(0,10))}</td>
            <td class="link">${p ? fullName(p) : '—'}</td>
            <td>${rx.purpose || '—'}</td>
            <td class="num">${rx.od_sph || '—'} / ${rx.od_cyl || '—'} / ${rx.od_ax || '—'}</td>
            <td class="num">${rx.os_sph || '—'} / ${rx.os_cyl || '—'} / ${rx.os_ax || '—'}</td>
            <td class="num">${rx.pd || '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${hasMore ? `<button class="btn-secondary load-more" onclick="loadExamsSection(false)">Učitaj još</button>` : ''}
  `;
}
