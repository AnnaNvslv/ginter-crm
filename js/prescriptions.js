let currentPrescriptions = [];

async function renderPrescriptionsTab() {
  const { data, error } = await sb
    .from('prescriptions')
    .select('*')
    .eq('patient_id', activePatientId)
    .order('created_at', { ascending: false });

  if (error) { toast('Ошибка загрузки рецептов', true); return; }
  currentPrescriptions = data;

  const html = `
    <button class="btn-primary" style="margin-bottom:20px;" onclick="openAddPrescriptionModal()">+ Добавить рецепт</button>
    ${currentPrescriptions.map(rx => `
      <div class="list-card">
        <div class="list-card-header">
          <div class="title">${rx.purpose}${rx.is_client_rx ? ' <span class="badge">рецепт клиента</span>' : ''}</div>
          <div class="actions">
            <span style="color:var(--text-light);font-size:14px;">${fmtDate(rx.created_at?.slice(0,10))}</span>
            <button class="btn-secondary" onclick="openEditPrescriptionModal('${rx.id}')">Изм.</button>
            <button class="btn-secondary" style="color:#C0392B;border-color:#C0392B;" onclick="deletePrescription('${rx.id}')">Удал.</button>
          </div>
        </div>
        <div class="rx-row">
          <span><b>OD</b> sph ${rx.od_sph ?? '—'} cyl ${rx.od_cyl ?? '—'} ax ${rx.od_ax ?? '—'}</span>
          <span><b>OS</b> sph ${rx.os_sph ?? '—'} cyl ${rx.os_cyl ?? '—'} ax ${rx.os_ax ?? '—'}</span>
          <span><b>Add</b> ${rx.add ?? '—'}</span>
          <span><b>Degr</b> ${rx.degr ?? '—'}</span>
          <span><b>PD</b> ${rx.pd ?? '—'}</span>
        </div>
      </div>
    `).join('') || '<div class="empty-state" style="height:auto;padding:30px;">Рецептов пока нет</div>'}
  `;

  document.getElementById('tab-content').innerHTML = html;
}

function openAddPrescriptionModal() {
  document.getElementById('rx-modal-title').textContent = 'Новый рецепт';
  document.getElementById('rx-form').reset();
  document.getElementById('rx-form-id').value = '';
  openModal('rx-modal');
}

function openEditPrescriptionModal(id) {
  const rx = currentPrescriptions.find(r => r.id === id);
  document.getElementById('rx-modal-title').textContent = 'Редактировать рецепт';
  document.getElementById('rx-form-id').value = rx.id;
  document.getElementById('rx-form-purpose').value = rx.purpose;
  document.getElementById('rx-form-client').checked = rx.is_client_rx;
  ['od_sph','od_cyl','od_ax','os_sph','os_cyl','os_ax','add','degr','pd'].forEach(f => {
    document.getElementById(`rx-form-${f}`).value = rx[f] ?? '';
  });
  openModal('rx-modal');
}

async function savePrescriptionForm(e) {
  e.preventDefault();
  const id = document.getElementById('rx-form-id').value;
  const payload = { patient_id: activePatientId, purpose: document.getElementById('rx-form-purpose').value,
    is_client_rx: document.getElementById('rx-form-client').checked };
  ['od_sph','od_cyl','od_ax','os_sph','os_cyl','os_ax','add','degr','pd'].forEach(f => {
    const v = document.getElementById(`rx-form-${f}`).value;
    payload[f] = v === '' ? null : Number(v);
  });

  let error;
  if (id) {
    ({ error } = await sb.from('prescriptions').update(payload).eq('id', id));
  } else {
    ({ error } = await sb.from('prescriptions').insert(payload));
  }

  if (error) { toast('Ошибка сохранения рецепта', true); return; }
  closeModal('rx-modal');
  toast('Рецепт сохранён');
  await renderPrescriptionsTab();
}

async function deletePrescription(id) {
  if (!confirm('Удалить рецепт?')) return;
  const { error } = await sb.from('prescriptions').delete().eq('id', id);
  if (error) { toast('Ошибка удаления', true); return; }
  toast('Рецепт удалён');
  await renderPrescriptionsTab();
}
