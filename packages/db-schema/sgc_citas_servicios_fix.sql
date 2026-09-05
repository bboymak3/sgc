-- =============================================================
-- SGC - Fix: agregar columnas faltantes a servicios_unificados
-- para compatibilidad con el codigo del chat IA
-- =============================================================

-- Agregar columna 'precio' (numeric) - el chat IA la usa en SELECT
ALTER TABLE servicios_unificados ADD COLUMN precio REAL DEFAULT 0;

-- Migrar datos desde precio_min a precio (extraer numero del texto)
UPDATE servicios_unificados
SET precio = CAST(
  REPLACE(REPLACE(REPLACE(REPLACE(
    REPLACE(precio_min, '$', ''),
    '.', ''),  -- miles
    ' ', ''),
    'CLP', ''),
    'Pesos', '')
  AS REAL
) WHERE precio_min IS NOT NULL AND precio = 0;

-- Agregar columna 'categoria' - el chat IA la usa en SELECT
ALTER TABLE servicios_unificados ADD COLUMN categoria TEXT DEFAULT 'Mantenimiento';

-- Agregar columna 'origen' - el admin la usa para distinguir origen
ALTER TABLE servicios_unificados ADD COLUMN origen TEXT DEFAULT 'base';

-- Categorizar servicios existentes
UPDATE servicios_unificados SET categoria = 'Diagnóstico' WHERE nombre LIKE '%Diagnóstico%' OR nombre LIKE '%Scanner%';
UPDATE servicios_unificados SET categoria = 'Mantención' WHERE nombre LIKE '%Mantención%' OR nombre LIKE '%Cambio de Aceite%';
UPDATE servicios_unificados SET categoria = 'Frenos' WHERE nombre LIKE '%Frenos%' OR nombre LIKE '%Tren Delantero%';
UPDATE servicios_unificados SET categoria = 'Eléctrico' WHERE nombre LIKE '%Baterías%' OR nombre LIKE '%Eléctrico%' OR nombre LIKE '%Auxilio%';
UPDATE servicios_unificados SET categoria = 'Aire Acondicionado' WHERE nombre LIKE '%Aire Acondicionado%';
UPDATE servicios_unificados SET categoria = 'Inspección' WHERE nombre LIKE '%Revisión Técnica%' OR nombre LIKE '%Inspección%';

-- Verificar resultado
SELECT id, nombre, precio, precio_min, categoria, origen FROM servicios_unificados;
