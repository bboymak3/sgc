// ============================================
// API: LIBERAR ORDEN DE TRABAJO
// Global Pro Automotriz
// POST: Des-asigna técnico y resetea estado de la OT
// para que quede libre para reasignación
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    if (!data.orden_id) {
      return new Response(JSON.stringify({ success: false, error: 'Falta orden_id' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    // Verificar que la OT existe
    const orden = await env.DB.prepare('SELECT id, numero_orden FROM OrdenesTrabajo WHERE id = ?').bind(data.orden_id).first();
    if (!orden) {
      return new Response(JSON.stringify({ success: false, error: 'Orden no encontrada' }), {
        headers: { 'Content-Type': 'application/json' }, status: 404
      });
    }

    // Liberar la OT: quitar técnico, fechas y resetear estado
    await env.DB.prepare(
      "UPDATE OrdenesTrabajo SET tecnico_asignado_id = NULL, fecha_programada = NULL, hora_programada = NULL, estado = 'PENDIENTE_ASIGNACION' WHERE id = ?"
    ).bind(data.orden_id).run();

    // También eliminar cualquier evento de agenda asociado a esta OT
    try {
      await env.DB.prepare('DELETE FROM AgendaTecnicos WHERE orden_id = ?').bind(data.orden_id).run();
    } catch (e) { /* tabla puede no existir */ }

    return new Response(JSON.stringify({
      success: true,
      mensaje: `OT#${String(orden.numero_orden).padStart(6, '0')} liberada para reasignación`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al liberar orden:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
