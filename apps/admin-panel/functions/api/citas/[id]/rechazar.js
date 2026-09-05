// ============================================
// SGC ADMIN - Rechazar cita
// POST /api/citas/[id]/rechazar
// body: { motivo: "..." }
// ============================================

export async function onRequestPost(context) {
  const { request, env, params } = context;

  try {
    const citaId = params.id;
    const { motivo } = await request.json();

    const cita = await env.CITAS_DB.prepare('SELECT * FROM Citas WHERE id = ?').bind(citaId).first();
    if (!cita) {
      return new Response(JSON.stringify({ success: false, error: 'Cita no encontrada' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    await env.CITAS_DB.prepare(
      `UPDATE Citas
       SET estado_aprobacion = 'rechazada',
           estado = 'cancelada',
           motivo_rechazo = ?,
           updated_at = datetime('now', '-3 hours')
       WHERE id = ?`
    ).bind(motivo || 'Sin motivo especificado', citaId).run();

    return new Response(JSON.stringify({
      success: true,
      mensaje: 'Cita rechazada',
      cita_id: citaId
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
