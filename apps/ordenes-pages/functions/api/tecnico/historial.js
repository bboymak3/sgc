// ============================================
// API: OBTENER HISTORIAL DE SEGUIMIENTO
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

    // Obtener historial de seguimiento
    const historial = await env.DB.prepare(`
      SELECT
        st.*,
        t.nombre as tecnico_nombre
      FROM SeguimientoTrabajo st
      LEFT JOIN Tecnicos t ON st.tecnico_id = t.id
      WHERE st.orden_id = ?
      ORDER BY st.id ASC
    `).bind(ordenId).all();

    return new Response(JSON.stringify({
      success: true,
      historial: historial.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener historial:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
