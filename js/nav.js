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

// I posle preventDefault() na sam keydown, na nekim raspored/OS kombinacijama znak
// ovog tastera ipak stigne u polje — ali kroz IME/composition mehanizam koji ide
// odvojeno od običnog unosa (Chrome ga tada obeleži kao inputType
// "insertCompositionText"/"insertFromComposition" ili event.isComposing=true), pa ga
// keydown.preventDefault() ne može sprečiti. To stiže asinhrono, tačno u trenutku kad
// se fokus premesti u prvo polje novog popapa — pre nego što Anna stigne da pritisne
// ijedan pravi taster. Ovde hvatamo baš taj prvi "input" event na polju: ako nosi
// obeležje composition-a, brišemo ga (jednom); ako je to obično kucanje (pravi
// keydown je već stigao), ne diramo ništa.
function guardAgainstLeakedShortcutChar() {
  setTimeout(() => {
    const field = document.getElementById('patient-form-first-name');
    if (!field) return;
    let realKeySeen = false;
    const onKeydown = () => { realKeySeen = true; };
    const onInput = (ev) => {
      if (!realKeySeen && (ev.isComposing || ev.inputType === 'insertCompositionText' || ev.inputType === 'insertFromComposition')) {
        field.value = '';
      }
      field.removeEventListener('keydown', onKeydown, true);
    };
    field.addEventListener('keydown', onKeydown, { capture: true, once: true });
    field.addEventListener('input', onInput, { once: true });
  }, 0);
}
