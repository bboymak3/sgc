// ============================================
// API: MIGRACIÓN AUTOMÁTICA
// Crea las tablas CostosAdicionales y GastosNegocio si no existen
// FIX: Eliminar CHECK constraint restrictivo en OrdenesTrabajo.estado
// Global Pro Automotriz
// ============================================

export async function onRequestGet(context) {
  const { env } = context;
  const resultados = [];

  try {
    // Crear tabla CostosAdicionales
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS CostosAdicionales (id INTEGER PRIMARY KEY AUTOINCREMENT, orden_id INTEGER NOT NULL, concepto TEXT NOT NULL, monto REAL NOT NULL, fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP, registrado_por TEXT, FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE)"
    ).run();
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_costos_orden ON CostosAdicionales(orden_id)").run(); } catch(e) {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_costos_fecha ON CostosAdicionales(fecha_registro)").run(); } catch(e) {}

    // Crear tabla GastosNegocio
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS GastosNegocio (id INTEGER PRIMARY KEY AUTOINCREMENT, concepto TEXT NOT NULL, categoria TEXT NOT NULL DEFAULT 'Otros', monto REAL NOT NULL, fecha_gasto DATE NOT NULL, observaciones TEXT, registrado_por TEXT, fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP)"
    ).run();
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON GastosNegocio(categoria)").run(); } catch(e) {}
    try { await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON GastosNegocio(fecha_gasto)").run(); } catch(e) {}

    resultados.push('CostosAdicionales y GastosNegocio verificadas');

    // ======================================================
    // FIX: Eliminar CHECK constraint restrictivo en estado
    // El constraint original era:
    //   estado IN ('Enviada', 'Aprobada', 'Cancelada', 'completada', 'en_proceso')
    // Pero el sistema usa valores con mayúsculas:
    //   'Completada', 'En Proceso', 'Cerrada', etc.
    // SQLite no permite ALTER CONSTRAINT, hay que recrear la tabla
    // ======================================================

    // Verificar si existe el CHECK constraint problemático
    let tieneCheckRestrictivo = false;
    let schemaOriginal = '';
    try {
      const sqlOrig = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='OrdenesTrabajo'").first();
      schemaOriginal = sqlOrig?.sql || '';
      if (schemaOriginal.includes("estado IN") || schemaOriginal.includes("estado CHECK")) {
        tieneCheckRestrictivo = true;
        resultados.push('Detectado CHECK constraint restrictivo en OrdenesTrabajo.estado');
      }
    } catch (e) {
      resultados.push('No se pudo verificar schema: ' + e.message);
    }

    if (tieneCheckRestrictivo) {
      try {
        // Obtener todas las columnas de la tabla original para reconstruirla
        const colsOriginales = await getColumnas(env, 'OrdenesTrabajo');
        resultados.push('Columnas originales: ' + colsOriginales.join(', '));

        // Paso 1: Crear tabla nueva con el mismo schema PERO sin CHECK constraint
        // Usar prepare().run() en vez de exec() porque D1 no maneja bien exec con strings largos
        await env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS OrdenesTrabajo_new (" +
          "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
          "numero_orden INTEGER, " +
          "token TEXT, " +
          "cliente_id INTEGER, " +
          "vehiculo_id INTEGER, " +
          "patente_placa TEXT, " +
          "marca TEXT, " +
          "modelo TEXT, " +
          "anio INTEGER, " +
          "cilindrada TEXT, " +
          "combustible TEXT, " +
          "kilometraje TEXT, " +
          "fecha_ingreso TEXT, " +
          "hora_ingreso TEXT, " +
          "recepcionista TEXT, " +
          "direccion TEXT, " +
          "trabajo_frenos INTEGER DEFAULT 0, " +
          "detalle_frenos TEXT, " +
          "trabajo_luces INTEGER DEFAULT 0, " +
          "detalle_luces TEXT, " +
          "trabajo_tren_delantero INTEGER DEFAULT 0, " +
          "detalle_tren_delantero TEXT, " +
          "trabajo_correas INTEGER DEFAULT 0, " +
          "detalle_correas TEXT, " +
          "trabajo_componentes INTEGER DEFAULT 0, " +
          "detalle_componentes TEXT, " +
          "nivel_combustible TEXT, " +
          "check_paragolfe_delantero_der INTEGER DEFAULT 0, " +
          "check_puerta_delantera_der INTEGER DEFAULT 0, " +
          "check_puerta_trasera_der INTEGER DEFAULT 0, " +
          "check_paragolfe_trasero_izq INTEGER DEFAULT 0, " +
          "check_otros_carroceria TEXT, " +
          "monto_total REAL DEFAULT 0, " +
          "monto_abono REAL DEFAULT 0, " +
          "monto_restante REAL DEFAULT 0, " +
          "metodo_pago TEXT, " +
          "estado TEXT DEFAULT 'Enviada', " +
          "estado_trabajo TEXT DEFAULT 'Pendiente', " +
          "firma_imagen TEXT, " +
          "fecha_aprobacion TEXT, " +
          "completo INTEGER DEFAULT 0, " +
          "notas TEXT, " +
          "pagado INTEGER DEFAULT 0, " +
          "fecha_creacion TEXT, " +
          "fecha_completado TEXT, " +
          "diagnostico_checks TEXT, " +
          "diagnostico_observaciones TEXT, " +
          "servicios_seleccionados TEXT, " +
          "referencia_direccion TEXT, " +
          "distancia_km REAL DEFAULT 0, " +
          "cargo_domicilio REAL DEFAULT 0, " +
          "domicilio_modo_cobro TEXT DEFAULT 'no_cobrar', " +
          "fecha_programada TEXT, " +
          "hora_programada TEXT, " +
          "es_express INTEGER DEFAULT 0, " +
          "tecnico_asignado_id INTEGER, " +
          "tecnico_lat REAL DEFAULT 0, " +
          "tecnico_lng REAL DEFAULT 0, " +
          "cliente_nombre TEXT, " +
          "cliente_telefono TEXT, " +
          "cliente_apellido TEXT DEFAULT '', " +
          "origen TEXT DEFAULT 'admin', " +
          "aprobado_por TEXT" +
          ")"
        ).run();
        resultados.push('Tabla OrdenesTrabajo_new creada exitosamente');

        // Paso 2: Obtener columnas de la tabla nueva
        const colsNuevas = await getColumnas(env, 'OrdenesTrabajo_new');
        const colsComunes = colsOriginales.filter(c => colsNuevas.includes(c));
        resultados.push('Columnas comunes para copiar: ' + colsComunes.join(', '));

        // Paso 3: Copiar datos usando prepare().run()
        const colsStr = colsComunes.join(', ');
        const selectStr = colsComunes.map(c => c).join(', ');
        await env.DB.prepare(
          `INSERT INTO OrdenesTrabajo_new (${colsStr}) SELECT ${selectStr} FROM OrdenesTrabajo`
        ).run();

        // Verificar que se copiaron los datos
        const countOld = await env.DB.prepare("SELECT COUNT(*) as cnt FROM OrdenesTrabajo").first();
        const countNew = await env.DB.prepare("SELECT COUNT(*) as cnt FROM OrdenesTrabajo_new").first();
        resultados.push(`Datos copiados: ${countNew?.cnt || 0} filas (original: ${countOld?.cnt || 0})`);

        // Paso 4: Drop tabla vieja
        await env.DB.prepare("DROP TABLE OrdenesTrabajo").run();
        resultados.push('Tabla OrdenesTrabajo vieja eliminada');

        // Paso 5: Renombrar tabla nueva
        await env.DB.prepare("ALTER TABLE OrdenesTrabajo_new RENAME TO OrdenesTrabajo").run();
        resultados.push('Tabla OrdenesTrabajo_new renombrada a OrdenesTrabajo');

        resultados.push('CHECK constraint eliminado exitosamente');

      } catch (migrateErr) {
        // Si falla, intentar limpiar tabla temporal
        try { await env.DB.prepare("DROP TABLE IF EXISTS OrdenesTrabajo_new").run(); } catch (e2) {}
        resultados.push('Error al migrar OrdenesTrabajo: ' + migrateErr.message);
        resultados.push('Se intentó limpiar tabla temporal');
      }
    } else {
      resultados.push('No se detectó CHECK constraint restrictivo - no se requiere migración de schema');
    }

    // Asegurar columnas que pueden faltar (usando prepare().run())
    const colsAsegurar = [
      'es_express INTEGER DEFAULT 0',
      'cliente_nombre TEXT',
      'cliente_telefono TEXT',
      'estado_trabajo TEXT DEFAULT \'Pendiente\'',
      'cliente_apellido TEXT DEFAULT \'\'',
      'origen TEXT DEFAULT \'admin\'',
      'aprobado_por TEXT'
    ];
    for (const colDef of colsAsegurar) {
      try { await env.DB.prepare(`ALTER TABLE OrdenesTrabajo ADD COLUMN ${colDef}`).run(); } catch (e) { /* ya existe */ }
    }

    // ======================================================
    // FIX: Reparar órdenes Express que tengan es_express = 0
    // Las órdenes express creadas ANTES de que existiera la
    // columna es_express tendrían valor DEFAULT 0.
    // Criterio ampliado para identificar express sin marca:
    //   - estado = 'Aprobada' (las express se crean directo en Aprobada)
    //   - NO tienen firma_imagen (las express NO requieren firma)
    //   - es_express = 0 (no marcadas como express)
    // ======================================================
    try {
      // Reparar órdenes APROBADAS sin firma y sin marca express
      const sinMarca1 = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM OrdenesTrabajo WHERE es_express = 0 AND estado = 'Aprobada' AND (firma_imagen IS NULL OR firma_imagen = '')`
      ).first();

      if (sinMarca1 && Number(sinMarca1.cnt) > 0) {
        await env.DB.prepare(
          `UPDATE OrdenesTrabajo SET es_express = 1 WHERE es_express = 0 AND estado = 'Aprobada' AND (firma_imagen IS NULL OR firma_imagen = '')`
        ).run();
        resultados.push(`Reparadas ${sinMarca1.cnt} órdenes Aprobada+sin firma sin marca express`);
      }

      // Reparar órdenes con estado_trabajo='Cerrada' o 'Completada' pero estado distinto de Aprobada
      // que fueron express pero se les cambió el estado manualmente
      const sinMarca2 = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM OrdenesTrabajo WHERE es_express = 0 AND (firma_imagen IS NULL OR firma_imagen = '') AND estado_trabajo IN ('Cerrada', 'Completada', 'En Progreso', 'En Sitio') AND estado NOT IN ('Enviada', 'Cancelada')`
      ).first();

      if (sinMarca2 && Number(sinMarca2.cnt) > 0) {
        await env.DB.prepare(
          `UPDATE OrdenesTrabajo SET es_express = 1 WHERE es_express = 0 AND (firma_imagen IS NULL OR firma_imagen = '') AND estado_trabajo IN ('Cerrada', 'Completada', 'En Progreso', 'En Sitio') AND estado NOT IN ('Enviada', 'Cancelada')`
        ).run();
        resultados.push(`Reparadas ${sinMarca2.cnt} órdenes sin firma con trabajo avanzado sin marca express`);
      }

      if ((!sinMarca1 || Number(sinMarca1.cnt) === 0) && (!sinMarca2 || Number(sinMarca2.cnt) === 0)) {
        resultados.push('No se encontraron órdenes express sin marca para reparar');
      }
    } catch (repairErr) {
      resultados.push('Error al reparar órdenes express: ' + repairErr.message);
    }

    // ======================================================
    // FIX: Reparar órdenes con fecha_ingreso = NULL
    // Las órdenes Express creadas desde el admin o el formulario público
    // NO enviaban fecha_ingreso, por lo que se guardaba como NULL.
    // Esto causaba que no aparecieran en liquidar-técnicos porque
    // el filtro strftime('%Y-%m', fecha_ingreso) no coincide con NULL.
    // Solución: Copiar fecha_creacion a fecha_ingreso donde sea NULL.
    // ======================================================
    try {
      const sinFecha = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM OrdenesTrabajo WHERE fecha_ingreso IS NULL AND fecha_creacion IS NOT NULL`
      ).first();

      if (sinFecha && Number(sinFecha.cnt) > 0) {
        await env.DB.prepare(
          `UPDATE OrdenesTrabajo SET fecha_ingreso = date(fecha_creacion) WHERE fecha_ingreso IS NULL AND fecha_creacion IS NOT NULL`
        ).run();
        resultados.push(`Reparadas ${sinFecha.cnt} órdenes con fecha_ingreso=NULL (copiada desde fecha_creacion)`);
      } else {
        // También verificar si hay órdenes sin ninguna fecha
        const sinNingunaFecha = await env.DB.prepare(
          `SELECT COUNT(*) as cnt FROM OrdenesTrabajo WHERE fecha_ingreso IS NULL AND fecha_creacion IS NULL`
        ).first();
        if (sinNingunaFecha && Number(sinNingunaFecha.cnt) > 0) {
          await env.DB.prepare(
            `UPDATE OrdenesTrabajo SET fecha_ingreso = date('now', '-3 hours'), fecha_creacion = datetime('now', '-3 hours') WHERE fecha_ingreso IS NULL AND fecha_creacion IS NULL`
          ).run();
          resultados.push(`Reparadas ${sinNingunaFecha.cnt} órdenes sin ninguna fecha (asignada fecha actual Chile)`);
        } else {
          resultados.push('Todas las órdenes tienen fecha_ingreso - no se requiere reparación');
        }
      }
    } catch (fechaErr) {
      resultados.push('Error al reparar fecha_ingreso: ' + fechaErr.message);
    }

    // ======================================================
    // FIX: Reparar patente_placa vacía en OrdenesTrabajo
    // Copiar la patente desde la tabla Vehiculos cuando esté vacía
    // ======================================================
    try {
      // Primero reparar los que tienen vehiculo_id pero patente_placa vacía
      const fixResult = await env.DB.prepare(`
        UPDATE OrdenesTrabajo
        SET patente_placa = (
          SELECT v.patente_placa FROM Vehiculos v WHERE v.id = OrdenesTrabajo.vehiculo_id
        )
        WHERE (OrdenesTrabajo.patente_placa IS NULL OR OrdenesTrabajo.patente_placa = '')
        AND OrdenesTrabajo.vehiculo_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM Vehiculos v WHERE v.id = OrdenesTrabajo.vehiculo_id AND v.patente_placa IS NOT NULL AND v.patente_placa != '')
      `).run();
      
      if (fixResult.meta.changes > 0) {
        resultados.push(`FIX PATENTES: ${fixResult.meta.changes} órdenes reparadas con patente desde Vehiculos`);
      }

      // También copiar marca y modelo si faltan
      const fixMarca = await env.DB.prepare(`
        UPDATE OrdenesTrabajo
        SET marca = COALESCE(OrdenesTrabajo.marca, (SELECT v.marca FROM Vehiculos v WHERE v.id = OrdenesTrabajo.vehiculo_id)),
            modelo = COALESCE(OrdenesTrabajo.modelo, (SELECT v.modelo FROM Vehiculos v WHERE v.id = OrdenesTrabajo.vehiculo_id))
        WHERE OrdenesTrabajo.vehiculo_id IS NOT NULL
        AND (OrdenesTrabajo.marca IS NULL OR OrdenesTrabajo.modelo IS NULL)
        AND EXISTS (SELECT 1 FROM Vehiculos v WHERE v.id = OrdenesTrabajo.vehiculo_id)
      `).run();
      
      if (fixMarca.meta.changes > 0) {
        resultados.push(`FIX MARCA/MODELO: ${fixMarca.meta.changes} órdenes reparadas con marca/modelo desde Vehiculos`);
      }

      // Actualizar patente_placa en Vehiculos que tenga la OrdenesTrabajo pero no el vehículo
      const fixVehiculo = await env.DB.prepare(`
        UPDATE Vehiculos
        SET patente_placa = (
          SELECT o.patente_placa FROM OrdenesTrabajo o WHERE o.vehiculo_id = Vehiculos.id
          AND o.patente_placa IS NOT NULL AND o.patente_placa != ''
          ORDER BY o.id DESC LIMIT 1
        )
        WHERE (Vehiculos.patente_placa IS NULL OR Vehiculos.patente_placa = '')
        AND EXISTS (
          SELECT 1 FROM OrdenesTrabajo o WHERE o.vehiculo_id = Vehiculos.id
          AND o.patente_placa IS NOT NULL AND o.patente_placa != ''
        )
      `).run();

      if (fixVehiculo.meta.changes > 0) {
        resultados.push(`FIX VEHICULOS: ${fixVehiculo.meta.changes} vehículos reparados con patente desde Órdenes`);
      }
    } catch (fixErr) {
      resultados.push('Error fix patentes: ' + fixErr.message);
    }



    // ======================================================
    // FIX: Recuperar tecnico_asignado_id desde MÚLTIPLES fuentes
    // cuando fue borrado por cerrarTodasLasOrdenes(), edición con
    // técnico inactivo, liberar-orden, o eliminación de agenda.
    // Fuentes en orden de prioridad:
    //   1) LiquidacionOrden (relación 1:1 con técnico confirmado)
    //   2) AgendaTecnicos  (agenda de trabajo asignada)
    //   3) servicios_seleccionados JSON (tecnico_id en items)
    //   4) FotosTrabajo (fotos subidas por técnico)
    //   5) NotasTrabajo (notas escritas por técnico)
    // ======================================================

    // Conteo previo de órdenes sin técnico
    let previasSinTecnico = 0;
    try {
      const countPrev = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM OrdenesTrabajo WHERE tecnico_asignado_id IS NULL OR tecnico_asignado_id = 0`
      ).first();
      previasSinTecnico = Number(countPrev?.cnt || 0);
    } catch(e) {}

    // --- Fuente 1: LiquidacionOrden (la más confiable) ---
    let recuperadasLO = 0;
    try {
      const fixTecResult = await env.DB.prepare(`
        UPDATE OrdenesTrabajo
        SET tecnico_asignado_id = (
          SELECT lo.tecnico_id FROM LiquidacionOrden lo
          WHERE lo.orden_id = OrdenesTrabajo.id
                   AND lo.tecnico_id IS NOT NULL AND lo.tecnico_id > 0
          LIMIT 1
        )
        WHERE (OrdenesTrabajo.tecnico_asignado_id IS NULL OR OrdenesTrabajo.tecnico_asignado_id = 0)
        AND EXISTS (
          SELECT 1 FROM LiquidacionOrden lo WHERE lo.orden_id = OrdenesTrabajo.id
          AND lo.tecnico_id IS NOT NULL AND lo.tecnico_id > 0
        )
      `).run();
      recuperadasLO = fixTecResult.meta.changes || 0;
      if (recuperadasLO > 0) {
        resultados.push('FIX TECNICOS (LiquidacionOrden): ' + recuperadasLO + ' ordenes recuperaron tecnico');
      }
    } catch (fixTecErr) {
      resultados.push('Error fix tecnicos desde LiquidacionOrden: ' + fixTecErr.message);
    }

    // --- Fuente 2: AgendaTecnicos (agenda de trabajo) ---
    let recuperadasAgenda = 0;
    try {
      const fixAgendaResult = await env.DB.prepare(`
        UPDATE OrdenesTrabajo
        SET tecnico_asignado_id = (
          SELECT ag.tecnico_id FROM AgendaTecnicos ag
          WHERE ag.orden_id = OrdenesTrabajo.id
            AND ag.tecnico_id IS NOT NULL AND ag.tecnico_id > 0
          ORDER BY ag.id DESC
          LIMIT 1
        )
        WHERE (OrdenesTrabajo.tecnico_asignado_id IS NULL OR OrdenesTrabajo.tecnico_asignado_id = 0)
        AND EXISTS (
          SELECT 1 FROM AgendaTecnicos ag WHERE ag.orden_id = OrdenesTrabajo.id
          AND ag.tecnico_id IS NOT NULL AND ag.tecnico_id > 0
        )
      `).run();
      recuperadasAgenda = fixAgendaResult.meta.changes || 0;
      if (recuperadasAgenda > 0) {
        resultados.push('FIX TECNICOS (AgendaTecnicos): ' + recuperadasAgenda + ' ordenes recuperaron tecnico desde agenda');
      }
    } catch (fixAgendaErr) {
      resultados.push('Error fix tecnicos desde AgendaTecnicos: ' + fixAgendaErr.message);
    }

    // --- Fuente 3: servicios_seleccionados JSON (tecnico_id en items) ---
    // SQLite json_each permite extraer tecnico_id de cada item del JSON
    let recuperadasServicios = 0;
    try {
      // Primero verificar si la tabla OrdenesTrabajo tiene la columna servicios_seleccionados
      const colsCheck = await getColumnas(env, 'OrdenesTrabajo');
      if (colsCheck.includes('servicios_seleccionados')) {
        // Buscar órdenes sin técnico que tengan tecnico_id en algún item de servicios_seleccionados
        const fixServResult = await env.DB.prepare(`
          UPDATE OrdenesTrabajo
          SET tecnico_asignado_id = (
            SELECT CAST(json_extract(sj.value, '$.tecnico_id') AS INTEGER)
            FROM OrdenesTrabajo ot2,
                 json_each(ot2.servicios_seleccionados) sj
            WHERE ot2.id = OrdenesTrabajo.id
              AND json_extract(sj.value, '$.tecnico_id') IS NOT NULL
              AND CAST(json_extract(sj.value, '$.tecnico_id') AS INTEGER) > 0
            LIMIT 1
          )
          WHERE (OrdenesTrabajo.tecnico_asignado_id IS NULL OR OrdenesTrabajo.tecnico_asignado_id = 0)
          AND servicios_seleccionados IS NOT NULL
          AND servicios_seleccionados != ''
          AND EXISTS (
            SELECT 1 FROM OrdenesTrabajo ot3,
                 json_each(ot3.servicios_seleccionados) sj2
            WHERE ot3.id = OrdenesTrabajo.id
              AND json_extract(sj2.value, '$.tecnico_id') IS NOT NULL
              AND CAST(json_extract(sj2.value, '$.tecnico_id') AS INTEGER) > 0
          )
        `).run();
        recuperadasServicios = fixServResult.meta.changes || 0;
        if (recuperadasServicios > 0) {
          resultados.push('FIX TECNICOS (servicios_seleccionados JSON): ' + recuperadasServicios + ' ordenes recuperaron tecnico desde items de servicio');
        }
      }
    } catch (fixServErr) {
      resultados.push('Error fix tecnicos desde servicios_seleccionados: ' + fixServErr.message);
    }

    // --- Fuente 4: FotosTrabajo (fotos subidas por un técnico) ---
    let recuperadasFotos = 0;
    try {
      const fixFotosResult = await env.DB.prepare(`
        UPDATE OrdenesTrabajo
        SET tecnico_asignado_id = (
          SELECT ft.tecnico_id FROM FotosTrabajo ft
          WHERE ft.orden_id = OrdenesTrabajo.id
            AND ft.tecnico_id IS NOT NULL AND ft.tecnico_id > 0
          ORDER BY ft.id DESC
          LIMIT 1
        )
        WHERE (OrdenesTrabajo.tecnico_asignado_id IS NULL OR OrdenesTrabajo.tecnico_asignado_id = 0)
        AND EXISTS (
          SELECT 1 FROM FotosTrabajo ft WHERE ft.orden_id = OrdenesTrabajo.id
          AND ft.tecnico_id IS NOT NULL AND ft.tecnico_id > 0
        )
      `).run();
      recuperadasFotos = fixFotosResult.meta.changes || 0;
      if (recuperadasFotos > 0) {
        resultados.push('FIX TECNICOS (FotosTrabajo): ' + recuperadasFotos + ' ordenes recuperaron tecnico desde fotos de trabajo');
      }
    } catch (fixFotosErr) {
      resultados.push('Error fix tecnicos desde FotosTrabajo: ' + fixFotosErr.message);
    }

    // --- Fuente 5: NotasTrabajo (notas escritas por un técnico) ---
    let recuperadasNotas = 0;
    try {
      const fixNotasResult = await env.DB.prepare(`
        UPDATE OrdenesTrabajo
        SET tecnico_asignado_id = (
          SELECT nt.tecnico_id FROM NotasTrabajo nt
          WHERE nt.orden_id = OrdenesTrabajo.id
            AND nt.tecnico_id IS NOT NULL AND nt.tecnico_id > 0
          ORDER BY nt.id DESC
          LIMIT 1
        )
        WHERE (OrdenesTrabajo.tecnico_asignado_id IS NULL OR OrdenesTrabajo.tecnico_asignado_id = 0)
        AND EXISTS (
          SELECT 1 FROM NotasTrabajo nt WHERE nt.orden_id = OrdenesTrabajo.id
          AND nt.tecnico_id IS NOT NULL AND nt.tecnico_id > 0
        )
      `).run();
      recuperadasNotas = fixNotasResult.meta.changes || 0;
      if (recuperadasNotas > 0) {
        resultados.push('FIX TECNICOS (NotasTrabajo): ' + recuperadasNotas + ' ordenes recuperaron tecnico desde notas de trabajo');
      }
    } catch (fixNotasErr) {
      resultados.push('Error fix tecnicos desde NotasTrabajo: ' + fixNotasErr.message);
    }

    // --- Resumen de recuperación ---
    const totalRecuperadas = recuperadasLO + recuperadasAgenda + recuperadasServicios + recuperadasFotos + recuperadasNotas;
    try {
      const countPost = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM OrdenesTrabajo WHERE tecnico_asignado_id IS NULL OR tecnico_asignado_id = 0`
      ).first();
      const postSinTecnico = Number(countPost?.cnt || 0);
      resultados.push('RECUPERACION TECNICOS: Antes=' + previasSinTecnico + ' sin tecnico | Recuperadas=' + totalRecuperadas + ' (Liquidacion:' + recuperadasLO + ', Agenda:' + recuperadasAgenda + ', Servicios:' + recuperadasServicios + ', Fotos:' + recuperadasFotos + ', Notas:' + recuperadasNotas + ') | Despues=' + postSinTecnico + ' sin tecnico');
    } catch(e) { resultados.push('RECUPERACION TECNICOS: Total recuperadas=' + totalRecuperadas); }

    // ======================================================
    // FIX: Repaso patente_placa desde Vehiculos
    // ======================================================
    try {
      const fixPatResult = await env.DB.prepare(`
        UPDATE OrdenesTrabajo
        SET patente_placa = (
          SELECT v.patente_placa FROM Vehiculos v WHERE v.id = OrdenesTrabajo.vehiculo_id
        )
        WHERE (OrdenesTrabajo.patente_placa IS NULL OR OrdenesTrabajo.patente_placa = '')
        AND OrdenesTrabajo.vehiculo_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM Vehiculos v WHERE v.id = OrdenesTrabajo.vehiculo_id AND v.patente_placa IS NOT NULL AND v.patente_placa != '')
      `).run();

      if (fixPatResult.meta.changes > 0) {
        resultados.push('FIX PATENTES (repaso): ' + fixPatResult.meta.changes + ' ordenes reparadas');
      }
    } catch (fixPatErr) {
      resultados.push('Error fix patentes repaso: ' + fixPatErr.message);
    }

    // ======================================================
    // DIAGNÓSTICO COMPLETO: Mostrar estado de órdenes en BD
    // ======================================================
    try {
      const diagExpress = await env.DB.prepare(
        `SELECT es_express, COUNT(*) as cnt FROM OrdenesTrabajo GROUP BY es_express`
      ).all();

      // Diagnóstico por estado/estado_trabajo/es_express (órdenes con técnico)
      const diagEstados = await env.DB.prepare(
        `SELECT estado, estado_trabajo, es_express, COUNT(*) as cnt FROM OrdenesTrabajo WHERE tecnico_asignado_id IS NOT NULL GROUP BY estado, estado_trabajo, es_express ORDER BY es_express DESC, cnt DESC`
      ).all();

      // Diagnóstico de órdenes RECIENTES (últimas 10 creadas)
      const diagRecientes = await env.DB.prepare(
        `SELECT id, numero_orden, estado, estado_trabajo, es_express, tecnico_asignado_id, firma_imagen IS NULL as sin_firma, fecha_creacion, fecha_ingreso FROM OrdenesTrabajo ORDER BY id DESC LIMIT 10`
      ).all();

      // Diagnóstico de órdenes SIN técnico asignado
      const diagSinTecnico = await env.DB.prepare(
        `SELECT estado, estado_trabajo, es_express, COUNT(*) as cnt FROM OrdenesTrabajo WHERE tecnico_asignado_id IS NULL GROUP BY estado, estado_trabajo, es_express ORDER BY cnt DESC`
      ).all();

      resultados.push('Diagnóstico es_express: ' + JSON.stringify((diagExpress.results || []).map(r => `es_express=${r.es_express}: ${r.cnt}`)));
      resultados.push('Diagnóstico con técnico: ' + JSON.stringify((diagEstados.results || []).slice(0, 15).map(r => `estado=${r.estado}/trabajo=${r.estado_trabajo}/express=${r.es_express}: ${r.cnt}`)));
      resultados.push('Diagnóstico sin técnico: ' + JSON.stringify((diagSinTecnico.results || []).slice(0, 10).map(r => `estado=${r.estado}/trabajo=${r.estado_trabajo}/express=${r.es_express}: ${r.cnt}`)));
      resultados.push('Últimas 10 órdenes: ' + JSON.stringify((diagRecientes.results || []).map(r => `#${r.numero_orden}: est=${r.estado}/trab=${r.estado_trabajo}/express=${r.es_express}/tecnico=${r.tecnico_asignado_id || 'none'}/firma=${r.sin_firma ? 'no' : 'si'}/fecha_ing=${r.fecha_ingreso || 'NULL'}`)));

      // Diagnóstico de fecha_ingreso: cuántas órdenes tienen NULL
      const diagFecha = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM OrdenesTrabajo WHERE fecha_ingreso IS NULL`
      ).first();
      if (diagFecha && Number(diagFecha.cnt) > 0) {
        resultados.push(`ALERTA: ${diagFecha.cnt} órdenes aún con fecha_ingreso=NULL`);
      }
    } catch (diagErr) {
      resultados.push('Error diagnóstico: ' + diagErr.message);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Migración completada exitosamente',
      resultados: resultados
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en migración:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      resultados: resultados
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// Helper para obtener columnas
async function getColumnas(env, tabla) {
  try {
    const r = await env.DB.prepare(`PRAGMA table_info('${tabla}')`).all();
    return (r.results || r || []).map(c => c.name);
  } catch (e) {
    return [];
  }
}

