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

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

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
