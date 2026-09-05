// ============================================
// API: GENERAR TOKEN DE FIRMA (PARA TÉCNICOS)
// Global Pro Automotriz
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    if (!data.orden_id || !data.tecnico_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos: orden_id y tecnico_id'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Verificar que la orden existe y está asignada a este técnico
    const orden = await env.DB.prepare(
      "SELECT id, cliente_telefono FROM OrdenesTrabajo WHERE id = ? AND tecnico_asignado_id = ?"
    ).bind(data.orden_id, data.tecnico_id).first();

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada o no asignada a este técnico'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Verificar si ya tiene un token de firma
    const tokenExistente = await env.DB.prepare(
      "SELECT token_firma_tecnico FROM OrdenesTrabajo WHERE id = ? AND token_firma_tecnico IS NOT NULL"
    ).bind(data.orden_id).first();

    if (tokenExistente) {
      return new Response(JSON.stringify({
        success: true,
        token: tokenExistente.token_firma_tecnico
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generar nuevo token
    const nuevoToken = crypto.randomUUID();

    // Guardar token en la orden
    await env.DB.prepare(
      "UPDATE OrdenesTrabajo SET token_firma_tecnico = ? WHERE id = ?"
    ).bind(nuevoToken, data.orden_id).run();

    return new Response(JSON.stringify({
      success: true,
      token: nuevoToken
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al generar token de firma:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
