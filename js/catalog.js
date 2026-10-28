// ═══ KATALOG OKVIRA (za sajt) ═══
// Tabela public.frames; fotografije u Storage bucket-u "frame-photos" (javno čitanje,
// upis samo zaposleni). U frames.photos čuvaju se pune javne URL adrese — prva je glavna.

let catalogLoaded = false;
let catalogRows = [];
let catalogDraftPhotos = [];   // URL-ovi fotografija u otvorenoj formi
let catalogRemovedPhotos = []; // URL-ovi uklonjeni u formi (brišu se iz Storage-a pri čuvanju)
let catalogDraftId = null;     // id okvira u formi (za novi okvir generiše se unapred)
let catalogDescLang = 'sr';
let catalogUploading = 0;

const FRAME_GENDERS = { zenski: 'Ženski', muski: 'Muški', uniseks: 'Uniseks', deciji: 'Dečiji' };
const FRAME_CATEGORIES = { opticki: 'Optički', suncani: 'Sunčani' };
const FRAME_MATERIALS = ['metal', 'acetat', 'titan', 'TR90', 'plastika', 'kombinovani'];
const SUN_LENS_TYPES = ['jednobojna', 'gradijent', 'ogledalo', 'fotohromatska'];
const SUN_LENS_MATERIALS = ['staklo', 'polikarbonat', 'CR-39 (organsko)', 'nylon'];
const UV_OPTIONS = ['UV400', '100% UV'];
const MAX_FRAME_PHOTOS = 4;

function frameTitle(f) {
  return `${f.brand || ''} ${f.model || ''}`.trim();
}

function frameStatusPill(f) {
  if (f.is_sold) return '<span class="cat-pill cat-pill-muted">Prodat</span>';
  if (f.is_published) return '<span class="cat-pill cat-pill-ok">Na sajtu</span>';
  return '<span class="cat-pill cat-pill-muted">Skriven</span>';
}

// "58□21 145", "58 21 145", "58/21/145" → "58-21-145"; prazno → null; loše → false
function normalizeFrameSize(v) {
  const s = (v || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{2})\D+(\d{2})\D+(\d{3})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : false;
}

async function loadCatalogSection() {
  catalogLoaded = true;
  const { data, error } = await sb.from('frames').select('*').is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) { toast('Greška pri učitavanju kataloga', true); return; }
  catalogRows = data || [];
  fillCatalogBrandFilter();
  renderCatalogGrid();
}

function fillCatalogBrandFilter() {
  const sel = document.getElementById('catalog-filter-brand');
  const current = sel.value;
  const brands = [...new Set(catalogRows.map(f => (f.brand || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'sr'));
  sel.innerHTML = '<option value="">Svi brendovi</option>' +
    brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
  sel.value = brands.includes(current) ? current : '';
  document.getElementById('frame-brand-list').innerHTML =
    brands.map(b => `<option value="${escapeHtml(b)}"></option>`).join('');
}

function renderCatalogGrid() {
  const q = document.getElementById('catalog-search').value.trim().toLowerCase();
  const brand = document.getElementById('catalog-filter-brand').value;
  const gender = document.getElementById('catalog-filter-gender').value;
  const category = document.getElementById('catalog-filter-category').value;
  const status = document.getElementById('catalog-filter-status').value;

  const rows = catalogRows.filter(f => {
    if (q && !`${f.brand} ${f.model} ${f.code} ${f.color || ''}`.toLowerCase().includes(q)) return false;
    if (brand && f.brand !== brand) return false;
    if (gender && f.gender !== gender) return false;
    if (category && f.category !== category) return false;
    if (status === 'sajt' && !(f.is_published && !f.is_sold)) return false;
    if (status === 'skriven' && (f.is_published || f.is_sold)) return false;
    if (status === 'prodat' && !f.is_sold) return false;
    return true;
  });

  const wrap = document.getElementById('catalog-grid');
  document.getElementById('catalog-count').textContent = `${rows.length} od ${catalogRows.length}`;
  if (!rows.length) {
    wrap.innerHTML = `<div class="empty-state" style="height:auto;padding:40px;grid-column:1/-1;">
      ${catalogRows.length ? 'Nema okvira za izabrane filtere' : 'Katalog je prazan — dodajte prvi okvir'}</div>`;
    return;
  }
  wrap.innerHTML = rows.map(f => `
    <div class="cat-card" onclick="openEditFrameModal('${f.id}')">
      <div class="cat-photo">${f.photos?.[0] ? `<img src="${escapeHtml(f.photos[0])}" alt="" loading="lazy">` : '<span>bez fotografije</span>'}</div>
      <div class="cat-title">${escapeHtml(frameTitle(f))}</div>
      <div class="cat-meta">${escapeHtml(f.code)} · ${FRAME_GENDERS[f.gender] || ''}${f.category === 'suncani' ? ' · sunčani' : ''}</div>
      <div class="cat-meta cat-price">${fmtMoney(f.price)}</div>
      ${frameStatusPill(f)}
    </div>
  `).join('');
}

// ── Forma ──

function openAddFrameModal() {
  fillFrameForm({ id: crypto.randomUUID(), _isNew: true, gender: 'zenski', category: 'opticki', is_published: true, photos: [] });
}

function openEditFrameModal(id) {
  const f = catalogRows.find(x => x.id === id);
  if (f) fillFrameForm(f);
}

function fillFrameForm(f) {
  catalogDraftId = f.id;
  catalogDraftPhotos = [...(f.photos || [])];
  catalogRemovedPhotos = [];
  const v = (id, val) => { document.getElementById(id).value = val ?? ''; };
  document.getElementById('frame-modal-title').textContent = f._isNew ? 'Novi okvir' : frameTitle(f);
  document.getElementById('frame-form').dataset.isNew = f._isNew ? '1' : '';
  v('frame-form-brand', f.brand);
  v('frame-form-model', f.model);
  v('frame-form-code', f.code);
  v('frame-form-price', f.price);
  v('frame-form-gender', f.gender || 'zenski');
  v('frame-form-category', f.category || 'opticki');
  v('frame-form-material', f.material);
  v('frame-form-color', f.color);
  v('frame-form-size', f.size);
  v('frame-form-sun-type', f.sun_lens_type);
  v('frame-form-sun-material', f.sun_lens_material);
  v('frame-form-uv', f.uv_protection);
  v('frame-form-filter', f.filter_category);
  document.getElementById('frame-form-polarized').checked = !!f.polarized;
  ['sr', 'hu', 'en', 'ru'].forEach(l => v(`frame-form-desc-${l}`, f[`desc_${l}`]));
  document.getElementById('frame-form-published').checked = !!f.is_published;
  document.getElementById('frame-form-sold').checked = !!f.is_sold;
  document.getElementById('frame-delete-btn').style.display = f._isNew ? 'none' : '';
  document.getElementById('frame-size-error').style.display = 'none';
  setFrameDescLang('sr');
  toggleFrameSunFields();
  renderFramePhotos();
  openModal('frame-modal');
}

function toggleFrameSunFields() {
  const sun = document.getElementById('frame-form-category').value === 'suncani';
  document.getElementById('frame-sun-fields').style.display = sun ? '' : 'none';
}

function setFrameDescLang(lang) {
  catalogDescLang = lang;
  ['sr', 'hu', 'en', 'ru'].forEach(l => {
    document.getElementById(`frame-form-desc-${l}`).style.display = l === lang ? '' : 'none';
    const btn = document.getElementById(`frame-desc-tab-${l}`);
    btn.classList.toggle('active', l === lang);
    const filled = document.getElementById(`frame-form-desc-${l}`).value.trim();
    btn.classList.toggle('filled', !!filled);
  });
}

function onFrameDescInput() {
  setFrameDescLang(catalogDescLang);
}

function renderFramePhotos() {
  const wrap = document.getElementById('frame-photos');
  const tiles = catalogDraftPhotos.map((url, i) => `
    <div class="frame-photo-tile ${i === 0 ? 'main' : ''}">
      <img src="${escapeHtml(url)}" alt="">
      ${i === 0 ? '<span class="frame-photo-main">glavna</span>' :
        `<button type="button" class="frame-photo-btn left" title="Postavi kao glavnu" onclick="makeFramePhotoMain(${i})">★</button>`}
      <button type="button" class="frame-photo-btn" title="Ukloni" onclick="removeFramePhoto(${i})">×</button>
    </div>
  `).join('');
  const busy = catalogUploading ? `<div class="frame-photo-tile add">Učitavanje…</div>` : '';
  const add = catalogDraftPhotos.length + catalogUploading < MAX_FRAME_PHOTOS
    ? `<label class="frame-photo-tile add">+ Dodaj<input type="file" accept="image/*" multiple onchange="uploadFramePhotos(this.files); this.value='';" style="display:none;"></label>`
    : '';
  wrap.innerHTML = tiles + busy + add;
}

function makeFramePhotoMain(i) {
  const [p] = catalogDraftPhotos.splice(i, 1);
  catalogDraftPhotos.unshift(p);
  renderFramePhotos();
}

function removeFramePhoto(i) {
  const [p] = catalogDraftPhotos.splice(i, 1);
  catalogRemovedPhotos.push(p);
  renderFramePhotos();
}

// Smanjuje fotografiju na najviše 1600 px po dužoj strani (JPEG) — telefonske slike
// od 4–8 MB postaju ~250 KB, sajt se brže učitava, a Storage ne puni.
function compressImage(file, maxSide = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('compress')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')); };
    img.src = url;
  });
}

async function uploadFramePhotos(fileList) {
  const free = MAX_FRAME_PHOTOS - catalogDraftPhotos.length - catalogUploading;
  const files = Array.from(fileList || []).slice(0, Math.max(0, free));
  if (!files.length) return;
  const frameId = catalogDraftId;
  catalogUploading += files.length;
  renderFramePhotos();
  for (const file of files) {
    try {
      const blob = await compressImage(file);
      const path = `${frameId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await sb.storage.from('frame-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      const url = sb.storage.from('frame-photos').getPublicUrl(path).data.publicUrl;
      if (catalogDraftId === frameId) catalogDraftPhotos.push(url);
    } catch (e) {
      console.error('Upload fotografije', e);
      toast('Fotografija nije učitana', true);
    } finally {
      catalogUploading--;
      renderFramePhotos();
    }
  }
}

function storagePathFromUrl(url) {
  const marker = '/frame-photos/';
  const i = (url || '').indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length)) : null;
}

let savingFrame = false;

async function saveFrameForm(e) {
  e.preventDefault();
  if (savingFrame) return;
  if (catalogUploading) { toast('Sačekajte da se fotografije učitaju', true); return; }

  const val = id => document.getElementById(id).value.trim();
  const brand = val('frame-form-brand');
  const model = val('frame-form-model');
  const code = val('frame-form-code');
  if (!brand || !model || !code) { toast('Brend, model i šifra su obavezni', true); return; }

  const size = normalizeFrameSize(val('frame-form-size'));
  if (size === false) {
    document.getElementById('frame-size-error').style.display = '';
    document.getElementById('frame-form-size').focus();
    return;
  }

  const isSun = val('frame-form-category') === 'suncani';
  const filter = val('frame-form-filter');
  const payload = {
    brand, model, code,
    price: Number(val('frame-form-price')) || 0,
    gender: val('frame-form-gender'),
    category: val('frame-form-category'),
    material: val('frame-form-material') || null,
    color: val('frame-form-color') || null,
    size,
    sun_lens_type: isSun ? (val('frame-form-sun-type') || null) : null,
    sun_lens_material: isSun ? (val('frame-form-sun-material') || null) : null,
    uv_protection: isSun ? (val('frame-form-uv') || null) : null,
    filter_category: isSun && filter !== '' ? Number(filter) : null,
    polarized: isSun && document.getElementById('frame-form-polarized').checked,
    desc_sr: val('frame-form-desc-sr') || null,
    desc_hu: val('frame-form-desc-hu') || null,
    desc_en: val('frame-form-desc-en') || null,
    desc_ru: val('frame-form-desc-ru') || null,
    photos: catalogDraftPhotos,
    is_published: document.getElementById('frame-form-published').checked,
    is_sold: document.getElementById('frame-form-sold').checked,
    updated_at: new Date().toISOString(),
  };

  savingFrame = true;
  try {
    const isNew = document.getElementById('frame-form').dataset.isNew === '1';
    const { error } = isNew
      ? await sb.from('frames').insert({ id: catalogDraftId, ...payload })
      : await sb.from('frames').update(payload).eq('id', catalogDraftId);
    if (error) { console.error(error); toast('Greška pri čuvanju okvira', true); return; }

    const paths = catalogRemovedPhotos.map(storagePathFromUrl).filter(Boolean);
    if (paths.length) await sb.storage.from('frame-photos').remove(paths);
    catalogRemovedPhotos = [];

    toast(isNew ? 'Okvir dodat' : 'Okvir sačuvan');
    closeModal('frame-modal');
    await loadCatalogSection();
  } finally {
    savingFrame = false;
  }
}

// Zatvaranje forme bez čuvanja: fotografije učitane u ovoj sesiji forme, a nesačuvane,
// brišu se iz Storage-a da ne ostanu "siročići".
async function cancelFrameForm() {
  const saved = catalogRows.find(x => x.id === catalogDraftId)?.photos || [];
  const orphans = catalogDraftPhotos.filter(u => !saved.includes(u)).map(storagePathFromUrl).filter(Boolean);
  closeModal('frame-modal');
  if (orphans.length) await sb.storage.from('frame-photos').remove(orphans);
}

async function deleteFrame() {
  if (!confirm('Obrisati okvir iz kataloga? Skinuće se i sa sajta.')) return;
  const { error } = await sb.from('frames')
    .update({ deleted_at: new Date().toISOString(), is_published: false }).eq('id', catalogDraftId);
  if (error) { toast('Greška pri brisanju', true); return; }
  toast('Okvir obrisan');
  closeModal('frame-modal');
  await loadCatalogSection();
}

function initCatalogFormLists() {
  const fill = (id, items) => { document.getElementById(id).innerHTML = items.map(x => `<option value="${escapeHtml(x)}"></option>`).join(''); };
  fill('frame-material-list', FRAME_MATERIALS);
  fill('sun-type-list', SUN_LENS_TYPES);
  fill('sun-material-list', SUN_LENS_MATERIALS);
  fill('uv-list', UV_OPTIONS);
}
