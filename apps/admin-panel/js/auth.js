// ============================================
// SGC ADMIN - Auth
// ============================================

const TOKEN_KEY = 'sgc_token';
const USER_KEY = 'sgc_user';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch { return null; }
}

function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const resp = await fetch(url, { ...options, headers });
  if (resp.status === 401) {
    clearSession();
    showLogin();
    throw new Error('Sesión expirada');
  }
  return resp;
}

async function doLogin(username, password) {
  const resp = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await resp.json();
  if (!data.success) {
    throw new Error(data.error || 'Error al iniciar sesión');
  }
  setSession(data.token, data.user);
  return data.user;
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  const user = getUser();
  if (user) {
    document.getElementById('user-info').textContent = `${user.nombre} (${user.username})`;
  }
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('sgc-toast');
  const body = document.getElementById('toast-body');
  const title = document.getElementById('toast-title');
  title.textContent = type === 'error' ? '❌ Error' : (type === 'warning' ? '⚠️ Aviso' : '✅ Éxito');
  body.textContent = message;
  toast.className = 'toast';
  if (type === 'error') toast.classList.add('text-bg-danger');
  else if (type === 'warning') toast.classList.add('text-bg-warning');
  else toast.classList.add('text-bg-success');
  const bs = new bootstrap.Toast(toast);
  bs.show();
}

// === Bind login form ===
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errDiv = document.getElementById('login-error');
      const btn = document.getElementById('login-btn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ingresando...';
      try {
        await doLogin(username, password);
        errDiv.style.display = 'none';
        showApp();
        loadDashboard();
      } catch (err) {
        errDiv.textContent = err.message;
        errDiv.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Ingresar';
      }
    });
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearSession();
      showLogin();
    });
  }

  // Auto-login si hay token
  if (getToken()) {
    const user = getUser();
    if (user) {
      showApp();
      loadDashboard();
    }
  }
});
