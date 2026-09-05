function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString('sr-RS', { minimumFractionDigits: 0 }) + ' RSD';
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function lensTotal(priceUnit, discountPct, qty) {
  const p = Number(priceUnit) || 0;
  const disc = Number(discountPct) || 0;
  const q = Number(qty) || 0;
  return Math.round(p * q * (1 - disc / 100));
}

function clTotal(price, qty) {
  return Math.round((Number(price) || 0) * (Number(qty) || 0));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:${isError ? '#C0392B' : '#1A6DB5'};color:#fff;padding:14px 24px;
    border-radius:12px;font-size:16px;font-weight:600;z-index:200;box-shadow:0 4px 16px rgba(0,0,0,0.2);`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add('active');
  setTimeout(() => {
    const first = modal.querySelector(
      'form input:not([type="hidden"]):not(:disabled), form select:not(:disabled), form textarea:not(:disabled)'
    );
    if (first && first.offsetParent !== null) {
      first.focus();
      if (typeof first.select === 'function') first.select();
    }
  }, 0);
}
function closeModal(id) {
  acClose();
  document.getElementById(id).classList.remove('active');
}

// ═══ PADAJUĆA LISTA PREDLOGA (zamena za nativni <datalist>) ═══
//
// Nativni <datalist> u Chrome-u se ne ponaša pouzdano: listu ne otvori na klik u prazno
// polje (predlozi se pojave tek posle par otkucanih slova), a kad se otvaranje forsira
// preko showPicker() lista ume da se otvori pa odmah zatvori — "trepće". Zato ovde imamo
// sopstvenu listu: običan DOM element koji mi otvaramo i zatvaramo, pa se ponaša isto u
// svakom browseru i na svakoj mašini.
//
// Ništa se ne menja u HTML-u ni u drugim JS fajlovima: polja i dalje imaju
// list="neka-datalist-lista", a vrednosti se čitaju iz te iste <datalist> liste (koju
// loadLensAutocompleteData() puni iz kataloga). Atribut list= se skida sa polja čim se ono
// pojavi u DOM-u — tako nativna lista nikad ne iskoči i ne može da se sudara sa našom.
//
// Ponašanje: klik ili fokus na polje → ceo spisak; kucanje → filtrira se po unetom tekstu;
// strelice gore/dole → kretanje kroz listu; Enter → uzima označenu stavku (ako nijedna nije
// označena, Enter radi kao i pre — ide na sledeće polje); Esc ili klik van → zatvara.
const AC_MAX_HEIGHT = 280;
let acBox = null;      // jedini plutaјući element liste, deljen za sva polja
let acInput = null;    // polje za koje je lista trenutno otvorena
let acValues = [];     // vrednosti trenutno prikazane u listi
let acIndex = -1;      // označena stavka (-1 = nijedna)
let acQuery = null;    // filter sa kojim je lista poslednji put iscrtana
let acPicking = false; // true dok upisujemo izabranu vrednost (da se lista ne otvori ponovo)

// Skida list="..." sa polja i pamti ga u data-ac-list, da nativna lista ne iskače.
// Radi i za polja koja tek nastanu (redovi stakala se iscrtavaju kroz innerHTML) —
// vidi acObserveNewFields().
function acAdoptFields(root) {
  if (!root || root.nodeType !== 1) return;
  if (root.matches && root.matches('input[list]')) acAdoptField(root);
  if (root.querySelectorAll) root.querySelectorAll('input[list]').forEach(acAdoptField);
}

function acAdoptField(el) {
  const id = el.getAttribute('list');
  if (!id) return;
  el.dataset.acList = id;
  el.removeAttribute('list');
  el.setAttribute('autocomplete', 'off');
}

// Vrednosti za dato polje — čitaju se iz njegove <datalist> liste u trenutku otvaranja,
// pa lista uvek prikazuje ono što je poslednji put učitano iz baze.
function acValuesFor(el) {
  const id = el.dataset.acList;
  const list = id && document.getElementById(id);
  if (!list) return [];
  return Array.from(list.options || []).map(o => o.value).filter(Boolean);
}

function acEnsureBox() {
  if (acBox) return acBox;
  acBox = document.createElement('div');
  acBox.className = 'ac-list';
  acBox.style.cssText = 'position:fixed;z-index:300;display:none;background:#fff;' +
    'border:1px solid var(--border, #E3E8EF);border-radius:12px;padding:4px;' +
    'box-shadow:0 8px 28px rgba(0,0,0,0.18);overflow-y:auto;';
  // Klik na stavku ne sme da oduzme fokus polju pre nego što ga obradimo.
  acBox.addEventListener('mousedown', e => e.preventDefault());
  acBox.addEventListener('click', e => {
    const item = e.target.closest('[data-ac-value]');
    if (item) acPick(item.dataset.acValue);
  });
  document.body.appendChild(acBox);
  return acBox;
}

function acClose() {
  if (acBox) acBox.style.display = 'none';
  acInput = null;
  acValues = [];
  acIndex = -1;
  acQuery = null;
}

// filter === '' znači "prikaži ceo spisak" (klik/fokus); inače se filtrira po unetom tekstu.
function acOpen(el, filter) {
  if (!el || !el.dataset.acList) return;
  const q = (filter || '').trim().toLowerCase();
  // Isti zahtev dok je lista već otvorena (npr. i onfocus i onclick na istom kliku) —
  // ne crtamo ponovo, da lista ne bi treperila.
  if (acInput === el && acQuery === q && acBox && acBox.style.display === 'block') { acPosition(); return; }

  const all = acValuesFor(el);
  const values = q ? all.filter(v => v.toLowerCase().includes(q)) : all;
  if (!values.length) { acClose(); return; }

  const box = acEnsureBox();
  acInput = el; acValues = values; acIndex = -1; acQuery = q;
  box.innerHTML = values.map((v, i) => `<div data-ac-value="${escapeHtml(v)}" data-ac-i="${i}" ` +
    `style="padding:10px 12px;border-radius:8px;cursor:pointer;font-size:16px;">${escapeHtml(v)}</div>`).join('');
  box.style.display = 'block';
  acPosition();
}

function acPosition() {
  if (!acInput || !acBox || acBox.style.display !== 'block') return;
  const r = acInput.getBoundingClientRect();
  const below = window.innerHeight - r.bottom;
  acBox.style.left = Math.round(r.left) + 'px';
  acBox.style.minWidth = Math.round(r.width) + 'px';
  if (below < 160 && r.top > below) {
    // Nema mesta ispod polja — lista ide iznad njega.
    acBox.style.top = 'auto';
    acBox.style.bottom = Math.round(window.innerHeight - r.top + 4) + 'px';
    acBox.style.maxHeight = Math.max(120, Math.min(AC_MAX_HEIGHT, r.top - 12)) + 'px';
  } else {
    acBox.style.bottom = 'auto';
    acBox.style.top = Math.round(r.bottom + 4) + 'px';
    acBox.style.maxHeight = Math.max(120, Math.min(AC_MAX_HEIGHT, below - 12)) + 'px';
  }
}

function acHighlight(i) {
  if (!acBox) return;
  const nodes = acBox.querySelectorAll('[data-ac-value]');
  nodes.forEach(n => { n.style.background = 'transparent'; });
  if (i >= 0 && nodes[i]) {
    nodes[i].style.background = 'var(--section-bg, #F0F6FF)';
    nodes[i].scrollIntoView({ block: 'nearest' });
  }
  acIndex = i;
}

// Upisuje izabranu vrednost i šalje "input" event, pa postojeći oninput handleri
// (npr. onLensNameInput → upis u orderLensesDraft i automatska cena) rade kao i pri kucanju.
function acPick(value) {
  const el = acInput;
  if (!el) return;
  acClose();
  el.value = value;
  acPicking = true;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  acPicking = false;
  el.focus();
}

// Zadržano ime funkcije koju polja pozivaju kroz onfocus/onclick — sada otvara našu listu.
function openDatalist(el) {
  acOpen(el, '');
}

function acFieldOf(target) {
  return target && target.closest ? target.closest('input[data-ac-list]') : null;
}

function initAutocomplete() {
  acAdoptFields(document.body);
  acObserveNewFields();

  document.addEventListener('focusin', e => {
    const el = acFieldOf(e.target);
    if (el) acOpen(el, '');
    else if (acInput) acClose();
  });

  // Klik u polje koje je već fokusirano (listu je u međuvremenu zatvorio Esc ili izbor
  // stavke) — tada focusin ne ide ponovo, pa listu otvaramo odavde. Za prvi klik u
  // nefokusirano polje ovo namerno ne radi ništa: to obrađuje focusin gore, da se lista
  // ne bi otvarala dva puta iz istog klika.
  document.addEventListener('mousedown', e => {
    const el = acFieldOf(e.target);
    if (el) {
      if (document.activeElement === el) setTimeout(() => acOpen(el, ''), 0);
    } else if (!(e.target.closest && e.target.closest('.ac-list'))) acClose();
  });

  document.addEventListener('input', e => {
    if (acPicking) return;
    const el = acFieldOf(e.target);
    if (el) acOpen(el, el.value);
  });

  // Capture faza — da strelice/Enter obradimo pre inline onkeydown handlera polja
  // (handleLensEnterJump) i pre initEnterNavigation() na formi.
  document.addEventListener('keydown', e => {
    if (!acInput || e.target !== acInput) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!acValues.length) return;
      e.preventDefault(); e.stopPropagation();
      const next = e.key === 'ArrowDown'
        ? (acIndex + 1) % acValues.length
        : (acIndex <= 0 ? acValues.length - 1 : acIndex - 1);
      acHighlight(next);
    } else if (e.key === 'Enter') {
      // Samo ako je stavka označena strelicama; inače Enter radi kao i pre.
      if (acIndex >= 0) { e.preventDefault(); e.stopPropagation(); acPick(acValues[acIndex]); }
      else acClose();
    } else if (e.key === 'Escape') {
      if (acBox && acBox.style.display === 'block') { e.stopPropagation(); acClose(); }
    } else if (e.key === 'Tab') {
      acClose();
    }
  }, true);

  window.addEventListener('resize', acPosition);
  document.addEventListener('scroll', acPosition, true);
}

// Redovi stakala se iscrtavaju kroz innerHTML svaki put kad se doda/ukloni red, pa nova
// polja moraju da se "usvoje" (skidanje list=) čim se pojave u DOM-u.
function acObserveNewFields() {
  if (!window.MutationObserver) return;
  new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(n => acAdoptFields(n)));
  }).observe(document.body, { childList: true, subtree: true });
}
document.addEventListener('DOMContentLoaded', initAutocomplete);

// Enter u poljima forme prebacuje fokus na sledeće polje umesto da odmah snimi i zatvori.
// Na poslednjem polju Enter fokusira dugme "Sačuvaj" (sledeći Enter tada zaista snima).
// Textarea i dugmad zadržavaju svoje uobičajeno ponašanje (nova linija / klik).
// Polja sa klasom "enter-skip" (npr. Komentar/Napomene — retko se popunjavaju pri brzom
// unosu) se preskaču u lancu navigacije: Enter ide pravo na sledeće polje posle njih
// (ili na Sačuvaj), umesto da se zaustavi na njima. Ručni klik/Tab u njih i dalje radi
// normalno, kao i Enter unutar njih (nova linija), jer tag==='TEXTAREA' grana ostaje ista.
function initEnterNavigation() {
  document.querySelectorAll('.modal form').forEach(form => {
    if (form.dataset.navBound) return;
    form.dataset.navBound = '1';
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const tag = e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault();
      const fields = Array.from(form.querySelectorAll('input, select, textarea'))
        .filter(el => el.type !== 'hidden' && !el.disabled && el.offsetParent !== null && !el.classList.contains('enter-skip'));
      const idx = fields.indexOf(e.target);
      if (idx === -1) return;
      const next = fields[idx + 1];
      if (next) {
        next.focus();
        if (typeof next.select === 'function') next.select();
      } else {
        form.querySelector('button[type="submit"]')?.focus();
      }
    });
  });
}
document.addEventListener('DOMContentLoaded', initEnterNavigation);

// Jedinstven spisak namena — koristi se i za recepte i za okvire/stakla,
// da bi grupisanje u kartici porudžbine uvek poklopilo recept sa okvirom/staklima.
const PURPOSES = ['za daljinu', 'za blizinu', 'za računar', 'progresivno', 'bifokalno', 'za stalno nošenje'];
const RX_PURPOSES = [...PURPOSES, 'kontaktna sočiva'];

function purposeOptions(selected = '') {
  return PURPOSES.map(p => `<option value="${p}" ${p === selected ? 'selected' : ''}>${p}</option>`).join('');
}

function rxPurposeOptions(selected = '') {
  return RX_PURPOSES.map(p => `<option value="${p}" ${p === selected ? 'selected' : ''}>${p}</option>`).join('');
}

function debounce(fn, wait = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
