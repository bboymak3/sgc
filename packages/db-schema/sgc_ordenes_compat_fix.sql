-- =============================================================
-- SGC - Schema fix: agregar columnas/tablas faltantes
-- para compatibilidad con sgc-ordenes (globalprov2 legacy)
-- =============================================================

-- Tabla Tecnicos: agregar columna 'pin' (codigo de acceso tecnico)
ALTER TABLE Tecnicos ADD COLUMN pin TEXT;
-- Actualizar tecnicos existentes con pin default si los hubiera
UPDATE Tecnicos SET pin = '0000' WHERE pin IS NULL;

-- Tabla Configuracion (legacy, usada por algunos endpoints)
CREATE TABLE IF NOT EXISTS Configuracion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT NOT NULL UNIQUE,
  valor TEXT,
  fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insertar configuracion por defecto
INSERT OR IGNORE INTO Configuracion (clave, valor) VALUES
  ('ultramsg_instance', 'instance170592'),
  ('ultramsg_token', ''),
  ('whatsapp_business_phone', '56939026185'),
  ('business_name', 'SGC'),
  ('cargo_domicilio_default', '5000'),
  ('domicilio_modo_cobro_default', 'no_cobrar');

-- Tabla SesionesAdmin (legacy schema con columna 'usuario')
-- En caso de que el schema anterior no la haya creado correctamente
CREATE TABLE IF NOT EXISTS SesionesAdmin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expira DATETIME NOT NULL,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migracion: si existe columna 'usuario' en SesionesAdmin, renombrarla a 'username'
-- (SQLite 3.25+ soporta ALTER TABLE RENAME COLUMN)
