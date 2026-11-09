let currentPatients = [];
let activePatientId = null;
let activeTab = 'prescriptions';
// Datum novog pacijenta koji se automatski prenosi u recept i porudžbinu
// ako se dodaju odmah nakon kreiranja pacijenta (bez potrebe da se datum unosi ponovo).
// Postavlja se samo u tom lancu i nestaje čim se iskoristi ili lanac prekine.
let pendingQuickAddDate = null;
let dupCheckTimer = null;
let patientLinks = []; // patient_links: ručne veze (family) i oznake «nije isti pacijent» (not_duplicate)

async function loadPatients() {
  const { data, error } = await fetchAllRows(() => sb
    .from('patients')
    .select('*')
    .is('deleted_at', null)
    .order('last_name')
    .order('id'));

  if (error) { toast('Greška pri učitavanju pacijenata', true); return; }
  currentPatients = data;
  await loadPatientLinks();
  renderPatientList();
}

async function loadPatientLinks() {
  const { data, error } = await sb.from('patient_links').select('*');
  patientLinks = error ? [] : (data || []);
}

function fullName(p) {
  return [p.last_name, p.first_name].filter(Boolean).join(' ');
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

// Pretraga radi po svim rečima unetim u polje (u bilo kom redosledu), i pretražuje
// ime, prezime, telefon i napomene (notes) — npr. "stevica buzarov" ili "0641234567"
// ili deo teksta iz napomena sve pronalaze istog pacijenta, bez obzira na redosled reči.
function renderPatientList(filter = '') {
  const tokens = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = tokens.length
    ? currentPatients.filter(p => {
        const haystack = [p.first_name, p.last_name, p.phone, p.notes].filter(Boolean).join(' ').toLowerCase();
        return tokens.every(t => haystack.includes(t));
      })
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
        <div class="visit">poslednja poseta<br>${fmtDateP(p.visit_date, p.visit_date_prec)}</div>
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
  document.getElementById('section-clients').classList.add('show-detail');
  await renderPatientCard();
}

function showPatientList() {
  document.getElementById('section-clients').classList.remove('show-detail');
}

async function renderPatientCard() {
  const patient = currentPatients.find(p => p.id === activePatientId);
  if (!patient) return;

  const [rxCount, orderCount] = await Promise.all([
    countPatientPrescriptions(patient.id),
    countPatientOrders(patient.id),
  ]);

  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="card-header">
      <div>
        <h2>${fullName(patient)}</h2>
        <div class="badges">
          ${patient.tkt ? `<span class="badge">TKT</span>` : ''}
          ${patient.phone ? `<span class="badge">${patient.phone}</span>` : ''}
          ${(patient.notes || '').startsWith('[IMPORT KNJIGA]') ? `<span class="badge badge-import" title="Uvezeno iz stare knjige (Excel 2019–2023)">Import knjiga</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-primary" onclick="quickAddPrescription()">+ Recept</button>
        <button class="btn-primary" onclick="quickAddOrder()">+ Porudžbina</button>
        <button class="btn-secondary" onclick="openLinkPatientModal()" title="Poveži sa članom porodice">+ Poveži</button>
        <button class="btn-secondary" onclick="openEditPatientModal()">Izmeni</button>
        <button class="btn-secondary" style="color:#C0392B;border-color:#C0392B;" onclick="deletePatient()">Obriši</button>
      </div>
    </div>

    ${renderRelatedPatients(patient)}

    <div class="tabs">
      <div class="tab ${activeTab === 'prescriptions' ? 'active' : ''}" data-tab="prescriptions" onclick="switchTab('prescriptions')">Recepti <span class="tab-count" id="tab-count-prescriptions">${rxCount}</span></div>
      <div class="tab ${activeTab === 'orders' ? 'active' : ''}" data-tab="orders" onclick="switchTab('orders')">Porudžbine <span class="tab-count" id="tab-count-orders">${orderCount}</span></div>
      <div class="tab ${activeTab === 'info' ? 'active' : ''}" data-tab="info" onclick="switchTab('info')">Info</div>
    </div>

    <div id="tab-content"></div>
  `;

  await renderActiveTab();
}

async function countPatientPrescriptions(patientId) {
  const { count, error } = await sb.from('prescriptions').select('id', { count: 'exact', head: true }).eq('patient_id', patientId);
  return error ? 0 : (count || 0);
}

async function countPatientOrders(patientId) {
  const { count, error } = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('patient_id', patientId).is('deleted_at', null);
  return error ? 0 : (count || 0);
}

// Ažurira brojeve na tabovima Recepti/Porudžbine bez ponovnog renderovanja cele kartice —
// pozivaju ga renderPrescriptionsTab() i renderOrdersTab() nakon svakog učitavanja liste,
// da brojevi ostanu tačni posle dodavanja/brisanja bez potrebe za ponovnim otvaranjem pacijenta.
function updateTabCount(tab, value) {
  const el = document.getElementById(`tab-count-${tab}`);
  if (el) el.textContent = value;
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
        <span><b>Datum posete:</b> ${fmtDateP(patient.visit_date, patient.visit_date_prec)}</span>
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
  setDateVal('patient-form-visit-date', todayISO());
  hideDupWarning();
  openModal('patient-modal');
}

function openEditPatientModal() {
  const patient = currentPatients.find(p => p.id === activePatientId);
  document.getElementById('patient-modal-title').textContent = 'Izmena pacijenta';
  document.getElementById('patient-form-id').value = patient.id;
  document.getElementById('patient-form-first-name').value = patient.first_name || '';
  document.getElementById('patient-form-last-name').value = patient.last_name || '';
  document.getElementById('patient-form-tkt').checked = patient.tkt;
  document.getElementById('patient-form-phone').value = patient.phone || '';
  setDateVal('patient-form-visit-date', { date: patient.visit_date, prec: patient.visit_date_prec || 'day' });
  document.getElementById('patient-form-notes').value = patient.notes || '';
  hideDupWarning();
  openModal('patient-modal');
}

// ═══ PROVERA DUPLIH PACIJENATA ═══
function normalizePhoneDigits(s) {
  return (s || '').replace(/\D/g, '');
}

function checkDuplicatePatient() {
  clearTimeout(dupCheckTimer);
  dupCheckTimer = setTimeout(runDuplicateCheck, 250);
}

function hideDupWarning() {
  const box = document.getElementById('patient-dup-warning');
  if (box) box.style.display = 'none';
}

function runDuplicateCheck() {
  const editingId = document.getElementById('patient-form-id').value;
  const first = document.getElementById('patient-form-first-name').value.trim().toLowerCase();
  const last = document.getElementById('patient-form-last-name').value.trim().toLowerCase();
  const phone = normalizePhoneDigits(document.getElementById('patient-form-phone').value);
  const nameTokens = (first + ' ' + last).split(/\s+/).filter(t => t.length >= 2);

  const box = document.getElementById('patient-dup-warning');
  const list = document.getElementById('patient-dup-list');

  const nameFilled = nameTokens.length > 0;
  const phoneFilled = phone.length >= 4;

  if (!nameFilled && !phoneFilled) { hideDupWarning(); return; }

  const matches = currentPatients.filter(p => {
    if (p.id === editingId) return false;
    const pName = fullName(p).toLowerCase();
    const pPhone = normalizePhoneDigits(p.phone);
    const nameMatch = nameFilled && nameTokens.every(t => pName.includes(t));
    const phoneMatch = phoneFilled && pPhone && (pPhone.includes(phone) || phone.includes(pPhone));
    return nameMatch || phoneMatch;
  });

  if (!matches.length) { hideDupWarning(); return; }

  list.innerHTML = matches.map(p => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border);cursor:pointer;" onclick="useDuplicatePatient('${p.id}')">
      <div>
        <div style="font-weight:600;">${fullName(p)}</div>
        <div style="font-size:13px;color:var(--text-light);">${p.phone || 'bez telefona'}</div>
      </div>
      <span style="color:var(--accent);font-size:14px;white-space:nowrap;">Otvori karticu →</span>
    </div>
  `).join('');
  box.style.display = 'block';
}

function useDuplicatePatient(id) {
  closeModal('patient-modal');
  openPatient(id);
}

async function savePatientForm(e) {
  e.preventDefault();
  const id = document.getElementById('patient-form-id').value;
  const visit = getDateVal('patient-form-visit-date');
  if (!visit.ok) { toast('Unesite godinu (npr. 2021)', true); return; }
  const payload = {
    first_name: document.getElementById('patient-form-first-name').value.trim(),
    last_name: document.getElementById('patient-form-last-name').value.trim(),
    tkt: document.getElementById('patient-form-tkt').checked,
    phone: document.getElementById('patient-form-phone').value.trim() || null,
    visit_date: visit.date,
    visit_date_prec: visit.prec,
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
    if (!id) pendingQuickAddDate = { date: payload.visit_date, prec: payload.visit_date_prec };
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

// "+ Porudžbina" (postojeći pacijent, bez novog recepta): odmah se povezuje poslednji
// uneti recept — svi recepti sa najnovijim datumom (npr. za daljinu + za blizinu iste posete).
async function quickAddOrder() {
  const { data } = await sb.from('prescriptions').select('id, rx_date')
    .eq('patient_id', activePatientId)
    .order('rx_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(20);
  const rows = data || [];
  const ids = rows.length ? rows.filter(r => r.rx_date === rows[0].rx_date).map(r => r.id) : [];
  await openOrderWithPrescriptions(ids);
}

async function deletePatient() {
  if (!confirm('Obrisati pacijenta? Ovo se može vratiti samo preko baze podataka.')) return;
  const id = activePatientId;
  const { error } = await sb.from('patients').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast('Greška pri brisanju', true); return; }

  // Kad se pacijent obriše, njegove porudžbine ostaju u bazi ali postaju "duh" —
  // patient_id i dalje pokazuje na obrisanog pacijenta, pa ih Analitika/liste ne mogu
  // imenovati (ime se prikazuje kao "—") a i dalje ulaze u ukupan promet.
  // Zato se ovde iste te porudžbine takođe soft-brišu, da ne kvare izveštaje.
  const { error: ordersError } = await sb
    .from('orders')
    .update({ deleted_at: new Date().toISOString() })
    .eq('patient_id', id)
    .is('deleted_at', null);
  if (ordersError) { toast('Pacijent obrisan, ali porudžbine nisu ažurirane — proveri Analitiku', true); }

  activePatientId = null;
  document.getElementById('content').innerHTML = '<div class="empty-state">Izaberite pacijenta sa leve strane</div>';
  showPatientList();
  toast('Pacijent obrisan');
  await loadPatients();
}


// ═══ POVEZANI PACIJENTI: porodica (isti telefon / ručna veza) i moguće duple kartice ═══
// Isti telefon + isto ime (a različito prezime) = moguće ista osoba sa dve kartice → žuto upozorenje.
// Isti telefon + drugo ime = porodica. Ništa se ne spaja automatski — samo dugmetom «Spoji kartice».
function unaccLower(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'dj');
}

function usablePhone(p) {
  const d = normalizePhoneDigits(p.phone);
  return d.length >= 6 && !/^0+$/.test(d) ? d : '';
}

function linkBetween(a, b, kind) {
  return patientLinks.find(l => l.kind === kind &&
    ((l.patient_a === a && l.patient_b === b) || (l.patient_a === b && l.patient_b === a)));
}

function relatedPatients(patient) {
  const dups = [], family = [];
  const seen = new Set([patient.id]);
  const phone = usablePhone(patient);
  const first = unaccLower(patient.first_name).trim();
  if (phone) {
    currentPatients.forEach(o => {
      if (seen.has(o.id) || usablePhone(o) !== phone) return;
      seen.add(o.id);
      const sameFirst = first && unaccLower(o.first_name).trim() === first;
      if (sameFirst && !linkBetween(patient.id, o.id, 'not_duplicate')) dups.push(o);
      else family.push({ p: o, link: linkBetween(patient.id, o.id, 'family') });
    });
  }
  patientLinks.filter(l => l.kind === 'family' && (l.patient_a === patient.id || l.patient_b === patient.id)).forEach(l => {
    const otherId = l.patient_a === patient.id ? l.patient_b : l.patient_a;
    if (seen.has(otherId)) return;
    const o = currentPatients.find(x => x.id === otherId);
    if (o) { seen.add(o.id); family.push({ p: o, link: l }); }
  });
  return { dups, family };
}

function renderRelatedPatients(patient) {
  const { dups, family } = relatedPatients(patient);
  const dupHtml = dups.map(o => `
    <div class="dup-alert">
      <div class="dup-alert-title">⚠ Moguće da pacijent ima još jednu karticu</div>
      <div class="dup-alert-text">Isti telefon i ime: <a onclick="openPatient('${o.id}')">${escapeHtml(fullName(o))}</a>${o.visit_date ? ' · poseta ' + fmtDateP(o.visit_date, o.visit_date_prec) : ''}</div>
      <div class="dup-alert-actions">
        <button class="btn-secondary" onclick="openPatient('${o.id}')">Otvori karticu</button>
        <button class="btn-secondary" onclick="mergePatientCards('${o.id}')">Spoji kartice</button>
        <button class="btn-secondary" onclick="markNotDuplicate('${o.id}')">Nije isti pacijent</button>
      </div>
    </div>`).join('');
  const chips = family.map(f => `
    <span class="link-chip"><a onclick="openPatient('${f.p.id}')">${escapeHtml(fullName(f.p))}</a>${f.link ? `<button title="Ukloni vezu" onclick="removePatientLink('${f.link.id}')">×</button>` : ''}</span>`).join('');
  // Red porodice se prikazuje samo kad postoje povezani pacijenti; ručno povezivanje je dugme u zaglavlju.
  return `${dupHtml}${chips ? `
    <div class="family-row">
      <span class="family-label">👥 Ista porodica / isti telefon:</span>
      ${chips}
    </div>` : ''}`;
}

async function markNotDuplicate(otherId) {
  const { error } = await sb.from('patient_links').insert({ patient_a: activePatientId, patient_b: otherId, kind: 'not_duplicate', created_by: getCurrentUser()?.name || null });
  if (error) { toast('Greška pri čuvanju', true); return; }
  await loadPatientLinks();
  toast('Označeno: različiti pacijenti');
  await renderPatientCard();
}

async function removePatientLink(linkId) {
  if (!confirm('Ukloniti vezu između ovih pacijenata?')) return;
  const { error } = await sb.from('patient_links').delete().eq('id', linkId);
  if (error) { toast('Greška pri brisanju veze', true); return; }
  await loadPatientLinks();
  await renderPatientCard();
}

// Spajanje: zadržava se kartica koja NIJE iz uvoza knjige (ili starija), druga se briše,
// a njeni recepti i porudžbine prelaze u zadržanu karticu.
async function mergePatientCards(otherId) {
  const a = currentPatients.find(p => p.id === activePatientId);
  const b = currentPatients.find(p => p.id === otherId);
  if (!a || !b) return;
  const isImp = p => (p.notes || '').startsWith('[IMPORT KNJIGA]');
  let keep = a, drop = b;
  if (isImp(a) && !isImp(b)) { keep = b; drop = a; }
  else if (isImp(a) === isImp(b) && (b.created_at || '') < (a.created_at || '')) { keep = b; drop = a; }
  if (!confirm(`Spojiti kartice?\n\nRecepti i porudžbine iz kartice „${fullName(drop)}“ prelaze u karticu „${fullName(keep)}“, a kartica „${fullName(drop)}“ se briše.\n\nOvo se ne može poništiti iz CRM-a.`)) return;
  const { data, error } = await sb.rpc('merge_patients', { src: drop.id, dst: keep.id });
  if (error) { toast('Greška pri spajanju', true); return; }
  toast('Spojeno: ' + data);
  await loadPatients();
  await openPatient(keep.id);
}

function openLinkPatientModal() {
  document.getElementById('link-search').value = '';
  document.getElementById('link-results').innerHTML = '';
  openModal('link-modal');
  setTimeout(() => document.getElementById('link-search').focus(), 0);
}

function searchLinkPatients() {
  const tokens = document.getElementById('link-search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const box = document.getElementById('link-results');
  if (!tokens.length) { box.innerHTML = ''; return; }
  const res = currentPatients.filter(p => p.id !== activePatientId && tokens.every(t =>
    [p.first_name, p.last_name, p.phone].filter(Boolean).join(' ').toLowerCase().includes(t))).slice(0, 15);
  box.innerHTML = res.map(p => `
    <div class="link-result" onclick="addFamilyLink('${p.id}')">
      <div><b>${escapeHtml(fullName(p))}</b><div class="meta">${p.phone || 'bez telefona'}</div></div>
      <span>Poveži →</span>
    </div>`).join('') || '<div class="meta" style="padding:8px 0;">Nema rezultata</div>';
}

async function addFamilyLink(otherId) {
  const { error } = await sb.from('patient_links').insert({ patient_a: activePatientId, patient_b: otherId, kind: 'family', created_by: getCurrentUser()?.name || null });
  if (error) { toast(error.code === '23505' ? 'Veza već postoji' : 'Greška pri čuvanju', true); return; }
  closeModal('link-modal');
  await loadPatientLinks();
  toast('Pacijenti povezani');
  await renderPatientCard();
}
