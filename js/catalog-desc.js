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

// Kratak, činjeničan opis: ne ponavlja parametre (oni se na sajtu prikazuju posebno).
// Bez reči „recept".
const DESC_TEXT = {
  introOptical: {
    sr: n => `${n} je medicinski okvir pogodan za višekratnu ugradnju dioptrijskih sočiva.`,
    hu: n => `${n} – gyógyászati szemüvegkeret, amelybe a dioptriás lencsék többször is beépíthetők.`,
    en: n => `${n} is a medical optical frame suitable for repeated fitting of corrective lenses.`,
    ru: n => `${n} — медицинская оправа, подходящая для многократной установки диоптрийных линз.`,
  },
  introSun: {
    sr: n => `${n} su sunčane naočare za svakodnevnu zaštitu očiju od jakog svetla.`,
    hu: n => `${n} – napszemüveg a szem mindennapi védelmére az erős fény ellen.`,
    en: n => `${n} are sunglasses for everyday protection from bright light.`,
    ru: n => `${n} — солнцезащитные очки для ежедневной защиты глаз от яркого света.`,
  },
  introSunKids: {
    sr: n => `${n} su dečije sunčane naočare koje štite osetljive oči deteta od sunca.`,
    hu: n => `${n} – gyermek napszemüveg, amely óvja a gyermek érzékeny szemét a naptól.`,
    en: n => `${n} are children's sunglasses that protect sensitive young eyes from the sun.`,
    ru: n => `${n} — детские солнцезащитные очки, которые берегут чувствительные глаза ребёнка от солнца.`,
  },
  lensType: {
    gradijent: {
      sr: 'Gradijentna sočiva su tamnija u gornjem i svetlija u donjem delu: štite od sunca, a ne smetaju kada pogledate u telefon ili knjigu.',
      hu: 'A színátmenetes lencsék felül sötétebbek, alul világosabbak: védenek a naptól, és nem zavarnak, ha a telefonra vagy egy könyvre néz.',
      en: 'Gradient lenses are darker at the top and lighter at the bottom: they shade your eyes without getting in the way when you look down at a phone or a book.',
      ru: 'Градиентные линзы темнее сверху и светлее снизу: защищают от солнца и не мешают, когда смотрите в телефон или книгу.',
    },
    ogledalo: {
      sr: 'Ogledalski sloj dodatno odbija jako svetlo, što je korisno na vodi, snegu i plaži.',
      hu: 'A tükrös bevonat további erős fényt ver vissza, ami víz mellett, havon és a strandon hasznos.',
      en: 'The mirrored coating reflects extra glare, which helps by the water, on snow and at the beach.',
      ru: 'Зеркальное покрытие дополнительно отражает яркий свет — это удобно у воды, на снегу и на пляже.',
    },
    fotohromatska: {
      sr: 'Fotohromatska sočiva tamne na suncu i posvetle u zatvorenom prostoru.',
      hu: 'A fotokromatikus lencsék napfényben besötétednek, beltérben kivilágosodnak.',
      en: 'Photochromic lenses darken in sunlight and clear up indoors.',
      ru: 'Фотохромные линзы темнеют на солнце и светлеют в помещении.',
    },
    jednobojna: {
      sr: 'Jednobojna sočiva ravnomerno smanjuju jačinu svetla u celom vidnom polju.',
      hu: 'Az egyszínű lencsék a teljes látómezőben egyenletesen csökkentik a fényerőt.',
      en: 'Solid-tint lenses reduce brightness evenly across the whole field of view.',
      ru: 'Однотонные линзы равномерно снижают яркость по всему полю зрения.',
    },
  },
  polarized: {
    sr: 'Polarizovana sočiva uklanjaju odsjaj sa vode, mokrog puta i snega, pa je slika jasnija, a oči se manje umaraju, posebno tokom vožnje.',
    hu: 'A polarizált lencsék kiszűrik a víz, a nedves úttest és a hó tükröződését: a kép élesebb, a szem kevésbé fárad, különösen vezetés közben.',
    en: 'Polarized lenses remove glare from water, wet roads and snow, giving a sharper image and less eye strain, especially when driving.',
    ru: 'Поляризационные линзы убирают блики от воды, мокрой дороги и снега: изображение чётче, глаза меньше устают, особенно за рулём.',
  },
  uv: {
    sr: 'Zaštita UV400 blokira UVA i UVB zračenje.',
    hu: 'Az UV400 védelem kiszűri az UVA- és UVB-sugárzást.',
    en: 'UV400 protection blocks UVA and UVB radiation.',
    ru: 'Защита UV400 блокирует ультрафиолет UVA и UVB.',
  },
  filter: {
    0: { sr: 'Kategorija filtera 0 je za oblačno vreme i zatvoren prostor.', hu: 'A 0-s szűrőkategória borús időre és beltérre való.', en: 'Filter category 0 is for overcast weather and indoors.', ru: 'Категория фильтра 0 — для пасмурной погоды и помещений.' },
    1: { sr: 'Kategorija filtera 1 je za slabo sunce.', hu: 'Az 1-es szűrőkategória gyenge napfényre való.', en: 'Filter category 1 is for weak sunlight.', ru: 'Категория фильтра 1 — для неяркого солнца.' },
    2: { sr: 'Kategorija filtera 2 je za umereno sunce, pogodna za grad i svakodnevno nošenje.', hu: 'A 2-es szűrőkategória mérsékelt napfényre, városi és mindennapi viseletre való.', en: 'Filter category 2 is for moderate sunlight, suited to the city and everyday wear.', ru: 'Категория фильтра 2 — для умеренного солнца, подходит для города и повседневной носки.' },
    3: { sr: 'Kategorija filtera 3 je za jako sunce: more, planine, letnji dani.', hu: 'A 3-as szűrőkategória erős napfényre való: tenger, hegyek, nyári napok.', en: 'Filter category 3 is for strong sunlight: sea, mountains, summer days.', ru: 'Категория фильтра 3 — для яркого солнца: море, горы, летние дни.' },
    4: { sr: 'Kategorija filtera 4 je za izuzetno jako sunce (visoke planine, glečeri) i nije pogodna za vožnju.', hu: 'A 4-es szűrőkategória rendkívül erős napfényre (magashegység, gleccserek) való, vezetéshez nem alkalmas.', en: 'Filter category 4 is for extremely bright sunlight (high mountains, glaciers) and is not suitable for driving.', ru: 'Категория фильтра 4 — для экстремально яркого солнца (высокогорье, ледники); не подходит для вождения.' },
  },
  clip: {
    sr: 'U kompletu je klip sa polarizovanim sočivima: jednim pokretom okvir postaje sunčane naočare, pa vam ne treba drugi par.',
    hu: 'A csomag polarizált clip-on előtétet tartalmaz: egy mozdulattal napszemüveggé alakítja a keretet, így nincs szükség második szemüvegre.',
    en: 'A polarized clip-on is included: in one move the frame becomes sunglasses, so you don\'t need a second pair.',
    ru: 'В комплекте поляризационная накладка-клипон: одним движением оправа превращается в солнцезащитные очки, и вторая пара не нужна.',
  },
};

function buildFrameDescription(d, lang) {
  const name = `${d.brand} ${d.model}`.trim();
  const isSun = d.category === 'suncani';
  const kids = d.gender === 'deciji';
  const T = DESC_TEXT;
  const parts = [];

  parts.push((isSun ? (kids ? T.introSunKids : T.introSun) : T.introOptical)[lang](name));

  if (isSun) {
    const lt = T.lensType[(d.sun_lens_type || '').trim().toLowerCase()];
    if (lt) parts.push(lt[lang]);
    if (d.polarized) parts.push(T.polarized[lang]);
    if (/400|100/.test(d.uv_protection || '')) parts.push(T.uv[lang]);
    const fc = T.filter[String(d.filter_category)];
    if (fc && d.filter_category !== '' && d.filter_category != null) parts.push(fc[lang]);
  }

  if (d.has_clip_on) parts.push(T.clip[lang]);
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
