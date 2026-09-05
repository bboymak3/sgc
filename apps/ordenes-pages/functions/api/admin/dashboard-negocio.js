// ============================================
// API: DASHBOARD GENERAL DEL NEGOCIO
// Con desglose de costos por categoría (Mano de Obra vs Repuestos)
// Auto-crea tablas si no existen
// Global Pro Automotriz
// ============================================

import { asegurarColumnasFaltantes, buildFechaWhere } from '../../lib/db-helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const url = new URL(request.url);
    const periodo = url.searchParams.get('periodo') || 'mes';
    const valor = url.searchParams.get('valor');

    // SIEMPRE usar o.fecha_ingreso para filtrar (columna 100% segura)
    const { condicion: rawFechaCond, params: fechaParams } = buildFechaWhere('o.fecha_ingreso', periodo, valor);
    const fechaCondicion = rawFechaCond ? `WHERE ${rawFechaCond}` : '';
    const params = [...fechaParams];

    // 1. Resumen general de órdenes (monto_abono puede ser $0, los pagos reales están en tabla Pagos)
    const resumen = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_ordenes,
        SUM(CASE WHEN estado = 'Aprobada' THEN 1 ELSE 0 END) as ordenes_aprobadas,
        SUM(CASE WHEN estado = 'Cancelada' THEN 1 ELSE 0 END) as ordenes_canceladas,
        SUM(CASE WHEN estado_trabajo = 'Cerrada' THEN 1 ELSE 0 END) as ordenes_cerradas,
        SUM(CASE WHEN estado_trabajo = 'En camino' THEN 1 ELSE 0 END) as ordenes_en_camino,
        SUM(CASE WHEN estado_trabajo = 'En trabajo' THEN 1 ELSE 0 END) as ordenes_en_trabajo,
        SUM(CASE WHEN estado_trabajo = 'Pendiente Visita' THEN 1 ELSE 0 END) as ordenes_pendientes,
        COALESCE(SUM(CASE WHEN estado != 'Cancelada' THEN monto_total ELSE 0 END), 0) as total_generado_base,
        COALESCE(SUM(CASE WHEN estado != 'Cancelada' THEN monto_abono ELSE 0 END), 0) as total_abonos_ot,
        COALESCE(SUM(CASE WHEN estado != 'Cancelada' THEN monto_restante ELSE 0 END), 0) as total_restantes,
        COALESCE(SUM(CASE WHEN estado = 'Cancelada' THEN 1 ELSE 0 END), 0) as canceladas,
        AVG(CASE WHEN estado != 'Cancelada' THEN monto_total END) as promedio_orden
      FROM OrdenesTrabajo o
      ${fechaCondicion}
    `).bind(...params).first();

    // 1b. Total pagos registrados desde tabla Pagos (fuente real de ingresos)
    let totalPagosRegistrados = 0;
    try {
      const pagosRegRes = await env.DB.prepare(`
        SELECT COALESCE(SUM(p.monto),0) as total
        FROM Pagos p
        INNER JOIN OrdenesTrabajo o ON p.orden_id = o.id
        ${fechaCondicion}
        ${fechaCondicion ? 'AND' : 'WHERE'} o.estado != 'Cancelada'
      `).bind(...params).first();
      totalPagosRegistrados = Number(pagosRegRes?.total || 0);
    } catch (e) { console.log('Pagos registrados error:', e.message); }

    // Usar Pagos como fuente primaria, fallback a monto_abono de OT
    const totalAbonosOT = Number(resumen?.total_abonos_ot || 0);
    const totalAbonos = totalPagosRegistrados > 0 ? totalPagosRegistrados : totalAbonosOT;

    // 2. Costos adicionales del periodo
    let costosQuery = `SELECT COUNT(*) as total_items_costos,
      COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
      COALESCE(SUM(CASE WHEN categoria = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
      COALESCE(SUM(monto), 0) as total_costos_adicionales
      FROM CostosAdicionales`;
    let costosParams = [];
    if (valor) {
      switch (periodo) {
        case 'dia': costosQuery += ' WHERE date(fecha_registro) = ?'; costosParams.push(valor); break;
        case 'semana': { const [yr, wk] = valor.split('-').map(Number); costosQuery += " WHERE strftime('%Y', fecha_registro) = ? AND cast(strftime('%W', fecha_registro) as integer) = ?"; costosParams.push(String(yr), wk); break; }
        case 'anio': costosQuery += " WHERE strftime('%Y', fecha_registro) = ?"; costosParams.push(valor); break;
        default: costosQuery += " WHERE strftime('%Y-%m', fecha_registro) = ?"; costosParams.push(valor); break;
      }
    }
    const costos = await env.DB.prepare(costosQuery).bind(...costosParams).first();

    const totalGeneradoBase = Number(resumen?.total_generado_base || 0);
    const totalCostosManoObra = Number(costos?.total_mano_obra || 0);
    const totalCostosRepuestos = Number(costos?.total_repuestos || 0);
    const totalCostosExtras = Number(costos?.total_costos_adicionales || 0);
    const totalGeneradoConExtras = totalGeneradoBase + totalCostosExtras;

    // 3. Gastos del negocio del periodo
    let gastosQuery = `SELECT COUNT(*) as total_gastos, COALESCE(SUM(monto), 0) as total_gastos_monto, categoria FROM GastosNegocio`;
    let gastosParams = [];
    if (valor) {
      switch (periodo) {
        case 'dia': gastosQuery += ' WHERE fecha_gasto = ?'; gastosParams.push(valor); break;
        case 'semana': { const [y, w] = valor.split('-').map(Number); gastosQuery += " WHERE strftime('%Y', fecha_gasto) = ? AND cast(strftime('%W', fecha_gasto) as integer) = ?"; gastosParams.push(String(y), w); break; }
        case 'anio': gastosQuery += " WHERE strftime('%Y', fecha_gasto) = ?"; gastosParams.push(valor); break;
        default: gastosQuery += " WHERE strftime('%Y-%m', fecha_gasto) = ?"; gastosParams.push(valor); break;
      }
    }
    gastosQuery += ' GROUP BY categoria';
    const { results: gastosPorCategoria } = await env.DB.prepare(gastosQuery).bind(...gastosParams).all();
    const totalGastos = gastosPorCategoria.reduce((sum, g) => sum + Number(g.total_gastos_monto || 0), 0);

    // 4. Órdenes por técnico
    let tecnicosWhere = 'WHERE o.tecnico_asignado_id IS NOT NULL';
    let tecnicosParams = [];
    if (rawFechaCond) {
      tecnicosWhere += ` AND ${rawFechaCond}`;
      tecnicosParams = [...fechaParams];
    }
    const tecnicosResult = await env.DB.prepare(`
      SELECT t.nombre as tecnico_nombre, t.id as tecnico_id,
        COUNT(*) as total_ordenes,
        COALESCE(SUM(o.monto_total), 0) as total_generado_base,
        SUM(CASE WHEN o.estado_trabajo = 'Cerrada' THEN 1 ELSE 0 END) as ordenes_cerradas
      FROM OrdenesTrabajo o LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
      ${tecnicosWhere}
      GROUP BY o.tecnico_asignado_id ORDER BY total_ordenes DESC
    `).bind(...tecnicosParams).all();

    // Agregar costos adicionales por técnico
    const tecnicosConCostos = await Promise.all((tecnicosResult.results || []).map(async t => {
      const costosTecnico = await env.DB.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN ca.categoria = 'Mano de Obra' THEN ca.monto ELSE 0 END), 0) as total_mano_obra,
          COALESCE(SUM(CASE WHEN ca.categoria = 'Repuestos/Materiales' THEN ca.monto ELSE 0 END), 0) as total_repuestos,
          COALESCE(SUM(ca.monto), 0) as total_costos
        FROM CostosAdicionales ca
        INNER JOIN OrdenesTrabajo o ON ca.orden_id = o.id
        WHERE o.tecnico_asignado_id = ?
        ${valor ? (periodo === 'dia' ? "AND date(ca.fecha_registro) = ?" : periodo === 'anio' ? "AND strftime('%Y', ca.fecha_registro) = ?" : "AND strftime('%Y-%m', ca.fecha_registro) = ?") : ''}
      `).bind(...(valor ? [t.tecnico_id, valor] : [t.tecnico_id])).first();
      const costosMO = Number(costosTecnico?.total_mano_obra || 0);
      const costosRM = Number(costosTecnico?.total_repuestos || 0);
      const costosT = Number(costosTecnico?.total_costos || 0);
      return { ...t, total_costos_mano_obra: costosMO, total_costos_repuestos: costosRM, total_costos_adicionales: costosT, total_generado: Number(t.total_generado_base || 0) + costosT, base_comisionable: Number(t.total_generado_base || 0) + costosMO };
    }));

    // 5. Trabajos más solicitados
    const trabajosResult = await env.DB.prepare(`
      SELECT
        SUM(CASE WHEN trabajo_frenos = 1 THEN 1 ELSE 0 END) as frenos,
        SUM(CASE WHEN trabajo_luces = 1 THEN 1 ELSE 0 END) as luces,
        SUM(CASE WHEN trabajo_tren_delantero = 1 THEN 1 ELSE 0 END) as tren_delantero,
        SUM(CASE WHEN trabajo_correas = 1 THEN 1 ELSE 0 END) as correas,
        SUM(CASE WHEN trabajo_componentes = 1 THEN 1 ELSE 0 END) as componentes
      FROM OrdenesTrabajo o ${fechaCondicion}
    `).bind(...params).first();

    // 6. Desglose por método de pago (desde tabla Pagos - fuente real)
    let pagosResultData = [];
    try {
      const pagosFromPagos = await env.DB.prepare(`
        SELECT p.metodo_pago, COUNT(DISTINCT p.orden_id) as cantidad, COALESCE(SUM(p.monto), 0) as total
        FROM Pagos p
        INNER JOIN OrdenesTrabajo o ON p.orden_id = o.id
        ${fechaCondicion}
        ${fechaCondicion ? 'AND' : 'WHERE'} o.estado != 'Cancelada'
          AND p.metodo_pago IS NOT NULL AND p.metodo_pago != ''
        GROUP BY p.metodo_pago
      `).bind(...params).all();
      pagosResultData = pagosFromPagos.results || [];
    } catch (e) {
      // Fallback a OT
      const pagosFromOT = await env.DB.prepare(`
        SELECT metodo_pago, COUNT(*) as cantidad, COALESCE(SUM(monto_abono), 0) as total
        FROM OrdenesTrabajo o ${fechaCondicion}
        AND o.metodo_pago IS NOT NULL AND o.metodo_pago != ''
        AND o.estado != 'Cancelada'
        GROUP BY metodo_pago
      `).bind(...params).all();
      pagosResultData = pagosFromOT.results || [];
    }

    // 7. Calcular comisiones POR TÉCNICO INDIVIDUAL (no promedio)
    // FIX: Get ALL active technicians (not just those found via GROUP BY tecnico_asignado_id)
    // A technician with only per-item assignments (via tecnico_id in servicios_seleccionados) must also appear
    let totalComisiones = 0;
    let totalBaseComisionable = 0;
    let comisionDetalles = [];

    // Obtener TODOS los técnicos activos
    const { results: todosTecnicos } = await env.DB.prepare(
      'SELECT id, nombre, COALESCE(comision_porcentaje, 40) as comision_porcentaje FROM Tecnicos'
    ).all();

    for (const tec of (todosTecnicos || [])) {
      const comisionPct = Number(tec.comision_porcentaje || 40);
      const factorComision = comisionPct / 100;

      // Buscar órdenes donde este técnico pueda tener items:
      // 1. tecnico_asignado_id = este técnico (legacy + items sin tecnico_id)
      // 2. Cualquier orden con servicios_seleccionados (puede tener items con tecnico_id = este técnico)
      let moServiciosTec = 0;
      let costosManoObraProporcionales = 0;

      try {
        let serviciosSQL = `
          SELECT o.tecnico_asignado_id, o.monto_total, o.servicios_seleccionados,
            COALESCE(ca.total_mano_obra, 0) as total_costos_mano_obra
          FROM OrdenesTrabajo o
          LEFT JOIN (
            SELECT orden_id,
              COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra
            FROM CostosAdicionales
            GROUP BY orden_id
          ) ca ON ca.orden_id = o.id
          WHERE (o.tecnico_asignado_id = ? OR (o.servicios_seleccionados IS NOT NULL AND o.servicios_seleccionados != ''))
        `;
        let serviciosParams = [tec.id];
        if (rawFechaCond) {
          serviciosSQL += ` AND ${rawFechaCond}`;
          serviciosParams = [...serviciosParams, ...fechaParams];
        }
        const { results: srvRows } = await env.DB.prepare(serviciosSQL).bind(...serviciosParams).all();

        for (const row of (srvRows || [])) {
          const tecnicoAsignadoId = row.tecnico_asignado_id;
          const costosMOOrden = Number(row.total_costos_mano_obra || 0);
          const montoBase = Number(row.monto_total || 0);

          let srvs = [];
          if (row.servicios_seleccionados) {
            try {
              srvs = typeof row.servicios_seleccionados === 'string'
                ? JSON.parse(row.servicios_seleccionados) : row.servicios_seleccionados;
              if (!Array.isArray(srvs)) srvs = [];
            } catch (e) { srvs = []; }
          }

          if (srvs.length > 0) {
            // Per-item filtering: si item tiene tecnico_id, solo cuenta para ese técnico
            // Si NO tiene tecnico_id (legacy), cuenta para el tecnico_asignado_id
            let manoObraThisTec = 0;
            let totalMOOrden = 0;
            let hasAnyItem = false;

            srvs.forEach(s => {
              const precio = Number(s.precio_final || s.precio_sugerido || 0);
              const esItemDeEsteTecnico = s.tecnico_id
                ? (Number(s.tecnico_id) === Number(tec.id))
                : (Number(tecnicoAsignadoId) === Number(tec.id));

              if (esItemDeEsteTecnico) {
                hasAnyItem = true;
                if (s.tipo_comision === 'mano_obra') {
                  manoObraThisTec += precio;
                }
              }
              // Track total MO in order for proportional cost distribution
              if (s.tipo_comision === 'mano_obra') {
                totalMOOrden += precio;
              }
            });

            if (hasAnyItem) {
              moServiciosTec += manoObraThisTec;
              // Costos MO: asignación directa por tecnico_id en CostosAdicionales
              try {
                const orderId = row.id || row.orden_id;
                if (orderId) {
                  const { results: costosDet } = await env.DB.prepare(`
                    SELECT monto, COALESCE(tecnico_id, 0) as tecnico_id
                    FROM CostosAdicionales
                    WHERE orden_id = ? AND COALESCE(categoria, 'Mano de Obra') = 'Mano de Obra'
                  `).bind(orderId).all();
                  if (costosDet && costosDet.length > 0) {
                    costosDet.forEach(c => {
                      const costoTecId = Number(c.tecnico_id || 0);
                      if (costoTecId === Number(tec.id) || (costoTecId === 0 && Number(tecnicoAsignadoId) === Number(tec.id))) {
                        costosManoObraProporcionales += Number(c.monto || 0);
                      }
                    });
                  }
                }
              } catch(e) {
                // Fallback proporcional
                if (costosMOOrden > 0 && totalMOOrden > 0) {
                  costosManoObraProporcionales += Math.round(costosMOOrden * (manoObraThisTec / totalMOOrden));
                } else if (costosMOOrden > 0 && Number(tecnicoAsignadoId) === Number(tec.id)) {
                  costosManoObraProporcionales += costosMOOrden;
                }
              }
            }
          } else {
            // No servicios_seleccionados: if this is the tecnico_asignado_id, use monto_total as base (legacy)
            if (Number(tecnicoAsignadoId) === Number(tec.id) && montoBase > 0) {
              moServiciosTec += montoBase;
              costosManoObraProporcionales += costosMOOrden;
            }
          }
        }
      } catch (e) {}

      // Skip technicians with zero base
      const baseTec = moServiciosTec + costosManoObraProporcionales;
      if (baseTec <= 0) continue;

      const comisionTec = Math.round(baseTec * factorComision);

      totalComisiones += comisionTec;
      totalBaseComisionable += baseTec;
      comisionDetalles.push({
        tecnico: tec.nombre,
        comision_porcentaje: comisionPct,
        base_comisionable: baseTec,
        comision: comisionTec
      });
    }

    // Calcular MO total de servicios para el resumen (para compatibilidad)
    let totalMOFromServicios = 0;
    try {
      const ordenesServicios = await env.DB.prepare(`
        SELECT o.servicios_seleccionados FROM OrdenesTrabajo o ${fechaCondicion}
        AND o.servicios_seleccionados IS NOT NULL AND o.servicios_seleccionados != ''
      `).bind(...params).all();
      (ordenesServicios.results || []).forEach(row => {
        if (row.servicios_seleccionados) {
          try {
            const srvs = typeof row.servicios_seleccionados === 'string'
              ? JSON.parse(row.servicios_seleccionados) : row.servicios_seleccionados;
            if (Array.isArray(srvs)) {
              srvs.forEach(s => {
                if (s.tipo_comision === 'mano_obra') {
                  totalMOFromServicios += Number(s.precio_final || s.precio_sugerido || 0);
                }
              });
            }
          } catch (e) {}
        }
      });
    } catch (e) {}

    return new Response(JSON.stringify({
      success: true, periodo, valor: valor || null,
      resumen: {
        total_ordenes: resumen?.total_ordenes || 0,
        ordenes_aprobadas: resumen?.ordenes_aprobadas || 0,
        ordenes_canceladas: resumen?.ordenes_canceladas || 0,
        ordenes_cerradas: resumen?.ordenes_cerradas || 0,
        ordenes_en_proceso: (resumen?.ordenes_en_camino || 0) + (resumen?.ordenes_en_trabajo || 0),
        ordenes_pendientes: resumen?.ordenes_pendientes || 0,
        ordenes_activas: Number(resumen?.total_ordenes || 0) - Number(resumen?.ordenes_canceladas || 0),
        canceladas: Number(resumen?.canceladas || resumen?.ordenes_canceladas || 0),
        total_generado: totalGeneradoConExtras,
        total_generado_base: totalGeneradoBase,
        total_abonos: totalAbonosOT,
        total_pagos_registrados: totalPagosRegistrados,
        total_entradas: totalAbonos,
        total_monto_ordenes: totalGeneradoBase,
        total_restantes: Number(resumen?.total_restantes || 0),
        total_impago: Number(resumen?.total_restantes || 0),
        total_pagado: totalAbonos,
        promedio_orden: Math.round(Number(resumen?.promedio_orden || 0)),
        comisiones_tecnicos: totalComisiones,
        total_adelantos: 0,
        total_gastos_negocio: totalGastos,
        liquidacion_comision: 0,
        liquidacion_domicilio: 0,
        total_salidas: totalComisiones + totalGastos,
        balance_neto: totalAbonos - totalComisiones - totalGastos
      },
      costos_adicionales: { total_items: costos?.total_items_costos || 0, total_monto: totalCostosExtras, desglose: { mano_de_obra: totalCostosManoObra, repuestos_materiales: totalCostosRepuestos } },
      gastos: { total_gastos: gastosPorCategoria.length, total_monto: totalGastos, por_categoria: gastosPorCategoria },
      comisiones_tecnicos: totalComisiones, base_comisionable: totalBaseComisionable,
      comision_porcentaje: 'individual',
      formula_comision: 'Comisión calculada POR TÉCNICO con su % individual. Los repuestos NO generan comisión.',
      comision_detalle: comisionDetalles,
      balance: totalGeneradoConExtras - totalComisiones - totalGastos,
      por_tecnico: tecnicosConCostos,
      trabajos_mas_solicitados: trabajosResult || {},
      por_metodo_pago: pagosResultData
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error al obtener dashboard:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
