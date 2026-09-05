// ============================================
// API: LIQUIDACIÓN DE TÉCNICOS
// FÓRMULA DINÁMICA: Pago = (Mano de Obra del catálogo + Costos MO extra) × comisión_técnico%
// Los REPUESTOS NO generan comisión para el técnico
// La comisión es individual por técnico (default 40%)
// FIX: Incluye órdenes Express, todos los estado_trabajo válidos
// FIX: Soporta tecnico_id por item en servicios_seleccionados
//   - Si un item tiene tecnico_id, solo suma a ese técnico
//   - Si un item NO tiene tecnico_id (órdenes antiguas), se asigna al tecnico_asignado_id
//   - Busca órdenes donde el técnico tenga items asignados (no solo tecnico_asignado_id)
// Global Pro Automotriz
// ============================================

import { asegurarColumnasFaltantes, getColumnas, buildFechaWhere } from '../../lib/db-helpers.js';

// Helper: filtrar servicios por tecnico_id con fallback a tecnico_asignado_id
// Retorna { manoObraServicios, repuestosServicios, itemsPropios, itemsOtros }
function filtrarServiciosPorTecnico(srvs, tecnicoId, tecnicoAsignadoId) {
  let manoObraServicios = 0;
  let repuestosServicios = 0;
  let itemsPropios = [];
  let itemsOtros = [];

  if (!Array.isArray(srvs)) return { manoObraServicios: 0, repuestosServicios: 0, itemsPropios: [], itemsOtros: [] };

  srvs.forEach(s => {
    const precio = Number(s.precio_final || s.precio_sugerido || 0);
    const esItemDeEsteTecnico = s.tecnico_id
      ? (Number(s.tecnico_id) === Number(tecnicoId))
      : (Number(tecnicoAsignadoId) === Number(tecnicoId)); // fallback: si no tiene tecnico_id, es del tecnico_asignado_id

    if (esItemDeEsteTecnico) {
      itemsPropios.push(s);
      if (s.tipo_comision === 'mano_obra') {
        manoObraServicios += precio;
      } else {
        repuestosServicios += precio;
      }
    } else {
      itemsOtros.push(s);
    }
  });

  return { manoObraServicios, repuestosServicios, itemsPropios, itemsOtros };
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    // Asegurar columna es_express existe ( doble verificación )
    try { await env.DB.prepare('ALTER TABLE OrdenesTrabajo ADD COLUMN es_express INTEGER DEFAULT 0').run(); } catch (e) {}

    const colOT = await getColumnas(env, 'OrdenesTrabajo');
    const colTec = await getColumnas(env, 'Tecnicos');
    const tieneComision = colTec.includes('comision_porcentaje');
    const tieneFechaCompletado = colOT.includes('fecha_completado');
    const tieneServicios = colOT.includes('servicios_seleccionados');
    // es_express SIEMPRE debe existir porque lo aseguramos arriba
    const tieneExpress = colOT.includes('es_express');

    const url = new URL(request.url);
    const tecnicoId = url.searchParams.get('tecnico_id');
    const periodo = url.searchParams.get('periodo') || 'mes';
    const valor = url.searchParams.get('valor');

    if (!tecnicoId) {
      return new Response(JSON.stringify({ success: false, error: 'Se requiere el ID del técnico' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    // Obtener datos del técnico con su comisión
    const tecSelect = tieneComision ? 'id, nombre, comision_porcentaje' : 'id, nombre';
    const tecnico = await env.DB.prepare(`SELECT ${tecSelect} FROM Tecnicos WHERE id = ?`).bind(tecnicoId).first();

    if (!tecnico) {
      return new Response(JSON.stringify({ success: false, error: 'Técnico no encontrado' }), {
        headers: { 'Content-Type': 'application/json' }, status: 404
      });
    }

    const comisionPorcentaje = Number(tecnico.comision_porcentaje || 40);
    const factorComision = comisionPorcentaje / 100;

    // Verificar si fecha_creacion existe para usar COALESCE
    const tieneFechaCreacion = colOT.includes('fecha_creacion');

    // Construir condición de fecha - Usar COALESCE para cubrir órdenes Express
    // que tienen fecha_ingreso=NULL pero sí tienen fecha_creacion
    const fechaCol = tieneFechaCreacion
      ? "COALESCE(o.fecha_ingreso, o.fecha_creacion)"
      : "o.fecha_ingreso";
    const { condicion: fechaWhere, params: fechaParams } = buildFechaWhere(fechaCol, periodo, valor);
    const fechaCondicion = fechaWhere ? `AND ${fechaWhere}` : '';

    // SELECT de columnas que pueden no existir - SIEMPRE incluir es_express
    let selectExtra = '';
    if (tieneFechaCompletado) selectExtra += ', o.fecha_completado';
    if (tieneServicios) selectExtra += ', o.servicios_seleccionados';
    // CRITICAL: siempre incluir es_express para distinguir Express vs Normal
    if (tieneExpress) selectExtra += ', o.es_express';

    // =============================================
    // CAMBIO CLAVE: Buscar TODAS las órdenes donde este técnico pueda tener items
    // Esto incluye órdenes donde:
    // 1. Es el tecnico_asignado_id (comportamiento anterior + items sin tecnico_id)
    // 2. Cualquier orden que tenga servicios_seleccionados (para buscar items con tecnico_id = este técnico)
    // Filtramos después en JavaScript por tecnico_id en cada item
    // =============================================
    const whereEstadosBase = `
      (
        o.estado = 'Aprobada'
        OR o.estado_trabajo IN (
          'Cerrada', 'Completada', 'En Progreso', 'En Sitio',
          'Pendiente Visita', 'Pendiente', 'Pendiente Piezas', 'No Completada'
        )
      )
    `;

    // Query principal: buscar órdenes donde el técnico es el asignado O que tengan servicios_seleccionados
    // (para cubrir órdenes donde el técnico tiene items pero NO es el tecnico_asignado_id)
    const params = [...fechaParams];
    let ordenes;
    try {
      ordenes = await env.DB.prepare(`
        SELECT
          o.id, o.numero_orden, COALESCE(o.cliente_nombre, c.nombre) as cliente_nombre, o.direccion, o.patente_placa,
          COALESCE(NULLIF(o.marca,''), v.marca) as marca,
          COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo,
          COALESCE(NULLIF(o.color,''), v.color) as color,
          o.fecha_ingreso as fecha_creacion
          ${selectExtra},
          o.monto_total, o.monto_abono, o.monto_restante,
          o.estado, o.estado_trabajo, o.tecnico_asignado_id,
          COALESCE(ca.total_mano_obra, 0) as total_costos_mano_obra,
          COALESCE(ca.total_repuestos, 0) as total_costos_repuestos,
          COALESCE(ca.total_general, 0) as total_costos_adicionales
        FROM OrdenesTrabajo o
        LEFT JOIN Clientes c ON o.cliente_id = c.id
        LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
        LEFT JOIN (
          SELECT
            orden_id,
            COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
            COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
            COALESCE(SUM(monto), 0) as total_general
          FROM CostosAdicionales
          GROUP BY orden_id
        ) ca ON ca.orden_id = o.id
        WHERE (
          o.tecnico_asignado_id = ?
          OR (o.servicios_seleccionados IS NOT NULL AND o.servicios_seleccionados != '')
        )
        AND ${whereEstadosBase}
        ${fechaCondicion}
        ORDER BY o.fecha_ingreso DESC
      `).bind(tecnicoId, ...params).all();
    } catch (queryError) {
      // Fallback: query sin servicios_seleccionados en WHERE (solo tecnico_asignado_id)
      console.log('Liquidar query fallback:', queryError.message);

      let fallbackSelect = `
        o.id, o.numero_orden, COALESCE(o.cliente_nombre, c.nombre) as cliente_nombre, o.direccion, o.patente_placa,
        COALESCE(NULLIF(o.marca,''), v.marca) as marca,
        COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo,
        COALESCE(NULLIF(o.color,''), v.color) as color,
        o.fecha_ingreso as fecha_creacion,
        o.monto_total, o.monto_abono, o.monto_restante,
        o.estado, o.estado_trabajo, o.tecnico_asignado_id`;

      if (tieneExpress) {
        fallbackSelect += ', o.es_express';
      }
      if (tieneServicios) {
        fallbackSelect += ', o.servicios_seleccionados';
      }
      if (tieneFechaCompletado) {
        fallbackSelect += ', o.fecha_completado';
      }

      try {
        ordenes = await env.DB.prepare(`
          SELECT
            ${fallbackSelect},
            COALESCE(ca.total_mano_obra, 0) as total_costos_mano_obra,
            COALESCE(ca.total_repuestos, 0) as total_costos_repuestos,
            COALESCE(ca.total_general, 0) as total_costos_adicionales
          FROM OrdenesTrabajo o
          LEFT JOIN Clientes c ON o.cliente_id = c.id
          LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
          LEFT JOIN (
            SELECT
              orden_id,
              COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
              COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
              COALESCE(SUM(monto), 0) as total_general
            FROM CostosAdicionales
            GROUP BY orden_id
          ) ca ON ca.orden_id = o.id
          WHERE o.tecnico_asignado_id = ?
          AND ${whereEstadosBase}
          ${fechaCondicion}
          ORDER BY o.fecha_ingreso DESC
        `).bind(tecnicoId, ...params).all();
      } catch (fallbackError2) {
        // Último fallback: sin es_express ni columnas opcionales, WHERE ampliado
        console.log('Liquidar query fallback2:', fallbackError2.message);
        ordenes = await env.DB.prepare(`
          SELECT
            o.id, o.numero_orden, o.cliente_nombre, o.direccion, o.patente_placa,
            COALESCE(NULLIF(o.marca,''), v.marca) as marca,
            COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo,
            COALESCE(NULLIF(o.color,''), v.color) as color,
            o.fecha_ingreso as fecha_creacion,
            o.monto_total, o.monto_abono, o.monto_restante,
            o.estado, o.estado_trabajo, o.tecnico_asignado_id,
            COALESCE(ca.total_mano_obra, 0) as total_costos_mano_obra,
            COALESCE(ca.total_repuestos, 0) as total_costos_repuestos,
            COALESCE(ca.total_general, 0) as total_costos_adicionales
          FROM OrdenesTrabajo o
          LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
          LEFT JOIN (
            SELECT
              orden_id,
              COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
              COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
              COALESCE(SUM(monto), 0) as total_general
            FROM CostosAdicionales
            GROUP BY orden_id
          ) ca ON ca.orden_id = o.id
          WHERE o.tecnico_asignado_id = ?
            AND (
              o.estado = 'Aprobada'
              OR o.estado_trabajo = 'Cerrada'
              OR o.estado_trabajo = 'Completada'
              OR o.estado_trabajo = 'En Progreso'
              OR o.estado_trabajo = 'En Sitio'
              OR o.estado_trabajo = 'Pendiente Visita'
              OR o.estado_trabajo = 'Pendiente'
            )
          ${fechaCondicion}
          ORDER BY o.fecha_ingreso DESC
        `).bind(tecnicoId, ...params).all();
      }
    }

    // =============================================
    // PASO 2: Filtrar órdenes y calcular comisiones por item
    // Solo incluir órdenes donde el técnico tiene items propios
    // =============================================
    const ordenesList = [];
    const ordenesRechazadas = []; // debug: órdenes donde no tiene items

    for (const orden of (ordenes.results || [])) {
      const montoBase = Number(orden.monto_total || 0);
      const costosManoObra = Number(orden.total_costos_mano_obra || 0);
      const costosRepuestos = Number(orden.total_costos_repuestos || 0);
      const costosTotales = Number(orden.total_costos_adicionales || 0);
      const tecnicoAsignadoId = orden.tecnico_asignado_id;

      // Parsear servicios_seleccionados
      let srvs = [];
      if (orden.servicios_seleccionados) {
        try {
          srvs = typeof orden.servicios_seleccionados === 'string'
            ? JSON.parse(orden.servicios_seleccionados)
            : orden.servicios_seleccionados;
          if (!Array.isArray(srvs)) srvs = [];
        } catch (e) { srvs = []; }
      }

      // =============================================
      // FILTRAR ITEMS POR TECNICO_ID
      // Si un item tiene tecnico_id, solo cuenta para ese técnico
      // Si un item NO tiene tecnico_id, cuenta para el tecnico_asignado_id (fallback legacy)
      // =============================================
      const { manoObraServicios, repuestosServicios, itemsPropios, itemsOtros } = filtrarServiciosPorTecnico(srvs, tecnicoId, tecnicoAsignadoId);

      // Si no hay servicios_seleccionados parseables Y el técnico es el asignado, usar monto_total como base (legacy)
      let manoObraFinal = manoObraServicios;
      let repuestosFinal = repuestosServicios;
      if (srvs.length === 0 && montoBase > 0 && Number(tecnicoAsignadoId) === Number(tecnicoId)) {
        manoObraFinal = montoBase; // sin catálogo, asumir todo como mano de obra
      }

      // Si este técnico NO tiene items en esta orden, skip (no incluir en la lista)
      const tieneItemsPropios = itemsPropios.length > 0 || (srvs.length === 0 && Number(tecnicoAsignadoId) === Number(tecnicoId));
      if (!tieneItemsPropios) {
        ordenesRechazadas.push({ id: orden.id, numero_orden: orden.numero_orden, motivo: 'Sin items asignados a este técnico' });
        continue; // skip esta orden
      }

      // =============================================
      // Costos adicionales de Mano de Obra: asignar directamente por tecnico_id
      // Si el costo tiene tecnico_id = este técnico, se le asigna directamente
      // Si NO tiene tecnico_id, se asigna al tecnico_asignado_id (legado)
      // =============================================
      let costosManoObraAsignados = 0;

      // Consultar costos adicionales de esta orden con tecnico_id
      try {
        const { results: costosDetallados } = await env.DB.prepare(`
          SELECT monto, COALESCE(tecnico_id, 0) as tecnico_id
          FROM CostosAdicionales
          WHERE orden_id = ? AND COALESCE(categoria, 'Mano de Obra') = 'Mano de Obra'
        `).bind(orden.id).all();

        if (costosDetallados && costosDetallados.length > 0) {
          costosDetallados.forEach(c => {
            const costoTecId = Number(c.tecnico_id || 0);
            // Si el costo tiene tecnico_id asignado a este técnico, o si no tiene y es el asignado
            if (costoTecId === Number(tecnicoId) || (costoTecId === 0 && Number(tecnicoAsignadoId) === Number(tecnicoId))) {
              costosManoObraAsignados += Number(c.monto || 0);
            }
          });
        }
      } catch(e) {
        // Fallback: si la columna tecnico_id no existe aún, usar el método anterior
        if (itemsPropios.length > 0) {
          const totalMOOrden = srvs.reduce((sum, s) => {
            if (s.tipo_comision === 'mano_obra') return sum + Number(s.precio_final || s.precio_sugerido || 0);
            return sum;
          }, 0);
          if (totalMOOrden > 0) {
            costosManoObraAsignados = Math.round(costosManoObra * (manoObraServicios / totalMOOrden));
          } else if (Number(tecnicoAsignadoId) === Number(tecnicoId)) {
            costosManoObraAsignados = costosManoObra;
          }
        } else if (Number(tecnicoAsignadoId) === Number(tecnicoId)) {
          costosManoObraAsignados = costosManoObra;
        }
      }

      // Base comisionable = SOLO mano de obra de ESTE técnico (catálogo + costos extra proporcionales)
      const baseComisionable = manoObraFinal + costosManoObraAsignados;
      const gananciaTecnico = Math.round(baseComisionable * factorComision);
      const totalCliente = montoBase + costosTotales;

      // Detectar si es express
      const esExpress = Number(orden.es_express || 0) === 1;

      // Contar cuántos técnicos participan en esta orden
      const tecnicosEnOrden = new Set();
      srvs.forEach(s => {
        if (s.tecnico_id) tecnicosEnOrden.add(Number(s.tecnico_id));
        else if (tecnicoAsignadoId) tecnicosEnOrden.add(Number(tecnicoAsignadoId));
      });
      const multiTecnico = tecnicosEnOrden.size > 1;

      ordenesList.push({
        ...orden,
        mano_obra_servicios: manoObraFinal,
        repuestos_servicios: repuestosFinal,
        total_costos_mano_obra: costosManoObraAsignados,
        total_costos_repuestos: costosRepuestos,
        total_costos_adicionales: costosTotales,
        base_comisionable: baseComisionable,
        total_cliente: totalCliente,
        ganancia_tecnico: gananciaTecnico,
        comision_aplicada: comisionPorcentaje,
        es_express: esExpress,
        tipo_orden: esExpress ? 'Express' : 'Normal',
        estado_resumen: orden.estado_trabajo === 'Cerrada' ? 'Cerrada' : (orden.estado || 'N/A'),
        // Nuevos campos para identificar items propios vs de otros
        items_propios: itemsPropios.length,
        items_otros: itemsOtros.length,
        multi_tecnico: multiTecnico,
        es_tecnico_asignado: Number(tecnicoAsignadoId) === Number(tecnicoId)
      });
    }

    // =============================================
    // PASO 3: Cargar órdenes canceladas en liquidación (persistidas)
    // =============================================
    let canceladasSet = new Set();
    try {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS LiquidacionCanceladas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orden_id INTEGER NOT NULL,
        tecnico_id INTEGER NOT NULL,
        cancelado INTEGER NOT NULL DEFAULT 1,
        fecha_cancelacion TEXT DEFAULT (datetime('now', '-3 hours')),
        motivo TEXT DEFAULT '',
        UNIQUE(orden_id, tecnico_id),
        FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id),
        FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
      )`).run();

      const { results: canceladasResults } = await env.DB.prepare(`
        SELECT orden_id FROM LiquidacionCanceladas
        WHERE tecnico_id = ? AND cancelado = 1
      `).bind(tecnicoId).all();

      (canceladasResults || []).forEach(r => canceladasSet.add(Number(r.orden_id)));
    } catch (e) {
      console.log('LiquidacionCanceladas no disponible:', e.message);
    }

    // Marcar cada orden con su estado de cancelación persistido
    ordenesList.forEach(o => {
      o.cancelado_liquidacion = canceladasSet.has(Number(o.id));
    });

    const totalBase = ordenesList.reduce((sum, o) => sum + Number(o.monto_total || 0), 0);
    const totalManoObra = ordenesList.reduce((sum, o) => sum + o.total_costos_mano_obra, 0);
    const totalRepuestos = ordenesList.reduce((sum, o) => sum + o.total_costos_repuestos, 0);
    const totalCostosExtras = ordenesList.reduce((sum, o) => sum + o.total_costos_adicionales, 0);
    const totalMOFromServicios = ordenesList.reduce((sum, o) => sum + (o.mano_obra_servicios || 0), 0);
    const totalRepFromServicios = ordenesList.reduce((sum, o) => sum + (o.repuestos_servicios || 0), 0);
    const totalBaseComisionable = totalMOFromServicios + totalManoObra;
    const totalCliente = totalBase + totalCostosExtras;
    const totalTecnico = Math.round(totalBaseComisionable * factorComision);

    // Desglose Express vs Normal
    const ordenesExpress = ordenesList.filter(o => o.es_express);
    const ordenesNormales = ordenesList.filter(o => !o.es_express);
    const totalExpress = ordenesExpress.reduce((sum, o) => sum + Number(o.monto_total || 0), 0);
    const totalNormal = ordenesNormales.reduce((sum, o) => sum + Number(o.monto_total || 0), 0);
    const comisionExpress = ordenesExpress.reduce((sum, o) => sum + (o.ganancia_tecnico || 0), 0);
    const comisionNormal = ordenesNormales.reduce((sum, o) => sum + (o.ganancia_tecnico || 0), 0);

    // Total FINAL del técnico
    const totalTecnicoFinal = totalTecnico;

    // =============================================
    // ADELANTOS PENDIENTES DEL TÉCNICO
    // Se descuentan del total a pagar
    // =============================================
    let adelantos = [];
    let totalAdelantosPendientes = 0;
    try {
      // Asegurar tabla de adelantos
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS AdelantosTecnico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tecnico_id INTEGER NOT NULL,
        monto REAL NOT NULL,
        concepto TEXT NOT NULL DEFAULT 'Adelanto',
        fecha_adelanto TEXT NOT NULL,
        registrado_por TEXT DEFAULT 'admin',
        estado TEXT NOT NULL DEFAULT 'pendiente',
        liquidacion_id INTEGER,
        fecha_registro TEXT DEFAULT (datetime('now', '-3 hours')),
        notas TEXT DEFAULT '',
        FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
      )`).run();
      try { await env.DB.prepare('ALTER TABLE AdelantosTecnico ADD COLUMN notas TEXT DEFAULT ""').run(); } catch(e) {}

      const { results: adResults } = await env.DB.prepare(`
        SELECT * FROM AdelantosTecnico
        WHERE tecnico_id = ? AND estado = 'pendiente'
        ORDER BY fecha_adelanto DESC
      `).bind(tecnicoId).all();
      adelantos = adResults || [];
      totalAdelantosPendientes = adelantos.reduce((sum, a) => sum + Number(a.monto || 0), 0);
    } catch (e) {
      console.log('Adelantos no disponibles:', e.message);
    }

    // Neto a pagar = comisión - adelantos pendientes
    const netoAPagar = Math.max(0, totalTecnicoFinal - totalAdelantosPendientes);

    // DIAGNÓSTICO: Contar órdenes SIN filtro de fecha para comparar
    let diagSinFiltro = null;
    let diagTodasDelTecnico = null;
    try {
      // Total de órdenes del técnico sin filtro de fecha
      const countSinFiltro = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM OrdenesTrabajo o WHERE o.tecnico_asignado_id = ? AND ${whereEstadosBase}`
      ).bind(tecnicoId).first();

      // Detalle de TODAS las órdenes del técnico (sin filtro fecha) para ver qué se excluye
      const todasDelTecnico = await env.DB.prepare(
        `SELECT o.id, o.numero_orden, o.estado, o.estado_trabajo, o.es_express,
                o.fecha_ingreso, o.fecha_creacion, o.tecnico_asignado_id
         FROM OrdenesTrabajo o
         WHERE o.tecnico_asignado_id = ?
         ORDER BY o.id DESC LIMIT 20`
      ).bind(tecnicoId).all();

      diagSinFiltro = countSinFiltro?.cnt || 0;
      diagTodasDelTecnico = (todasDelTecnico.results || []).map(r =>
        `#${r.numero_orden}: est=${r.estado}/trab=${r.estado_trabajo}/express=${r.es_express}/fing=${r.fecha_ingreso||'NULL'}/fcrea=${r.fecha_creacion||'NULL'}/pasaWhere=${r.estado==='Aprobada'||['Cerrada','Completada','En Progreso','En Sitio','Pendiente Visita','Pendiente','Pendiente Piezas','No Completada'].includes(r.estado_trabajo)?'SI':'NO'}`
      );
    } catch (diagErr) {
      diagSinFiltro = 'error: ' + diagErr.message;
    }

    return new Response(JSON.stringify({
      success: true,
      tecnico: { id: tecnico.id, nombre: tecnico.nombre, comision_porcentaje: comisionPorcentaje },
      tecnico_id: tecnicoId, periodo, valor: valor || null,
      ordenes: ordenesList,
      totalOt: ordenesList.length,
      totalGenerado: totalCliente,
      totalBaseOriginal: totalBase,
      desgloseServicios: { mano_de_obra: totalMOFromServicios, repuestos: totalRepFromServicios },
      desgloseCostos: { mano_de_obra: totalManoObra, repuestos_materiales: totalRepuestos, total: totalCostosExtras },
      desgloseTipo: {
        express: { cantidad: ordenesExpress.length, total: totalExpress, comision: comisionExpress },
        normal: { cantidad: ordenesNormales.length, total: totalNormal, comision: comisionNormal }
      },
      baseComisionable: totalBaseComisionable,
      totalTecnico: totalTecnico,
      totalTecnicoFinal,
      adelantos,
      totalAdelantosPendientes,
      netoAPagar,
      formula: `(Mano de Obra de servicios + Costos MO extra) x ${comisionPorcentaje}% - Adelantos pendientes`,
      _debug: {
        tieneExpress, colOT_count: colOT.length, selectExtra,
        fechaCol, fechaCondicion: fechaCondicion || 'sin filtro fecha',
        ordenesSinFiltroFecha: diagSinFiltro,
        ordenesConFiltroFecha: ordenesList.length,
        ordenesExcluidasPorLiquidacion: 0,
        todasDelTecnico: diagTodasDelTecnico,
        ordenesRechazadasSinItems: ordenesRechazadas
      }
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error al obtener liquidación de técnicos:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
