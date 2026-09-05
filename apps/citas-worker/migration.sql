-- ============================================
-- GLOBALPRO CITAS - Schema Migration
-- Database: citas (678b4adc-232d-43db-86ec-230828268161)
-- ============================================

-- Add columns to existing Citas table
ALTER TABLE Citas ADD COLUMN patente TEXT;
ALTER TABLE Citas ADD COLUMN marca TEXT;
ALTER TABLE Citas ADD COLUMN modelo TEXT;
ALTER TABLE Citas ADD COLUMN anio INTEGER;
ALTER TABLE Citas ADD COLUMN nombre_cliente TEXT;
ALTER TABLE Citas ADD COLUMN telefono TEXT;
ALTER TABLE Citas ADD COLUMN email TEXT;
ALTER TABLE Citas ADD COLUMN duracion_minutos INTEGER DEFAULT 60;
ALTER TABLE Citas ADD COLUMN observaciones TEXT;
ALTER TABLE Citas ADD COLUMN canal TEXT DEFAULT 'chat';
ALTER TABLE Citas ADD COLUMN notificada_negocio INTEGER DEFAULT 0;
ALTER TABLE Citas ADD COLUMN notificada_cliente INTEGER DEFAULT 0;
ALTER TABLE Citas ADD COLUMN recordatorio_enviado INTEGER DEFAULT 0;
ALTER TABLE Citas ADD COLUMN created_at TEXT DEFAULT (datetime('now'));
ALTER TABLE Citas ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- Servicios disponibles
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

-- Horarios por día
CREATE TABLE IF NOT EXISTS horarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dia_semana TEXT NOT NULL UNIQUE,
    hora_apertura TEXT NOT NULL DEFAULT '08:00',
    hora_cierre TEXT NOT NULL DEFAULT '18:00',
    intervalo_minutos INTEGER DEFAULT 30,
    activo INTEGER DEFAULT 1
);

-- Fechas bloqueadas
CREATE TABLE IF NOT EXISTS bloqueos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL UNIQUE,
    motivo TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Config
CREATE TABLE IF NOT EXISTS config (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);

-- Servicios iniciales
INSERT OR IGNORE INTO servicios (nombre, descripcion, icono, duracion_minutos, precio_min, orden) VALUES
('Cambio de Aceite', 'Cambio de aceite de motor y filtro', 'oil-can', 30, '$15.000', 1),
('Revisión General', 'Inspección completa del vehículo', 'search', 60, '$25.000', 2),
('Scanner Diagnóstico', 'Diagnóstico electrónico con scanner OBD2', 'microchip', 30, '$20.000', 3),
('Frenos', 'Revisión y cambio de pastillas/discos de freno', 'hand-paper', 60, '$35.000', 4),
('Revisión Eléctrica', 'Diagnóstico del sistema eléctrico', 'bolt', 45, '$20.000', 5),
('Aire Acondicionado', 'Recarga y revisión de A/C', 'snowflake', 45, '$25.000', 6),
('Revisión Técnica', 'Preparación para revisión técnica', 'clipboard-check', 60, '$30.000', 7),
('Servicio a Domicilio', 'Mecánico a domicilio', 'truck', 90, '$40.000', 8);

-- Horarios
INSERT OR IGNORE INTO horarios (dia_semana, hora_apertura, hora_cierre, intervalo_minutos, activo) VALUES
('lunes', '08:00', '18:00', 30, 1),
('martes', '08:00', '18:00', 30, 1),
('miercoles', '08:00', '18:00', 30, 1),
('jueves', '08:00', '18:00', 30, 1),
('viernes', '08:00', '18:00', 30, 1),
('sabado', '09:00', '14:00', 30, 1),
('domingo', '00:00', '00:00', 30, 0);

-- Config
INSERT OR IGNORE INTO config (clave, valor) VALUES
('max_citas_por_dia', '20'),
('anticipacion_dias', '30'),
('limite_horas_antes', '2');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_citas_fecha ON Citas(fecha_cita);
CREATE INDEX IF NOT EXISTS idx_citas_estado ON Citas(estado);
CREATE INDEX IF NOT EXISTS idx_citas_patente ON Citas(patente);
CREATE INDEX IF NOT EXISTS idx_citas_telefono ON Citas(telefono);
