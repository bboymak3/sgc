// ============================================
// API: APROBAR ORDEN (GUARDAR FIRMA)
// SGC
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    if (!data.token || !data.firma) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos: token y firma'
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

    // Asegurar columna aprobado_por existe (puede faltar si la tabla fue recreada por migración)
    try { await env.DB.prepare("ALTER TABLE OrdenesTrabajo ADD COLUMN aprobado_por TEXT").run(); } catch (e) { /* ya existe */ }

    // Actualizar orden con firma y cambiar estado
    await env.DB.prepare(`
      UPDATE OrdenesTrabajo
      SET estado = 'Aprobada',
          firma_imagen = ?,
          fecha_aprobacion = datetime('now', 'localtime'),
          aprobado_por = 'Cliente'
      WHERE token = ?
    `).bind(data.firma, data.token).run();

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
    console.error('Error al aprobar orden:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
