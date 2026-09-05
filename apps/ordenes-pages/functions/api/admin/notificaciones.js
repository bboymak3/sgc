// ============================================
// API: NOTIFICACIONES WHATSAPP
// Global Pro Automotriz
// ============================================

import { asegurarColumnasFaltantes } from '../../lib/db-helpers.js';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    await asegurarColumnasFaltantes(env);
    var pendientes = await env.DB.prepare(
      'SELECT n.*, o.numero_orden, o.patente_placa, o.cliente_nombre FROM NotificacionesWhatsApp n LEFT JOIN OrdenesTrabajo o ON n.orden_id = o.id WHERE n.enviada = 0 ORDER BY n.fecha_creacion DESC LIMIT 50'
    ).all();
    var enviadas = await env.DB.prepare(
      'SELECT n.*, o.numero_orden, o.patente_placa FROM NotificacionesWhatsApp n LEFT JOIN OrdenesTrabajo o ON n.orden_id = o.id WHERE n.enviada = 1 ORDER BY n.fecha_creacion DESC LIMIT 20'
    ).all();
    return new Response(JSON.stringify({
      success: true,
      pendientes: pendientes.results || [],
      enviadas: enviadas.results || []
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    var data = await request.json();
    if (!data.id) {
      return new Response(JSON.stringify({ success: false, error: 'Falta id' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }
    // Marcar como enviada
    if (data.accion === 'marcar_enviada') {
      await env.DB.prepare('UPDATE NotificacionesWhatsApp SET enviada = 1 WHERE id = ?').bind(data.id).run();
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }
    // Marcar todas como enviadas
    if (data.accion === 'marcar_todas') {
      await env.DB.prepare('UPDATE NotificacionesWhatsApp SET enviada = 1 WHERE enviada = 0').run();
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }
    // Enviar todas pendientes (devuelve lista de links wa.me)
    if (data.accion === 'enviar_todas') {
      var pendientes = await env.DB.prepare(
        'SELECT n.id, n.telefono, n.mensaje FROM NotificacionesWhatsApp n WHERE n.enviada = 0'
      ).all();
      var links = [];
      for (var i = 0; i < (pendientes.results || []).length; i++) {
        var p = pendientes.results[i];
        links.push({
          id: p.id,
          telefono: p.telefono,
          link: 'https://wa.me/' + p.telefono + '?text=' + encodeURIComponent(p.mensaje)
        });
      }
      return new Response(JSON.stringify({ success: true, links: links }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: false, error: 'Accion no reconocida' }), {
      headers: { 'Content-Type': 'application/json' }, status: 400
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
