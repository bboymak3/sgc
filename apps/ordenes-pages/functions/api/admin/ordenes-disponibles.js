// ============================================
// API: ÓRDENES DISPONIBLES PARA ASIGNACIÓN
// SGC
// ============================================

import { asegurarColumnasFaltantes } from '../../lib/db-helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const ordenes = await env.DB.prepare(
      `SELECT o.id, o.numero_orden, o.patente_placa, o.marca, o.modelo,
              COALESCE(o.cliente_nombre, c.nombre) as cliente_nombre,
              o.fecha_ingreso as fecha_creacion, o.es_express, o.origen
       FROM OrdenesTrabajo o
       LEFT JOIN Clientes c ON c.id = o.cliente_id
       WHERE o.estado = 'Aprobada' AND (o.tecnico_asignado_id IS NULL OR o.tecnico_asignado_id = '')
       ORDER BY o.fecha_ingreso DESC`
    ).all();

    return new Response(JSON.stringify({
      success: true,
      ordenes: ordenes.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener órdenes disponibles:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
