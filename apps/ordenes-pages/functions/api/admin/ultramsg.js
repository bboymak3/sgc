// ============================================
// API: CONFIGURAR ULTRAMSG (WHATSAPP API)
// Global Pro Automotriz
// GET  -> obtener config actual
// POST -> guardar instance + token (y opcional test)
// ============================================

import { enviarUltraMsg, getUltraMsgConfig } from '../../lib/notificaciones.js';
import { chileNow } from '../../lib/db-helpers.js';

// Asegurar que la tabla Configuracion acepte clave-valor
async function asegurarConfigKV(env) {
  try {
    // Verificar si existe la columna 'clave' en Configuracion
    var cols = await env.DB.prepare("PRAGMA table_info(Configuracion)").all();
    var hasClave = cols.results.some(function(c) { return c.name === 'clave'; });
    if (!hasClave) {
      // Crear tabla simple KV si no existe
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ConfigKV (
        clave TEXT PRIMARY KEY,
        valor TEXT,
        fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
      )`).run();
    }
  } catch (e) {
    // Si falla, crear tabla KV
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ConfigKV (
      clave TEXT PRIMARY KEY,
      valor TEXT,
      fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();
  }
}

async function getConfigValue(env, clave) {
  // Intentar ConfigKV primero
  try {
    var row = await env.DB.prepare("SELECT valor FROM ConfigKV WHERE clave = ?").bind(clave).first();
    if (row) return row.valor;
  } catch (e) {}

  // Fallback: buscar en Configuracion
  try {
    var row = await env.DB.prepare("SELECT valor FROM Configuracion WHERE clave = ?").bind(clave).first();
    if (row) return row.valor;
  } catch (e) {}

  return '';
}

async function setConfigValue(env, clave, valor) {
  // Intentar ConfigKV primero
  try {
    await env.DB.prepare(
      `INSERT INTO ConfigKV (clave, valor, fecha_actualizacion) VALUES (?, ?, ${chileNow()}) ON CONFLICT(clave) DO UPDATE SET valor = ?, fecha_actualizacion = ${chileNow()}`
    ).bind(clave, valor, valor).run();
    return true;
  } catch (e) {
    // Fallback: usar Configuracion existente
    try {
      var existe = await env.DB.prepare("SELECT id FROM Configuracion WHERE clave = ?").bind(clave).first();
      if (existe) {
        await env.DB.prepare("UPDATE Configuracion SET valor = ? WHERE clave = ?").bind(valor, clave).run();
      } else {
        await env.DB.prepare("INSERT INTO Configuracion (clave, valor) VALUES (?, ?)").bind(clave, valor).run();
      }
      return true;
    } catch (e2) {
      return false;
    }
  }
}

export async function onRequestGet(context) {
  var { env } = context;
  try {
    await asegurarConfigKV(env);
    var instanceId = await getConfigValue(env, 'ultramsg_instance');
    var token = await getConfigValue(env, 'ultramsg_token');

    // Ocultar parte del token por seguridad
    var tokenMask = '';
    if (token && token.length > 8) {
      tokenMask = token.substring(0, 6) + '****' + token.substring(token.length - 4);
    } else if (token) {
      tokenMask = '****';
    }

    return new Response(JSON.stringify({
      success: true,
      instance_id: instanceId || '',
      token_mask: tokenMask,
      configurado: !!(instanceId && token)
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}

export async function onRequestPost(context) {
  var { request, env } = context;
  try {
    await asegurarConfigKV(env);
    var data = await request.json();

    // Acción: test conexión
    if (data.accion === 'test') {
      var instanceId = await getConfigValue(env, 'ultramsg_instance');
      var token = await getConfigValue(env, 'ultramsg_token');

      if (!instanceId || !token) {
        return new Response(JSON.stringify({
          success: false, error: 'Primero guarda el Instance ID y Token'
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      // Enviar mensaje de prueba al teléfono del admin
      var telTest = (data.telefono_test || '').replace(/[^0-9]/g, '');
      if (telTest.length < 10) {
        return new Response(JSON.stringify({
          success: false, error: 'Telefono de prueba invalido'
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      var resultado = await enviarUltraMsg(instanceId, token, telTest,
        'Global Pro Automotriz - Mensaje de prueba. Si ves esto, UltraMsg esta configurado correctamente!'
      );

      return new Response(JSON.stringify({
        success: true,
        resultado: resultado
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Acción: guardar configuración
    if (!data.instance_id || !data.token) {
      return new Response(JSON.stringify({
        success: false, error: 'Instance ID y Token son requeridos'
      }), { headers: { 'Content-Type': 'application/json' }, status: 400 });
    }

    await setConfigValue(env, 'ultramsg_instance', data.instance_id.trim());
    await setConfigValue(env, 'ultramsg_token', data.token.trim());

    return new Response(JSON.stringify({
      success: true,
      mensaje: 'Configuracion guardada. Las notificaciones se enviaran automaticamente.'
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
