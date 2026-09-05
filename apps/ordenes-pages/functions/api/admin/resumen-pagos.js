// ============================================
// API: RESUMEN DE PAGOS Y FLUJO DE CAJA
// Con desglose de costos por categoría
// Auto-crea tablas si no existen
// Global Pro Automotriz
// FIX: Usa tabla Pagos como fuente primaria de ingresos
// FIX: Filtra Pagos por o.fecha_ingreso (Chile) no p.fecha_pago (UTC)
// ============================================

import { asegurarColumnasFaltantes, buildFechaWhere } from '../../lib/db-helpers.js';

// Helper: filtrar servicios por tecnico_id con fallback a tecnico_asignado_id
// Retorna { manoObraServicios, itemsPropios }
function filtrarServiciosPorTecnico(srvs, tecnicoId, tecnicoAsignadoId) {
  let manoObraServicios = 0;
  let itemsPropios = 0;

  if (!Array.isArray(srvs)) return { manoObraServicios: 0, itemsPropios: 0 };

  srvs.forEach(s => {
    const precio = Number(s.precio_final || s.precio_sugerido || 0);
    const esItemDeEsteTecnico = s.tecnico_id
      ? (Number(s.tecnico_id) === Number(tecnicoId))
      : (Number(tecnicoAsignadoId) === Number(tecnicoId)); // fallback: si no tiene tecnico_id, es del tecnico_asignado_id

    if (esItemDeEsteTecnico) {
      itemsPropios++;
      if (s.tipo_comision === 'mano_obra') {
        manoObraServicios += precio;
      }
    }
  });

  return { manoObraServicios, itemsPropios };
}

async function asegurarTablas(env) {
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS CostosAdicionales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      concepto TEXT NOT NULL,
      monto REAL NOT NULL,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
      registrado_por TEXT,
      categoria TEXT NOT NULL DEFAULT 'Mano de Obra'
    )`).run();
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
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON GastosNegocio(fecha_gasto)`).run();

    // Asegurar columna categoria
    try {
      const columns = await env.DB.prepare("PRAGMA table_info(CostosAdicionales)").all();
      const hasCategoria = columns.results?.some(c => c.name === 'categoria');
      if (!hasCategoria) {
        await env.DB.prepare("ALTER TABLE CostosAdicionales ADD COLUMN categoria TEXT NOT NULL DEFAULT 'Mano de Obra'").run();
      }
    } catch (e) {
      console.log('asegurar columna categoria:', e.message);
    }
  } catch (e) {
    console.error('Error al asegurar tablas:', e);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarTablas(env);
    await asegurarColumnasFaltantes(env);

    const url = new URL(request.url);
    const periodo = url.searchParams.get('periodo') || 'mes';
    const valor = url.searchParams.get('valor');

    // SIEMPRE usar o.fecha_ingreso para filtrar (columna 100% segura, en horario Chile)
    const fechaWhere = buildFechaWhere('o.fecha_ingreso', periodo, valor);
    const fechaCondicion = fechaWhere.condicion;
    const fechaSQL = fechaCondicion ? `WHERE ${fechaCondicion}` : '';
    const params = fechaWhere.params;

    // ============================================================
    // SECCIÓN DE INGRESOS: Usar monto_abono de OT como FUENTE PRIMARIA
    // con Pagos como fuente suplementaria cuando esté disponible.
    // monto_abono en OrdenesTrabajo SIEMPRE se actualiza cuando se registra pago
    // La tabla Pagos puede estar vacía si no se insertaron registros históricos
    // ============================================================

    // 1a. Total abonos desde OT (fuente confiable — siempre se actualiza)
    let totalAbonosOT = 0;
    try {
      const abonosOTRes = await env.DB.prepare(`
        SELECT COALESCE(SUM(o.monto_abono), 0) as total_abonos
        FROM OrdenesTrabajo o
        ${fechaSQL}
        ${fechaSQL ? 'AND' : 'WHERE'} o.estado != 'Cancelada'
          AND o.monto_abono > 0
      `).bind(...params).first();
      totalAbonosOT = Number(abonosOTRes?.total_abonos || 0);
    } catch (e) { console.log('Abonos OT total error:', e.message); }

    // 1a2. Total pagos registrados desde tabla Pagos (fuente suplementaria)
    let totalPagosRegistrados = 0;
    let cantidadPagos = 0;
    try {
      const pagosRegRes = await env.DB.prepare(`
        SELECT COALESCE(SUM(p.monto),0) as total, COUNT(*) as cantidad
        FROM Pagos p
        INNER JOIN OrdenesTrabajo o ON p.orden_id = o.id
        ${fechaSQL}
        ${fechaSQL ? 'AND' : 'WHERE'} o.estado != 'Cancelada'
      `).bind(...params).first();
      totalPagosRegistrados = Number(pagosRegRes?.total || 0);
      cantidadPagos = Number(pagosRegRes?.cantidad || 0);
    } catch (e) { console.log('Pagos registrados total error:', e.message); }

    // Usar la fuente que tenga datos: Pagos si existe, si no OT.monto_abono
    const totalAbonos = totalPagosRegistrados > 0 ? totalPagosRegistrados : totalAbonosOT;

    // 1b. Desglose por método de pago — desde Pagos si hay, si no desde OT
    let metodosPagoFromPagos = [];
    if (totalPagosRegistrados > 0) {
      try {
        const metodosFromPagosResult = await env.DB.prepare(`
          SELECT
            p.metodo_pago,
            COUNT(DISTINCT p.orden_id) as cantidad,
            COALESCE(SUM(p.monto), 0) as total_abonos
          FROM Pagos p
          INNER JOIN OrdenesTrabajo o ON p.orden_id = o.id
          ${fechaSQL}
          ${fechaSQL ? 'AND' : 'WHERE'} o.estado != 'Cancelada'
            AND p.metodo_pago IS NOT NULL AND p.metodo_pago != ''
          GROUP BY p.metodo_pago
          ORDER BY total_abonos DESC
        `).bind(...params).all();
        metodosPagoFromPagos = metodosFromPagosResult.results || [];
      } catch (e) { console.log('Metodos pago from Pagos error:', e.message); }
    } else {
      // Fallback: desglose por método desde OT.monto_abono
      try {
        const metodosFromOTResult = await env.DB.prepare(`
          SELECT
            o.metodo_pago,
            COUNT(*) as cantidad,
            COALESCE(SUM(o.monto_abono), 0) as total_abonos
          FROM OrdenesTrabajo o
          ${fechaSQL}
          ${fechaSQL ? 'AND' : 'WHERE'} o.estado != 'Cancelada'
            AND o.metodo_pago IS NOT NULL AND o.metodo_pago != ''
            AND o.monto_abono > 0
          GROUP BY o.metodo_pago
          ORDER BY total_abonos DESC
        `).bind(...params).all();
        metodosPagoFromPagos = metodosFromOTResult.results || [];
      } catch (e) { console.log('Metodos pago from OT error:', e.message); }
    }

    // 1c. Valor total de órdenes (desde OT, para referencia del valor de las OT)
    let totalIngresosOrd = 0;
    try {
      const ordValResult = await env.DB.prepare(`
        SELECT COALESCE(SUM(o.monto_total), 0) as total_ordenes
        FROM OrdenesTrabajo o
        ${fechaSQL}
        ${fechaSQL ? 'AND' : 'WHERE'} o.estado != 'Cancelada'
      `).bind(...params).first();
      totalIngresosOrd = Number(ordValResult?.total_ordenes || 0);
    } catch (e) { console.log('Total ordenes valor error:', e.message); }

    // 1d. Valor total de órdenes por método (desde OT, para referencia)
    let metodosPagoFromOT = [];
    try {
      const metodosOTResult = await env.DB.prepare(`
        SELECT
          metodo_pago,
          COALESCE(SUM(monto_total), 0) as total_ordenes
        FROM OrdenesTrabajo o
        ${fechaSQL}
        ${fechaSQL ? 'AND' : 'WHERE'} metodo_pago IS NOT NULL AND metodo_pago != ''
        AND o.estado != 'Cancelada'
        GROUP BY metodo_pago
      `).bind(...params).all();
      metodosPagoFromOT = metodosOTResult.results || [];
    } catch (e) { console.log('Metodos pago from OT error:', e.message); }

    // Combinar: Pagos para abonos + OT para valor órdenes
    const otMetodoMap = {};
    metodosPagoFromOT.forEach(m => { otMetodoMap[m.metodo_pago] = Number(m.total_ordenes || 0); });

    const metodosPago = metodosPagoFromPagos.map(m => ({
      metodo_pago: m.metodo_pago,
      cantidad: Number(m.cantidad || 0),
      total_abonos: Number(m.total_abonos || 0),
      total_ordenes: otMetodoMap[m.metodo_pago] || 0
    }));
    // Agregar métodos que están en OT pero no en Pagos (sin pagos registrados pero con valor)
    metodosPagoFromOT.forEach(m => {
      if (!metodosPagoFromPagos.find(p => p.metodo_pago === m.metodo_pago)) {
        metodosPago.push({
          metodo_pago: m.metodo_pago,
          cantidad: 0,
          total_abonos: 0,
          total_ordenes: Number(m.total_ordenes || 0)
        });
      }
    });

    // 1e. Detalle de pagos por método — desde Pagos si hay, si no desde OT
    let pagosPorMetodoDetalle = [];
    if (totalPagosRegistrados > 0) {
      try {
        const pagosDetResult = await env.DB.prepare(`
          SELECT
            o.id, o.numero_orden, o.patente_placa,
            COALESCE(NULLIF(o.marca,''), v.marca) as marca,
            COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo,
            COALESCE(NULLIF(o.color,''), v.color) as color,
            o.es_express,
            p.metodo_pago,
            SUM(p.monto) as monto_abono,
            o.monto_total,
            o.tecnico_asignado_id, o.servicios_seleccionados
          FROM Pagos p
          INNER JOIN OrdenesTrabajo o ON p.orden_id = o.id
          LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
          ${fechaSQL}
          ${fechaSQL ? 'AND' : 'WHERE'} o.estado != 'Cancelada'
            AND p.metodo_pago IS NOT NULL AND p.metodo_pago != ''
          GROUP BY p.orden_id, p.metodo_pago
          ORDER BY p.metodo_pago, o.numero_orden DESC
        `).bind(...params).all();
        pagosPorMetodoDetalle = pagosDetResult.results || [];
      } catch (e) { console.log('Pagos detalle error:', e.message); }
    } else {
      // Fallback: detalle desde OT.monto_abono
      try {
        const pagosDetResult = await env.DB.prepare(`
          SELECT
            o.id, o.numero_orden, o.patente_placa,
            COALESCE(NULLIF(o.marca,''), v.marca) as marca,
            COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo,
            COALESCE(NULLIF(o.color,''), v.color) as color,
            o.es_express,
            o.metodo_pago,
            o.monto_abono,
            o.monto_total,
            o.tecnico_asignado_id, o.servicios_seleccionados
          FROM OrdenesTrabajo o
          LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
          ${fechaSQL}
          ${fechaSQL ? 'AND' : 'WHERE'} o.estado != 'Cancelada'
            AND o.monto_abono > 0
            AND o.metodo_pago IS NOT NULL AND o.metodo_pago != ''
          ORDER BY o.metodo_pago, o.numero_orden DESC
        `).bind(...params).all();
        pagosPorMetodoDetalle = pagosDetResult.results || [];
      } catch (e) { console.log('Pagos detalle OT error:', e.message); }
    }

    // 1f. Detalle de abonos para Entrada de Dinero — desde Pagos si hay, si no desde OT
    let abonosDetalle = [];
    if (totalPagosRegistrados > 0) {
      try {
        const abonosResult = await env.DB.prepare(`
          SELECT
            o.id, o.numero_orden, o.patente_placa,
            COALESCE(NULLIF(o.marca,''), v.marca) as marca,
            COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo,
            COALESCE(NULLIF(o.color,''), v.color) as color,
            SUM(p.monto) as monto_abono,
            o.monto_total, p.metodo_pago, o.es_express
          FROM Pagos p
          INNER JOIN OrdenesTrabajo o ON p.orden_id = o.id
          LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
          ${fechaSQL}
          ${fechaSQL ? 'AND' : 'WHERE'} o.estado != 'Cancelada'
          GROUP BY p.orden_id
          HAVING SUM(p.monto) > 0
          ORDER BY o.numero_orden DESC
        `).bind(...params).all();
        abonosDetalle = abonosResult.results || [];
      } catch (e) { console.log('Abonos detalle error:', e.message); }
    } else {
      // Fallback: abonos desde OT.monto_abono
      try {
        const abonosResult = await env.DB.prepare(`
          SELECT
            o.id, o.numero_orden, o.patente_placa,
            COALESCE(NULLIF(o.marca,''), v.marca) as marca,
            COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo,
            COALESCE(NULLIF(o.color,''), v.color) as color,
            o.monto_abono,
            o.monto_total, o.metodo_pago, o.es_express
          FROM OrdenesTrabajo o
          LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
          ${fechaSQL}
          ${fechaSQL ? 'AND' : 'WHERE'} o.estado != 'Cancelada'
            AND o.monto_abono > 0
          ORDER BY o.numero_orden DESC
        `).bind(...params).all();
        abonosDetalle = abonosResult.results || [];
      } catch (e) { console.log('Abonos detalle OT error:', e.message); }
    }

    // 2. Órdenes pendientes de pago (excluye canceladas)
    const pendientes = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_pendientes,
        COALESCE(SUM(monto_restante), 0) as saldo_pendiente
      FROM OrdenesTrabajo o
      ${fechaSQL ? fechaSQL + ' AND' : 'WHERE'}
        monto_restante > 0
        AND estado != 'Cancelada'
        AND (estado = 'Aprobada' OR estado_trabajo = 'Cerrada')
    `).bind(...params).first();

    // 3. Costos adicionales DESGLOSADOS del periodo
    let costosParams = [];
    let costosFecha = '';
    if (valor) {
      switch (periodo) {
        case 'dia':
          costosFecha = "WHERE date(fecha_registro) = ?";
          costosParams.push(valor);
          break;
        case 'semana':
          const [yr, wk] = valor.split('-').map(Number);
          costosFecha = "WHERE strftime('%Y', fecha_registro) = ? AND cast(strftime('%W', fecha_registro) as integer) = ?";
          costosParams.push(String(yr), wk);
          break;
        case 'anio':
          costosFecha = "WHERE strftime('%Y', fecha_registro) = ?";
          costosParams.push(valor);
          break;
        default:
          costosFecha = "WHERE strftime('%Y-%m', fecha_registro) = ?";
          costosParams.push(valor);
          break;
      }
    }

    const costosAdicionales = await env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN categoria = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
        COALESCE(SUM(CASE WHEN categoria = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
        COALESCE(SUM(monto), 0) as total
      FROM CostosAdicionales
      ${costosFecha}
    `).bind(...costosParams).first();

    // 4. Gastos del negocio
    let gastosFecha = '';
    let gastosParams = [];
    if (valor) {
      switch (periodo) {
        case 'dia':
          gastosFecha = 'WHERE fecha_gasto = ?';
          gastosParams.push(valor);
          break;
        case 'semana':
          const [y, w] = valor.split('-').map(Number);
          gastosFecha = "WHERE strftime('%Y', fecha_gasto) = ? AND cast(strftime('%W', fecha_gasto) as integer) = ?";
          gastosParams.push(String(y), w);
          break;
        case 'anio':
          gastosFecha = "WHERE strftime('%Y', fecha_gasto) = ?";
          gastosParams.push(valor);
          break;
        default:
          gastosFecha = "WHERE strftime('%Y-%m', fecha_gasto) = ?";
          gastosParams.push(valor);
          break;
      }
    }

    const totalGastos = await env.DB.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM GastosNegocio
      ${gastosFecha}
    `).bind(...gastosParams).first();

    // 5. Historial diario — combina datos de OT (órdenes + abonos) + Pagos si hay
    // Primero: datos de OT (conteo de órdenes, valor, y abonos desde monto_abono)
    const historialOTResult = await env.DB.prepare(`
      SELECT
        date(o.fecha_ingreso) as fecha,
        COUNT(*) as ordenes,
        COALESCE(SUM(CASE WHEN o.estado != 'Cancelada' THEN monto_total ELSE 0 END), 0) as ingresos,
        COALESCE(SUM(CASE WHEN o.estado != 'Cancelada' THEN monto_abono ELSE 0 END), 0) as abonos_ot
      FROM OrdenesTrabajo o
      ${fechaSQL}
      GROUP BY date(o.fecha_ingreso)
      ORDER BY fecha ASC
    `).bind(...params).all();
    const historialOT = historialOTResult.results || [];

    // Segundo: datos de Pagos (abonos reales recibidos por día) si hay pagos registrados
    let historialPagosMap = {};
    if (totalPagosRegistrados > 0) {
      try {
        const historialPagosResult = await env.DB.prepare(`
          SELECT
            date(o.fecha_ingreso) as fecha,
            COALESCE(SUM(p.monto), 0) as abonos_recibidos,
            COUNT(DISTINCT p.orden_id) as ordenes_con_pago
          FROM Pagos p
          INNER JOIN OrdenesTrabajo o ON p.orden_id = o.id
          ${fechaSQL}
          ${fechaSQL ? 'AND' : 'WHERE'} o.estado != 'Cancelada'
          GROUP BY date(o.fecha_ingreso)
        `).bind(...params).all();
        (historialPagosResult.results || []).forEach(r => {
          historialPagosMap[r.fecha] = {
            abonos_recibidos: Number(r.abonos_recibidos || 0),
            ordenes_con_pago: Number(r.ordenes_con_pago || 0)
          };
        });
      } catch (e) { console.log('Historial pagos error:', e.message); }
    }

    // Merge: usar abonos de Pagos si hay, si no usar OT.monto_abono
    const historial = historialOT.map(h => {
      const pagosDia = historialPagosMap[h.fecha] || {};
      const abonosRecibidos = totalPagosRegistrados > 0
        ? Number(pagosDia.abonos_recibidos || 0)
        : Number(h.abonos_ot || 0);
      return {
        fecha: h.fecha,
        ordenes: Number(h.ordenes || 0),
        ingresos: Number(h.ingresos || 0),
        abonos_recibidos: abonosRecibidos
      };
    });
    // Agregar días que tienen pagos pero no OT en el periodo (caso raro)
    Object.keys(historialPagosMap).forEach(fecha => {
      if (!historial.find(h => h.fecha === fecha)) {
        historial.push({
          fecha,
          ordenes: 0,
          ingresos: 0,
          abonos_recibidos: Number(historialPagosMap[fecha].abonos_recibidos || 0)
        });
      }
    });
    historial.sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Cálculos principales
    // totalAbonos ya fue calculado arriba con fallback: Pagos si hay, si no OT.monto_abono
    const costosManoObra = Number(costosAdicionales?.total_mano_obra || 0);
    const costosRepuestos = Number(costosAdicionales?.total_repuestos || 0);
    const costosExtra = Number(costosAdicionales?.total || 0);
    const gastosNegocio = Number(totalGastos?.total || 0);

    // Total de entradas = abonos recibidos (de Pagos o de OT, lo que tenga datos)
    const totalEntradasReales = totalAbonos;
    const totalIngresosConExtras = totalEntradasReales + costosExtra;

    // Separar mano de obra vs repuestos de los servicios del catálogo
    let totalMOFromServicios = 0;
    try {
      const ordenesServicios = await env.DB.prepare(`
        SELECT servicios_seleccionados FROM OrdenesTrabajo o
        ${fechaSQL}
        ${fechaSQL ? 'AND' : 'WHERE'} o.servicios_seleccionados IS NOT NULL AND o.servicios_seleccionados != ''
        AND o.estado != 'Cancelada'
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

    // Calcular comisiones POR TÉCNICO INDIVIDUAL (no promedio)
    // Cada técnico tiene su propio % de comisión
    // FIX: Itera sobre TODOS los técnicos activos (no solo los encontrados por GROUP BY)
    // y usa filtrado por item (tecnico_id) igual que liquidar-tecnicos.js
    let comisionesTecnicos = 0;
    let baseComisionable = 0;
    let comisionDetalles = [];

    // Obtener TODOS los técnicos activos
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

      // Query orders where this technician might have items:
      // 1. Orders where they are tecnico_asignado_id
      // 2. Orders that have servicios_seleccionados (may contain items with tecnico_id = this technician)
      let ordenesTecnico = []; // Build order list in the same loop
      try {
        let ordSQL = `
          SELECT o.id, o.numero_orden, o.patente_placa,
                 COALESCE(NULLIF(o.marca,''), v.marca) as marca,
                 COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo,
                 COALESCE(NULLIF(o.color,''), v.color) as color,
                 COALESCE(o.cliente_nombre, c.nombre) as cliente_nombre,
                 o.es_express,
                 o.monto_total, o.estado, o.estado_trabajo, o.tecnico_asignado_id, o.servicios_seleccionados,
                 COALESCE(ca.total_mano_obra, 0) as total_costos_mano_obra
          FROM OrdenesTrabajo o
          LEFT JOIN Clientes c ON o.cliente_id = c.id
          LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
          LEFT JOIN (
            SELECT orden_id,
              COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra
            FROM CostosAdicionales
            GROUP BY orden_id
          ) ca ON ca.orden_id = o.id
          WHERE (o.tecnico_asignado_id = ? OR (o.servicios_seleccionados IS NOT NULL AND o.servicios_seleccionados != ''))
          AND o.estado != 'Cancelada'
        `;
        let ordParams = [tecnicoId];
        // Excluir órdenes canceladas en liquidación
        try {
          await env.DB.prepare(`CREATE TABLE IF NOT EXISTS LiquidacionCanceladas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            orden_id INTEGER NOT NULL,
            tecnico_id INTEGER NOT NULL,
            fecha_cancelacion TEXT DEFAULT (datetime('now', '-3 hours')),
            UNIQUE(orden_id, tecnico_id)
          )`).run();
        } catch(e) {}
        ordSQL += ` AND o.id NOT IN (SELECT orden_id FROM LiquidacionCanceladas WHERE tecnico_id = ?)`;
        ordParams = [tecnicoId, tecnicoId];
        if (fechaCondicion) {
          ordSQL += ` AND ${fechaCondicion}`;
          ordParams = [...ordParams, ...params];
        }

        const { results: ordRows } = await env.DB.prepare(ordSQL).bind(...ordParams).all();

        for (const row of (ordRows || [])) {
          const tecnicoAsignadoId = row.tecnico_asignado_id;
          const esTecnicoAsignado = Number(tecnicoAsignadoId) === Number(tecnicoId);
          const costosMOOrden = Number(row.total_costos_mano_obra || 0);

          // Parse servicios_seleccionados
          let srvs = [];
          if (row.servicios_seleccionados) {
            try {
              srvs = typeof row.servicios_seleccionados === 'string'
                ? JSON.parse(row.servicios_seleccionados) : row.servicios_seleccionados;
              if (!Array.isArray(srvs)) srvs = [];
            } catch (e) { srvs = []; }
          }

          // Filter items by tecnico_id
          const { manoObraServicios, itemsPropios } = filtrarServiciosPorTecnico(srvs, tecnicoId, tecnicoAsignadoId);

          // Determine if this technician has items in this order
          const tieneItems = itemsPropios > 0 || (srvs.length === 0 && esTecnicoAsignado);
          if (!tieneItems) continue; // skip this order for this technician

          // Per-order base and commission calculation
          let ordenBase = 0;
          let ordenMoExtra = 0;

          // Direct assignment by tecnico_id from CostosAdicionales (replaces proportional)
          let costosManoObraAsignados = 0;
          try {
            const { results: costosDetallados } = await env.DB.prepare(`
              SELECT monto, COALESCE(tecnico_id, 0) as tecnico_id
              FROM CostosAdicionales
              WHERE orden_id = ? AND COALESCE(categoria, 'Mano de Obra') = 'Mano de Obra'
            `).bind(row.id).all();
            if (costosDetallados && costosDetallados.length > 0) {
              costosDetallados.forEach(c => {
                const costoTecId = Number(c.tecnico_id || 0);
                if (costoTecId === Number(tecnicoId) || (costoTecId === 0 && Number(tecnicoAsignadoId) === Number(tecnicoId))) {
                  costosManoObraAsignados += Number(c.monto || 0);
                }
              });
            }
          } catch(e) {
            // OLD proportional fallback logic
            if (srvs.length > 0 && itemsPropios > 0) {
              if (costosMOOrden > 0) {
                const totalMOOrden = srvs.reduce((sum, s) => {
                  if (s.tipo_comision === 'mano_obra') return sum + Number(s.precio_final || s.precio_sugerido || 0);
                  return sum;
                }, 0);
                if (totalMOOrden > 0) {
                  const proporcion = manoObraServicios / totalMOOrden;
                  costosManoObraAsignados = Math.round(costosMOOrden * proporcion);
                } else if (esTecnicoAsignado) {
                  costosManoObraAsignados = costosMOOrden;
                }
              }
            } else if (srvs.length === 0 && esTecnicoAsignado) {
              costosManoObraAsignados = costosMOOrden;
            }
          }

          if (srvs.length > 0 && itemsPropios > 0) {
            moServTec += manoObraServicios;
            ordenBase = manoObraServicios;
          } else if (srvs.length === 0 && esTecnicoAsignado) {
            // Legacy: no services parsed, use monto_total as base
            totalGeneradoBase += Number(row.monto_total || 0);
            ordenBase = Number(row.monto_total || 0);
          }

          moExtraTec += costosManoObraAsignados;
          ordenMoExtra = costosManoObraAsignados;

          // Add to order list with per-order base/commission
          ordenesTecnico.push({
            id: row.id,
            numero_orden: row.numero_orden,
            patente: row.patente_placa || '',
            marca: row.marca || '',
            modelo: row.modelo || '',
            color: row.color || '',
            cliente_nombre: row.cliente_nombre || '',
            es_express: Number(row.es_express || 0) === 1,
            total: Number(row.monto_total || 0),
            base_comision: ordenBase + ordenMoExtra,
            comision: Math.round((ordenBase + ordenMoExtra) * factorComision),
            estado: row.estado || '',
            estado_trabajo: row.estado_trabajo || ''
          });
        }
      } catch (e) {}

      const baseTec = moServTec > 0
        ? moServTec + moExtraTec
        : totalGeneradoBase + moExtraTec;

      if (baseTec <= 0) continue; // Skip technicians with zero base

      const comisionTec = Math.round(baseTec * factorComision);

      comisionesTecnicos += comisionTec;
      baseComisionable += baseTec;

      comisionDetalles.push({
        tecnico: tec.nombre,
        comision_porcentaje: comisionPct,
        base_comisionable: baseTec,
        comision: comisionTec,
        ordenes: ordenesTecnico
      });
    }

    // 6. Datos de LiquidacionOrden (liquidaciones manuales desde panel)
    let liquidacionOrdenResumen = [];
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
          lo.tecnico_id,
          t.nombre as tecnico_nombre,
          COUNT(DISTINCT lo.orden_id) as total_ordenes,
          SUM(lo.base_comisionable) as total_base,
          SUM(lo.monto_comision) as total_comision,
          SUM(lo.monto_domicilio) as total_domicilio
        FROM LiquidacionOrden lo
        LEFT JOIN Tecnicos t ON lo.tecnico_id = t.id
        ${liqOrdWhere}
        GROUP BY lo.tecnico_id
        ORDER BY t.nombre
      `).bind(...liqOrdParams).all();

      liquidacionOrdenResumen = liqOrdData.results || [];
      liquidacionOrdenResumen.forEach(r => {
        totalComisionLiqOrd += Number(r.total_comision || 0);
        totalDomicilioLiqOrd += Number(r.total_domicilio || 0);
        totalBaseLiqOrd += Number(r.total_base || 0);
      });

      // Fetch individual order details for each technician
      try {
        const liqOrdDetData = await env.DB.prepare(`
          SELECT
            lo.tecnico_id,
            lo.orden_id,
            lo.porcentaje_comision,
            lo.base_comisionable,
            lo.monto_comision,
            lo.monto_domicilio,
            o.numero_orden,
            o.patente_placa,
            COALESCE(NULLIF(o.marca,''), v.marca) as marca,
            COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo,
            COALESCE(NULLIF(o.color,''), v.color) as color,
            COALESCE(o.cliente_nombre, c.nombre) as cliente_nombre,
            COALESCE(o.es_express, 0) as es_express
          FROM LiquidacionOrden lo
          LEFT JOIN OrdenesTrabajo o ON lo.orden_id = o.id
          LEFT JOIN Clientes cl ON o.cliente_id = cl.id
          LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
          ${liqOrdWhere}
          ORDER BY o.numero_orden DESC
        `).bind(...liqOrdParams).all();

        const liqOrdDetalles = liqOrdDetData.results || [];
        // Group details by tecnico_id
        liquidacionOrdenResumen.forEach(r => {
          r.ordenes = liqOrdDetalles.filter(d => Number(d.tecnico_id) === Number(r.tecnico_id));
        });
      } catch (detErr) {
        console.log('LiquidacionOrden detail error:', detErr.message);
        liquidacionOrdenResumen.forEach(r => { r.ordenes = []; });
      }
    } catch (liqErr) {
      console.log('LiquidacionOrden resumen error:', liqErr.message);
    }

    // 7. Desglose de gastos por categoría
    let gastosPorCategoria = [];
    try {
      const gastosCatResult = await env.DB.prepare(`
        SELECT categoria, COALESCE(SUM(monto), 0) as total, COUNT(*) as cantidad
        FROM GastosNegocio
        ${gastosFecha}
        GROUP BY categoria
        ORDER BY total DESC
      `).bind(...gastosParams).all();
      gastosPorCategoria = gastosCatResult.results || [];
    } catch (e) {
      console.log('Gastos por categoria error:', e.message);
    }

    // 8. Detalle de gastos individuales
    let gastosDetalle = [];
    try {
      const gastosDetResult = await env.DB.prepare(`
        SELECT concepto, categoria, monto, fecha_gasto, observaciones
        FROM GastosNegocio
        ${gastosFecha}
        ORDER BY fecha_gasto DESC
        LIMIT 50
      `).bind(...gastosParams).all();
      gastosDetalle = gastosDetResult.results || [];
    } catch (e) {}

    // 9. Desglose por tipo de orden (Express vs Normal) — con abonos de Pagos o OT
    let desgloseTipoOrden = { express: { cantidad: 0, total: 0, abonos: 0 }, normal: { cantidad: 0, total: 0, abonos: 0 } };
    try {
      // Cantidad, valor y abonos desde OT (monto_abono como fuente confiable)
      const tipoOrdResult = await env.DB.prepare(`
        SELECT
          CASE WHEN o.es_express = 1 THEN 'express' ELSE 'normal' END as tipo,
          COUNT(*) as cantidad,
          COALESCE(SUM(o.monto_total), 0) as total,
          COALESCE(SUM(CASE WHEN o.monto_abono > 0 THEN o.monto_abono ELSE 0 END), 0) as abonos_ot
        FROM OrdenesTrabajo o
        ${fechaSQL}
        ${fechaSQL ? 'AND' : 'WHERE'} o.estado != 'Cancelada'
        GROUP BY CASE WHEN o.es_express = 1 THEN 'express' ELSE 'normal' END
      `).bind(...params).all();

      // Si Pagos tiene datos, usar esos como abonos; si no, usar OT.monto_abono
      let tipoAbonosMap = {};
      if (totalPagosRegistrados > 0) {
        try {
          const tipoPagosResult = await env.DB.prepare(`
            SELECT
              CASE WHEN o.es_express = 1 THEN 'express' ELSE 'normal' END as tipo,
              COALESCE(SUM(p.monto), 0) as abonos
            FROM Pagos p
            INNER JOIN OrdenesTrabajo o ON p.orden_id = o.id
            ${fechaSQL}
            ${fechaSQL ? 'AND' : 'WHERE'} o.estado != 'Cancelada'
            GROUP BY CASE WHEN o.es_express = 1 THEN 'express' ELSE 'normal' END
          `).bind(...params).all();
          (tipoPagosResult.results || []).forEach(r => {
            tipoAbonosMap[r.tipo] = Number(r.abonos || 0);
          });
        } catch (e) {}
      }

      (tipoOrdResult.results || []).forEach(r => {
        const abonos = totalPagosRegistrados > 0
          ? (tipoAbonosMap[r.tipo] || 0)
          : Number(r.abonos_ot || 0);
        if (r.tipo === 'express') {
          desgloseTipoOrden.express = { cantidad: Number(r.cantidad || 0), total: Number(r.total || 0), abonos };
        } else {
          desgloseTipoOrden.normal = { cantidad: Number(r.cantidad || 0), total: Number(r.total || 0), abonos };
        }
      });
    } catch (e) { console.log('Desglose tipo orden error:', e.message); }

    // 10. Tareas más comunes (servicios más frecuentes del catálogo)
    let tareasComunes = [];
    try {
      const srvRows = await env.DB.prepare(`
        SELECT servicios_seleccionados FROM OrdenesTrabajo o
        ${fechaSQL}
        ${fechaSQL ? 'AND' : 'WHERE'} o.servicios_seleccionados IS NOT NULL AND o.servicios_seleccionados != ''
        AND o.estado != 'Cancelada'
      `).bind(...params).all();
      const taskCount = {};
      (srvRows.results || []).forEach(row => {
        if (row.servicios_seleccionados) {
          try {
            const srvs = typeof row.servicios_seleccionados === 'string'
              ? JSON.parse(row.servicios_seleccionados) : row.servicios_seleccionados;
            if (Array.isArray(srvs)) {
              srvs.forEach(s => {
                const nombre = s.nombre || 'Sin nombre';
                if (!taskCount[nombre]) taskCount[nombre] = { nombre, cantidad: 0, total_generado: 0 };
                taskCount[nombre].cantidad++;
                taskCount[nombre].total_generado += Number(s.precio_final || s.precio_sugerido || 0);
              });
            }
          } catch (e) {}
        }
      });
      tareasComunes = Object.values(taskCount).sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);
    } catch (e) { console.log('Tareas comunes error:', e.message); }

    // 11. Conteo de órdenes en liquidación
    let resumenLiquidacion = { cantidad_ordenes: 0, total_comision: 0, total_domicilio: 0 };
    try {
      const liqCountResult = await env.DB.prepare(`
        SELECT
          COUNT(DISTINCT lo.orden_id) as cantidad_ordenes,
          COALESCE(SUM(lo.monto_comision), 0) as total_comision,
          COALESCE(SUM(lo.monto_domicilio), 0) as total_domicilio
        FROM LiquidacionOrden lo
        ${liqOrdWhere.replace(/lo\./g, 'lo.')}
      `).bind(...liqOrdParams).all();
      const liqRow = (liqCountResult.results || [])[0];
      if (liqRow) {
        resumenLiquidacion = {
          cantidad_ordenes: Number(liqRow.cantidad_ordenes || 0),
          total_comision: Number(liqRow.total_comision || 0),
          total_domicilio: Number(liqRow.total_domicilio || 0)
        };
      }
    } catch (e) { console.log('Resumen liquidacion error:', e.message); }

    // 12. ADELANTOS A TÉCNICOS (préstamos que se descuentan de la liquidación)
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
        notas TEXT DEFAULT '',
        fecha_registro TEXT DEFAULT (datetime('now', '-3 hours')),
        FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
      )`).run();

      // ADELANTOS: NO se filtran por fecha — son permanentes hasta que se paguen
      // Siempre muestran el total de adelantos pendientes independientemente del periodo seleccionado

      // Total adelantos pendientes (SIN filtro de fecha)
      const adelantoResumen = await env.DB.prepare(`
        SELECT COALESCE(SUM(a.monto), 0) as total
        FROM AdelantosTecnico a
        WHERE a.estado = 'pendiente'
      `).first();
      totalAdelantosPendientes = Number(adelantoResumen?.total || 0);

      // Desglose por técnico (SIN filtro de fecha)
      const { results: adPorTec } = await env.DB.prepare(`
        SELECT t.nombre as tecnico_nombre, COALESCE(SUM(a.monto), 0) as total_adelantos, COUNT(*) as cantidad
        FROM AdelantosTecnico a
        LEFT JOIN Tecnicos t ON a.tecnico_id = t.id
        WHERE a.estado = 'pendiente'
        GROUP BY a.tecnico_id
        ORDER BY total_adelantos DESC
      `).all();
      adelantosPorTecnico = adPorTec || [];

      // Detalle individual (SIN filtro de fecha)
      const { results: adDet } = await env.DB.prepare(`
        SELECT a.*, t.nombre as tecnico_nombre
        FROM AdelantosTecnico a
        LEFT JOIN Tecnicos t ON a.tecnico_id = t.id
        WHERE a.estado = 'pendiente'
        ORDER BY a.fecha_adelanto DESC
        LIMIT 50
      `).all();
      adelantosDetalle = adDet || [];
    } catch (e) { console.log('Adelantos error:', e.message); }

    // Agregar adelantos a cada técnico en comision_detalle
    const adelantosPorTecnicoMap = {};
    adelantosPorTecnico.forEach(a => {
      adelantosPorTecnicoMap[a.tecnico_nombre] = Number(a.total_adelantos || 0);
    });
    comisionDetalles.forEach(cd => {
      cd.adelantos = adelantosPorTecnicoMap[cd.tecnico] || 0;
      cd.neto_pagar = Math.max(0, cd.comision - cd.adelantos);
    });

    // Balance neto CORREGIDO: Entradas (Pagos o OT.monto_abono) - comisiones - gastos - liquidación - adelantos
    const balanceNeto = totalEntradasReales - comisionesTecnicos - gastosNegocio - totalComisionLiqOrd - totalDomicilioLiqOrd - totalAdelantosPendientes;

    return new Response(JSON.stringify({
      success: true,
      periodo,
      valor: valor || null,
      entradas: {
        total_abonos: totalAbonos,
        total_abonos_ot: totalAbonosOT,
        total_pagos_registrados: totalPagosRegistrados,
        total_entradas: totalEntradasReales,
        total_ordenes_valor: totalIngresosOrd,
        costos_adicionales: costosExtra,
        desglose_costos: {
          mano_de_obra: costosManoObra,
          repuestos_materiales: costosRepuestos
        },
        total_ingresos_con_extras: totalIngresosConExtras,
        total_mano_obra_servicios: totalMOFromServicios
      },
      salidas: {
        comisiones_tecnicos: comisionesTecnicos,
        base_comisionable: baseComisionable,
        comision_porcentaje: 'individual',
        gastos_operativos: gastosNegocio,
        adelantos_tecnicos: totalAdelantosPendientes,
        comision_detalle: comisionDetalles,
        liquidacion_ordenes: {
          total_comision: totalComisionLiqOrd,
          total_domicilio: totalDomicilioLiqOrd,
          total_base: totalBaseLiqOrd,
          por_tecnico: liquidacionOrdenResumen
        }
      },
      adelantos_detalle: {
        por_tecnico: adelantosPorTecnico,
        items: adelantosDetalle,
        total: totalAdelantosPendientes
      },
      gastos_detalle: {
        por_categoria: gastosPorCategoria,
        items: gastosDetalle
      },
      desglose_tipo_orden: desgloseTipoOrden,
      tareas_comunes: tareasComunes,
      resumen_liquidacion: resumenLiquidacion,
      balance_neto: balanceNeto,
      saldo_pendiente_cobrar: Number(pendientes?.saldo_pendiente || 0),
      total_pendientes_cobrar: pendientes?.total_pendientes || 0,
      por_metodo_pago: metodosPago,
      pagos_detalle: pagosPorMetodoDetalle,
      abonos_detalle: abonosDetalle,
      historial_diario: historial,
      formula_comision: 'Comisión calculada POR TÉCNICO con su % individual. Los repuestos NO generan comisión. Balance Neto = Entradas (Pagos registrados o monto_abono de OT) - Comisiones Auto - Gastos - Liq.Orden(Comisión+Domicilio) - Adelantos.'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener resumen de pagos:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
