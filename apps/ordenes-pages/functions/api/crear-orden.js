// ============================================
// API: CREAR ORDEN DE TRABAJO
// SGC
// Soporta: orden normal (Enviada) y OT EXPRESS (Aprobada directo)
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    const isExpress = data.express === true;

    // Validaciones básicas
    if (!data.patente || !data.cliente || !data.telefono) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos obligatorios: patente, cliente y teléfono'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Obtener próximo número de orden
    const configResult = await env.DB.prepare(
      "SELECT ultimo_numero_orden FROM Configuracion WHERE id = 1"
    ).first();

    const ultimoNumero = configResult?.ultimo_numero_orden || 57;
    const nuevoNumero = ultimoNumero + 1;

    // Generar token único
    const token = crypto.randomUUID();

    // Asegurar columna express en la tabla
    try { await env.DB.exec('ALTER TABLE OrdenesTrabajo ADD COLUMN es_express INTEGER DEFAULT 0'); } catch (e) {}

    // Crear o actualizar cliente
    let cliente = await env.DB.prepare(
      "SELECT id FROM Clientes WHERE nombre = ? AND telefono = ?"
    ).bind(data.cliente, data.telefono).first();

    let clienteId;
    if (cliente) {
      clienteId = cliente.id;
      // Actualizar RUT si se proporcionó
      if (data.rut) {
        await env.DB.prepare(
          "UPDATE Clientes SET rut = ? WHERE id = ?"
        ).bind(data.rut, clienteId).run();
      }
    } else {
      const result = await env.DB.prepare(
        "INSERT INTO Clientes (nombre, rut, telefono) VALUES (?, ?, ?)"
      ).bind(data.cliente, data.rut || null, data.telefono).run();
      clienteId = result.meta.last_row_id;
    }

    // Asegurar columna color en Vehiculos
    try { await env.DB.exec('ALTER TABLE Vehiculos ADD COLUMN color TEXT DEFAULT NULL'); } catch (e) {}

    // Buscar o crear vehículo
    let vehiculo = await env.DB.prepare(
      "SELECT id FROM Vehiculos WHERE patente_placa = ?"
    ).bind(data.patente).first();

    let vehiculoId;
    if (vehiculo) {
      vehiculoId = vehiculo.id;
      // Actualizar datos del vehículo si vienen
      if (data.marca || data.modelo || data.anio) {
        await env.DB.prepare(`
          UPDATE Vehiculos
          SET marca = ?, modelo = ?, anio = ?, color = ?, cilindrada = ?,
              combustible = ?, kilometraje = ?, cliente_id = ?
          WHERE id = ?
        `).bind(
          data.marca || null,
          data.modelo || null,
          data.anio || null,
          data.color || null,
          data.cilindrada || null,
          data.combustible || null,
          data.kilometraje || null,
          clienteId,
          vehiculoId
        ).run();
      }
    } else {
      const result = await env.DB.prepare(`
        INSERT INTO Vehiculos (cliente_id, patente_placa, marca, modelo, anio, color,
                              cilindrada, combustible, kilometraje)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        clienteId,
        data.patente,
        data.marca || null,
        data.modelo || null,
        data.anio || null,
        data.color || null,
        data.cilindrada || null,
        data.combustible || null,
        data.kilometraje || null
      ).run();
      vehiculoId = result.meta.last_row_id;
    }

    // Auto-alter: asegurar columnas que pueden faltar existan
    const columnasFaltantes = [
      'diagnostico_checks TEXT',
      'diagnostico_observaciones TEXT',
      'servicios_seleccionados TEXT',
      'fecha_creacion TEXT',
      'fecha_completado TEXT',
      'referencia_direccion TEXT',
      'distancia_km REAL DEFAULT 0',
      'cargo_domicilio REAL DEFAULT 0',
      'domicilio_modo_cobro TEXT DEFAULT \'no_cobrar\'',
      'cliente_apellido TEXT DEFAULT \'\'',
      'cliente_lat REAL DEFAULT 0',
      'cliente_lng REAL DEFAULT 0',
      'color TEXT DEFAULT NULL'
    ];
    for (const colDef of columnasFaltantes) {
      try {
        await env.DB.exec(`ALTER TABLE OrdenesTrabajo ADD COLUMN ${colDef}`);
      } catch (e) { /* columna ya existe */ }
    }

    // Función auxiliar para escapar strings
    const escapeSql = (str) => {
      if (str === null || str === undefined || str === '') return 'NULL';
      return "'" + String(str).replace(/'/g, "''").replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + "'";
    };

    // FIX: Si es express y no viene fecha_ingreso, asignar fecha actual de Chile
    if (!data.fecha_ingreso) {
      data.fecha_ingreso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0]; // Chile UTC-3
    }
    // FIX: Si es express y no viene hora_ingreso, asignar hora actual de Chile
    if (!data.hora_ingreso) {
      const chileNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
      data.hora_ingreso = chileNow.toTimeString().slice(0, 5);
    }

    // Calcular monto_total desde servicios seleccionados si no viene explícitamente (solo para normal)
    let montoTotal = data.monto_total || 0;
    if (!isExpress && (!montoTotal || montoTotal === 0) && data.servicios_seleccionados) {
      try {
        const servicios = typeof data.servicios_seleccionados === 'string'
          ? JSON.parse(data.servicios_seleccionados)
          : data.servicios_seleccionados;
        montoTotal = servicios.reduce((sum, s) => sum + (Number(s.precio_final) || Number(s.precio_sugerido) || 0), 0);
      } catch (e) { /* usar monto_total original */ }
    }

    // Estado: EXPRESS = 'Aprobada' directo, Normal = 'Enviada'
    const estadoInicial = isExpress ? 'Aprobada' : 'Enviada';

    // Para EXPRESS: las notas de diagnóstico van en diagnostico_observaciones
    const diagnosticoObs = isExpress
      ? (data.notas_diagnostico || null)
      : (data.diagnostico_observaciones || null);

    const cLat = Number(data.cliente_lat) || 0;
    const cLng = Number(data.cliente_lng) || 0;

    // Insertar orden de trabajo
    const stmt = `INSERT INTO OrdenesTrabajo (numero_orden, token, cliente_id, vehiculo_id, patente_placa, fecha_ingreso, hora_ingreso, recepcionista, marca, modelo, anio, color, cilindrada, combustible, kilometraje, direccion, referencia_direccion, trabajo_frenos, detalle_frenos, trabajo_luces, detalle_luces, trabajo_tren_delantero, detalle_tren_delantero, trabajo_correas, detalle_correas, trabajo_componentes, detalle_componentes, nivel_combustible, check_paragolfe_delantero_der, check_puerta_delantera_der, check_puerta_trasera_der, check_paragolfe_trasero_izq, check_otros_carroceria, monto_total, monto_abono, monto_restante, metodo_pago, diagnostico_checks, diagnostico_observaciones, servicios_seleccionados, estado, fecha_creacion, es_express, cliente_apellido, cliente_lat, cliente_lng) VALUES (${nuevoNumero}, '${token}', ${clienteId}, ${vehiculoId}, '${data.patente}', ${escapeSql(data.fecha_ingreso)}, ${escapeSql(data.hora_ingreso)}, ${escapeSql(data.recepcionista)}, ${escapeSql(data.marca)}, ${escapeSql(data.modelo)}, ${data.anio || 'NULL'}, ${escapeSql(data.color)}, ${escapeSql(data.cilindrada)}, ${escapeSql(data.combustible)}, ${escapeSql(data.kilometraje)}, ${escapeSql(data.direccion)}, ${escapeSql(data.referencia_direccion)}, ${data.trabajo_frenos || 0}, ${escapeSql(data.detalle_frenos)}, ${data.trabajo_luces || 0}, ${escapeSql(data.detalle_luces)}, ${data.trabajo_tren_delantero || 0}, ${escapeSql(data.detalle_tren_delantero)}, ${data.trabajo_correas || 0}, ${escapeSql(data.detalle_correas)}, ${data.trabajo_componentes || 0}, ${escapeSql(data.detalle_componentes)}, ${escapeSql(data.nivel_combustible)}, ${data.check_paragolfe_delantero_der || 0}, ${data.check_puerta_delantera_der || 0}, ${data.check_puerta_trasera_der || 0}, ${data.check_paragolfe_trasero_izq || 0}, ${escapeSql(data.check_otros_carroceria)}, ${montoTotal}, ${data.monto_abono || 0}, ${data.monto_restante || 0}, ${escapeSql(data.metodo_pago)}, ${escapeSql(typeof data.diagnostico_checks === 'string' ? data.diagnostico_checks : (data.diagnostico_checks ? JSON.stringify(data.diagnostico_checks) : null))}, ${escapeSql(diagnosticoObs)}, ${escapeSql(typeof data.servicios_seleccionados === 'string' ? data.servicios_seleccionados : (data.servicios_seleccionados ? JSON.stringify(data.servicios_seleccionados) : null))}, '${estadoInicial}', datetime('now', 'localtime'), ${isExpress ? 1 : 0}, ${escapeSql(data.cliente_apellido || '')}, ${cLat}, ${cLng})`;

    await env.DB.exec(stmt);

    // Registrar pago inicial en tabla Pagos si hay monto_abono > 0
    const montoAbonoInicial = Number(data.monto_abono) || 0;
    if (montoAbonoInicial > 0) {
      try {
        // Obtener el ID de la orden recién creada
        const ordenCreada = await env.DB.prepare(
          'SELECT id FROM OrdenesTrabajo WHERE numero_orden = ? ORDER BY id DESC LIMIT 1'
        ).bind(nuevoNumero).first();
        if (ordenCreada) {
          const metodoPago = data.metodo_pago || 'Efectivo';
          await env.DB.prepare(`
            INSERT INTO Pagos (orden_id, monto, metodo_pago, fecha_pago, observaciones)
            VALUES (?, ?, ?, datetime('now', '-3 hours'), ?)
          `).bind(
            ordenCreada.id,
            montoAbonoInicial,
            metodoPago,
            'Abono inicial al crear orden'
          ).run();
        }
      } catch (pagoErr) {
        console.log('Error al registrar abono inicial en Pagos:', pagoErr.message);
      }
    }

    // Actualizar número de orden en configuración
    await env.DB.prepare(
      "UPDATE Configuracion SET ultimo_numero_orden = ? WHERE id = 1"
    ).bind(nuevoNumero).run();

    // Enviar notificación WhatsApp
    try {
      const { registrarNotificacion } = await import('../lib/notificaciones.js');
      var ordenCreada = await env.DB.prepare(
        'SELECT id FROM OrdenesTrabajo WHERE numero_orden = ? ORDER BY id DESC LIMIT 1'
      ).bind(nuevoNumero).first();
      var ordenId = ordenCreada ? ordenCreada.id : 0;

      if (isExpress) {
        // Notificación EXPRESS: sin link de firma
        await registrarNotificacion(env, ordenId, data.telefono, 'orden_express_creada', {
          numero_orden: nuevoNumero,
          patente_placa: data.patente,
          cliente_nombre: data.cliente
        });
      } else {
        // Notificación normal: con link de firma
        await registrarNotificacion(env, ordenId, data.telefono, 'orden_creada', {
          numero_orden: nuevoNumero,
          patente_placa: data.patente,
          cliente_nombre: data.cliente,
          link_aprobacion: 'https://sgc-ordenes.pages.dev/aprobar?token=' + token
        });
      }
    } catch (ne) { console.log('Notificacion no enviada:', ne.message); }

    return new Response(JSON.stringify({
      success: true,
      numero_orden: nuevoNumero,
      token: token,
      express: isExpress
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al crear orden:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
