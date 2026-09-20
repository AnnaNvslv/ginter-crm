async function login(name, password) {
  const { data, error } = await sb.rpc('verify_login', { p_name: name, p_password: password });

  if (error || !data || !data.length) {
    return { ok: false };
  }

  const user = data[0];
  localStorage.setItem('ginter_user', JSON.stringify({ id: user.id, name: user.name, role: user.role }));
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
