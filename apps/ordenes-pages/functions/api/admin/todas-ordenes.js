// ============================================
// API: LISTAR TODAS LAS ÓRDENES
// Con desglose de costos por categoría
// SGC
// ============================================

import { asegurarColumnasFaltantes, getFechaColumn, getColumnas } from '../../lib/db-helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);
    const fechaInfo = await getFechaColumn(env);

    const url = new URL(request.url);
    const patente = url.searchParams.get('patente');
    const estado = url.searchParams.get('estado');
    const tecnico_id = url.searchParams.get('tecnico_id');
    const desde = url.searchParams.get('desde');
    const hasta = url.searchParams.get('hasta');
    const pagina = parseInt(url.searchParams.get('pagina')) || 1;
    const limite = parseInt(url.searchParams.get('limite')) || 50;
    const offset = (pagina - 1) * limite;

    const es_express = url.searchParams.get('es_express');

    let whereClauses = [];
    let params = [];

    // SIEMPRE usar o.fecha_ingreso para filtrar (columna 100% segura)
    if (patente) { whereClauses.push('UPPER(o.patente_placa) = UPPER(?)'); params.push(patente); }
    if (estado) { whereClauses.push('o.estado = ?'); params.push(estado); }
    if (tecnico_id) { whereClauses.push('o.tecnico_asignado_id = ?'); params.push(tecnico_id); }
    if (desde) { whereClauses.push(`o.fecha_ingreso >= ?`); params.push(desde); }
    if (hasta) { whereClauses.push(`o.fecha_ingreso <= ?`); params.push(hasta); }
    if (es_express === '1') { whereClauses.push('o.es_express = 1'); }

    const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM OrdenesTrabajo o LEFT JOIN Clientes c ON o.cliente_id = c.id ${whereSQL}`
    ).bind(...params).first();

    // SELECT dinámico según columnas existentes
    let selectCols = `
      o.id, o.numero_orden, o.token, o.patente_placa, COALESCE(NULLIF(o.marca,''), v.marca) as marca, COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo, COALESCE(NULLIF(o.color,''), v.color) as color, o.anio,
      o.cilindrada, o.combustible, o.kilometraje, o.fecha_ingreso, o.hora_ingreso,
      o.recepcionista, o.direccion, o.estado, o.estado_trabajo,
      o.monto_total, o.monto_abono, o.monto_restante, o.metodo_pago,
      o.firma_imagen, o.fecha_aprobacion, o.completo,
      ${fechaInfo.select},
      o.tecnico_asignado_id,
      o.trabajo_frenos, o.detalle_frenos, o.trabajo_luces, o.detalle_luces,
      o.trabajo_tren_delantero, o.detalle_tren_delantero, o.trabajo_correas, o.detalle_correas,
      o.trabajo_componentes, o.detalle_componentes, o.nivel_combustible,
      o.check_paragolfe_delantero_der, o.check_puerta_delantera_der,
      o.check_puerta_trasera_der, o.check_paragolfe_trasero_izq, o.check_otros_carroceria`;
    if (fechaInfo.tiene_fecha_completado) selectCols += ', o.fecha_completado';
    if (fechaInfo.tiene_servicios) selectCols += ', o.servicios_seleccionados';
    if (fechaInfo.tiene_diag_checks) selectCols += ', o.diagnostico_checks';
    if (fechaInfo.tiene_diag_obs) selectCols += ', o.diagnostico_observaciones';
    if (fechaInfo.tiene_distancia_km) selectCols += ', o.distancia_km';
    if (fechaInfo.tiene_cargo_domicilio) selectCols += ', o.cargo_domicilio';
    if (fechaInfo.tiene_domicilio_modo_cobro) selectCols += ', o.domicilio_modo_cobro';
    // Siempre incluir es_express para identificar órdenes Express
    const colNames = await getColumnas(env, 'OrdenesTrabajo');
    if (colNames.includes('es_express')) selectCols += ', o.es_express';
    if (colNames.includes('cliente_apellido')) selectCols += ', o.cliente_apellido';
    if (colNames.includes('origen')) selectCols += ', o.origen';
    if (colNames.includes('tipo_atencion')) selectCols += ', o.tipo_atencion';
    if (colNames.includes('fecha_creacion')) selectCols += ', o.fecha_creacion';

    const { results } = await env.DB.prepare(`
      SELECT ${selectCols},
        c.nombre as cliente_nombre, c.rut as cliente_rut, c.telefono as cliente_telefono, c.email as cliente_email,
        t.nombre as tecnico_nombre, t.telefono as tecnico_telefono, COALESCE(t.comision_porcentaje, 40) as comision_porcentaje,
        COALESCE(ca.total_mano_obra, 0) as total_costos_mano_obra,
        COALESCE(ca.total_repuestos, 0) as total_costos_repuestos,
        (SELECT COALESCE(SUM(monto), 0) FROM CostosAdicionales ca2 WHERE ca2.orden_id = o.id) as total_costos_adicionales,
        (SELECT COUNT(*) FROM CostosAdicionales ca3 WHERE ca3.orden_id = o.id) as cantidad_costos_adicionales
      FROM OrdenesTrabajo o
      LEFT JOIN Clientes c ON o.cliente_id = c.id
      LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
      LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
      LEFT JOIN (
        SELECT orden_id,
          COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
          COALESCE(SUM(CASE WHEN categoria = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos
        FROM CostosAdicionales GROUP BY orden_id
      ) ca ON ca.orden_id = o.id
      ${whereSQL}
      ORDER BY o.fecha_ingreso DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limite, offset).all();

    const ordenIds = results.map(o => o.id);
    let costosMap = {};
    if (ordenIds.length > 0) {
      const placeholders = ordenIds.map(() => '?').join(',');
      const { results: costos } = await env.DB.prepare(`SELECT * FROM CostosAdicionales WHERE orden_id IN (${placeholders}) ORDER BY fecha_registro DESC`).bind(...ordenIds).all();
      costos.forEach(c => {
        if (!costosMap[c.orden_id]) costosMap[c.orden_id] = [];
        costosMap[c.orden_id].push(c);
      });
    }

    // Obtener lista de técnicos para el filtro
    const { results: tecnicosList } = await env.DB.prepare('SELECT id, nombre FROM Tecnicos WHERE activo = 1 ORDER BY nombre').all();

    // Calcular comisión para cada orden
    const ordenesConComision = results.map(o => {
      const comisionPct = Number(o.comision_porcentaje || 40);
      const factorComision = comisionPct / 100;
      const costosManoObra = Number(o.total_costos_mano_obra || 0);

      // Separar MO vs Repuestos de servicios_seleccionados
      let manoObraServicios = 0;
      if (o.servicios_seleccionados) {
        try {
          const srvs = typeof o.servicios_seleccionados === 'string'
            ? JSON.parse(o.servicios_seleccionados)
            : o.servicios_seleccionados;
          if (Array.isArray(srvs)) {
            srvs.forEach(s => {
              const precio = Number(s.precio_final || s.precio_sugerido || 0);
              if (s.tipo_comision === 'mano_obra') {
                manoObraServicios += precio;
              }
            });
          }
        } catch (e) { /* formato inválido */ }
      }
      // Si no hay servicios parseables, usar monto_total como base MO
      if (manoObraServicios === 0 && Number(o.monto_total || 0) > 0) {
        manoObraServicios = Number(o.monto_total);
      }

      const baseComisionable = manoObraServicios + costosManoObra;
      const gananciaTecnico = Math.round(baseComisionable * factorComision);

      const costosTotales = Number(o.total_costos_adicionales || 0);
      const montoFinal = Number(o.monto_total || 0) + costosTotales;

      return {
        ...o,
        costos_adicionales_detalle: costosMap[o.id] || [],
        base_comisionable: baseComisionable,
        ganancia_tecnico: gananciaTecnico,
        comision_aplicada: comisionPct,
        monto_final: montoFinal
      };
    });

    return new Response(JSON.stringify({
      success: true,
      total: countResult?.total || 0,
      pagina, limite,
      total_paginas: Math.ceil((countResult?.total || 0) / limite),
      tecnicos: tecnicosList || [],
      ordenes: ordenesConComision
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error al listar órdenes:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
