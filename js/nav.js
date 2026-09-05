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
// (Backquote — na EN rasporedu je to `~`, na RU rasporedu "ё", na SR latiničnom "‚";
// e.code je isti bez obzira na raspored tastature, pa prečica radi identično na svima).
// Otvara "Novi pacijent" kad je aktivna sekcija Klijenti, van polja za unos i van
// otvorenog modala — da se ne aktivira dok se kuca tekst koji sadrži taj znak.
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

// Čišćenje znaka koji "procuri" iz prečice u polje Ime.
//
// Taster levo od "1" je na srpskoj (i hrvatskoj) latiničnoj raspored MRTAV TASTER
// (dead key): sam po sebi ne ispisuje ništa, nego čeka sledeće slovo da se spoje. Kad
// se spajanje ne desi (npr. sledeće slovo je "V"), OS ispusti taj znak samostalno —
// kao "‚" (U+201A). Zato preventDefault() na keydown ovde ne pomaže: znak ne dolazi iz
// tog pritiska, nego ga OS ubaci ZAJEDNO SA PRVIM STVARNIM SLOVOM koje Ana otkuca u
// novootvorenom polju (otud "‚Vuk" umesto "Vuk"). Na ruskom rasporedu isti taster daje
// "ё", na engleskom "`" — svi ti znaci mogu da procure na isti način.
//
// Raniji pokušaj je brisao samo unos koji stigne PRE prvog pravog keydown-a, pa ovaj
// slučaj nije hvatao (znak stiže u istom potezu sa slovom). Sada, kratko nakon
// otvaranja forme prečicom, sa početka teksta skidamo eventualni procureli znak —
// ostatak (stvarno otkucano ime) ostaje netaknut. Skida se samo sa POČETKA i samo u
// prvih nekoliko sekundi posle prečice, pa normalan unos ne može da strada.
const SHORTCUT_LEAK_CHARS = /^[`~ё‚‛„‘’¸¨°'"]+/;
const SHORTCUT_GUARD_MS = 5000;

function guardAgainstLeakedShortcutChar() {
  setTimeout(() => {
    const form = document.getElementById('patient-form');
    if (!form) return;
    const fields = Array.from(form.querySelectorAll('input[type="text"]'));
    if (!fields.length) return;

    const stop = () => fields.forEach(f => f.removeEventListener('input', strip));
    function strip(e) {
      const el = e.target;
      const cleaned = el.value.replace(SHORTCUT_LEAK_CHARS, '');
      if (cleaned !== el.value) {
        el.value = cleaned;
        if (typeof el.setSelectionRange === 'function') el.setSelectionRange(cleaned.length, cleaned.length);
        // Provera duplikata je već pozvana sa "prljavom" vrednošću — ponavljamo je sa čistom.
        if (typeof checkDuplicatePatient === 'function') checkDuplicatePatient();
      }
    }

    fields.forEach(f => f.addEventListener('input', strip));
    setTimeout(stop, SHORTCUT_GUARD_MS);
  }, 0);
}
