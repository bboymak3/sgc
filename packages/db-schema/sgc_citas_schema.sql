-- =============================================================
-- SGC - SISTEMA DE GESTIÓN DE CITAS
-- Schema SQL para sgc_citas_db (citas + chat IA)
-- =============================================================

-- =====================================================
-- Tabla: Citas (tabla principal)
-- =====================================================
CREATE TABLE IF NOT EXISTS Citas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha_cita TEXT NOT NULL,
  hora_cita TEXT NOT NULL,
  servicio TEXT NOT NULL,
  estado TEXT DEFAULT 'pendiente',
  -- Datos del vehículo
  patente TEXT,
  marca TEXT,
  modelo TEXT,
  anio INTEGER,
  color TEXT,
  -- Datos del cliente
  nombre_cliente TEXT,
  telefono TEXT,
  email TEXT,
  cliente_id INTEGER,
  -- Configuración
  duracion_minutos INTEGER DEFAULT 60,
  observaciones TEXT,
  canal TEXT DEFAULT 'chat',
  -- Notificaciones
  notificada_negocio INTEGER DEFAULT 0,
  notificada_cliente INTEGER DEFAULT 0,
  recordatorio_enviado INTEGER DEFAULT 0,
  -- Tipo de atención (domicilio o taller)
  tipo_atencion TEXT DEFAULT 'taller',
  direccion TEXT,
  referencia_direccion TEXT,
  -- Aprobación (admin panel)
  estado_aprobacion TEXT DEFAULT 'pendiente',
  motivo_rechazo TEXT,
  -- Integración con sgc-ordenes
  orden_enviada INTEGER DEFAULT 0,
  numero_orden_sgc INTEGER,
  -- Timestamps (Chile = UTC-3)
  created_at TEXT DEFAULT (datetime('now', '-3 hours')),
  updated_at TEXT DEFAULT (datetime('now', '-3 hours'))
);

CREATE INDEX IF NOT EXISTS idx_citas_fecha ON Citas(fecha_cita);
CREATE INDEX IF NOT EXISTS idx_citas_estado ON Citas(estado);
CREATE INDEX IF NOT EXISTS idx_citas_patente ON Citas(patente);
CREATE INDEX IF NOT EXISTS idx_citas_telefono ON Citas(telefono);
CREATE INDEX IF NOT EXISTS idx_citas_canal ON Citas(canal);
CREATE INDEX IF NOT EXISTS idx_citas_aprobacion ON Citas(estado_aprobacion);

-- =====================================================
-- Tabla: servicios (catálogo de servicios disponibles)
-- =====================================================
CREATE TABLE IF NOT EXISTS servicios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  icono TEXT DEFAULT 'wrench',
  duracion_minutos INTEGER DEFAULT 60,
  precio_min TEXT,
  activo INTEGER DEFAULT 1,
  orden INTEGER DEFAULT 0
);

-- =====================================================
-- Tabla: servicios_unificados (tabla activa usada por el chat IA)
-- Schema idéntico al que tiene sgc_citas_db en producción
-- =====================================================
CREATE TABLE IF NOT EXISTS servicios_unificados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  icono TEXT DEFAULT 'wrench',
  duracion_minutos INTEGER DEFAULT 60,
  precio_min TEXT,
  activo INTEGER DEFAULT 1,
  orden INTEGER DEFAULT 0,
  requiere_vehiculo INTEGER DEFAULT 1,
  es_domicilio INTEGER DEFAULT 0
);

-- Servicios unificados iniciales (con tipo_atencion)
INSERT OR IGNORE INTO servicios_unificados (nombre, descripcion, icono, duracion_minutos, precio_min, orden, requiere_vehiculo, es_domicilio) VALUES
('Diagnóstico y Scanner en Terreno', 'Diagnóstico con scanner OBD2 + inspección visual', 'microchip', 60, '$25.000', 1, 1, 1),
('Mantención Preventiva y Cambio de Aceite', 'Cambio de aceite + filtros + revisión general', 'oil-can', 60, '$35.000', 2, 1, 1),
('Reparación de Tren Delantero y Frenos', 'Rotulas, terminales, pastillas, discos', 'car', 90, '$45.000', 3, 1, 0),
('Baterías, Sistema Eléctrico y Auxilio Mecánico', 'Cambio de batería, alternador, arranque, auxilio', 'bolt', 45, '$30.000', 4, 1, 1),
('Aire Acondicionado Automotriz', 'Recarga + revisión completa', 'snowflake', 60, '$35.000', 5, 1, 0),
('Inspección para Revisión Técnica', 'Pre-check antes de la revisión técnica', 'clipboard-check', 60, '$30.000', 6, 1, 0);

-- =====================================================
-- Tabla: horarios (atención por día)
-- =====================================================
CREATE TABLE IF NOT EXISTS horarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dia_semana TEXT NOT NULL UNIQUE,
  hora_apertura TEXT NOT NULL DEFAULT '08:00',
  hora_cierre TEXT NOT NULL DEFAULT '18:00',
  intervalo_minutos INTEGER DEFAULT 30,
  activo INTEGER DEFAULT 1
);

INSERT OR IGNORE INTO horarios (dia_semana, hora_apertura, hora_cierre, intervalo_minutos, activo) VALUES
('lunes', '08:00', '18:00', 30, 1),
('martes', '08:00', '18:00', 30, 1),
('miercoles', '08:00', '18:00', 30, 1),
('jueves', '08:00', '18:00', 30, 1),
('viernes', '08:00', '18:00', 30, 1),
('sabado', '09:00', '14:00', 30, 1),
('domingo', '00:00', '00:00', 30, 0);

-- =====================================================
-- Tabla: bloqueos (fechas no disponibles)
-- =====================================================
CREATE TABLE IF NOT EXISTS bloqueos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL UNIQUE,
  motivo TEXT,
  created_at TEXT DEFAULT (datetime('now', '-3 hours'))
);

-- =====================================================
-- Tabla: config (configuración general)
-- =====================================================
CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

INSERT OR IGNORE INTO config (clave, valor) VALUES
('max_citas_por_dia', '20'),
('anticipacion_dias', '30'),
('limite_horas_antes', '2'),
('business_name', 'SGC'),
('business_phone', '56939026185');

-- =====================================================
-- Tabla: AdminUsers (auth del admin panel de citas)
-- (mismo admin/admin123 que sgc_ordenes_db)
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

INSERT OR IGNORE INTO AdminUsers (username, password_hash, nombre, rol) VALUES
('admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'Administrador SGC', 'admin');
