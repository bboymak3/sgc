// ============================================
// API: TRACKING DE TÉCNICO (enviar ubicación)
// POST /api/tecnico/tracking
// El técnico envía sus coordenadas GPS cada 30s
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    if (!data.orden_id || !data.tecnico_id || !data.latitud || !data.longitud) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos: orden_id, tecnico_id, latitud, longitud'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Asegurar que la tabla TrackingTecnico existe
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS TrackingTecnico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      tecnico_id INTEGER NOT NULL,
      latitud REAL NOT NULL,
      longitud REAL NOT NULL,
      velocidad REAL DEFAULT 0,
      fecha_registro TEXT DEFAULT (datetime('now', '-3 hours')),
      FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id),
      FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
    )`).run();

    // Crear índices si no existen
    try {
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_tracking_orden ON TrackingTecnico(orden_id)').run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_tracking_fecha ON TrackingTecnico(fecha_registro)').run();
    } catch(e) {}

    // Limpiar puntos anteriores de esta orden (mantener solo los últimos 100 para no llenar la BD)
    // Primero contar cuántos hay
    const count = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM TrackingTecnico WHERE orden_id = ?'
    ).bind(data.orden_id).first();

    if (count && count.total > 100) {
      // Borrar los más viejos, dejar solo los últimos 100
      await env.DB.prepare(
        `DELETE FROM TrackingTecnico WHERE orden_id = ? AND id NOT IN (
          SELECT id FROM TrackingTecnico WHERE orden_id = ? ORDER BY id DESC LIMIT 100
        )`
      ).bind(data.orden_id, data.orden_id).run();
    }

    // Insertar nuevo punto de tracking
    const velocidad = data.velocidad || 0;
    await env.DB.prepare(
      'INSERT INTO TrackingTecnico (orden_id, tecnico_id, latitud, longitud, velocidad) VALUES (?, ?, ?, ?, ?)'
    ).bind(data.orden_id, data.tecnico_id, data.latitud, data.longitud, velocidad).run();

    // Actualizar también las coordenadas en la orden (para referencia rápida)
    try {
      await env.DB.prepare(
        'UPDATE OrdenesTrabajo SET tecnico_lat = ?, tecnico_lng = ? WHERE id = ?'
      ).bind(data.latitud, data.longitud, data.orden_id).run();
    } catch(e) {
      // Si no existen las columnas, crearlas
      try { await env.DB.prepare('ALTER TABLE OrdenesTrabajo ADD COLUMN tecnico_lat REAL DEFAULT 0').run(); } catch(e2) {}
      try { await env.DB.prepare('ALTER TABLE OrdenesTrabajo ADD COLUMN tecnico_lng REAL DEFAULT 0').run(); } catch(e2) {}
      try {
        await env.DB.prepare(
          'UPDATE OrdenesTrabajo SET tecnico_lat = ?, tecnico_lng = ? WHERE id = ?'
        ).bind(data.latitud, data.longitud, data.orden_id).run();
      } catch(e3) {}
    }

    return new Response(JSON.stringify({
      success: true,
      mensaje: 'Ubicación registrada'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en tracking:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
