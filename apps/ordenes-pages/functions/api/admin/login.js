// ============================================
// API: LOGIN ADMIN (sgc-ordenes)
// Alineado con sgc-admin: usa columna username + SHA-256 password
// Credenciales: admin / admin123
// ============================================

import { chileNow } from '../../lib/db-helpers.js';

// SHA-256 (Web Crypto API)
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const data = await request.json();
    const usuario = (data.usuario || data.username || '').trim();
    const password = (data.password || '').trim();

    if (!usuario || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Usuario y contraseña requeridos' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    // Crear tabla AdminUsers si no existe (schema alineado con sgc-admin)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS AdminUsers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nombre TEXT,
      rol TEXT NOT NULL DEFAULT 'admin',
      activo INTEGER DEFAULT 1,
      ultimo_login TEXT,
      fecha_creacion TEXT DEFAULT (datetime('now', '-3 hours'))
    )`).run();

    // Migracion: si existe columna legacy 'usuario', copiarla a 'username'
    try {
      const cols = await env.DB.prepare("PRAGMA table_info(AdminUsers)").all();
      const colNames = (cols.results || []).map(c => c.name);
      if (colNames.includes('usuario') && !colNames.includes('username')) {
        await env.DB.prepare("ALTER TABLE AdminUsers RENAME COLUMN usuario TO username").run();
      }
    } catch (e) {
      // Si la migracion falla, probablemente ya esta migrada o no existe la columna
    }

    // Verificar si existe el admin default, si no crearlo
    const adminCount = await env.DB.prepare('SELECT COUNT(*) as c FROM AdminUsers').first();
    if (adminCount.c === 0) {
      // Admin default: admin / admin123 (hash SHA-256)
      const hash = await sha256('admin123');
      await env.DB.prepare(
        "INSERT INTO AdminUsers (username, password_hash, nombre, rol) VALUES (?, ?, ?, ?)"
      ).bind('admin', hash, 'Administrador SGC', 'admin').run();
    }

    // Buscar usuario por username
    const passwordHash = await sha256(password);
    const user = await env.DB.prepare(
      'SELECT id, username, password_hash, nombre, rol, activo FROM AdminUsers WHERE username = ? AND activo = 1'
    ).bind(usuario).first();

    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Usuario no encontrado' }), {
        headers: { 'Content-Type': 'application/json' }, status: 401
      });
    }

    // Verificar password (SHA-256 hash)
    if (user.password_hash !== passwordHash) {
      return new Response(JSON.stringify({ success: false, error: 'Contraseña incorrecta' }), {
        headers: { 'Content-Type': 'application/json' }, status: 401
      });
    }

    // Actualizar ultimo_login
    await env.DB.prepare(
      "UPDATE AdminUsers SET ultimo_login = datetime('now', '-3 hours') WHERE id = ?"
    ).bind(user.id).run();

    // Generar token de sesion (valido 24 horas Chile)
    const token = 'sgc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    const _now = new Date();
    const _utc = _now.getTime() + _now.getTimezoneOffset() * 60000;
    const _chile24h = new Date(_utc + (-3 * 60 * 60000) + 24 * 60 * 60 * 1000);
    const expira = _chile24h.toISOString();

    // Crear tabla SesionesAdmin si no existe
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS SesionesAdmin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expira DATETIME NOT NULL,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    await env.DB.prepare(
      'INSERT INTO SesionesAdmin (username, token, expira) VALUES (?, ?, ?)'
    ).bind(usuario, token, expira).run();

    return new Response(JSON.stringify({
      success: true,
      token: token,
      nombre: user.nombre || usuario,
      usuario: user.username,
      expira: expira
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error login:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response(JSON.stringify({ success: false, error: 'Token requerido' }), {
      headers: { 'Content-Type': 'application/json' }, status: 400
    });
  }

  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS SesionesAdmin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expira DATETIME NOT NULL,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // Compatibilidad: si existe columna 'usuario' mapearla
    try {
      const cols = await env.DB.prepare("PRAGMA table_info(SesionesAdmin)").all();
      const colNames = (cols.results || []).map(c => c.name);
      if (colNames.includes('usuario') && !colNames.includes('username')) {
        await env.DB.prepare("ALTER TABLE SesionesAdmin RENAME COLUMN usuario TO username").run();
      }
    } catch (e) {}

    const session = await env.DB.prepare(
      `SELECT username, expira FROM SesionesAdmin WHERE token = ? AND expira > ${chileNow()}`
    ).bind(token).first();

    if (!session) {
      return new Response(JSON.stringify({ success: false, error: 'Sesión expirada' }), {
        headers: { 'Content-Type': 'application/json' }, status: 401
      });
    }

    return new Response(JSON.stringify({ success: true, usuario: session.username, username: session.username }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
