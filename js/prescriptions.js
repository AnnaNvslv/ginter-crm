let currentPrescriptions = [];
let rxChain = []; // { id, purpose } recepata sačuvanih preko "+ Dodaj još recept" u trenutnoj sesiji unosa
// true kad je unos recepta otvoren iz forme porudžbine ("+ Novi recept") — posle snimanja
// recepti se vraćaju u tu porudžbinu umesto da se otvara nova.
let rxOpenedFromOrder = false;

async function renderPrescriptionsTab() {
  const { data, error } = await sb
    .from('prescriptions')
    .select('*')
    .eq('patient_id', activePatientId)
    .order('rx_date', { ascending: false });

  if (error) { toast('Greška pri učitavanju recepata', true); return; }
  currentPrescriptions = data;
  if (typeof updateTabCount === 'function') updateTabCount('prescriptions', currentPrescriptions.length);

  const html = `
    <button class="btn-primary" style="margin-bottom:20px;" onclick="openAddPrescriptionModal()">+ Dodaj recept</button>
    ${currentPrescriptions.map(rx => `
      <div class="list-card">
        <div class="list-card-header">
          <div class="title">${rx.purpose || '—'}${rxSourceBadges(rx)}</div>
          <div class="actions">
            <span style="color:var(--text-light);font-size:14px;">${fmtDate(rx.rx_date || rx.created_at?.slice(0,10))}</span>
            <button class="btn-secondary" onclick="applyPrescriptionToOrder('${rx.id}')">Primeni recept</button>
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
        ${rx.purpose === 'kontaktna sočiva' && (rx.bc || rx.dia) ? `
          <div class="kv-row" style="margin-top:8px;">
            <span><b>BC:</b> ${rx.bc || '—'}</span>
            <span><b>DIA:</b> ${rx.dia || '—'}</span>
          </div>
        ` : ''}
        ${(rx.od_prism || rx.os_prism) ? `
          <div class="kv-row" style="margin-top:8px;">
            <span><b>Prizma OD:</b> ${rx.od_prism || '—'}</span>
            <span><b>Prizma OS:</b> ${rx.os_prism || '—'}</span>
          </div>
        ` : ''}
        ${rx.checked_by ? `<div class="kv-row" style="margin-top:8px;"><span><b>Pregled izvršio/la:</b> ${rx.checked_by}</span></div>` : ''}
        ${rx.comment ? `<div style="margin-top:10px;color:var(--text-light);">${rx.comment}</div>` : ''}
        ${rx.created_by ? `<div class="entry-meta">Uneo/la: ${rx.created_by} · ${fmtDate(rx.created_at?.slice(0,10))}</div>` : ''}
      </div>
    `).join('') || '<div class="empty-state" style="height:auto;padding:30px;">Još nema recepata</div>'}
  `;

  document.getElementById('tab-content').innerHTML = html;
}

function rxSourceBadges(rx) {
  return [
    rx.is_client_rx && 'klijentov recept',
    rx.rx_from_client_words && 'po rečima klijenta',
    rx.rx_from_glasses && 'po naočarima',
  ].filter(Boolean).map(t => ` <span class="badge">${t}</span>`).join('');
}

// "Primeni recept": nova porudžbina sa već povezanim ovim receptom.
async function applyPrescriptionToOrder(id) {
  await openOrderWithPrescriptions([id]);
}

// ═══ Recept za blizinu iz recepta sa adicijom ═══
// Sph za blizinu = Sph za daljinu + Add (oba oka); Cyl, Ax i prizma ostaju isti;
// PD za blizinu = PD za daljinu − 2 mm (binokularni), odnosno − 1 mm po oku (npr. 32/32 → 31/31).
// Polja su slobodan tekst: prihvata se zarez ili tačka, "pl"/"plano" = 0.
function parseDiopter(v) {
  const s = String(v ?? '').trim().toLowerCase().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  if (s === 'pl' || s === 'plano' || s === 'pl.') return 0;
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

function fmtDiopter(n, useComma) {
  const r = Math.round(n * 100) / 100;
  let s = Math.abs(r).toFixed(2);
  if (useComma) s = s.replace('.', ',');
  return (r > 0 ? '+' : r < 0 ? '-' : '') + s;
}

function nearSph(sph, add) {
  const a = parseDiopter(add);
  const v = parseDiopter(sph);
  if (a === null || Number.isNaN(a) || Number.isNaN(v)) return null;
  const useComma = String(sph ?? '').includes(',') || String(add ?? '').includes(',');
  return fmtDiopter((v ?? 0) + a, useComma);
}

function nearPd(pd) {
  const s = String(pd ?? '').trim();
  if (!s) return '';
  const num = v => Number(v.replace(',', '.'));
  const out = n => { const r = String(Math.round(n * 10) / 10); return s.includes(',') ? r.replace('.', ',') : r; };
  const mono = s.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/);
  if (mono) return `${out(num(mono[1]) - 1)}/${out(num(mono[2]) - 1)}`;
  if (/^\d+(?:[.,]\d+)?$/.test(s)) return out(num(s) - 2);
  return s;
}

// Popunjava formu (već postavljenu na "za blizinu") vrednostima izračunatim iz prethodnog
// recepta. Vraća false ako prethodni recept nema upotrebljivu adiciju.
function fillNearFromDistance(prev) {
  const a = parseDiopter(prev.add);
  if (a === null || Number.isNaN(a) || a === 0) return false;
  const odSph = nearSph(prev.od_sph, prev.add);
  const osSph = nearSph(prev.os_sph, prev.add);
  const set = (f, v) => { document.getElementById(`rx-form-${f}`).value = v ?? ''; };
  set('od_sph', odSph ?? prev.od_sph);
  set('os_sph', osSph ?? prev.os_sph);
  ['od_cyl', 'od_ax', 'od_prism', 'os_cyl', 'os_ax', 'os_prism'].forEach(f => set(f, prev[f]));
  set('pd', nearPd(prev.pd));
  if (odSph === null || osSph === null) toast('Sph nije prepoznat — proverite dioptrije za blizinu', true);
  return true;
}

function toggleRxClFields() {
  const isCl = document.getElementById('rx-form-purpose').value === 'kontaktna sočiva';
  document.getElementById('rx-cl-fields').style.display = isCl ? 'grid' : 'none';
}

// Fokusira polje OD Sph umesto podrazumevanog prvog polja (Namena), pošto se ono
// najčešće prvo popunjava pri unosu recepta.
function focusRxSphField() {
  setTimeout(() => {
    const el = document.getElementById('rx-form-od_sph');
    if (el) { el.focus(); el.select(); }
  }, 0);
}

// Dugme "+ Dodaj još recept" je vidljivo samo pri unosu NOVOG recepta (ne pri izmeni
// postojećeg) — izmena postojećeg recepta ne može biti deo lanca za novu porudžbinu.
// Kratka napomena iznad forme pokazuje koliko je recepata već sačuvano u lancu.
function updateRxChainUI() {
  const isEdit = !!document.getElementById('rx-form-id').value;
  const btn = document.getElementById('rx-add-another-btn');
  if (btn) btn.style.display = isEdit ? 'none' : 'inline-block';
  const info = document.getElementById('rx-chain-info');
  if (info) info.textContent = rxChain.length ? `Već dodato u ovoj porudžbini: ${rxChain.length}` : '';
}

// Čita trenutna polja forme u payload za upis u bazu — koristi ga i "+ Dodaj još recept"
// i normalno "Sačuvaj", da ne bi bilo duplirane logike.
function buildRxFormPayload() {
  const purpose = document.getElementById('rx-form-purpose').value;
  const isCl = purpose === 'kontaktna sočiva';

  const checkedBy = ['Ervin', 'Anna', 'Bojana']
    .filter(name => document.getElementById(`rx-form-checked-${name}`).checked)
    .join(', ') || null;

  const payload = {
    patient_id: activePatientId,
    purpose,
    rx_date: document.getElementById('rx-form-date').value || todayISO(),
    is_client_rx: document.getElementById('rx-form-client').checked,
    rx_from_client_words: document.getElementById('rx-form-src-words').checked,
    rx_from_glasses: document.getElementById('rx-form-src-glasses').checked,
    bc: isCl ? (document.getElementById('rx-form-bc').value.trim() || null) : null,
    dia: isCl ? (document.getElementById('rx-form-dia').value.trim() || null) : null,
    checked_by: checkedBy,
    comment: document.getElementById('rx-form-comment').value.trim() || null,
  };
  ['od_sph','od_cyl','od_ax','od_prism','os_sph','os_cyl','os_ax','os_prism','add','degr','pd'].forEach(f => {
    const v = document.getElementById(`rx-form-${f}`).value.trim();
    payload[f] = v || null;
  });
  return payload;
}

function setRxOpenedFromOrder(on) {
  rxOpenedFromOrder = !!on;
  document.getElementById('rx-modal').classList.toggle('over-order', rxOpenedFromOrder);
}

// opts.fromOrder: otvoreno iz forme porudžbine (modal ide preko nje); opts.date: datum porudžbine.
function openAddPrescriptionModal(opts = {}) {
  rxChain = [];
  setRxOpenedFromOrder(opts.fromOrder);
  document.getElementById('rx-modal-title').textContent = 'Novi recept';
  document.getElementById('rx-form').reset();
  document.getElementById('rx-form-id').value = '';
  // Datum recepta: ako se otvara odmah nakon kreiranja novog pacijenta, preuzima se
  // datum posete pacijenta (pendingQuickAddDate); iz porudžbine — datum porudžbine;
  // inače današnji datum. Uvek se može ručno promeniti.
  document.getElementById('rx-form-date').value = opts.date || pendingQuickAddDate || todayISO();
  toggleRxClFields();
  updateRxChainUI();
  openModal('rx-modal');
  focusRxSphField();
}

function openEditPrescriptionModal(id) {
  rxChain = [];
  setRxOpenedFromOrder(false);
  const rx = currentPrescriptions.find(r => r.id === id);
  document.getElementById('rx-modal-title').textContent = 'Izmena recepta';
  document.getElementById('rx-form-id').value = rx.id;
  document.getElementById('rx-form-purpose').value = rx.purpose || 'za daljinu';
  document.getElementById('rx-form-date').value = rx.rx_date || (rx.created_at ? rx.created_at.slice(0, 10) : todayISO());
  document.getElementById('rx-form-client').checked = rx.is_client_rx;
  document.getElementById('rx-form-src-words').checked = !!rx.rx_from_client_words;
  document.getElementById('rx-form-src-glasses').checked = !!rx.rx_from_glasses;
  ['od_sph','od_cyl','od_ax','od_prism','os_sph','os_cyl','os_ax','os_prism','add','degr','pd'].forEach(f => {
    document.getElementById(`rx-form-${f}`).value = rx[f] ?? '';
  });
  document.getElementById('rx-form-bc').value = rx.bc || '';
  document.getElementById('rx-form-dia').value = rx.dia || '';
  const checkedNames = (rx.checked_by || '').split(',').map(s => s.trim()).filter(Boolean);
  ['Ervin', 'Anna', 'Bojana'].forEach(name => {
    document.getElementById(`rx-form-checked-${name}`).checked = checkedNames.includes(name);
  });
  document.getElementById('rx-form-comment').value = rx.comment || '';
  toggleRxClFields();
  updateRxChainUI();
  openModal('rx-modal');
  focusRxSphField();
}

// Snima trenutni recept (uvek kao nov, insert) i odmah otvara praznu formu za sledeći —
// modal ostaje otvoren. Sačuvani recept se dodaje u rxChain i povezuje na porudžbinu
// tek kad se lanac završi normalnim "Sačuvaj".
//
// Pre resetovanja forme pamti se ko je označen u "Pregled izvršio/la" na upravo sačuvanom
// receptu — isti izvršioci se odmah označavaju i na sledećem receptu u lancu (najčešće je
// isti pregled/isto lice za oba recepta istog pacijenta, ne treba ponovo klikati).
// Namena sledećeg recepta u lancu podrazumevano postaje "za blizinu" — najčešći slučaj kad
// Ana unosi dva recepta zaredom je prvi za daljinu, drugi za blizinu.
async function saveAndAddAnotherPrescription() {
  const payload = buildRxFormPayload();
  payload.created_by = getCurrentUser()?.name || null;
  const { data, error } = await sb.from('prescriptions').insert(payload).select('id').single();
  if (error) { toast('Greška pri čuvanju recepta', true); return; }

  rxChain.push({ id: data.id, purpose: payload.purpose });
  toast('Recept sačuvan — unesite sledeći');

  const checkedNames = ['Ervin', 'Anna', 'Bojana']
    .filter(name => document.getElementById(`rx-form-checked-${name}`).checked);
  const rxDate = payload.rx_date;

  document.getElementById('rx-form').reset();
  document.getElementById('rx-form-id').value = '';
  document.getElementById('rx-form-purpose').value = 'za blizinu';
  document.getElementById('rx-form-date').value = rxDate;
  checkedNames.forEach(name => { document.getElementById(`rx-form-checked-${name}`).checked = true; });
  // Ako je prethodni recept imao adiciju (Add) — dioptrije za blizinu se odmah izračunavaju.
  if (payload.purpose !== 'kontaktna sočiva') fillNearFromDistance(payload);
  toggleRxClFields();
  updateRxChainUI();
  focusRxSphField();
}

async function savePrescriptionForm(e) {
  e.preventDefault();
  const id = document.getElementById('rx-form-id').value;
  const payload = buildRxFormPayload();
  const purpose = payload.purpose;

  let error, savedId = id;
  if (id) {
    ({ error } = await sb.from('prescriptions').update(payload).eq('id', id));
  } else {
    payload.created_by = getCurrentUser()?.name || null;
    const res = await sb.from('prescriptions').insert(payload).select('id').single();
    error = res.error;
    savedId = res.data?.id;
  }

  if (error) { toast('Greška pri čuvanju recepta', true); return; }
  closeModal('rx-modal');
  toast('Recept sačuvan');

  // Sakupljamo sve recepte iz ovog lanca (dodate preko "+ Dodaj još recept"), zajedno
  // sa upravo sačuvanim (poslednjim) — svi se odjednom povezuju na istu porudžbinu.
  const chainIds = rxChain.map(r => r.id);
  rxChain = [];
  if (savedId) chainIds.push(savedId);

  // Otvoreno iz forme porudžbine → recepti se povezuju na tu (još otvorenu) porudžbinu.
  if (rxOpenedFromOrder) {
    setRxOpenedFromOrder(false);
    updateTabCount('prescriptions', await countPatientPrescriptions(activePatientId));
    await attachNewPrescriptionsToOrder(chainIds);
    return;
  }

  await renderPrescriptionsTab();

  // Nakon snimanja novog recepta odmah se otvara forma porudžbine (bez pitanja) — svi
  // recepti iz lanca se automatski povezuju, okvir/stakla (ili sočiva) se odmah dodaju.
  // pendingQuickAddDate (ako postoji) prenosi datum pacijenta u formu porudžbine.
  if (chainIds.length) await openOrderWithPrescriptions(chainIds, pendingQuickAddDate);
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
    .order('rx_date', { ascending: false })
    .range(examsSectionOffset, examsSectionOffset + EXAMS_PAGE - 1);
  if (patientIds) query = query.in('patient_id', patientIds);
  if (dateFilter) query = query.eq('rx_date', dateFilter);

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
            <td>${fmtDate(rx.rx_date || rx.created_at?.slice(0,10))}</td>
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
