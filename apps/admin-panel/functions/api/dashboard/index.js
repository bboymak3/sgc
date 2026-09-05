// ============================================
// SGC ADMIN - Dashboard: Métricas generales
// GET /api/dashboard
// Devuelve KPIs de las 2 DBs (citas + ordenes)
// ============================================
export async function onRequestGet(context) {
  const { env } = context;

  try {
    // === CITAS === (sgc_citas_db)
    const citasHoy = await env.CITAS_DB.prepare(
      "SELECT COUNT(*) as total FROM Citas WHERE fecha_cita = date('now', '-3 hours')"
    ).first();

    const citasPendientesAprob = await env.CITAS_DB.prepare(
      "SELECT COUNT(*) as total FROM Citas WHERE estado_aprobacion = 'pendiente' AND estado = 'confirmada'"
    ).first();

    const citasAprobadas = await env.CITAS_DB.prepare(
      "SELECT COUNT(*) as total FROM Citas WHERE estado_aprobacion = 'aprobada'"
    ).first();

    const citasMes = await env.CITAS_DB.prepare(
      "SELECT COUNT(*) as total FROM Citas WHERE strftime('%Y-%m', fecha_cita) = strftime('%Y-%m', 'now', '-3 hours')"
    ).first();

    const citasPorServicio = await env.CITAS_DB.prepare(
      "SELECT servicio, COUNT(*) as total FROM Citas WHERE strftime('%Y-%m', fecha_cita) = strftime('%Y-%m', 'now', '-3 hours') GROUP BY servicio ORDER BY total DESC LIMIT 10"
    ).all();

    // === ORDENES === (sgc_ordenes_db)
    const otPendientes = await env.ORDENES_DB.prepare(
      "SELECT COUNT(*) as total FROM OrdenesTrabajo WHERE estado_trabajo IN ('Pendiente', 'En Proceso')"
    ).first();

    const otCompletadasMes = await env.ORDENES_DB.prepare(
      "SELECT COUNT(*) as total FROM OrdenesTrabajo WHERE estado_trabajo = 'Completada' AND strftime('%Y-%m', COALESCE(fecha_completado, fecha_creacion)) = strftime('%Y-%m', 'now', '-3 hours')"
    ).first();

    const ingresosMes = await env.ORDENES_DB.prepare(
      "SELECT COALESCE(SUM(monto_total), 0) as total FROM OrdenesTrabajo WHERE strftime('%Y-%m', COALESCE(fecha_creacion, fecha_ingreso)) = strftime('%Y-%m', 'now', '-3 hours') AND estado != 'Cancelada'"
    ).first();

    const otExpress = await env.ORDENES_DB.prepare(
      "SELECT COUNT(*) as total FROM OrdenesTrabajo WHERE es_express = 1 AND estado_trabajo = 'Pendiente'"
    ).first();

    // === TECNICOS ===
    const tecnicosActivos = await env.ORDENES_DB.prepare(
      "SELECT COUNT(*) as total FROM Tecnicos WHERE activo = 1"
    ).first();

    // === ÚLTIMAS CITAS ===
    const ultimasCitas = await env.CITAS_DB.prepare(
      `SELECT c.id, c.fecha_cita, c.hora_cita, c.servicio, c.nombre_cliente, c.telefono,
              c.patente, c.estado, c.estado_aprobacion, c.canal, c.tipo_atencion
       FROM Citas c
       ORDER BY c.created_at DESC
       LIMIT 10`
    ).all();

    // === PRÓXIMAS CITAS ===
    const proximasCitas = await env.CITAS_DB.prepare(
      `SELECT c.id, c.fecha_cita, c.hora_cita, c.servicio, c.nombre_cliente, c.patente, c.tipo_atencion
       FROM Citas c
       WHERE c.fecha_cita >= date('now', '-3 hours')
         AND c.estado_aprobacion IN ('pendiente', 'aprobada')
       ORDER BY c.fecha_cita ASC, c.hora_cita ASC
       LIMIT 10`
    ).all();

    return new Response(JSON.stringify({
      success: true,
      kpis: {
        citas_hoy: citasHoy?.total || 0,
        citas_pendientes_aprobacion: citasPendientesAprob?.total || 0,
        citas_aprobadas_total: citasAprobadas?.total || 0,
        citas_mes_actual: citasMes?.total || 0,
        ot_pendientes: otPendientes?.total || 0,
        ot_completadas_mes: otCompletadasMes?.total || 0,
        ot_express_pendientes: otExpress?.total || 0,
        ingresos_mes: ingresosMes?.total || 0,
        tecnicos_activos: tecnicosActivos?.total || 0
      },
      citas_por_servicio: citasPorServicio.results || [],
      ultimas_citas: ultimasCitas.results || [],
      proximas_citas: proximasCitas.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
