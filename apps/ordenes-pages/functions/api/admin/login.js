// ============================================
// API: LOGIN ADMIN
// Global Pro Automotriz
// ============================================

import { chileNow } from '../../lib/db-helpers.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const data = await request.json();
    const usuario = (data.usuario || '').trim();
    const password = (data.password || '').trim();

    if (!usuario || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Usuario y contraseña requeridos' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    // Crear tabla AdminUsers si no existe + usuario default
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS AdminUsers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nombre TEXT,
      activo INTEGER DEFAULT 1,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // Verificar si existe el admin default, si no crearlo
    var adminCount = await env.DB.prepare('SELECT COUNT(*) as c FROM AdminUsers').first();
    if (adminCount.c === 0) {
      // Admin default: admin / globalpro2025
      await env.DB.prepare(
        "INSERT INTO AdminUsers (usuario, password_hash, nombre) VALUES (?, ?, ?)"
      ).bind('admin', 'globalpro2025', 'Administrador').run();
    }

    // Buscar usuario
    var user = await env.DB.prepare(
      'SELECT id, usuario, password_hash, nombre, activo FROM AdminUsers WHERE usuario = ? AND activo = 1'
    ).bind(usuario).first();

    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Usuario no encontrado' }), {
        headers: { 'Content-Type': 'application/json' }, status: 401
      });
    }

    // Verificar password (hash simple para MVP - en producción usar bcrypt)
    if (user.password_hash !== password) {
      return new Response(JSON.stringify({ success: false, error: 'Contraseña incorrecta' }), {
        headers: { 'Content-Type': 'application/json' }, status: 401
      });
    }

    // Generar token de sesión (válido por 24 horas Chile)
    var token = 'gp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    var _now = new Date();
    var _utc = _now.getTime() + _now.getTimezoneOffset() * 60000;
    var _chile24h = new Date(_utc + (-3 * 60 * 60000) + 24 * 60 * 60 * 1000);
    var expira = _chile24h.toISOString();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS SesionesAdmin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expira DATETIME NOT NULL,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    await env.DB.prepare(
      'INSERT INTO SesionesAdmin (usuario, token, expira) VALUES (?, ?, ?)'
    ).bind(usuario, token, expira).run();

    return new Response(JSON.stringify({
      success: true,
      token: token,
      nombre: user.nombre || usuario,
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
      usuario TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expira DATETIME NOT NULL,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    var session = await env.DB.prepare(
      `SELECT usuario, expira FROM SesionesAdmin WHERE token = ? AND expira > ${chileNow()}`
    ).bind(token).first();

    if (!session) {
      return new Response(JSON.stringify({ success: false, error: 'Sesión expirada' }), {
        headers: { 'Content-Type': 'application/json' }, status: 401
      });
    }

    return new Response(JSON.stringify({ success: true, usuario: session.usuario }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
