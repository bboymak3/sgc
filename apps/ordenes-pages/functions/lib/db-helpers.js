// ============================================
// DB HELPERS - Utilidades compartidas para D1
// SGC
// ============================================

// Hora actual en Chile (America/Santiago = UTC-3, sin cambio horario desde 2022)
// Devuelve expresión SQL para usar en D1/SQLite
// Ejemplo: datetime('now', '-3 hours') → '2026-04-23 14:30:00'
export function chileNow() {
  return "datetime('now', '-3 hours')";
}

// Fecha actual en Chile (solo date, sin hora)
export function chileDate() {
  return "date('now', '-3 hours')";
}

// Hora actual en Chile como string ISO para uso en JS del Worker
export function chileNowISO() {
  // D1 Workers ejecutan en UTC, calculamos Chile manualmente
  const now = new Date();
  // Chile = UTC-3 (sin DST desde 2022)
  const chileOffset = -3 * 60; // minutos
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const chileTime = new Date(utc + chileOffset * 60000);
  return chileTime.toISOString();
}

// Obtiene las columnas reales de una tabla
export async function getColumnas(env, tabla) {
  try {
    const r = await env.DB.prepare(`PRAGMA table_info('${tabla}')`).all();
    return (r.results || r || []).map(c => c.name);
  } catch (e) {
    return [];
  }
}

// Intenta agregar columnas faltantes (no falla si ya existen)
export async function asegurarColumnasFaltantes(env) {
  try {
    // Tablas que pueden no existir
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS CostosAdicionales (
      id INTEGER PRIMARY KEY AUTOINCREMENT, orden_id INTEGER NOT NULL,
      concepto TEXT NOT NULL, monto REAL NOT NULL,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
      registrado_por TEXT, categoria TEXT NOT NULL DEFAULT 'Mano de Obra'
    )`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS GastosNegocio (
      id INTEGER PRIMARY KEY AUTOINCREMENT, concepto TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'Otros', monto REAL NOT NULL,
      fecha_gasto DATE NOT NULL, observaciones TEXT,
      registrado_por TEXT, fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS Pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, orden_id INTEGER NOT NULL,
      monto REAL NOT NULL, metodo_pago TEXT NOT NULL,
      fecha_pago DATETIME DEFAULT CURRENT_TIMESTAMP, observaciones TEXT
    )`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ServiciosCatalogo (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE,
      precio_sugerido REAL NOT NULL DEFAULT 0,
      categoria TEXT NOT NULL DEFAULT 'Mantenimiento',
      tipo_comision TEXT NOT NULL DEFAULT 'mano_obra',
      activo INTEGER DEFAULT 1, fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ModelosVehiculo (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS NotificacionesWhatsApp (
      id INTEGER PRIMARY KEY AUTOINCREMENT, orden_id INTEGER NOT NULL,
      telefono TEXT NOT NULL, mensaje TEXT NOT NULL,
      tipo_evento TEXT NOT NULL, enviada INTEGER DEFAULT 0,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // Tabla AgendaTecnicos para Calendario de Agendamiento
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS AgendaTecnicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tecnico_id INTEGER NOT NULL,
      orden_id INTEGER,
      titulo TEXT NOT NULL,
      tipo_servicio TEXT NOT NULL DEFAULT 'taller',
      fecha_inicio TEXT NOT NULL,
      fecha_fin TEXT NOT NULL,
      color TEXT DEFAULT '#0d6efd',
      observaciones TEXT,
      estado TEXT DEFAULT 'pendiente',
      creado_por TEXT DEFAULT 'admin',
      fecha_creacion TEXT DEFAULT (datetime('now', '-3 hours')),
      FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id),
      FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id)
    )`).run();

    // Tabla FotosTrabajo para fotos subidas por técnicos (almacenadas en R2)
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS FotosTrabajo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      tecnico_id INTEGER NOT NULL,
      tipo_foto TEXT NOT NULL,
      r2_key TEXT NOT NULL DEFAULT '',
      url_imagen TEXT NOT NULL,
      tamano_bytes INTEGER DEFAULT 0,
      descripcion TEXT,
      fecha_subida TEXT DEFAULT (datetime('now', '-3 hours')),
      FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id),
      FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
    )`).run();

    // Agregar columnas nuevas a FotosTrabajo si la tabla ya existía sin ellas
    const colsFotos = await getColumnas(env, 'FotosTrabajo');
    if (colsFotos.length > 0) {
      if (!colsFotos.includes('r2_key')) {
        try { await env.DB.prepare('ALTER TABLE FotosTrabajo ADD COLUMN r2_key TEXT NOT NULL DEFAULT ""').run(); } catch (e) {}
      }
      if (!colsFotos.includes('tamano_bytes')) {
        try { await env.DB.prepare('ALTER TABLE FotosTrabajo ADD COLUMN tamano_bytes INTEGER DEFAULT 0').run(); } catch (e) {}
      }
    }

    // Tabla NotasTrabajo para notas de técnicos
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS NotasTrabajo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      tecnico_id INTEGER NOT NULL,
      nota TEXT NOT NULL,
      fecha_nota TEXT DEFAULT (datetime('now', '-3 hours')),
      FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id),
      FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
    )`).run();

    // Columnas faltantes en OrdenesTrabajo
    const colsOT = [
      'servicios_seleccionados TEXT', 'diagnostico_checks TEXT',
      'diagnostico_observaciones TEXT', 'fecha_creacion TEXT',
      'fecha_completado TEXT', 'referencia_direccion TEXT',
      'distancia_km REAL DEFAULT 0',
      'cargo_domicilio REAL DEFAULT 0',
      "domicilio_modo_cobro TEXT DEFAULT 'no_cobrar'",
      'fecha_programada TEXT',
      'hora_programada TEXT',
      'es_express INTEGER DEFAULT 0',
      'cliente_nombre TEXT',
      'cliente_telefono TEXT',
      'cliente_apellido TEXT DEFAULT \'\'',
      'aprobado_por TEXT',
      'color TEXT DEFAULT NULL'
    ];
    for (const colDef of colsOT) {
      try { await env.DB.prepare(`ALTER TABLE OrdenesTrabajo ADD COLUMN ${colDef}`).run(); } catch (e) {}
    }

    // Columnas faltantes en Vehiculos
    try { await env.DB.prepare(`ALTER TABLE Vehiculos ADD COLUMN color TEXT DEFAULT NULL`).run(); } catch (e) {}

    // Columnas faltantes en Tecnicos
    try { await env.DB.prepare(`ALTER TABLE Tecnicos ADD COLUMN comision_porcentaje REAL NOT NULL DEFAULT 40`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE Tecnicos ADD COLUMN apellido TEXT DEFAULT ''`).run(); } catch (e) {}

    // Tabla LiquidacionOrden: liquidación de órdenes con % personalizado por técnico
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS LiquidacionOrden (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      tecnico_id INTEGER NOT NULL,
      porcentaje_comision REAL NOT NULL DEFAULT 40,
      base_comisionable REAL NOT NULL DEFAULT 0,
      monto_comision REAL NOT NULL DEFAULT 0,
      monto_domicilio REAL DEFAULT 0,
      observaciones TEXT,
      fecha_liquidacion TEXT DEFAULT (datetime('now', '-3 hours')),
      estado TEXT DEFAULT 'pendiente',
      FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id),
      FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
    )`).run();

    // Columnas faltantes en CostosAdicionales
    try { await env.DB.prepare(`ALTER TABLE CostosAdicionales ADD COLUMN categoria TEXT NOT NULL DEFAULT 'Mano de Obra'`).run(); } catch (e) {}
    try { await env.DB.prepare(`ALTER TABLE CostosAdicionales ADD COLUMN tecnico_id INTEGER`).run(); } catch (e) {}
  } catch (e) {
    console.log('asegurarColumnasFaltantes:', e.message);
  }
}

// Devuelve el nombre de columna de fecha y la expresión ORDER BY
// Si fecha_creacion existe: usa COALESCE(fecha_creacion, fecha_ingreso)
// Si no: usa solo fecha_ingreso
export async function getFechaColumn(env) {
  const cols = await getColumnas(env, 'OrdenesTrabajo');
  const tiene = cols.includes('fecha_creacion');
  return {
    col: tiene ? "COALESCE(o.fecha_creacion, o.fecha_ingreso)" : "o.fecha_ingreso",
    as: tiene ? "COALESCE(o.fecha_creacion, o.fecha_ingreso)" : "o.fecha_ingreso",
    select: tiene ? "COALESCE(o.fecha_creacion, o.fecha_ingreso) as fecha_creacion" : "o.fecha_ingreso as fecha_creacion",
    tiene_fecha_creacion: tiene,
    tiene_fecha_completado: cols.includes('fecha_completado'),
    tiene_servicios: cols.includes('servicios_seleccionados'),
    tiene_diag_checks: cols.includes('diagnostico_checks'),
    tiene_diag_obs: cols.includes('diagnostico_observaciones'),
    tiene_referencia_dir: cols.includes('referencia_direccion'),
    tiene_distancia_km: cols.includes('distancia_km'),
    tiene_cargo_domicilio: cols.includes('cargo_domicilio'),
    tiene_domicilio_modo_cobro: cols.includes('domicilio_modo_cobro')
  };
}

// Devuelve info de columnas de Tecnicos
export async function getTecnicosInfo(env) {
  const cols = await getColumnas(env, 'Tecnicos');
  return {
    tiene_comision: cols.includes('comision_porcentaje'),
    select: cols.includes('comision_porcentaje') ? 't.comision_porcentaje' : '40 as comision_porcentaje'
  };
}

// Construye condición de fecha para WHERE
export function buildFechaWhere(fechaCol, periodo, valor) {
  if (!valor) return { condicion: '', params: [] };
  switch (periodo) {
    case 'dia':
      return { condicion: `date(${fechaCol}) = ?`, params: [valor] };
    case 'semana': {
      const [y, w] = valor.split('-').map(Number);
      return { condicion: `strftime('%Y', ${fechaCol}) = ? AND cast(strftime('%W', ${fechaCol}) as integer) = ?`, params: [String(y), w] };
    }
    case 'anio':
      return { condicion: `strftime('%Y', ${fechaCol}) = ?`, params: [valor] };
    case 'quincena':
      return { condicion: `strftime('%Y-%m', ${fechaCol}) = ? AND cast(strftime('%d', ${fechaCol}) as integer) <= 15`, params: [valor] };
    case 'mes':
    default:
      return { condicion: `strftime('%Y-%m', ${fechaCol}) = ?`, params: [valor] };
  }
}
