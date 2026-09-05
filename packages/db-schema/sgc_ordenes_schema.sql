-- =============================================================
-- SGC - SISTEMA DE GESTIÓN DE CITAS
-- Schema SQL inicial para sgc_ordenes_db
-- (Base de datos principal de órdenes de trabajo)
-- =============================================================

-- =====================================================
-- Tabla: Clientes
-- =====================================================
CREATE TABLE IF NOT EXISTS Clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  rut TEXT,
  direccion TEXT,
  fecha_registro TEXT DEFAULT (datetime('now', '-3 hours'))
);
CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON Clientes(telefono);
CREATE INDEX IF NOT EXISTS idx_clientes_rut ON Clientes(rut);

-- =====================================================
-- Tabla: Vehiculos
-- =====================================================
CREATE TABLE IF NOT EXISTS Vehiculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patente_placa TEXT NOT NULL UNIQUE,
  marca TEXT,
  modelo TEXT,
  anio INTEGER,
  cilindrada TEXT,
  combustible TEXT,
  kilometraje TEXT,
  color TEXT DEFAULT NULL,
  cliente_id INTEGER,
  fecha_registro TEXT DEFAULT (datetime('now', '-3 hours')),
  FOREIGN KEY (cliente_id) REFERENCES Clientes(id)
);
CREATE INDEX IF NOT EXISTS idx_vehiculos_patente ON Vehiculos(patente_placa);
CREATE INDEX IF NOT EXISTS idx_vehiculos_cliente ON Vehiculos(cliente_id);

-- =====================================================
-- Tabla: Tecnicos
-- =====================================================
CREATE TABLE IF NOT EXISTS Tecnicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellido TEXT DEFAULT '',
  telefono TEXT,
  email TEXT,
  especialidad TEXT,
  zona_cobertura TEXT,
  activo INTEGER DEFAULT 1,
  comision_porcentaje REAL NOT NULL DEFAULT 40,
  fecha_registro TEXT DEFAULT (datetime('now', '-3 hours'))
);
CREATE INDEX IF NOT EXISTS idx_tecnicos_activo ON Tecnicos(activo);

-- =====================================================
-- Tabla: OrdenesTrabajo (tabla principal)
-- (Schema completo incluyendo columnas legacy y nuevas)
-- =====================================================
CREATE TABLE IF NOT EXISTS OrdenesTrabajo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_orden INTEGER,
  token TEXT,
  cliente_id INTEGER,
  vehiculo_id INTEGER,
  patente_placa TEXT,
  marca TEXT,
  modelo TEXT,
  anio INTEGER,
  cilindrada TEXT,
  combustible TEXT,
  kilometraje TEXT,
  fecha_ingreso TEXT,
  hora_ingreso TEXT,
  recepcionista TEXT,
  direccion TEXT,
  -- Diagnóstico (checkboxes)
  trabajo_frenos INTEGER DEFAULT 0,
  detalle_frenos TEXT,
  trabajo_luces INTEGER DEFAULT 0,
  detalle_luces TEXT,
  trabajo_tren_delantero INTEGER DEFAULT 0,
  detalle_tren_delantero TEXT,
  trabajo_correas INTEGER DEFAULT 0,
  detalle_correas TEXT,
  trabajo_componentes INTEGER DEFAULT 0,
  detalle_componentes TEXT,
  nivel_combustible TEXT,
  -- Carrocería (checks)
  check_paragolfe_delantero_der INTEGER DEFAULT 0,
  check_puerta_delantera_der INTEGER DEFAULT 0,
  check_puerta_trasera_der INTEGER DEFAULT 0,
  check_paragolfe_trasero_izq INTEGER DEFAULT 0,
  check_otros_carroceria TEXT,
  -- Montos
  monto_total REAL DEFAULT 0,
  monto_abono REAL DEFAULT 0,
  monto_restante REAL DEFAULT 0,
  metodo_pago TEXT,
  -- Estados (sin CHECK restrictivo)
  estado TEXT DEFAULT 'Enviada',
  estado_trabajo TEXT DEFAULT 'Pendiente',
  firma_imagen TEXT,
  fecha_creacion TEXT DEFAULT (datetime('now', '-3 hours')),
  fecha_completado TEXT,
  -- Datos cliente (para órdenes express sin cliente_id)
  cliente_nombre TEXT,
  cliente_telefono TEXT,
  cliente_apellido TEXT DEFAULT '',
  aprobado_por TEXT,
  color TEXT DEFAULT NULL,
  -- Servicios y diagnóstico
  servicios_seleccionados TEXT,
  diagnostico_checks TEXT,
  diagnostico_observaciones TEXT,
  -- Domicilio
  referencia_direccion TEXT,
  distancia_km REAL DEFAULT 0,
  cargo_domicilio REAL DEFAULT 0,
  domicilio_modo_cobro TEXT DEFAULT 'no_cobrar',
  fecha_programada TEXT,
  hora_programada TEXT,
  es_express INTEGER DEFAULT 0,
  -- Asignación técnica
  tecnico_asignado_id INTEGER,
  FOREIGN KEY (cliente_id) REFERENCES Clientes(id),
  FOREIGN KEY (vehiculo_id) REFERENCES Vehiculos(id),
  FOREIGN KEY (tecnico_asignado_id) REFERENCES Tecnicos(id)
);
CREATE INDEX IF NOT EXISTS idx_ordenes_numero ON OrdenesTrabajo(numero_orden);
CREATE INDEX IF NOT EXISTS idx_ordenes_patente ON OrdenesTrabajo(patente_placa);
CREATE INDEX IF NOT EXISTS idx_ordenes_cliente ON OrdenesTrabajo(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON OrdenesTrabajo(estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_estado_trabajo ON OrdenesTrabajo(estado_trabajo);
CREATE INDEX IF NOT EXISTS idx_ordenes_fecha_programada ON OrdenesTrabajo(fecha_programada);
CREATE INDEX IF NOT EXISTS idx_ordenes_tecnico ON OrdenesTrabajo(tecnico_asignado_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_es_express ON OrdenesTrabajo(es_express);

-- =====================================================
-- Tabla: AgendaTecnicos (calendario FullCalendar)
-- =====================================================
CREATE TABLE IF NOT EXISTS AgendaTecnicos (
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
);
CREATE INDEX IF NOT EXISTS idx_agenda_tecnico ON AgendaTecnicos(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_agenda_fecha ON AgendaTecnicos(fecha_inicio);

-- =====================================================
-- Tabla: CostosAdicionales
-- =====================================================
CREATE TABLE IF NOT EXISTS CostosAdicionales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  concepto TEXT NOT NULL,
  monto REAL NOT NULL,
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
  registrado_por TEXT,
  categoria TEXT NOT NULL DEFAULT 'Mano de Obra',
  tecnico_id INTEGER,
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id) ON DELETE CASCADE
);

-- =====================================================
-- Tabla: GastosNegocio
-- =====================================================
CREATE TABLE IF NOT EXISTS GastosNegocio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concepto TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Otros',
  monto REAL NOT NULL,
  fecha_gasto DATE NOT NULL,
  observaciones TEXT,
  registrado_por TEXT,
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- Tabla: Pagos
-- =====================================================
CREATE TABLE IF NOT EXISTS Pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  monto REAL NOT NULL,
  metodo_pago TEXT NOT NULL,
  fecha_pago DATETIME DEFAULT CURRENT_TIMESTAMP,
  observaciones TEXT,
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id)
);

-- =====================================================
-- Tabla: ServiciosCatalogo
-- =====================================================
CREATE TABLE IF NOT EXISTS ServiciosCatalogo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  precio_sugerido REAL NOT NULL DEFAULT 0,
  categoria TEXT NOT NULL DEFAULT 'Mantenimiento',
  tipo_comision TEXT NOT NULL DEFAULT 'mano_obra',
  activo INTEGER DEFAULT 1,
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- Tabla: ModelosVehiculo
-- =====================================================
CREATE TABLE IF NOT EXISTS ModelosVehiculo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- Tabla: NotificacionesWhatsApp
-- =====================================================
CREATE TABLE IF NOT EXISTS NotificacionesWhatsApp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  telefono TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  tipo_evento TEXT NOT NULL,
  enviada INTEGER DEFAULT 0,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- Tabla: FotosTrabajo (almacenadas en R2)
-- =====================================================
CREATE TABLE IF NOT EXISTS FotosTrabajo (
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
);

-- =====================================================
-- Tabla: NotasTrabajo
-- =====================================================
CREATE TABLE IF NOT EXISTS NotasTrabajo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  tecnico_id INTEGER NOT NULL,
  nota TEXT NOT NULL,
  fecha_nota TEXT DEFAULT (datetime('now', '-3 hours')),
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id),
  FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
);

-- =====================================================
-- Tabla: LiquidacionOrden
-- =====================================================
CREATE TABLE IF NOT EXISTS LiquidacionOrden (
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
);

-- =====================================================
-- Tabla: AdelantosTecnico
-- =====================================================
CREATE TABLE IF NOT EXISTS AdelantosTecnico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tecnico_id INTEGER NOT NULL,
  monto REAL NOT NULL,
  fecha_adelanto TEXT DEFAULT (datetime('now', '-3 hours')),
  observaciones TEXT,
  registrado_por TEXT,
  FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
);

-- =====================================================
-- Tabla: ConfigKV
-- =====================================================
CREATE TABLE IF NOT EXISTS ConfigKV (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now', '-3 hours'))
);

-- =====================================================
-- Tabla: LiquidacionCanceladas
-- =====================================================
CREATE TABLE IF NOT EXISTS LiquidacionCanceladas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orden_id INTEGER NOT NULL,
  tecnico_id INTEGER,
  monto REAL NOT NULL,
  motivo TEXT,
  fecha TEXT DEFAULT (datetime('now', '-3 hours')),
  FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id),
  FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
);

-- =====================================================
-- Tabla: AdminUsers (para el panel admin con auth)
-- =====================================================
CREATE TABLE IF NOT EXISTS AdminUsers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'admin',
  activo INTEGER DEFAULT 1,
  ultimo_login TEXT,
  fecha_creacion TEXT DEFAULT (datetime('now', '-3 hours'))
);

-- Insertar admin por defecto (password: admin123)
-- Hash SHA-256 de "admin123": 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
INSERT OR IGNORE INTO AdminUsers (username, password_hash, nombre, rol) VALUES
  ('admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'Administrador SGC', 'admin');
