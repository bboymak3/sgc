// ============================================
// API: LIQUIDAR ÓRDENES (Nuevo Panel)
// Permite asignar técnicos con % personalizado a órdenes cerradas/aprobadas
// Los datos se guardan en tabla LiquidacionOrden
// Luego Liquidar Técnicos lee de esta tabla para sumar al total
// FIX: Pre-calcular base comisionable por técnico desde items con tecnico_id
// Global Pro Automotriz
// ============================================

import { asegurarColumnasFaltantes, getColumnas, buildFechaWhere } from '../../lib/db-helpers.js';

// Helper: agrupar servicios por tecnico_id y calcular base por técnico
function agruparServiciosPorTecnico(srvs, tecnicoAsignadoId) {
  const itemsPorTecnico = {};

  if (!Array.isArray(srvs) || srvs.length === 0) {
    // Sin servicios, asignar todo al tecnico_asignado_id
    if (tecnicoAsignadoId) {
      itemsPorTecnico[tecnicoAsignadoId] = { base: 0, items: [], tieneItemsConTecnico: false };
    }
    return itemsPorTecnico;
  }

  srvs.forEach(s => {
    const tid = s.tecnico_id ? Number(s.tecnico_id) : Number(tecnicoAsignadoId);
    if (!itemsPorTecnico[tid]) {
      itemsPorTecnico[tid] = { base: 0, items: [], tieneItemsConTecnico: !!s.tecnico_id };
    }
    const precio = Number(s.precio_final || s.precio_sugerido || 0);
    if (s.tipo_comision === 'mano_obra') {
      itemsPorTecnico[tid].base += precio;
    }
    itemsPorTecnico[tid].items.push(s);
    if (s.tecnico_id) itemsPorTecnico[tid].tieneItemsConTecnico = true;
  });

  return itemsPorTecnico;
}

// GET: Listar órdenes cerradas/aprobadas pendientes de liquidar + las ya liquidadas
export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const url = new URL(request.url);
    const accion = url.searchParams.get('accion') || 'listar';
    const ordenId = url.searchParams.get('orden_id');
    const periodo = url.searchParams.get('periodo') || 'mes';
    const valor = url.searchParams.get('valor');

    // Asegurar columna es_express
    try { await env.DB.prepare('ALTER TABLE OrdenesTrabajo ADD COLUMN es_express INTEGER DEFAULT 0').run(); } catch (e) {}

    const colOT = await getColumnas(env, 'OrdenesTrabajo');
    const tieneServicios = colOT.includes('servicios_seleccionados');
    const tieneFechaCompletado = colOT.includes('fecha_completado');
    const tieneExpress = colOT.includes('es_express');
    const tieneCargoDomicilio = colOT.includes('cargo_domicilio');

    // ========================================
    // ACCIÓN: Listar órdenes cerradas/aprobadas
    // ========================================
    if (accion === 'listar') {
      // Construir filtro de fecha
      const fechaCol = colOT.includes('fecha_creacion')
        ? "COALESCE(o.fecha_ingreso, o.fecha_creacion)"
        : "o.fecha_ingreso";
      const { condicion: fechaWhere, params: fechaParams } = buildFechaWhere(fechaCol, periodo, valor);
      const fechaCondicion = fechaWhere ? `AND ${fechaWhere}` : '';

      // Órdenes cerradas/aprobadas que pueden ser liquidadas
      let selectExtra = '';
      if (tieneServicios) selectExtra += ', o.servicios_seleccionados';
      if (tieneExpress) selectExtra += ', o.es_express';
      if (tieneCargoDomicilio) selectExtra += ', o.cargo_domicilio';
      if (tieneFechaCompletado) selectExtra += ', o.fecha_completado';

      const params = [...fechaParams];

      const ordenes = await env.DB.prepare(`
        SELECT
          o.id, o.numero_orden, COALESCE(o.cliente_nombre, c.nombre) as cliente_nombre, o.direccion, o.patente_placa,
          COALESCE(NULLIF(o.marca,''), v.marca) as marca,
          COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo,
          COALESCE(NULLIF(o.color,''), v.color) as color,
          o.fecha_ingreso as fecha_creacion
          ${selectExtra},
          o.monto_total, o.monto_abono, o.monto_restante,
          o.estado, o.estado_trabajo,
          o.tecnico_asignado_id,
          t.nombre as tecnico_nombre,
          COALESCE(t.comision_porcentaje, 40) as comision_porcentaje,
          COALESCE(ca.total_mano_obra, 0) as total_costos_mano_obra,
          COALESCE(ca.total_repuestos, 0) as total_costos_repuestos,
          COALESCE(ca.total_general, 0) as total_costos_adicionales
        FROM OrdenesTrabajo o
        LEFT JOIN Clientes c ON o.cliente_id = c.id
        LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
        LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
        LEFT JOIN (
          SELECT orden_id,
            COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
            COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
            COALESCE(SUM(monto), 0) as total_general
          FROM CostosAdicionales GROUP BY orden_id
        ) ca ON ca.orden_id = o.id
        WHERE (
          o.estado_trabajo IN ('Cerrada', 'Completada')
          OR o.estado = 'Aprobada'
        )
        ${fechaCondicion}
        ORDER BY o.fecha_ingreso DESC
      `).bind(...params).all();

      // Para cada orden, obtener liquidaciones existentes en LiquidacionOrden
      const ordenIds = (ordenes.results || []).map(o => o.id);
      let liquidacionesMap = {};
      if (ordenIds.length > 0) {
        const ph = ordenIds.map(() => '?').join(',');
        const liqs = await env.DB.prepare(
          `SELECT lo.*, t.nombre as tecnico_nombre FROM LiquidacionOrden lo LEFT JOIN Tecnicos t ON lo.tecnico_id = t.id WHERE lo.orden_id IN (${ph}) ORDER BY lo.id`
        ).bind(...ordenIds).all();
        (liqs.results || []).forEach(l => {
          if (!liquidacionesMap[l.orden_id]) liquidacionesMap[l.orden_id] = [];
          liquidacionesMap[l.orden_id].push(l);
        });
      }

      // Calcular base comisionable por orden Y por técnico
      const ordenesConDatos = await Promise.all((ordenes.results || []).map(async orden => {
        const montoBase = Number(orden.monto_total || 0);
        const costosManoObra = Number(orden.total_costos_mano_obra || 0);

        let manoObraServicios = 0;
        let srvs = [];
        if (orden.servicios_seleccionados) {
          try {
            srvs = typeof orden.servicios_seleccionados === 'string'
              ? JSON.parse(orden.servicios_seleccionados)
              : orden.servicios_seleccionados;
            if (Array.isArray(srvs)) {
              srvs.forEach(s => {
                const precio = Number(s.precio_final || s.precio_sugerido || 0);
                if (s.tipo_comision === 'mano_obra') {
                  manoObraServicios += precio;
                }
              });
            }
          } catch (e) {}
        }

        if (manoObraServicios === 0 && montoBase > 0) {
          manoObraServicios = montoBase;
        }

        const baseComisionable = manoObraServicios + costosManoObra;
        const cargoDomicilio = Number(orden.cargo_domicilio || 0);
        const esExpress = Number(orden.es_express || 0) === 1;

        // =============================================
        // NUEVO: Agrupar items por técnico para pre-calcular bases
        // =============================================
        const itemsPorTecnico = agruparServiciosPorTecnico(srvs, orden.tecnico_asignado_id);

        // Costos adicionales de Mano de Obra: asignar directamente por tecnico_id
        const tecnicosIds = Object.keys(itemsPorTecnico);
        let basesPorTecnico = {};
        try {
          const { results: costosDetallados } = await env.DB.prepare(`
            SELECT monto, COALESCE(tecnico_id, 0) as tecnico_id
            FROM CostosAdicionales
            WHERE orden_id = ? AND COALESCE(categoria, 'Mano de Obra') = 'Mano de Obra'
          `).bind(orden.id).all();

          tecnicosIds.forEach(tid => {
            const baseTec = itemsPorTecnico[tid].base;
            let costoMOAsignado = 0;
            if (costosDetallados && costosDetallados.length > 0) {
              costosDetallados.forEach(c => {
                const costoTecId = Number(c.tecnico_id || 0);
                if (costoTecId === Number(tid) || (costoTecId === 0 && Number(orden.tecnico_asignado_id) === Number(tid))) {
                  costoMOAsignado += Number(c.monto || 0);
                }
              });
            }
            basesPorTecnico[tid] = baseTec + costoMOAsignado;
          });
        } catch(e) {
          // Fallback: distribución proporcional de costos MO
          const totalMOOrden = srvs.reduce((sum, s) => {
            if (s.tipo_comision === 'mano_obra') return sum + Number(s.precio_final || s.precio_sugerido || 0);
            return sum;
          }, 0);

          tecnicosIds.forEach(tid => {
            const baseTec = itemsPorTecnico[tid].base;
            let costoMOAsignado = 0;
            if (totalMOOrden > 0) {
              costoMOAsignado = Math.round(costosManoObra * (baseTec / totalMOOrden));
            }
            basesPorTecnico[tid] = baseTec + costoMOAsignado;
          });
        }

        if (tecnicosIds.length === 0 && orden.tecnico_asignado_id) {
          basesPorTecnico[orden.tecnico_asignado_id] = baseComisionable;
        }

        return {
          ...orden,
          mano_obra_servicios: manoObraServicios,
          base_comisionable: baseComisionable,
          cargo_domicilio: cargoDomicilio,
          es_express: esExpress,
          tipo_orden: esExpress ? 'Express' : 'Normal',
          liquidaciones: liquidacionesMap[orden.id] || [],
          ya_liquidada: (liquidacionesMap[orden.id] || []).length > 0,
          // Nuevos campos: bases por técnico
          bases_por_tecnico: basesPorTecnico,
          items_por_tecnico: Object.keys(itemsPorTecnico).reduce((acc, tid) => {
            acc[tid] = { base: itemsPorTecnico[tid].base, items: itemsPorTecnico[tid].items.length };
            return acc;
          }, {}),
          multi_tecnico: tecnicosIds.length > 1
        };
      }));

      // Obtener lista de técnicos activos
      const { results: tecnicosList } = await env.DB.prepare(
        'SELECT id, nombre, comision_porcentaje FROM Tecnicos WHERE activo = 1 ORDER BY nombre'
      ).all();

      return new Response(JSON.stringify({
        success: true,
        ordenes: ordenesConDatos,
        tecnicos: tecnicosList || [],
        periodo, valor
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ========================================
    // ACCIÓN: Obtener liquidaciones de una orden específica
    // ========================================
    if (accion === 'detalle' && ordenId) {
      const orden = await env.DB.prepare(
        `SELECT o.*, COALESCE(o.cliente_nombre, c.nombre) as cliente_nombre, t.nombre as tecnico_nombre, COALESCE(t.comision_porcentaje, 40) as comision_porcentaje
         FROM OrdenesTrabajo o LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id LEFT JOIN Clientes c ON o.cliente_id = c.id WHERE o.id = ?`
      ).bind(ordenId).first();

      if (!orden) {
        return new Response(JSON.stringify({ success: false, error: 'Orden no encontrada' }), {
          headers: { 'Content-Type': 'application/json' }, status: 404
        });
      }

      const { results: liquidaciones } = await env.DB.prepare(
        `SELECT lo.*, t.nombre as tecnico_nombre FROM LiquidacionOrden lo LEFT JOIN Tecnicos t ON lo.tecnico_id = t.id WHERE lo.orden_id = ? ORDER BY lo.id`
      ).bind(ordenId).all();

      // Calcular bases por técnico desde items
      let srvs = [];
      try {
        srvs = typeof orden.servicios_seleccionados === 'string'
          ? JSON.parse(orden.servicios_seleccionados)
          : (orden.servicios_seleccionados || []);
        if (!Array.isArray(srvs)) srvs = [];
      } catch (e) {}

      const itemsPorTecnico = agruparServiciosPorTecnico(srvs, orden.tecnico_asignado_id);
      let basesPorTecnico = {};
      const costosManoObra = await obtenerCostosManoObra(env, ordenId);
      const tecnicosIds = Object.keys(itemsPorTecnico);

      try {
        const { results: costosDetallados } = await env.DB.prepare(`
          SELECT monto, COALESCE(tecnico_id, 0) as tecnico_id
          FROM CostosAdicionales
          WHERE orden_id = ? AND COALESCE(categoria, 'Mano de Obra') = 'Mano de Obra'
        `).bind(ordenId).all();

        tecnicosIds.forEach(tid => {
          const baseTec = itemsPorTecnico[tid].base;
          let costoMOAsignado = 0;
          if (costosDetallados && costosDetallados.length > 0) {
            costosDetallados.forEach(c => {
              const costoTecId = Number(c.tecnico_id || 0);
              if (costoTecId === Number(tid) || (costoTecId === 0 && Number(orden.tecnico_asignado_id) === Number(tid))) {
                costoMOAsignado += Number(c.monto || 0);
              }
            });
          }
          basesPorTecnico[tid] = baseTec + costoMOAsignado;
        });
      } catch(e) {
        // Fallback: distribución proporcional de costos MO
        const totalMOOrden = srvs.reduce((sum, s) => {
          if (s.tipo_comision === 'mano_obra') return sum + Number(s.precio_final || s.precio_sugerido || 0);
          return sum;
        }, 0);
        tecnicosIds.forEach(tid => {
          const baseTec = itemsPorTecnico[tid].base;
          let costoMOAsignado = 0;
          if (totalMOOrden > 0) costoMOAsignado = Math.round(costosManoObra * (baseTec / totalMOOrden));
          basesPorTecnico[tid] = baseTec + costoMOAsignado;
        });
      }

      if (tecnicosIds.length === 0 && orden.tecnico_asignado_id) {
        basesPorTecnico[orden.tecnico_asignado_id] = (srvs.reduce((sum, s) => sum + Number(s.precio_final || s.precio_sugerido || 0), 0)) + costosManoObra;
      }

      return new Response(JSON.stringify({
        success: true,
        orden,
        liquidaciones: liquidaciones || [],
        bases_por_tecnico: basesPorTecnico,
        items_por_tecnico: Object.keys(itemsPorTecnico).reduce((acc, tid) => {
          acc[tid] = { base: itemsPorTecnico[tid].base, items: itemsPorTecnico[tid].items.length };
          return acc;
        }, {})
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ========================================
    // ACCIÓN: Obtener todas las liquidaciones (para resumen)
    // ========================================
    if (accion === 'resumen') {
      const fechaCol = colOT.includes('fecha_creacion')
        ? "COALESCE(o.fecha_ingreso, o.fecha_creacion)"
        : "o.fecha_ingreso";
      const { condicion: fechaWhere, params: fechaParams } = buildFechaWhere(fechaCol, periodo, valor);
      const fechaCondicion = fechaWhere ? `AND ${fechaWhere}` : '';

      const resumen = await env.DB.prepare(`
        SELECT
          lo.tecnico_id,
          t.nombre as tecnico_nombre,
          COUNT(DISTINCT lo.orden_id) as total_ordenes,
          SUM(lo.base_comisionable) as total_base,
          SUM(lo.monto_comision) as total_comision,
          SUM(lo.monto_domicilio) as total_domicilio
        FROM LiquidacionOrden lo
        LEFT JOIN Tecnicos t ON lo.tecnico_id = t.id
        LEFT JOIN OrdenesTrabajo o ON lo.orden_id = o.id
        WHERE 1=1
        ${fechaCondicion}
        GROUP BY lo.tecnico_id
        ORDER BY t.nombre
      `).bind(...fechaParams).all();

      return new Response(JSON.stringify({
        success: true,
        resumen: resumen.results || [],
        periodo, valor
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'Acción no reconocida' }), {
      headers: { 'Content-Type': 'application/json' }, status: 400
    });

  } catch (error) {
    console.error('Error en liquidar-ordenes GET:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}

// Helper: obtener costos adicionales de MO para una orden
async function obtenerCostosManoObra(env, ordenId) {
  try {
    const result = await env.DB.prepare(
      "SELECT COALESCE(SUM(monto), 0) as total FROM CostosAdicionales WHERE orden_id = ? AND COALESCE(categoria, 'Mano de Obra') = 'Mano de Obra'"
    ).bind(ordenId).first();
    return Number(result?.total || 0);
  } catch (e) {
    return 0;
  }
}

// POST: Guardar liquidación de una orden (asignar técnicos con %)
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const data = await request.json();

    if (!data.orden_id) {
      return new Response(JSON.stringify({ success: false, error: 'Falta orden_id' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    if (!data.tecnicos || !Array.isArray(data.tecnicos) || data.tecnicos.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Falta array de tecnicos' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    // Verificar que la orden existe
    const orden = await env.DB.prepare(
      'SELECT id, numero_orden, estado, estado_trabajo FROM OrdenesTrabajo WHERE id = ?'
    ).bind(data.orden_id).first();

    if (!orden) {
      return new Response(JSON.stringify({ success: false, error: 'Orden no encontrada' }), {
        headers: { 'Content-Type': 'application/json' }, status: 404
      });
    }

    // Eliminar liquidaciones previas de esta orden
    await env.DB.prepare('DELETE FROM LiquidacionOrden WHERE orden_id = ?').bind(data.orden_id).run();

    // Insertar las nuevas liquidaciones
    let insertadas = [];
    for (const tec of data.tecnicos) {
      if (!tec.tecnico_id) continue;

      const porcentaje = Number(tec.porcentaje_comision || 40);
      const baseComisionable = Number(tec.base_comisionable || 0);
      const montoComision = Math.round(baseComisionable * (porcentaje / 100));
      const montoDomicilio = Number(tec.monto_domicilio || 0);
      const observaciones = tec.observaciones || '';

      const result = await env.DB.prepare(`
        INSERT INTO LiquidacionOrden (orden_id, tecnico_id, porcentaje_comision, base_comisionable, monto_comision, monto_domicilio, observaciones, estado)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente')
      `).bind(data.orden_id, tec.tecnico_id, porcentaje, baseComisionable, montoComision, montoDomicilio, observaciones).run();

      // Obtener nombre del técnico
      const tecData = await env.DB.prepare('SELECT nombre FROM Tecnicos WHERE id = ?').bind(tec.tecnico_id).first();

      insertadas.push({
        tecnico_id: tec.tecnico_id,
        tecnico_nombre: tecData?.nombre || 'Desconocido',
        porcentaje_comision: porcentaje,
        base_comisionable: baseComisionable,
        monto_comision: montoComision,
        monto_domicilio: montoDomicilio
      });
    }

    return new Response(JSON.stringify({
      success: true,
      mensaje: `Liquidación guardada para orden #${orden.numero_orden}`,
      orden_id: data.orden_id,
      tecnicos_liquidados: insertadas
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error en liquidar-ordenes POST:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}

// DELETE: Eliminar liquidación de una orden
export async function onRequestDelete(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const url = new URL(request.url);
    const ordenId = url.searchParams.get('orden_id');

    if (!ordenId) {
      return new Response(JSON.stringify({ success: false, error: 'Falta orden_id' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    await env.DB.prepare('DELETE FROM LiquidacionOrden WHERE orden_id = ?').bind(ordenId).run();

    return new Response(JSON.stringify({
      success: true,
      mensaje: 'Liquidación eliminada correctamente'
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error en liquidar-ordenes DELETE:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
