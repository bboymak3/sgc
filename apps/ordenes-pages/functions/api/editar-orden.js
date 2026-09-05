// ============================================
// API: EDITAR ORDEN DE TRABAJO
// SGC
// Actualización dinámica: solo actualiza columnas que existen
// ============================================

import { getColumnas, asegurarColumnasFaltantes } from '../lib/db-helpers.js';

export async function onRequestPut(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const data = await request.json();
    if (!data.orden_id) {
      return new Response(JSON.stringify({ success: false, error: 'Falta orden_id' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    const existe = await env.DB.prepare('SELECT id FROM OrdenesTrabajo WHERE id = ?').bind(data.orden_id).first();
    if (!existe) {
      return new Response(JSON.stringify({ success: false, error: 'Orden no encontrada' }), {
        headers: { 'Content-Type': 'application/json' }, status: 404
      });
    }

    // Actualizar cliente
    if (data.cliente_id) {
      await env.DB.prepare('UPDATE Clientes SET nombre = ?, rut = ?, telefono = ? WHERE id = ?')
        .bind(data.cliente || '', data.rut || null, data.telefono || '', data.cliente_id).run();
    }

    // Actualizar vehículo
    if (data.vehiculo_id) {
      await env.DB.prepare('UPDATE Vehiculos SET marca = ?, modelo = ?, color = ?, anio = ?, cilindrada = ?, combustible = ?, kilometraje = ? WHERE id = ?')
        .bind(data.marca || null, data.modelo || null, data.color || null, data.anio || null, data.cilindrada || null, data.combustible || null, data.kilometraje || null, data.vehiculo_id).run();
    }

    // Asegurar que todas las columnas nuevas existan antes del UPDATE
    const nuevasCols = [
      'fecha_programada TEXT',
      'hora_programada TEXT',
      'referencia_direccion TEXT',
      'distancia_km REAL DEFAULT 0',
      'cargo_domicilio REAL DEFAULT 0',
      "domicilio_modo_cobro TEXT DEFAULT 'no_cobrar'",
      'es_express INTEGER DEFAULT 0',
      'tecnico_lat REAL DEFAULT 0',
      'tecnico_lng REAL DEFAULT 0',
      'cliente_apellido TEXT DEFAULT \'\'',
      'color TEXT DEFAULT NULL'
    ];
    for (const colDef of nuevasCols) {
      try { await env.DB.exec(`ALTER TABLE OrdenesTrabajo ADD COLUMN ${colDef}`); } catch (e) { /* ya existe */ }
    }
    // Asegurar columna color en Vehiculos también
    try { await env.DB.exec('ALTER TABLE Vehiculos ADD COLUMN color TEXT DEFAULT NULL'); } catch (e) {}

    // Obtener columnas disponibles para construir UPDATE dinámico
    const cols = await getColumnas(env, 'OrdenesTrabajo');

    // Calcular monto total = servicios + costos adicionales
    let totalServicios = 0;
    if (data.servicios_seleccionados) {
      try {
        const s = typeof data.servicios_seleccionados === 'string' ? JSON.parse(data.servicios_seleccionados) : data.servicios_seleccionados;
        if (Array.isArray(s) && s.length > 0) {
          totalServicios = s.reduce((sum, x) => sum + (Number(x.precio_final) || Number(x.precio_sugerido) || 0), 0);
        }
      } catch (e) {}
    }

    // Obtener costos adicionales de la orden desde la BD
    let totalCostosAdicionales = 0;
    try {
      const costos = await env.DB.prepare('SELECT COALESCE(SUM(monto), 0) as total FROM CostosAdicionales WHERE orden_id = ?').bind(data.orden_id).first();
      totalCostosAdicionales = Number(costos?.total || 0);
    } catch (e) { /* tabla puede no existir */ }

    // Si el frontend envía monto_total explícito (edición manual), respetarlo
    // Si no, calcular automáticamente: servicios + costos adicionales
    let montoTotal;
    const montoEnviado = Number(data.monto_total) || 0;
    const autoCalculado = totalServicios + totalCostosAdicionales;

    if (data.monto_total_manual === true) {
      // El usuario editó manualmente el total — respetar su valor
      montoTotal = montoEnviado;
    } else if (autoCalculado > 0) {
      // Auto-calcular: servicios + costos adicionales (solo si da > 0)
      montoTotal = autoCalculado;
    } else {
      // Auto-cálculo da 0: preservar el valor enviado (viene del campo de BD)
      montoTotal = montoEnviado;
    }

    // Obtener datos anteriores ANTES de actualizar, para calcular pago incremental
    // y resolver monto_total cuando el frontend no lo envía (cierre con candadito)
    let prevAbono = 0;
    let montoTotalDB = 0;
    try {
      const ordenAnterior = await env.DB.prepare(
        'SELECT COALESCE(monto_abono, 0) as abono_prev, COALESCE(monto_total, 0) as mt_prev FROM OrdenesTrabajo WHERE id = ?'
      ).bind(data.orden_id).first();
      prevAbono = Number(ordenAnterior?.abono_prev || 0);
      montoTotalDB = Number(ordenAnterior?.mt_prev || 0);
    } catch (e) {}

    // Si montoTotal sigue en 0, usar el valor de la BD
    // Esto es crítico cuando se cierra una orden desde el candadito:
    // el frontend NO envía monto_total, solo monto_abono = monto_total
    if (montoTotal === 0 && montoTotalDB > 0) {
      montoTotal = montoTotalDB;
    }

    let montoAbono = Number(data.monto_abono) || 0;

    // Si la orden se cierra, forzar: abono = total, restante = 0, pagado = 1 (sin deuda)
    const seCierra = data.estado_trabajo === 'Cerrada';
    if (seCierra && montoTotal > 0) {
      montoAbono = montoTotal; // abono = total → no debe nada
    }

    // Asegurar columna pagado existe
    try { await env.DB.exec('ALTER TABLE OrdenesTrabajo ADD COLUMN pagado INTEGER DEFAULT 0'); } catch (e) { /* ya existe */ }

    const sj = data.servicios_seleccionados ? (typeof data.servicios_seleccionados === 'string' ? data.servicios_seleccionados : JSON.stringify(data.servicios_seleccionados)) : null;
    const cj = data.diagnostico_checks ? (typeof data.diagnostico_checks === 'string' ? data.diagnostico_checks : JSON.stringify(data.diagnostico_checks)) : null;

        // FIX CRITICO: Solo incluir campos que fueron enviados explicitamente en data.
    // Antes: todos se incluian siempre, causando que cerrarTodasLasOrdenes()
    // borrara patente, tecnico_asignado_id, marca, etc.
    const camposPosibles = {};

    if (data.patente !== undefined) camposPosibles.patente_placa = data.patente || '';
    if (data.marca !== undefined) camposPosibles.marca = data.marca || null;
    if (data.modelo !== undefined) camposPosibles.modelo = data.modelo || null;
    if (data.color !== undefined) camposPosibles.color = data.color || null;
    if (data.anio !== undefined) camposPosibles.anio = data.anio || null;
    if (data.cilindrada !== undefined) camposPosibles.cilindrada = data.cilindrada || null;
    if (data.combustible !== undefined) camposPosibles.combustible = data.combustible || null;
    if (data.kilometraje !== undefined) camposPosibles.kilometraje = data.kilometraje || null;
    if (data.fecha_ingreso !== undefined) camposPosibles.fecha_ingreso = data.fecha_ingreso || null;
    if (data.hora_ingreso !== undefined) camposPosibles.hora_ingreso = data.hora_ingreso || null;
    if (data.recepcionista !== undefined) camposPosibles.recepcionista = data.recepcionista || null;
    if (data.direccion !== undefined) camposPosibles.direccion = data.direccion || null;
    if (data.referencia_direccion !== undefined) camposPosibles.referencia_direccion = data.referencia_direccion || null;
    if (data.trabajo_frenos !== undefined) camposPosibles.trabajo_frenos = data.trabajo_frenos ? 1 : 0;
    if (data.trabajo_luces !== undefined) camposPosibles.trabajo_luces = data.trabajo_luces ? 1 : 0;
    if (data.trabajo_tren_delantero !== undefined) camposPosibles.trabajo_tren_delantero = data.trabajo_tren_delantero ? 1 : 0;
    if (data.trabajo_correas !== undefined) camposPosibles.trabajo_correas = data.trabajo_correas ? 1 : 0;
    if (data.trabajo_componentes !== undefined) camposPosibles.trabajo_componentes = data.trabajo_componentes ? 1 : 0;
    if (data.detalle_frenos !== undefined) camposPosibles.detalle_frenos = data.detalle_frenos || null;
    if (data.detalle_luces !== undefined) camposPosibles.detalle_luces = data.detalle_luces || null;
    if (data.detalle_tren_delantero !== undefined) camposPosibles.detalle_tren_delantero = data.detalle_tren_delantero || null;
    if (data.detalle_correas !== undefined) camposPosibles.detalle_correas = data.detalle_correas || null;
    if (data.detalle_componentes !== undefined) camposPosibles.detalle_componentes = data.detalle_componentes || null;
    if (data.nivel_combustible !== undefined) camposPosibles.nivel_combustible = data.nivel_combustible || null;
    if (data.check_paragolfe_delantero_der !== undefined) camposPosibles.check_paragolfe_delantero_der = data.check_paragolfe_delantero_der ? 1 : 0;
    if (data.check_puerta_delantera_der !== undefined) camposPosibles.check_puerta_delantera_der = data.check_puerta_delantera_der ? 1 : 0;
    if (data.check_puerta_trasera_der !== undefined) camposPosibles.check_puerta_trasera_der = data.check_puerta_trasera_der ? 1 : 0;
    if (data.check_paragolpe_trasero_izq !== undefined) camposPosibles.check_paragolfe_trasero_izq = data.check_paragolfe_trasero_izq ? 1 : 0;
    if (data.check_otros_carroceria !== undefined) camposPosibles.check_otros_carroceria = data.check_otros_carroceria || null;
    if (data.metodo_pago !== undefined) camposPosibles.metodo_pago = data.metodo_pago || null;
    if (data.diagnostico_observaciones !== undefined) camposPosibles.diagnostico_observaciones = data.diagnostico_observaciones || null;
    if (data.estado !== undefined) camposPosibles.estado = data.estado || 'Enviada';
    if (data.estado_trabajo !== undefined) camposPosibles.estado_trabajo = data.estado_trabajo || null;
    if (data.tecnico_asignado_id !== undefined) {
      // FIX DEFENSA: Solo null si se envió explícitamente null o vacío.
      // No borrar el técnico si viene 0 o un valor inválido por error del frontend.
      camposPosibles.tecnico_asignado_id = (data.tecnico_asignado_id === null || data.tecnico_asignado_id === '' || data.tecnico_asignado_id === 0) ? null : data.tecnico_asignado_id;
    }
    if (data.fecha_programada !== undefined) camposPosibles.fecha_programada = data.fecha_programada || null;
    if (data.hora_programada !== undefined) camposPosibles.hora_programada = data.hora_programada || null;
    if (data.cliente !== undefined) camposPosibles.cliente_nombre = data.cliente || null;
    if (data.cliente_apellido !== undefined) camposPosibles.cliente_apellido = data.cliente_apellido || null;
    if (data.telefono !== undefined) camposPosibles.cliente_telefono = data.telefono || null;
    if (data.es_express !== undefined) camposPosibles.es_express = data.es_express ? 1 : 0;
    if (data.servicios_seleccionados !== undefined) camposPosibles.servicios_seleccionados = sj;
    if (data.diagnostico_checks !== undefined) camposPosibles.diagnostico_checks = cj;

    // Campos financieros calculados: siempre incluir
    camposPosibles.monto_total = montoTotal;
    camposPosibles.monto_abono = montoAbono;
    camposPosibles.monto_restante = montoTotal - montoAbono;

    // Si se cierra la orden, marcar como pagado = 1 (sin deuda)
    if (seCierra) {
      camposPosibles.pagado = 1;
    }

    // Eliminar campos undefined (no deben ir en el UPDATE)
    Object.keys(camposPosibles).forEach(key => {
      if (camposPosibles[key] === undefined) delete camposPosibles[key];
    });

    // Construir UPDATE solo con columnas que existen en la tabla
    const setClauses = [];
    const values = [];

    for (const [col, val] of Object.entries(camposPosibles)) {
      if (cols.includes(col)) {
        setClauses.push(`${col} = ?`);
        values.push(val);
      }
    }

    if (setClauses.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No hay campos para actualizar' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    values.push(data.orden_id);

    await env.DB.prepare(
      `UPDATE OrdenesTrabajo SET ${setClauses.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    // Registrar pago en tabla Pagos si hay monto_abono > 0
    // Esto permite que el flujo de caja tenga datos reales en la tabla Pagos
    if (montoAbono > 0) {
      try {
        // Solo registrar el pago incremental (lo nuevo que se pagó)
        const pagoIncremental = montoAbono - prevAbono;
        if (pagoIncremental > 0) {
          const metodoPago = data.metodo_pago || 'Efectivo';
          await env.DB.prepare(`
            INSERT INTO Pagos (orden_id, monto, metodo_pago, fecha_pago, observaciones)
            VALUES (?, ?, ?, datetime('now', '-3 hours'), ?)
          `).bind(
            data.orden_id,
            pagoIncremental,
            metodoPago,
            seCierra ? 'Pago automático al cerrar orden' : 'Pago registrado al actualizar abono'
          ).run();
        }
      } catch (pagoErr) {
        // No fallar la edición si el INSERT en Pagos falla
        console.log('Error al registrar pago en tabla Pagos:', pagoErr.message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      mensaje: 'Orden actualizada correctamente',
      monto_total: montoTotal,
      monto_restante: montoTotal - montoAbono
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al editar orden:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
