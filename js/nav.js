let currentSection = 'clients';

function switchSection(section) {
  currentSection = section;
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.toggle('active', el.dataset.section === section));
  document.querySelectorAll('.section-body').forEach(el => el.classList.toggle('active', el.id === `section-${section}`));

  if (section === 'orders' && !ordersLoaded) loadOrdersSection(true);
  if (section === 'exams' && !examsLoaded) loadExamsSection(true);
  if (section === 'debts') loadDebtsSection();
}

async function goToPatient(patientId, tab) {
  switchSection('clients');
  await openPatient(patientId);
  if (tab) await switchTab(tab);
}

// Prečica za brzi unos mnogo starih pacijenata: fizičko dugme desno od "1"
// (Backquote — na EN rasporedu je to `~`, na RU rasporedu "ё"; e.code je isti bez
// obzira na raspored tastature, pa prečica radi identično na oba). Otvara "Novi
// pacijent" kad je aktivna sekcija Klijenti, van polja za unos i van otvorenog modala
// — da se ne aktivira dok se kuca tekst koji sadrži taj znak.
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Backquote') return;
  const activeTag = document.activeElement && document.activeElement.tagName;
  const inField = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';
  // Ako se ovaj taster i dalje fizički drži (OS auto-repeat) dok je fokus već
  // unutar polja otvorenog modala, to je rep istog pritiska koji je maločas
  // otvorio "Novi pacijent" i prebacio fokus u prvo polje — ne sme da procuri
  // kao slovo u to polje. preventDefault() ovde ne otvara modal ponovo, samo
  // guta te repeat-evente dok se taster fizički ne pusti.
  if (e.repeat && inField && document.querySelector('.modal-overlay.active')) {
    e.preventDefault();
    return;
  }
  if (inField) return;
  if (currentSection !== 'clients') return;
  if (document.querySelector('.modal-overlay.active')) return;
  e.preventDefault();
  openAddPatientModal();
  guardAgainstLeakedShortcutChar();
});

// I posle preventDefault() na sam keydown, znak ovog tastera ipak zna da stigne u polje
// "Ime" pošto se fokus premesti tamo asinhrono (openModal() koristi setTimeout) — na RU
// rasporedu ovaj fizički taster kuca "ё" direktno (nije IME kompozicija kao kod
// kineskog/japanskog unosa), pa provera samo na isComposing/insertCompositionText
// (raniji pokušaj popravke) ne hvata ovo curenje: stiže kao običan "insertText" input
// event, bez ikakvog prethodnog pravog keydown-a NA TOM POLJU.
//
// Zato ovde ne gledamo tip input eventa uopšte — samo da li je pre njega na ovom polju
// već registrovan pravi fizički keydown (Anin sledeći stvarni pritisak tastera). Ako
// nije, curenje se briše. Prozor od ~200ms (ne samo "prvi sledeći input") pokriva i
// slučaj kad znak stigne u dva navrata (prazan pa pravi event).
function guardAgainstLeakedShortcutChar() {
  setTimeout(() => {
    const field = document.getElementById('patient-form-first-name');
    if (!field) return;
    let realKeySeen = false;
    let timer;
    const cleanup = () => {
      field.removeEventListener('keydown', onKeydown, true);
      field.removeEventListener('input', onInput);
      clearTimeout(timer);
    };
    const onKeydown = () => {
      realKeySeen = true;
      cleanup();
    };
    const onInput = () => {
      if (!realKeySeen) field.value = '';
    };
    field.addEventListener('keydown', onKeydown, { capture: true });
    field.addEventListener('input', onInput);
    timer = setTimeout(cleanup, 200);
  }, 0);
}
