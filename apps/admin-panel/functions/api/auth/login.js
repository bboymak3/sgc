// ============================================
// SGC ADMIN - Auth: Login
// POST /api/auth/login  body: { username, password }
// ============================================
import { createToken, sha256 } from '../_middleware.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Usuario y contraseña requeridos' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const passwordHash = await sha256(password);

    const user = await env.ORDENES_DB.prepare(
      'SELECT id, username, password_hash, nombre, rol, activo FROM AdminUsers WHERE username = ?'
    ).bind(username).first();

    if (!user || user.activo !== 1) {
      return new Response(JSON.stringify({ success: false, error: 'Credenciales inválidas' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (user.password_hash !== passwordHash) {
      return new Response(JSON.stringify({ success: false, error: 'Credenciales inválidas' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    await env.ORDENES_DB.prepare(
      "UPDATE AdminUsers SET ultimo_login = datetime('now', '-3 hours') WHERE id = ?"
    ).bind(user.id).run();

    const token = await createToken({
      uid: user.id,
      username: user.username,
      nombre: user.nombre,
      rol: user.rol
    }, 24);

    return new Response(JSON.stringify({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        rol: user.rol
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `sgc_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
      }
    });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestGet() {
  return new Response(JSON.stringify({
    success: true,
    message: 'SGC Admin - Auth endpoint',
    version: '1.0.0'
  }), { headers: { 'Content-Type': 'application/json' } });
}
