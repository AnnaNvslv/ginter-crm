async function login(name, password) {
  const { data, error } = await sb
    .from('users')
    .select('id, name, role, password')
    .eq('name', name)
    .single();

  if (error || !data || data.password !== password) {
    return { ok: false };
  }

  localStorage.setItem('ginter_user', JSON.stringify({ id: data.id, name: data.name, role: data.role }));
  return { ok: true };
}

function getCurrentUser() {
  const raw = localStorage.getItem('ginter_user');
  return raw ? JSON.parse(raw) : null;
}

function logout() {
  localStorage.removeItem('ginter_user');
  location.href = 'index.html';
}

function requireAuth() {
  if (!getCurrentUser()) location.href = 'index.html';
}
