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
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// Chrome ne prikazuje padajuću listu iz <datalist> na prost fokus/klik praznog polja —
// predlozi se pojave tek kad se otkucaju prva slova. showPicker() eksplicitno otvara tu
// listu odmah pri fokusiranju/kliku. Stariji browseri bez podrške za showPicker() (ili
// poziv van korisničke geste) samo nastavljaju sa uobičajenim ponašanjem — otud try/catch.
function openDatalist(el) {
  if (typeof el.showPicker === 'function') {
    try { el.showPicker(); } catch (err) { /* ignoriši */ }
  }
}

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
