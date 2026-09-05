// ============================================
// API: EXPORTAR TODOS LOS DATOS (completo)
// Consulta TODAS las tablas de la BD con filtros de periodo
// SGC
// ============================================
// Usa PRAGMA para detectar columnas existentes y evitar
// errores "no such column" en D1 remoto.
// SIEMPRE usa fecha_ingreso para filtrar/ordenar (columna segura).
// fecha_creacion solo se agrega como columna extra de lectura.
// FIX: Usa buildFechaWhere() con parámetros .bind() para
// evitar SQL injection y errores de alias de tabla.
// ============================================

import { chileNowISO, buildFechaWhere } from '../../lib/db-helpers.js';

async function asegurarTablas(env) {
  try {
    // ===== CREAR TABLAS SI NO EXISTEN =====
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS CostosAdicionales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      concepto TEXT NOT NULL,
      monto REAL NOT NULL,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
      registrado_por TEXT,
      categoria TEXT NOT NULL DEFAULT 'Mano de Obra'
    )`).run();

    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_costos_orden ON CostosAdicionales(orden_id)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_costos_categoria ON CostosAdicionales(categoria)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS GastosNegocio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concepto TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'Otros',
      monto REAL NOT NULL,
      fecha_gasto DATE NOT NULL,
      observaciones TEXT,
      registrado_por TEXT,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON GastosNegocio(categoria)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON GastosNegocio(fecha_gasto)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS Pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      monto REAL NOT NULL,
      metodo_pago TEXT NOT NULL,
      fecha_pago DATETIME DEFAULT CURRENT_TIMESTAMP,
      observaciones TEXT
    )`).run();

    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pagos_orden ON Pagos(orden_id)`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ServiciosCatalogo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      precio_sugerido REAL NOT NULL DEFAULT 0,
      categoria TEXT NOT NULL DEFAULT 'Mantenimiento',
      tipo_comision TEXT NOT NULL DEFAULT 'mano_obra',
      activo INTEGER DEFAULT 1,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ModelosVehiculo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // ===== COLUMNAS FALTANTES EN OrdenesTrabajo =====
    const columnasOT = [
      'servicios_seleccionados TEXT',
      'diagnostico_checks TEXT',
      'diagnostico_observaciones TEXT',
      'fecha_creacion TEXT',
      'fecha_completado TEXT',
      'referencia_direccion TEXT',
      'color TEXT DEFAULT NULL'
    ];
    for (const colDef of columnasOT) {
      try {
        await env.DB.prepare(`ALTER TABLE OrdenesTrabajo ADD COLUMN ${colDef}`).run();
      } catch (e) { /* columna ya existe */ }
    }

    // ===== COLUMNAS FALTANTES EN Vehiculos =====
    try {
      await env.DB.prepare(`ALTER TABLE Vehiculos ADD COLUMN color TEXT DEFAULT NULL`).run();
    } catch (e) { /* ya existe */ }

    // ===== COLUMNAS FALTANTES EN Tecnicos =====
    try {
      await env.DB.prepare(`ALTER TABLE Tecnicos ADD COLUMN comision_porcentaje REAL NOT NULL DEFAULT 40`).run();
    } catch (e) { /* ya existe */ }

    // ===== COLUMNAS FALTANTES EN CostosAdicionales =====
    try {
      await env.DB.prepare(`ALTER TABLE CostosAdicionales ADD COLUMN categoria TEXT NOT NULL DEFAULT 'Mano de Obra'`).run();
    } catch (e) { /* ya existe */ }

    // ===== TABLA LiquidacionCanceladas (para excluir órdenes canceladas en liquidación) =====
    try {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS LiquidacionCanceladas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orden_id INTEGER NOT NULL,
        tecnico_id INTEGER NOT NULL,
        fecha_cancelacion TEXT DEFAULT (datetime('now', '-3 hours')),
        UNIQUE(orden_id, tecnico_id)
      )`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_liq_canceladas_orden ON LiquidacionCanceladas(orden_id)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_liq_canceladas_tecnico ON LiquidacionCanceladas(tecnico_id)`).run();
    } catch (e) { /* ya existe */ }

    // ===== TABLA AdelantosTecnico (con notas) =====
    try {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS AdelantosTecnico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tecnico_id INTEGER NOT NULL,
        monto REAL NOT NULL,
        concepto TEXT NOT NULL DEFAULT 'Adelanto',
        fecha_adelanto TEXT NOT NULL,
        registrado_por TEXT DEFAULT 'admin',
        estado TEXT NOT NULL DEFAULT 'pendiente',
        liquidacion_id INTEGER,
        notas TEXT DEFAULT '',
        fecha_registro TEXT DEFAULT (datetime('now', '-3 hours')),
        FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
      )`).run();
    } catch (e) { /* ya existe */ }
    try {
      await env.DB.prepare(`ALTER TABLE AdelantosTecnico ADD COLUMN notas TEXT DEFAULT ''`).run();
    } catch (e) { /* ya existe */ }
  } catch (e) {
    console.log('asegurarTablas:', e.message);
  }
}

// Detecta qué columnas existen realmente en una tabla
async function getColumnas(env, tabla) {
  try {
    const r = await env.DB.prepare(`PRAGMA table_info('${tabla}')`).all();
    return (r.results || r || []).map(c => c.name);
  } catch (e) {
    return [];
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    await asegurarTablas(env);

    // Detectar columnas reales existentes
    const colOT = await getColumnas(env, 'OrdenesTrabajo');
    const colTec = await getColumnas(env, 'Tecnicos');

    const tiene_fecha_creacion = colOT.includes('fecha_creacion');
    const tiene_fecha_completado = colOT.includes('fecha_completado');
    const tiene_servicios_sel = colOT.includes('servicios_seleccionados');
    const tiene_diag_checks = colOT.includes('diagnostico_checks');
    const tiene_diag_obs = colOT.includes('diagnostico_observaciones');
    const tiene_comision = colTec.includes('comision_porcentaje');

    // SIEMPRE usar fecha_ingreso para filtrar y ordenar (columna que siempre existe)
    // Solo agregar fecha_creacion como columna extra de lectura si existe
    const fechaLabel = tiene_fecha_creacion
      ? "COALESCE(o.fecha_creacion, o.fecha_ingreso) as fecha_creacion"
      : "o.fecha_ingreso as fecha_creacion";

    const url = new URL(request.url);
    const periodo = url.searchParams.get('periodo') || 'mes';
    const valor = url.searchParams.get('valor') || '';

    // =============================================
    // FIX: Usar buildFechaWhere() con parámetros .bind()
    // Esto elimina SQL injection y errores de alias de tabla.
    // Cada consulta usa el alias correcto según su FROM clause.
    // =============================================
    const fwOT = buildFechaWhere('o.fecha_ingreso', periodo, valor);
    const fwGasto = buildFechaWhere('fecha_gasto', periodo, valor);
    const fwCosto = buildFechaWhere('ca.fecha_registro', periodo, valor);
    const fwPago = buildFechaWhere('p.fecha_pago', periodo, valor);

    // Construir cláusulas WHERE con prefijo AND
    const fOTCond = fwOT.condicion ? `AND ${fwOT.condicion}` : '';
    const fGastoCond = fwGasto.condicion ? `AND ${fwGasto.condicion}` : '';
    const fCostoCond = fwCosto.condicion ? `AND ${fwCosto.condicion}` : '';
    const fPagoCond = fwPago.condicion ? `AND ${fwPago.condicion}` : '';

    // ===== 1. ORDENES DE TRABAJO =====
    // Construir SELECT solo con columnas que existen
    let ordenesSelect = `
      o.id,
      o.numero_orden, o.patente_placa, COALESCE(NULLIF(o.marca,''), v.marca) as marca, COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo, COALESCE(NULLIF(o.color,''), v.color) as color, COALESCE(NULLIF(o.anio,''), v.anio) as anio, o.cilindrada, o.combustible,
      o.kilometraje, o.fecha_ingreso, o.hora_ingreso, o.recepcionista, o.direccion,
      o.estado, o.estado_trabajo,
      ${fechaLabel},
      o.fecha_aprobacion,`;

    if (tiene_fecha_completado) {
      ordenesSelect += ` o.fecha_completado,`;
    }

    ordenesSelect += `
      o.monto_total, o.monto_abono, o.monto_restante, o.metodo_pago, o.nivel_combustible,
      o.pagado, o.completo,
      o.notas,
      c.nombre as cliente_nombre, c.rut as cliente_rut, c.telefono as cliente_telefono, c.email as cliente_email,`;

    if (tiene_comision) {
      ordenesSelect += ` t.comision_porcentaje as tecnico_comision,`;
    }

    ordenesSelect += ` t.nombre as tecnico_nombre, t.telefono as tecnico_telefono,`;

    if (tiene_diag_checks) ordenesSelect += ` o.diagnostico_checks,`;
    if (tiene_diag_obs) ordenesSelect += ` o.diagnostico_observaciones,`;
    if (tiene_servicios_sel) ordenesSelect += ` o.servicios_seleccionados,`;

    ordenesSelect += `
      (SELECT COALESCE(SUM(monto),0) FROM CostosAdicionales WHERE orden_id = o.id) as total_costos_extra,
      (SELECT COALESCE(SUM(CASE WHEN categoria='Mano de Obra' THEN monto ELSE 0 END),0) FROM CostosAdicionales WHERE orden_id = o.id) as costos_mo,
      (SELECT COALESCE(SUM(CASE WHEN categoria='Repuestos/Materiales' THEN monto ELSE 0 END),0) FROM CostosAdicionales WHERE orden_id = o.id) as costos_rep`;

    let ordenes = [];
    try {
      const r = await env.DB.prepare(`
        SELECT ${ordenesSelect}
        FROM OrdenesTrabajo o
        LEFT JOIN Clientes c ON o.cliente_id = c.id
        LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
        LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
        WHERE 1=1 ${fOTCond}
        ORDER BY o.fecha_ingreso DESC
        LIMIT 500
      `).bind(...fwOT.params).all();
      ordenes = r.results || [];
    } catch (e) {
      console.log('Error ordenes main (fallback simple):', e.message);
      try {
        const r = await env.DB.prepare(`
          SELECT
            o.id, o.numero_orden, o.patente_placa,
            COALESCE(NULLIF(o.marca,''), v.marca) as marca, COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo, COALESCE(NULLIF(o.color,''), v.color) as color,
            o.anio, o.cilindrada, o.combustible, o.kilometraje,
            o.fecha_ingreso, o.hora_ingreso, o.recepcionista, o.direccion,
            o.estado, o.estado_trabajo, o.fecha_ingreso as fecha_creacion,
            o.fecha_aprobacion, o.monto_total, o.monto_abono, o.monto_restante,
            o.metodo_pago, o.nivel_combustible, o.pagado, o.completo, o.notas
          FROM OrdenesTrabajo o
          LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
          WHERE 1=1 ${fOTCond}
          ORDER BY o.fecha_ingreso DESC
          LIMIT 500
        `).bind(...fwOT.params).all();
        ordenes = r.results || [];
      } catch (e2) {
        console.log('Error ordenes fallback:', e2.message);
      }
    }

    // ===== 2. TECNICOS =====
    let tecnicos = [];
    try {
      let tecSelect = `t.id, t.nombre, t.telefono, t.email, t.activo, t.fecha_registro`;
      if (tiene_comision) tecSelect += `, t.comision_porcentaje`;

      const r = await env.DB.prepare(`
        SELECT ${tecSelect},
          COALESCE(ot.total_ordenes, 0) as total_ordenes,
          COALESCE(ot.total_cerradas, 0) as total_cerradas,
          COALESCE(ot.total_generado, 0) as total_generado
        FROM Tecnicos t
        LEFT JOIN (
          SELECT tecnico_asignado_id,
            COUNT(*) as total_ordenes,
            SUM(CASE WHEN estado_trabajo='Cerrada' THEN 1 ELSE 0 END) as total_cerradas,
            COALESCE(SUM(monto_total),0) as total_generado
          FROM OrdenesTrabajo WHERE 1=1 ${fOTCond} AND tecnico_asignado_id IS NOT NULL
          GROUP BY tecnico_asignado_id
        ) ot ON ot.tecnico_asignado_id = t.id
        ORDER BY total_ordenes DESC
      `).bind(...fwOT.params).all();
      tecnicos = r.results || [];
    } catch (e) {
      console.log('Error tecnicos:', e.message);
    }

    // ===== 3. COSTOS ADICIONALES (con marca y modelo, excluyendo órdenes canceladas) =====
    let costosAdicionales = [];
    try {
      const { results } = await env.DB.prepare(`
        SELECT ca.id, ca.orden_id, ca.concepto, ca.monto,
          COALESCE(ca.categoria, 'Mano de Obra') as categoria,
          ca.fecha_registro, ca.registrado_por,
          o.numero_orden, o.patente_placa,
          COALESCE(NULLIF(o.marca,''), v.marca) as marca,
          COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo,
          COALESCE(NULLIF(o.color,''), v.color) as color
        FROM CostosAdicionales ca
        LEFT JOIN OrdenesTrabajo o ON ca.orden_id = o.id
        LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
        WHERE 1=1 ${fCostoCond} AND (o.estado IS NULL OR o.estado != 'Cancelada')
        ORDER BY ca.fecha_registro DESC
      `).bind(...fwCosto.params).all();
      costosAdicionales = results || [];
    } catch (e) {
      console.log('Error costos adicionales:', e.message);
    }

    // ===== 4. GASTOS DEL NEGOCIO =====
    let gastosNegocio = [];
    try {
      const { results } = await env.DB.prepare(`
        SELECT * FROM GastosNegocio WHERE 1=1 ${fGastoCond}
        ORDER BY fecha_gasto DESC
      `).bind(...fwGasto.params).all();
      gastosNegocio = results || [];
    } catch (e) {
      console.log('Error gastos negocio:', e.message);
    }

    // ===== 5. PAGOS (con marca y modelo, excluyendo órdenes canceladas) =====
    let pagos = [];
    try {
      const { results } = await env.DB.prepare(`
        SELECT p.*, o.numero_orden, o.patente_placa,
          COALESCE(NULLIF(o.marca,''), v.marca) as marca,
          COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo,
          COALESCE(NULLIF(o.color,''), v.color) as color,
          c.nombre as cliente_nombre
        FROM Pagos p
        LEFT JOIN OrdenesTrabajo o ON p.orden_id = o.id
        LEFT JOIN Clientes c ON o.cliente_id = c.id
        LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
        WHERE 1=1 ${fPagoCond} AND (o.estado IS NULL OR o.estado != 'Cancelada')
        ORDER BY p.fecha_pago DESC
      `).bind(...fwPago.params).all();
      pagos = results || [];
    } catch (e) {
      console.log('Error pagos:', e.message);
    }

    // ===== 6. CLIENTES DEL PERIODO (con marca y modelo de sus órdenes + Vehiculos fallback) =====
    let clientes = [];
    try {
      const { results } = await env.DB.prepare(`
        SELECT DISTINCT c.id, c.nombre, c.telefono,
          COALESCE(NULLIF(o.marca,''), v.marca) as orden_marca,
          COALESCE(NULLIF(o.modelo,''), v.modelo) as orden_modelo,
          COALESCE(NULLIF(o.color,''), v.color) as orden_color,
          o.patente_placa
        FROM Clientes c
        INNER JOIN OrdenesTrabajo o ON o.cliente_id = c.id
        LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
        WHERE 1=1 ${fOTCond}
        ORDER BY c.nombre ASC
      `).bind(...fwOT.params).all();
      clientes = results || [];
    } catch (e) {
      console.log('Error clientes:', e.message);
    }

    // ===== 7. VEHICULOS DEL PERIODO =====
    let vehiculos = [];
    try {
      const { results } = await env.DB.prepare(`
        SELECT DISTINCT v.id, v.patente_placa, v.marca, v.modelo, v.anio, v.combustible
        FROM Vehiculos v
        INNER JOIN OrdenesTrabajo o ON o.vehiculo_id = v.id
        WHERE 1=1 ${fOTCond}
        ORDER BY v.marca ASC
      `).bind(...fwOT.params).all();
      vehiculos = results || [];
    } catch (e) {
      console.log('Error vehiculos:', e.message);
    }

    // ===== 8. SERVICIOS DEL CATALOGO =====
    let serviciosPopulares = [];
    try {
      if (tiene_servicios_sel) {
        const fOTClean = fwOT.condicion ? `AND ${fwOT.condicion}` : '';
        const srvResult = await env.DB.prepare(`
          SELECT sc.nombre, sc.categoria, sc.tipo_comision, sc.precio_sugerido,
            COUNT(DISTINCT o.id) as veces_usado
          FROM ServiciosCatalogo sc
          LEFT JOIN (
            SELECT id, json_each.value as serv_id
            FROM OrdenesTrabajo, json_each(
              CASE WHEN servicios_seleccionados IS NOT NULL AND servicios_seleccionados != '' AND servicios_seleccionados != '[]'
              THEN servicios_seleccionados ELSE '[]' END
            )
          ) j ON CAST(json_extract(j.value, '$.id') AS INTEGER) = sc.id
          LEFT JOIN OrdenesTrabajo o ON o.id = j.id ${fOTClean}
          GROUP BY sc.id
          ORDER BY veces_usado DESC
          LIMIT 30
        `).bind(...fwOT.params).all();
        serviciosPopulares = srvResult.results || [];
      }
    } catch (e) {
      console.log('Error servicios populares:', e.message);
    }

    // ===== 9. RESUMEN GENERAL (actualizado con todos los estados reales) =====
    // NOTA: Los conteos de estado incluyen TODAS las órdenes.
    // Las métricas financieras EXCLUYEN órdenes con estado='Cancelada'.
    let resumen = {
      total_ordenes: 0, aprobadas: 0, enviadas: 0, canceladas: 0,
      pendientes_asignacion: 0,
      cerradas: 0, pendientes: 0, pendientes_visita: 0, en_sitio: 0,
      en_progreso: 0, pendientes_piezas: 0, completadas: 0, no_completadas: 0,
      total_monto_ordenes: 0, total_abonos: 0, total_restantes: 0,
      total_pagado: 0, total_impago: 0, promedio_orden: 0,
      total_clientes_unicos: 0, total_tecnicos_activos: 0, total_patentes_unicas: 0,
      total_pagos_registrados: 0, ordenes_activas: 0
    };
    try {
      const r = await env.DB.prepare(`
        SELECT
          COUNT(*) as total_ordenes,
          SUM(CASE WHEN estado='Aprobada' THEN 1 ELSE 0 END) as aprobadas,
          SUM(CASE WHEN estado='Enviada' THEN 1 ELSE 0 END) as enviadas,
          SUM(CASE WHEN estado='Cancelada' THEN 1 ELSE 0 END) as canceladas,
          SUM(CASE WHEN estado='PENDIENTE_ASIGNACION' THEN 1 ELSE 0 END) as pendientes_asignacion,
          SUM(CASE WHEN estado_trabajo='Cerrada' THEN 1 ELSE 0 END) as cerradas,
          SUM(CASE WHEN estado_trabajo='Pendiente' OR estado_trabajo='Aprobada' THEN 1 ELSE 0 END) as pendientes,
          SUM(CASE WHEN estado_trabajo='Pendiente Visita' THEN 1 ELSE 0 END) as pendientes_visita,
          SUM(CASE WHEN estado_trabajo='En Sitio' THEN 1 ELSE 0 END) as en_sitio,
          SUM(CASE WHEN estado_trabajo='En Progreso' OR estado_trabajo='En trabajo' THEN 1 ELSE 0 END) as en_progreso,
          SUM(CASE WHEN estado_trabajo='Pendiente Piezas' THEN 1 ELSE 0 END) as pendientes_piezas,
          SUM(CASE WHEN estado_trabajo='Completada' OR estado_trabajo='Usuario Satisfecho' THEN 1 ELSE 0 END) as completadas,
          SUM(CASE WHEN estado_trabajo='No Completada' THEN 1 ELSE 0 END) as no_completadas,
          SUM(CASE WHEN estado != 'Cancelada' THEN 1 ELSE 0 END) as ordenes_activas,
          COALESCE(SUM(CASE WHEN estado != 'Cancelada' THEN monto_total ELSE 0 END),0) as total_monto_ordenes,
          COALESCE(SUM(CASE WHEN estado != 'Cancelada' THEN monto_abono ELSE 0 END),0) as total_abonos,
          COALESCE(SUM(CASE WHEN estado != 'Cancelada' AND monto_restante > 0 THEN monto_restante ELSE 0 END),0) as total_restantes,
          COALESCE(SUM(CASE WHEN estado != 'Cancelada' AND pagado=1 THEN monto_total ELSE 0 END),0) as total_pagado,
          COALESCE(SUM(CASE WHEN estado != 'Cancelada' AND (pagado=0 OR pagado IS NULL) AND monto_restante > 0 THEN monto_restante WHEN estado != 'Cancelada' AND (pagado=0 OR pagado IS NULL) AND (monto_restante IS NULL OR monto_restante <= 0) THEN monto_total ELSE 0 END),0) as total_impago,
          AVG(CASE WHEN estado != 'Cancelada' THEN monto_total END) as promedio_orden,
          COUNT(DISTINCT CASE WHEN estado != 'Cancelada' THEN cliente_id END) as total_clientes_unicos,
          COUNT(DISTINCT tecnico_asignado_id) as total_tecnicos_activos,
          COUNT(DISTINCT CASE WHEN estado != 'Cancelada' THEN patente_placa END) as total_patentes_unicas
        FROM OrdenesTrabajo o
        WHERE 1=1 ${fOTCond}
      `).bind(...fwOT.params).first();
      if (r) resumen = { ...resumen, ...r };
    } catch (e) {
      console.log('Error resumen:', e.message);
    }

    // ===== 9b. TOTAL PAGOS REGISTRADOS (desde tabla Pagos, excluyendo órdenes canceladas) =====
    try {
      const pagosResumen = await env.DB.prepare(`
        SELECT COALESCE(SUM(p.monto),0) as total_pagos_registrados, COUNT(*) as cantidad_pagos
        FROM Pagos p
        LEFT JOIN OrdenesTrabajo o ON p.orden_id = o.id
        WHERE 1=1 ${fPagoCond} AND (o.estado IS NULL OR o.estado != 'Cancelada')
      `).bind(...fwPago.params).first();
      if (pagosResumen) {
        resumen.total_pagos_registrados = Number(pagosResumen.total_pagos_registrados || 0);
        resumen.cantidad_pagos = Number(pagosResumen.cantidad_pagos || 0);
      }
    } catch (e) {
      console.log('Error pagos resumen:', e.message);
    }

    // Gastos resumen
    let gastosPorCategoria = [];
    let totalGastos = 0;
    try {
      const gastosResumen = await env.DB.prepare(`
        SELECT categoria, COUNT(*) as cantidad, COALESCE(SUM(monto),0) as total
        FROM GastosNegocio WHERE 1=1 ${fGastoCond}
        GROUP BY categoria ORDER BY total DESC
      `).bind(...fwGasto.params).all();
      gastosPorCategoria = gastosResumen.results || [];
      totalGastos = gastosPorCategoria.reduce((s, g) => s + Number(g.total || 0), 0);
    } catch (e) {
      console.log('Error gastos resumen:', e.message);
    }

    // Costos extras resumen (EXCLUYENDO costos de órdenes canceladas)
    let totalCostosExtras = 0, costosMO = 0, costosRep = 0;
    try {
      const costosResumen = await env.DB.prepare(`
        SELECT
          COUNT(*) as total_items,
          COALESCE(SUM(CASE WHEN COALESCE(ca.categoria,'Mano de Obra')='Mano de Obra' THEN ca.monto ELSE 0 END),0) as total_mo,
          COALESCE(SUM(CASE WHEN COALESCE(ca.categoria,'Mano de Obra')='Repuestos/Materiales' THEN ca.monto ELSE 0 END),0) as total_rep,
          COALESCE(SUM(ca.monto),0) as total_general
        FROM CostosAdicionales ca
        LEFT JOIN OrdenesTrabajo o ON ca.orden_id = o.id
        WHERE 1=1 ${fCostoCond} AND (o.estado IS NULL OR o.estado != 'Cancelada')
      `).bind(...fwCosto.params).first();
      if (costosResumen) {
        totalCostosExtras = Number(costosResumen.total_general || 0);
        costosMO = Number(costosResumen.total_mo || 0);
        costosRep = Number(costosResumen.total_rep || 0);
        resumen.total_items_costos = Number(costosResumen.total_items || 0);
      }
    } catch (e) {
      console.log('Error costos resumen:', e.message);
    }

    const totalIngresos = Number(resumen.total_monto_ordenes || 0) + totalCostosExtras;

    // ===== 10. COMISIONES POR TÉCNICO (Flujo de Caja real) =====
    let comisionesTecnicos = 0;
    let baseComisionable = 0;
    let comisionDetalles = [];
    try {
      const { results: todosTecnicos } = await env.DB.prepare(`
        SELECT id, nombre, COALESCE(comision_porcentaje, 40) as comision_porcentaje
        FROM Tecnicos
      `).all();

      for (const tec of (todosTecnicos || [])) {
        const comisionPct = Number(tec.comision_porcentaje || 40);
        const factorComision = comisionPct / 100;
        const tecnicoId = tec.id;

        let moServTec = 0;
        let moExtraTec = 0;
        let totalGeneradoBase = 0;

        try {
          // EXCLUIR órdenes canceladas y órdenes canceladas en liquidación
          const ordSQL = `
            SELECT o.id, o.monto_total, o.estado, o.estado_trabajo,
              o.tecnico_asignado_id, o.servicios_seleccionados,
              COALESCE(ca.total_mano_obra, 0) as total_costos_mano_obra
            FROM OrdenesTrabajo o
            LEFT JOIN (
              SELECT orden_id,
                COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra
              FROM CostosAdicionales
              GROUP BY orden_id
            ) ca ON ca.orden_id = o.id
            LEFT JOIN LiquidacionCanceladas lc ON lc.orden_id = o.id AND lc.tecnico_id = ?
            WHERE (o.tecnico_asignado_id = ? OR (o.servicios_seleccionados IS NOT NULL AND o.servicios_seleccionados != ''))
            AND o.estado != 'Cancelada'
            AND lc.id IS NULL
            ${fOTCond}
          `;
          const ordParams = [tecnicoId, tecnicoId, ...fwOT.params];
          const { results: ordRows } = await env.DB.prepare(ordSQL).bind(...ordParams).all();

          (ordRows || []).forEach(row => {
            const tecnicoAsignadoId = row.tecnico_asignado_id;
            const esTecnicoAsignado = Number(tecnicoAsignadoId) === Number(tecnicoId);
            const costosMOOrden = Number(row.total_costos_mano_obra || 0);

            let srvs = [];
            if (row.servicios_seleccionados) {
              try {
                srvs = typeof row.servicios_seleccionados === 'string'
                  ? JSON.parse(row.servicios_seleccionados) : row.servicios_seleccionados;
                if (!Array.isArray(srvs)) srvs = [];
              } catch (e) { srvs = []; }
            }

            let manoObraServicios = 0;
            let itemsPropios = 0;
            if (Array.isArray(srvs)) {
              srvs.forEach(s => {
                const precio = Number(s.precio_final || s.precio_sugerido || 0);
                const esItemDeEsteTecnico = s.tecnico_id
                  ? (Number(s.tecnico_id) === Number(tecnicoId))
                  : esTecnicoAsignado;
                if (esItemDeEsteTecnico) {
                  itemsPropios++;
                  if (s.tipo_comision === 'mano_obra') manoObraServicios += precio;
                }
              });
            }

            const tieneItems = itemsPropios > 0 || (srvs.length === 0 && esTecnicoAsignado);
            if (!tieneItems) return;

            if (srvs.length > 0 && itemsPropios > 0) {
              moServTec += manoObraServicios;
              if (costosMOOrden > 0) {
                const totalMOOrden = srvs.reduce((sum, s) => {
                  if (s.tipo_comision === 'mano_obra') return sum + Number(s.precio_final || s.precio_sugerido || 0);
                  return sum;
                }, 0);
                if (totalMOOrden > 0) {
                  moExtraTec += Math.round(costosMOOrden * (manoObraServicios / totalMOOrden));
                } else if (esTecnicoAsignado) {
                  moExtraTec += costosMOOrden;
                }
              }
            } else if (srvs.length === 0 && esTecnicoAsignado) {
              totalGeneradoBase += Number(row.monto_total || 0);
              moExtraTec += costosMOOrden;
            }
          });
        } catch (e) { console.log('Error comision tecnico ' + tecnicoId + ':', e.message); }

        const baseTec = moServTec > 0 ? moServTec + moExtraTec : totalGeneradoBase + moExtraTec;
        if (baseTec <= 0) continue;

        const comisionTec = Math.round(baseTec * factorComision);
        comisionesTecnicos += comisionTec;
        baseComisionable += baseTec;
        comisionDetalles.push({
          tecnico: tec.nombre,
          comision_porcentaje: comisionPct,
          base_comisionable: baseTec,
          comision: comisionTec
        });
      }
    } catch (e) { console.log('Error calculo comisiones:', e.message); }

    // ===== 10b. ADELANTOS A TÉCNICOS =====
    let totalAdelantosPendientes = 0;
    let adelantosPorTecnico = [];
    let adelantosDetalle = [];
    try {
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
        FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
      )`).run();

      let adelantoWhere = '';
      let adelantoParams = [];
      if (valor) {
        switch (periodo) {
          case 'dia':
            adelantoWhere = "AND date(a.fecha_adelanto) = ?";
            adelantoParams.push(valor);
            break;
          case 'semana':
            const [yA, wA] = valor.split('-').map(Number);
            adelantoWhere = "AND strftime('%Y', a.fecha_adelanto) = ? AND cast(strftime('%W', a.fecha_adelanto) as integer) = ?";
            adelantoParams.push(String(yA), wA);
            break;
          case 'anio':
            adelantoWhere = "AND strftime('%Y', a.fecha_adelanto) = ?";
            adelantoParams.push(valor);
            break;
          default:
            adelantoWhere = "AND strftime('%Y-%m', a.fecha_adelanto) = ?";
            adelantoParams.push(valor);
            break;
        }
      }

      const adelantoResumen = await env.DB.prepare(`
        SELECT COALESCE(SUM(a.monto), 0) as total
        FROM AdelantosTecnico a
        WHERE a.estado = 'pendiente' ${adelantoWhere}
      `).bind(...adelantoParams).first();
      totalAdelantosPendientes = Number(adelantoResumen?.total || 0);

      const { results: adPorTec } = await env.DB.prepare(`
        SELECT t.nombre as tecnico_nombre, COALESCE(SUM(a.monto), 0) as total_adelantos, COUNT(*) as cantidad
        FROM AdelantosTecnico a
        LEFT JOIN Tecnicos t ON a.tecnico_id = t.id
        WHERE a.estado = 'pendiente' ${adelantoWhere}
        GROUP BY a.tecnico_id
        ORDER BY total_adelantos DESC
      `).bind(...adelantoParams).all();
      adelantosPorTecnico = adPorTec || [];

      const { results: adDet } = await env.DB.prepare(`
        SELECT a.*, t.nombre as tecnico_nombre
        FROM AdelantosTecnico a
        LEFT JOIN Tecnicos t ON a.tecnico_id = t.id
        WHERE a.estado = 'pendiente' ${adelantoWhere}
        ORDER BY a.fecha_adelanto DESC
        LIMIT 50
      `).bind(...adelantoParams).all();
      adelantosDetalle = adDet || [];

      // Add adelantos to comision_detalle
      const adelantosMap = {};
      adelantosPorTecnico.forEach(a => { adelantosMap[a.tecnico_nombre] = Number(a.total_adelantos || 0); });
      comisionDetalles.forEach(cd => {
        cd.adelantos = adelantosMap[cd.tecnico] || 0;
        cd.neto_pagar = Math.max(0, cd.comision - cd.adelantos);
      });
    } catch (e) { console.log('Error adelantos:', e.message); }

    // ===== 11. LIQUIDACION ORDEN (comisiones ya liquidadas) =====
    let totalComisionLiqOrd = 0;
    let totalDomicilioLiqOrd = 0;
    let totalBaseLiqOrd = 0;
    try {
      let liqOrdWhere = '';
      let liqOrdParams = [];
      if (valor) {
        switch (periodo) {
          case 'dia':
            liqOrdWhere = "WHERE date(lo.fecha_liquidacion) = ?";
            liqOrdParams.push(valor);
            break;
          case 'semana':
            const [yr2, wk2] = valor.split('-').map(Number);
            liqOrdWhere = "WHERE strftime('%Y', lo.fecha_liquidacion) = ? AND cast(strftime('%W', lo.fecha_liquidacion) as integer) = ?";
            liqOrdParams.push(String(yr2), wk2);
            break;
          case 'anio':
            liqOrdWhere = "WHERE strftime('%Y', lo.fecha_liquidacion) = ?";
            liqOrdParams.push(valor);
            break;
          default:
            liqOrdWhere = "WHERE strftime('%Y-%m', lo.fecha_liquidacion) = ?";
            liqOrdParams.push(valor);
            break;
        }
      }
      const liqOrdData = await env.DB.prepare(`
        SELECT
          COALESCE(SUM(lo.monto_comision), 0) as total_comision,
          COALESCE(SUM(lo.monto_domicilio), 0) as total_domicilio,
          COALESCE(SUM(lo.base_comisionable), 0) as total_base
        FROM LiquidacionOrden lo
        ${liqOrdWhere}
      `).bind(...liqOrdParams).first();
      if (liqOrdData) {
        totalComisionLiqOrd = Number(liqOrdData.total_comision || 0);
        totalDomicilioLiqOrd = Number(liqOrdData.total_domicilio || 0);
        totalBaseLiqOrd = Number(liqOrdData.total_base || 0);
      }
    } catch (e) { console.log('Error LiquidacionOrden:', e.message); }

    // ===== BALANCE NETO (Flujo de Caja real — incluye Pagos Registrados + Adelantos) =====
    const totalAbonos = Number(resumen.total_abonos || 0);
    const totalPagosRegistrados = Number(resumen.total_pagos_registrados || 0);
    const totalEntradas = totalAbonos + totalPagosRegistrados;
    const balanceNeto = totalEntradas - comisionesTecnicos - totalGastos - totalComisionLiqOrd - totalDomicilioLiqOrd - totalAdelantosPendientes;
    const totalSalidas = comisionesTecnicos + totalGastos + totalComisionLiqOrd + totalDomicilioLiqOrd + totalAdelantosPendientes;

    return new Response(JSON.stringify({
      success: true,
      periodo, valor,
      generado_en: chileNowISO(),
      resumen: {
        ...resumen,
        total_costos_extra: totalCostosExtras,
        costos_mano_obra: costosMO,
        costos_repuestos: costosRep,
        total_gastos_negocio: totalGastos,
        gastos_por_categoria: gastosPorCategoria,
        total_ingresos: totalIngresos,
        balance: totalIngresos - totalGastos,
        // Flujo de Caja real
        total_abonos: totalAbonos,
        total_pagos_registrados: totalPagosRegistrados,
        total_entradas: totalEntradas,
        comisiones_tecnicos: comisionesTecnicos,
        base_comisionable: baseComisionable,
        comision_detalle: comisionDetalles,
        total_adelantos: totalAdelantosPendientes,
        adelantos_por_tecnico: adelantosPorTecnico,
        liquidacion_comision: totalComisionLiqOrd,
        liquidacion_domicilio: totalDomicilioLiqOrd,
        liquidacion_base: totalBaseLiqOrd,
        total_salidas: totalSalidas,
        balance_neto: balanceNeto
      },
      ordenes,
      tecnicos,
      costos_adicionales: costosAdicionales,
      gastos_negocio: gastosNegocio,
      pagos,
      clientes,
      vehiculos,
      servicios_populares: serviciosPopulares,
      adelantos_detalle: adelantosDetalle
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error al exportar datos:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
