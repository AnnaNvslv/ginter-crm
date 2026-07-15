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
