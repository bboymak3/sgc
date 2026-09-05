// ============================================
// API: ELIMINAR ORDEN DE TRABAJO
// SGC
// Eliminación en cascada de todas las tablas relacionadas
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();
    const ordenId = data.orden_id;

    if (!ordenId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Se requiere el ID de la orden'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Verificar que la orden existe
    const orden = await env.DB.prepare(`
      SELECT id, numero_orden, estado, estado_trabajo
      FROM OrdenesTrabajo
      WHERE id = ?
    `).bind(ordenId).first();

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Eliminar en orden de dependencias (tablas hijas primero)
    // Cada DELETE usa try/catch porque la tabla puede no existir aún

    // 1. Fotos de trabajo
    try { await env.DB.prepare('DELETE FROM FotosTrabajo WHERE orden_id = ?').bind(ordenId).run(); } catch (e) {}

    // 2. Notas de trabajo
    try { await env.DB.prepare('DELETE FROM NotasTrabajo WHERE orden_id = ?').bind(ordenId).run(); } catch (e) {}

    // 3. Seguimiento de trabajo
    try { await env.DB.prepare('DELETE FROM SeguimientoTrabajo WHERE orden_id = ?').bind(ordenId).run(); } catch (e) {}

    // 4. Tracking GPS del técnico
    try { await env.DB.prepare('DELETE FROM TrackingTecnico WHERE orden_id = ?').bind(ordenId).run(); } catch (e) {}

    // 5. Costos adicionales
    try { await env.DB.prepare('DELETE FROM CostosAdicionales WHERE orden_id = ?').bind(ordenId).run(); } catch (e) {}

    // 6. Notificaciones WhatsApp
    try { await env.DB.prepare('DELETE FROM NotificacionesWhatsApp WHERE orden_id = ?').bind(ordenId).run(); } catch (e) {}

    // 7. Eventos de agenda del calendario
    try { await env.DB.prepare('DELETE FROM AgendaTecnicos WHERE orden_id = ?').bind(ordenId).run(); } catch (e) {}

    // 8. Pagos asociados
    try { await env.DB.prepare('DELETE FROM Pagos WHERE orden_id = ?').bind(ordenId).run(); } catch (e) {}

    // 9. Liquidaciones de la orden (FK constraint)
    try { await env.DB.prepare('DELETE FROM LiquidacionOrden WHERE orden_id = ?').bind(ordenId).run(); } catch (e) {}

    // 10. Servicios del diagnóstico (si existen tablas relacionadas)
    try { await env.DB.prepare('DELETE FROM DiagnosticoItems WHERE orden_id = ?').bind(ordenId).run(); } catch (e) {}

    // Finalmente eliminar la orden
    await env.DB.prepare('DELETE FROM OrdenesTrabajo WHERE id = ?').bind(ordenId).run();

    return new Response(JSON.stringify({
      success: true,
      message: `Orden #${String(orden.numero_orden).padStart(6, '0')} eliminada correctamente`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al eliminar orden:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
