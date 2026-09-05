// ============================================
// API: OBTENER NOTAS DE UNA ORDEN
// Global Pro Automotriz
// ============================================

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const ordenId = url.searchParams.get('orden_id');

    if (!ordenId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Falta ID de la orden'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Obtener notas de la orden
    const notas = await env.DB.prepare(`
      SELECT id, nota, fecha_nota
      FROM NotasTrabajo
      WHERE orden_id = ?
      ORDER BY fecha_nota ASC
    `).bind(ordenId).all();

    return new Response(JSON.stringify({
      success: true,
      notas: notas.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener notas:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
