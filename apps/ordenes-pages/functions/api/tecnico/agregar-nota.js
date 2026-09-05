// ============================================
// API: AGREGAR NOTA A UNA ORDEN
// Global Pro Automotriz
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    if (!data.orden_id || !data.tecnico_id || !data.nota) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos: orden_id, tecnico_id y nota'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Verificar que la orden está asignada a este técnico
    const orden = await env.DB.prepare(
      "SELECT id FROM OrdenesTrabajo WHERE id = ? AND tecnico_asignado_id = ?"
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

    // Guardar nota
    await env.DB.prepare(`
      INSERT INTO NotasTrabajo (orden_id, tecnico_id, nota)
      VALUES (?, ?, ?)
    `).bind(data.orden_id, data.tecnico_id, data.nota).run();

    return new Response(JSON.stringify({
      success: true,
      mensaje: 'Nota agregada correctamente'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al agregar nota:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
