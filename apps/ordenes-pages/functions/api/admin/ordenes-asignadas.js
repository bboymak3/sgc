// ============================================
// API: OBTENER ÓRDENES ASIGNADAS A UN TÉCNICO
// Para el panel de Reasignar OT
// Solo retorna órdenes que NO estén completadas/cerradas
// ============================================

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const tecnicoId = url.searchParams.get('tecnico_id');

    if (!tecnicoId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Falta ID del técnico'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Obtener órdenes asignadas a este técnico, excluyendo completadas/cerradas
    const ordenes = await env.DB.prepare(`
      SELECT
        o.id, o.numero_orden, o.patente_placa, o.estado_trabajo,
        o.es_express, o.direccion, o.fecha_programada,
        c.nombre as cliente_nombre
      FROM OrdenesTrabajo o
      LEFT JOIN Clientes c ON o.cliente_id = c.id
      WHERE o.tecnico_asignado_id = ?
        AND o.estado_trabajo NOT IN ('Completada', 'Cerrada')
        AND o.estado NOT IN ('Cancelada')
      ORDER BY o.fecha_creacion DESC
    `).bind(tecnicoId).all();

    return new Response(JSON.stringify({
      success: true,
      ordenes: ordenes.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener órdenes asignadas:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
