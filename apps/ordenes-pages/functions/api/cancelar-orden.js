// ============================================
// API: CANCELAR ORDEN
// Global Pro Automotriz
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    if (!data.token) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Falta el token de la orden'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Verificar que la orden existe y está en estado "Enviada"
    const orden = await env.DB.prepare(
      "SELECT * FROM OrdenesTrabajo WHERE token = ? AND estado = 'Enviada'"
    ).bind(data.token).first();

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada o ya procesada'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Guardar el motivo en la columna notas (ya que motivo_cancelacion no existe)
    const motivo = data.motivo || 'Cancelado por el cliente';

    // Actualizar orden a cancelada
    await env.DB.prepare(`
      UPDATE OrdenesTrabajo
      SET estado = 'Cancelada',
          notas = ?
      WHERE token = ?
    `).bind(motivo, data.token).run();

    // Obtener orden actualizada
    const ordenActualizada = await env.DB.prepare(`
      SELECT
        o.*,
        c.nombre as cliente_nombre,
        c.rut as cliente_rut,
        c.telefono as cliente_telefono
      FROM OrdenesTrabajo o
      LEFT JOIN Clientes c ON o.cliente_id = c.id
      WHERE o.token = ?
    `).bind(data.token).first();

    return new Response(JSON.stringify({
      success: true,
      orden: ordenActualizada
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al cancelar orden:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
