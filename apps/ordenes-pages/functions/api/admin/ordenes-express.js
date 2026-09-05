// ============================================
// API: ÓRDENES EXPRESS - Dashboard dedicado
// Global Pro Automotriz
// GET: Lista órdenes express con métricas y filtros
// ============================================

import { asegurarColumnasFaltantes, getFechaColumn, buildFechaWhere } from '../../lib/db-helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const url = new URL(request.url);
    const estadoFiltro = url.searchParams.get('estado') || '';
    const tecnicoFiltro = url.searchParams.get('tecnico_id') || '';
    const periodo = url.searchParams.get('periodo') || '';
    const valor = url.searchParams.get('valor') || '';
    const limite = parseInt(url.searchParams.get('limite') || '200');

    // Asegurar columnas
    try { await env.DB.exec('ALTER TABLE OrdenesTrabajo ADD COLUMN es_express INTEGER DEFAULT 0'); } catch (e) {}
    try { await env.DB.exec('ALTER TABLE OrdenesTrabajo ADD COLUMN origen TEXT DEFAULT \"admin\"'); } catch (e) {}

    // Construir WHERE dinámico
    let condiciones = ['o.es_express = 1'];
    let params = [];

    // Filtro por estado_trabajo
    if (estadoFiltro) {
      condiciones.push('o.estado_trabajo = ?');
      params.push(estadoFiltro);
    }

    // Filtro por técnico asignado
    if (tecnicoFiltro) {
      condiciones.push('o.tecnico_asignado_id = ?');
      params.push(tecnicoFiltro);
    }

    // Filtro por fecha
    const fechaInfo = await getFechaColumn(env);
    const fechaCol = fechaInfo.col;
    if (valor && periodo) {
      const { condicion, params: fechaParams } = buildFechaWhere(fechaCol, periodo, valor);
      if (condicion) {
        condiciones.push(condicion);
        params = [...params, ...fechaParams];
      }
    }

    const whereClause = condiciones.length > 0 ? 'WHERE ' + condiciones.join(' AND ') : '';

    // 1. Obtener órdenes express
    const ordenesQuery = `
      SELECT
        o.id, o.numero_orden, o.patente_placa, COALESCE(NULLIF(o.marca,''), v.marca) as marca, COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo, COALESCE(NULLIF(o.color,''), v.color) as color, o.anio,
        o.direccion, o.estado, o.estado_trabajo, o.monto_total, o.monto_abono,
        o.monto_restante, o.metodo_pago, o.fecha_ingreso, o.fecha_creacion,
        o.diagnostico_observaciones, o.tecnico_asignado_id,
        o.distancia_km, o.cargo_domicilio, o.domicilio_modo_cobro,
        COALESCE(o.origen, 'admin') as origen,
        c.nombre as cliente_nombre, c.telefono as cliente_telefono, c.rut as cliente_rut,
        t.nombre as tecnico_nombre
      FROM OrdenesTrabajo o
      LEFT JOIN Clientes c ON o.cliente_id = c.id
      LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
      LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
      ${whereClause}
      ORDER BY COALESCE(o.fecha_creacion, o.fecha_ingreso) DESC
      LIMIT ?
    `;
    params.push(limite);

    const { results: ordenes } = await env.DB.prepare(ordenesQuery).bind(...params).all();

    // 2. Métricas generales de express (sin filtros de estado/técnico para tener totales)
    let metricasConds = ['o.es_express = 1'];
    let metricasParams = [];
    if (valor && periodo) {
      const { condicion, params: fp } = buildFechaWhere(fechaCol, periodo, valor);
      if (condicion) {
        metricasConds.push(condicion);
        metricasParams = fp;
      }
    }
    const metricasWhere = 'WHERE ' + metricasConds.join(' AND ');

    const metricas = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_express,
        COALESCE(SUM(o.monto_total), 0) as total_generado,
        COALESCE(SUM(o.monto_abono), 0) as total_abonos,
        COALESCE(SUM(o.monto_restante), 0) as total_pendiente,
        SUM(CASE WHEN o.estado_trabajo = 'Cerrada' THEN 1 ELSE 0 END) as cerradas,
        SUM(CASE WHEN o.estado_trabajo = 'Completada' THEN 1 ELSE 0 END) as completadas,
        SUM(CASE WHEN o.estado_trabajo = 'En Progreso' THEN 1 ELSE 0 END) as en_progreso,
        SUM(CASE WHEN o.estado_trabajo = 'En Sitio' THEN 1 ELSE 0 END) as en_sitio,
        SUM(CASE WHEN o.estado_trabajo = 'Pendiente Visita' THEN 1 ELSE 0 END) as pendientes,
        SUM(CASE WHEN o.estado_trabajo = 'Pendiente Piezas' THEN 1 ELSE 0 END) as pendiente_piezas,
        SUM(CASE WHEN o.estado_trabajo = 'No Completada' THEN 1 ELSE 0 END) as no_completadas,
        SUM(CASE WHEN o.tecnico_asignado_id IS NULL THEN 1 ELSE 0 END) as sin_asignar,
        SUM(CASE WHEN o.estado = 'Aprobada' THEN 1 ELSE 0 END) as aprobadas,
        SUM(CASE WHEN o.origen = 'web' THEN 1 ELSE 0 END) as desde_web
      FROM OrdenesTrabajo o
      ${metricasWhere}
    `).bind(...metricasParams).first();

    // 3. Listado de técnicos para el filtro
    const { results: tecnicos } = await env.DB.prepare(
      'SELECT id, nombre FROM Tecnicos WHERE activo = 1 ORDER BY nombre'
    ).all();

    return new Response(JSON.stringify({
      success: true,
      ordenes: ordenes || [],
      metricas: {
        total_express: metricas?.total_express || 0,
        total_generado: Number(metricas?.total_generado || 0),
        total_abonos: Number(metricas?.total_abonos || 0),
        total_pendiente: Number(metricas?.total_pendiente || 0),
        cerradas: metricas?.cerradas || 0,
        completadas: metricas?.completadas || 0,
        en_progreso: metricas?.en_progreso || 0,
        en_sitio: metricas?.en_sitio || 0,
        pendientes: metricas?.pendientes || 0,
        pendiente_piezas: metricas?.pendiente_piezas || 0,
        no_completadas: metricas?.no_completadas || 0,
        sin_asignar: metricas?.sin_asignar || 0,
        aprobadas: metricas?.aprobadas || 0,
        desde_web: metricas?.desde_web || 0
      },
      tecnicos: tecnicos || [],
      filtros: { estado: estadoFiltro, tecnico_id: tecnicoFiltro, periodo, valor }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener órdenes express:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
