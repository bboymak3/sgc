// ============================================
// API: OBTENER DETALLE DE UNA ORDEN
// SGC
// ============================================

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const ordenId = url.searchParams.get('id');
    const tecnicoId = url.searchParams.get('tecnico_id');

    if (!ordenId || !tecnicoId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan parámetros: id y tecnico_id'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Verificar que la orden esté asignada a este técnico (como tecnico_asignado o con ítems en servicios_seleccionados)
    const orden = await env.DB.prepare(`
      SELECT
        o.*,
        c.nombre as cliente_nombre,
        c.telefono as cliente_telefono,
        c.rut as cliente_rut
      FROM OrdenesTrabajo o
      LEFT JOIN Clientes c ON o.cliente_id = c.id
      WHERE o.id = ? AND (o.tecnico_asignado_id = ? OR (o.servicios_seleccionados IS NOT NULL AND o.servicios_seleccionados != ''))
    `).bind(ordenId, tecnicoId).first();

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada o no asignada a este técnico'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Si no es el tecnico_asignado, verificar que tenga al menos un ítem asignado
    const tecId = String(tecnicoId);
    orden.es_tecnico_principal = String(orden.tecnico_asignado_id) === tecId;
    if (!orden.es_tecnico_principal) {
      let tieneItemAsignado = false;
      if (orden.servicios_seleccionados) {
        try {
          const servicios = JSON.parse(orden.servicios_seleccionados);
          if (Array.isArray(servicios)) {
            tieneItemAsignado = servicios.some(item => String(item.tecnico_id) === tecId);
          }
        } catch (e) { /* ignore parse errors */ }
      }
      if (!tieneItemAsignado) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Orden no encontrada o no asignada a este técnico'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 404
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      orden: orden
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener orden:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
