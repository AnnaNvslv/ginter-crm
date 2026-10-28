// ═══ KATALOG: predlozi (pamćenje unetih naziva) i automatski opis na 4 jezika ═══

const FRAME_COLORS_SR = ['crna', 'bela', 'braon', 'havana', 'zlatna', 'srebrna', 'siva', 'plava',
  'zelena', 'crvena', 'bordo', 'roze', 'ljubičasta', 'bež', 'providna'];

// ── Predlozi iz već unetih okvira (da se isti brend/model/boja ne pišu različito) ──

function uniqCI(values) {
  const seen = new Map();
  values.forEach(v => {
    const t = (v || '').trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'sr'));
}

function fillDatalist(id, values) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = values.map(x => `<option value="${escapeHtml(x)}"></option>`).join('');
}

function refreshFrameSuggestions() {
  const rows = catalogRows || [];
  fillDatalist('frame-brand-list', uniqCI(rows.map(f => f.brand)));
  refreshFrameModelSuggestions();
  fillDatalist('frame-color-list', uniqCI([...rows.map(f => f.color), ...FRAME_COLORS_SR]));
  fillDatalist('frame-material-list', uniqCI([...FRAME_MATERIALS, ...rows.map(f => f.material)]));
  fillDatalist('sun-type-list', uniqCI([...SUN_LENS_TYPES, ...rows.map(f => f.sun_lens_type)]));
  fillDatalist('sun-material-list', uniqCI([...SUN_LENS_MATERIALS, ...rows.map(f => f.sun_lens_material)]));
  fillDatalist('uv-list', uniqCI([...UV_OPTIONS, ...rows.map(f => f.uv_protection)]));
}

// Modeli se nude za upisani brend (ako brend još nije upisan — svi modeli).
function refreshFrameModelSuggestions() {
  const brand = (document.getElementById('frame-form-brand')?.value || '').trim().toLowerCase();
  const rows = (catalogRows || []).filter(f => !brand || (f.brand || '').trim().toLowerCase() === brand);
  fillDatalist('frame-model-list', uniqCI(rows.map(f => f.model)));
}

// "ray-ban" → "Ray-Ban" ako je taj brend već upisan; isto za model, boju, materijal.
function canonicalValue(value, existing) {
  const t = (value || '').trim();
  if (!t) return t;
  const hit = existing.find(x => (x || '').trim().toLowerCase() === t.toLowerCase());
  return hit ? hit.trim() : t;
}

// ── Automatski opis ──

const DESC_DICT = {
  material: {
    metal:       { sr: 'metal', hu: 'fém', en: 'metal', ru: 'металл' },
    acetat:      { sr: 'acetat', hu: 'acetát', en: 'acetate', ru: 'ацетат' },
    titan:       { sr: 'titan', hu: 'titán', en: 'titanium', ru: 'титан' },
    tr90:        { sr: 'TR90', hu: 'TR90', en: 'TR90', ru: 'TR90' },
    plastika:    { sr: 'plastika', hu: 'műanyag', en: 'plastic', ru: 'пластик' },
    kombinovani: { sr: 'kombinovani (metal i acetat)', hu: 'kombinált (fém és acetát)', en: 'combined (metal and acetate)', ru: 'комбинированный (металл и ацетат)' },
  },
  color: {
    crna:       { hu: 'fekete', en: 'black', ru: 'чёрный' },
    bela:       { hu: 'fehér', en: 'white', ru: 'белый' },
    braon:      { hu: 'barna', en: 'brown', ru: 'коричневый' },
    havana:     { hu: 'havanna', en: 'havana (tortoiseshell)', ru: 'черепаховый (гавана)' },
    zlatna:     { hu: 'arany', en: 'gold', ru: 'золотой' },
    srebrna:    { hu: 'ezüst', en: 'silver', ru: 'серебристый' },
    siva:       { hu: 'szürke', en: 'grey', ru: 'серый' },
    plava:      { hu: 'kék', en: 'blue', ru: 'синий' },
    zelena:     { hu: 'zöld', en: 'green', ru: 'зелёный' },
    crvena:     { hu: 'piros', en: 'red', ru: 'красный' },
    bordo:      { hu: 'bordó', en: 'burgundy', ru: 'бордовый' },
    roze:       { hu: 'rózsaszín', en: 'pink', ru: 'розовый' },
    'ljubičasta': { hu: 'lila', en: 'purple', ru: 'фиолетовый' },
    'bež':      { hu: 'bézs', en: 'beige', ru: 'бежевый' },
    providna:   { hu: 'átlátszó', en: 'transparent', ru: 'прозрачный' },
  },
  lensType: {
    jednobojna:    { sr: 'jednobojna', hu: 'egyszínű', en: 'solid tint', ru: 'однотонные' },
    gradijent:     { sr: 'gradijent', hu: 'színátmenetes', en: 'gradient', ru: 'градиентные' },
    ogledalo:      { sr: 'sa efektom ogledala', hu: 'tükrös', en: 'mirrored', ru: 'зеркальные' },
    fotohromatska: { sr: 'fotohromatska', hu: 'fotokromatikus', en: 'photochromic', ru: 'фотохромные' },
  },
  lensMaterial: {
    staklo:             { sr: 'staklo (mineralno)', hu: 'üveg (ásványi)', en: 'glass (mineral)', ru: 'стекло (минеральное)' },
    polikarbonat:       { sr: 'polikarbonat', hu: 'polikarbonát', en: 'polycarbonate', ru: 'поликарбонат' },
    'cr-39 (organsko)': { sr: 'CR-39 (organsko)', hu: 'CR-39 (szerves)', en: 'CR-39 (organic)', ru: 'CR-39 (органическое)' },
    nylon:              { sr: 'nylon', hu: 'nylon', en: 'nylon', ru: 'нейлон' },
  },
};

const DESC_GENDER = {
  opticki: {
    sr: { zenski: 'ženski', muski: 'muški', uniseks: 'uniseks', deciji: 'dečiji' },
    hu: { zenski: 'női', muski: 'férfi', uniseks: 'uniszex', deciji: 'gyermek' },
    en: { zenski: "women's", muski: "men's", uniseks: 'unisex', deciji: "children's" },
    ru: { zenski: 'женская', muski: 'мужская', uniseks: 'унисекс', deciji: 'детская' },
  },
  suncani: {
    sr: { zenski: 'ženske', muski: 'muške', uniseks: 'uniseks', deciji: 'dečije' },
    hu: { zenski: 'női', muski: 'férfi', uniseks: 'uniszex', deciji: 'gyermek' },
    en: { zenski: "women's", muski: "men's", uniseks: 'unisex', deciji: "children's" },
    ru: { zenski: 'женские', muski: 'мужские', uniseks: 'унисекс', deciji: 'детские' },
  },
};

// Vrednost iz rečnika; nepoznata (ručno upisana) vrednost ostaje kako je upisana.
function descTerm(group, value, lang) {
  const v = (value || '').trim();
  if (!v) return '';
  const entry = DESC_DICT[group][v.toLowerCase()];
  if (!entry) return v;
  return entry[lang] || v;
}

// Boja može biti "crna / zlatna" — prevodi se svaki deo.
function descColor(value, lang) {
  const v = (value || '').trim();
  if (!v) return '';
  if (lang === 'sr') return v;
  return v.split(/\s*([\/,])\s*/).map(part =>
    part === '/' || part === ',' ? part : (DESC_DICT.color[part.toLowerCase()]?.[lang] || part)
  ).join(' ').replace(/\s+([,])/g, '$1').replace(/\s*\/\s*/g, ' / ');
}

function descSize(size, lang) {
  if (!size) return '';
  const [a, b, c] = size.split('-');
  return {
    sr: `Veličina: ${size} (širina sočiva ${a} mm, most ${b} mm, dužina drški ${c} mm).`,
    hu: `Méret: ${size} (lencseszélesség ${a} mm, híd ${b} mm, szárhossz ${c} mm).`,
    en: `Size: ${size} (lens width ${a} mm, bridge ${b} mm, temple length ${c} mm).`,
    ru: `Размер: ${size} (ширина линзы ${a} мм, мост ${b} мм, длина заушника ${c} мм).`,
  }[lang];
}

function buildFrameDescription(d, lang) {
  const name = `${d.brand} ${d.model}`.trim();
  const isSun = d.category === 'suncani';
  const g = DESC_GENDER[isSun ? 'suncani' : 'opticki'][lang][d.gender] || '';
  const mat = descTerm('material', d.material, lang);
  const col = descColor(d.color, lang);
  const parts = [];

  if (!isSun) {
    parts.push({
      sr: `${name} — ${g} optički okvir za izradu naočara sa korektivnim sočivima.`,
      hu: `${name} — ${g} optikai keret korrekciós lencsés szemüveg készítéséhez.`,
      en: `${name} — ${g} optical frame for glasses with corrective lenses.`,
      ru: `${name} — ${g} медицинская оправа для изготовления очков с корригирующими линзами.`,
    }[lang]);
    if (mat) parts.push({ sr: `Materijal okvira: ${mat}.`, hu: `Keret anyaga: ${mat}.`, en: `Frame material: ${mat}.`, ru: `Материал оправы: ${mat}.` }[lang]);
    if (col) parts.push({ sr: `Boja: ${col}.`, hu: `Szín: ${col}.`, en: `Colour: ${col}.`, ru: `Цвет: ${col}.` }[lang]);
  } else {
    parts.push({
      sr: `${name} — ${g} sunčane naočare.`,
      hu: `${name} — ${g} napszemüveg.`,
      en: `${name} — ${g} sunglasses.`,
      ru: `${name} — ${g} солнцезащитные очки.`,
    }[lang]);
    const frame = [mat, col].filter(Boolean).join(', ');
    if (frame) parts.push({ sr: `Okvir: ${frame}.`, hu: `Keret: ${frame}.`, en: `Frame: ${frame}.`, ru: `Оправа: ${frame}.` }[lang]);
    const lens = [
      descTerm('lensType', d.sun_lens_type, lang),
      descTerm('lensMaterial', d.sun_lens_material, lang),
      d.polarized ? { sr: 'polarizovana', hu: 'polarizált', en: 'polarized', ru: 'поляризационные' }[lang] : '',
    ].filter(Boolean).join(', ');
    if (lens) parts.push({ sr: `Sočiva: ${lens}.`, hu: `Lencse: ${lens}.`, en: `Lenses: ${lens}.`, ru: `Линзы: ${lens}.` }[lang]);
    if (d.uv_protection) parts.push({ sr: `UV zaštita: ${d.uv_protection}.`, hu: `UV-védelem: ${d.uv_protection}.`, en: `UV protection: ${d.uv_protection}.`, ru: `Защита от УФ: ${d.uv_protection}.` }[lang]);
    if (d.filter_category !== '' && d.filter_category != null) parts.push({ sr: `Kategorija filtera: ${d.filter_category}.`, hu: `Szűrőkategória: ${d.filter_category}.`, en: `Filter category: ${d.filter_category}.`, ru: `Категория фильтра: ${d.filter_category}.` }[lang]);
  }

  if (d.has_clip_on) {
    parts.push({
      sr: 'U kompletu je nastavak (klip) sa polarizovanim sočivima koji se postavlja na okvir i štiti od sunca.',
      hu: 'A csomag tartalmaz egy polarizált lencsés előtétet (clip-on), amely a keretre helyezhető napvédelemhez.',
      en: 'Includes a clip-on attachment with polarized lenses that fits onto the frame for sun protection.',
      ru: 'В комплекте накладка (клипон) с поляризационными линзами, которая крепится на оправу и защищает от солнца.',
    }[lang]);
  }

  const size = descSize(d.size, lang);
  if (size) parts.push(size);
  return parts.join(' ');
}

function generateFrameDescriptions() {
  const val = id => document.getElementById(id).value.trim();
  const d = {
    brand: val('frame-form-brand'),
    model: val('frame-form-model'),
    category: val('frame-form-category'),
    gender: val('frame-form-gender'),
    material: val('frame-form-material'),
    color: val('frame-form-color'),
    size: normalizeFrameSize(val('frame-form-size')),
    sun_lens_type: val('frame-form-sun-type'),
    sun_lens_material: val('frame-form-sun-material'),
    uv_protection: val('frame-form-uv'),
    filter_category: val('frame-form-filter'),
    polarized: document.getElementById('frame-form-polarized').checked,
    has_clip_on: document.getElementById('frame-form-clip').checked,
  };
  if (!d.brand || !d.model) { toast('Prvo upišite brend i model', true); return; }
  // Ispravi pisanje prema ranije unetim okvirima i upiši nazad u polja.
  const others = (catalogRows || []).filter(x => x.id !== catalogDraftId);
  d.brand = canonicalValue(d.brand, others.map(x => x.brand));
  d.model = canonicalValue(d.model, others.filter(x => (x.brand || '').toLowerCase() === d.brand.toLowerCase()).map(x => x.model));
  document.getElementById('frame-form-brand').value = d.brand;
  document.getElementById('frame-form-model').value = d.model;
  if (d.size === false) {
    document.getElementById('frame-size-error').style.display = '';
    toast('Veličina mora biti u formatu 58-21-145', true);
    return;
  }

  const missing = [];
  if (!d.material) missing.push('materijal');
  if (!d.color) missing.push('boja');
  if (!d.size) missing.push('veličina');
  if (d.category === 'suncani') {
    if (!d.sun_lens_type) missing.push('vrsta sočiva');
    if (!d.uv_protection) missing.push('UV zaštita');
  }
  if (missing.length && !confirm(`Nisu popunjeni: ${missing.join(', ')}.\nOpis će biti bez tih podataka. Nastaviti?`)) return;

  const langs = ['sr', 'hu', 'en', 'ru'];
  const hasText = langs.some(l => val(`frame-form-desc-${l}`));
  if (hasText && !confirm('Postojeći opis na svim jezicima biće zamenjen novim. Nastaviti?')) return;

  langs.forEach(l => { document.getElementById(`frame-form-desc-${l}`).value = buildFrameDescription(d, l); });
  setFrameDescLang(catalogDescLang);
  toast('Opis dodat na 4 jezika — proverite i po potrebi dopunite');
}

// ── Povezivanje sa formom (omotači oko funkcija iz catalog.js) ──
(function wireCatalogSuggestions() {
  const origFill = fillCatalogBrandFilter;
  fillCatalogBrandFilter = function (...args) {
    origFill.apply(this, args);
    refreshFrameSuggestions();
  };

  const origFillForm = fillFrameForm;
  fillFrameForm = function (...args) {
    origFillForm.apply(this, args);
    refreshFrameSuggestions();
  };

  // Pre čuvanja: brend/model/boja/materijal dobijaju isto pisanje kao u ranijim okvirima.
  const origSave = saveFrameForm;
  saveFrameForm = function (e) {
    const el = id => document.getElementById(id);
    const others = (catalogRows || []).filter(x => x.id !== catalogDraftId);
    el('frame-form-brand').value = canonicalValue(el('frame-form-brand').value, others.map(x => x.brand));
    const brand = el('frame-form-brand').value.trim().toLowerCase();
    el('frame-form-model').value = canonicalValue(el('frame-form-model').value,
      others.filter(x => (x.brand || '').trim().toLowerCase() === brand).map(x => x.model));
    el('frame-form-material').value = canonicalValue(el('frame-form-material').value, [...FRAME_MATERIALS, ...others.map(x => x.material)]);
    el('frame-form-color').value = canonicalValue(el('frame-form-color').value, [...FRAME_COLORS_SR, ...others.map(x => x.color)]);
    return origSave.call(this, e);
  };

  initCatalogFormLists = function () { refreshFrameSuggestions(); };
})();
