// Вход через Supabase Auth. Кнопки Ervin/Bojana/Anna сохранены — имя → служебный email.
const STAFF = {
  Ervin:  { email: 'ervin@ginter-crm.local',  role: 'staff' },
  Bojana: { email: 'bojana@ginter-crm.local', role: 'staff' },
  Anna:   { email: 'anna@ginter-crm.local',   role: 'admin' },
};

async function login(name, password) {
  const s = STAFF[name];
  if (!s) return { ok: false };

  const { data, error } = await sb.auth.signInWithPassword({ email: s.email, password });
  if (error || !data?.session) return { ok: false };

  localStorage.setItem('ginter_user', JSON.stringify({ id: data.user.id, name, role: s.role }));
  return { ok: true };
}

function getCurrentUser() {
  const raw = localStorage.getItem('ginter_user');
  return raw ? JSON.parse(raw) : null;
}

async function logout() {
  try { await sb.auth.signOut(); } catch (e) {}
  localStorage.removeItem('ginter_user');
  location.href = 'index.html';
}

function requireAuth() {
  if (!getCurrentUser()) { location.href = 'index.html'; return; }
  sb.auth.getSession().then(({ data }) => {
    if (!data?.session) {
      localStorage.removeItem('ginter_user');
      location.href = 'index.html';
    }
  });
}
