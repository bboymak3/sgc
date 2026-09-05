// ============================================
// API: VER ORDEN DE TRABAJO
// Con desglose de costos por categoría
// SGC
// ============================================

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const ordenId = url.searchParams.get('id');
    const token = url.searchParams.get('token');

    if (!ordenId && !token) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Se requiere ID o token de la orden'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    let orden;

    // Asegurar columnas faltantes antes de consultar (inline, no import)
    try {
      const cols = [
        'diagnostico_checks TEXT', 'diagnostico_observaciones TEXT',
        'servicios_seleccionados TEXT', 'fecha_creacion TEXT',
        'fecha_completado TEXT', 'referencia_direccion TEXT',
        'distancia_km REAL DEFAULT 0', 'cargo_domicilio REAL DEFAULT 0',
        "domicilio_modo_cobro TEXT DEFAULT 'no_cobrar'",
        'fecha_programada TEXT', 'hora_programada TEXT',
        'color TEXT DEFAULT NULL'
      ];
      for (const colDef of cols) {
        try { await env.DB.exec(`ALTER TABLE OrdenesTrabajo ADD COLUMN ${colDef}`); } catch (e) {}
      }
      try { await env.DB.exec('ALTER TABLE OrdenesTrabajo ADD COLUMN es_express INTEGER DEFAULT 0'); } catch (e) {}
      try { await env.DB.exec('ALTER TABLE Vehiculos ADD COLUMN color TEXT DEFAULT NULL'); } catch (e) {}
      try { await env.DB.exec('CREATE TABLE IF NOT EXISTS CostosAdicionales (id INTEGER PRIMARY KEY AUTOINCREMENT, orden_id INTEGER NOT NULL, concepto TEXT NOT NULL, monto REAL NOT NULL, fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP, registrado_por TEXT, categoria TEXT NOT NULL DEFAULT \'Mano de Obra\')'); } catch (e) {}
    } catch (e) {}

    if (token) {
      orden = await env.DB.prepare(`
        SELECT
          o.*,
          COALESCE(NULLIF(o.patente_placa,''), v.patente_placa, '') as patente_placa,
          COALESCE(o.marca, v.marca) as marca,
          COALESCE(o.modelo, v.modelo) as modelo,
          COALESCE(o.color, v.color) as color,
          COALESCE(o.cilindrada, v.cilindrada) as cilindrada,
          COALESCE(o.combustible, v.combustible) as combustible,
          COALESCE(o.kilometraje, v.kilometraje) as kilometraje,
          COALESCE(o.anio, v.anio) as anio,
          c.nombre as cliente_nombre,
          c.rut as cliente_rut,
          c.telefono as cliente_telefono,
          t.nombre as tecnico_nombre
        FROM OrdenesTrabajo o
        LEFT JOIN Clientes c ON o.cliente_id = c.id
        LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
        LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
        WHERE o.token = ?
      `).bind(token).first();
    } else {
      orden = await env.DB.prepare(`
        SELECT
          o.*,
          COALESCE(NULLIF(o.patente_placa,''), v.patente_placa, '') as patente_placa,
          COALESCE(o.marca, v.marca) as marca,
          COALESCE(o.modelo, v.modelo) as modelo,
          COALESCE(o.color, v.color) as color,
          COALESCE(o.cilindrada, v.cilindrada) as cilindrada,
          COALESCE(o.combustible, v.combustible) as combustible,
          COALESCE(o.kilometraje, v.kilometraje) as kilometraje,
          COALESCE(o.anio, v.anio) as anio,
          c.nombre as cliente_nombre,
          c.rut as cliente_rut,
          c.telefono as cliente_telefono,
          t.nombre as tecnico_nombre
        FROM OrdenesTrabajo o
        LEFT JOIN Clientes c ON o.cliente_id = c.id
        LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
        LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
        WHERE o.id = ?
      `).bind(parseInt(ordenId)).first();
    }

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Obtener costos adicionales desglosados por categoría
    let desgloseCostos = { mano_de_obra: 0, repuestos_materiales: 0, domicilio: 0, total: 0 };
    try {
      const costosResult = await env.DB.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN categoria = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
          COALESCE(SUM(CASE WHEN categoria = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
          COALESCE(SUM(monto), 0) as total_general
        FROM CostosAdicionales WHERE orden_id = ?
      `).bind(orden.id).first();

      desgloseCostos = {
        mano_de_obra: Number(costosResult?.total_mano_obra || 0),
        repuestos_materiales: Number(costosResult?.total_repuestos || 0),
        domicilio: Number(orden.cargo_domicilio || 0),
        total: Number(costosResult?.total_general || 0)
      };
    } catch (e) {
      console.log('Tabla CostosAdicionales no disponible:', e.message);
    }

    // Obtener items individuales de costos adicionales
    let costosAdicionales = [];
    try {
      const { results: costosItems } = await env.DB.prepare(
        'SELECT id, concepto, monto, categoria, fecha_registro FROM CostosAdicionales WHERE orden_id = ? ORDER BY fecha_registro DESC'
      ).bind(orden.id).all();
      costosAdicionales = costosItems || [];
    } catch (e) {
      console.log('CostosAdicionales items no disponible:', e.message);
    }

    // Obtener servicios seleccionados
    let serviciosSeleccionados = [];
    try {
      const cols = await env.DB.prepare("PRAGMA table_info(OrdenesTrabajo)").all();
      const hasServicios = (cols.results || []).some(c => c.name === 'servicios_seleccionados');
      if (hasServicios && orden.servicios_seleccionados) {
        serviciosSeleccionados = typeof orden.servicios_seleccionados === 'string' 
          ? JSON.parse(orden.servicios_seleccionados) 
          : (orden.servicios_seleccionados || []);
      }
    } catch (e) {
      console.log('servicios_seleccionados no disponible:', e.message);
    }

    // monto_final: si el domicilio es pago directo al tecnico, NO se suma al total
    var modoDomicilio = orden.domicilio_modo_cobro || 'pago_directo_tecnico';
    var domicilioExclude = (modoDomicilio === 'pago_directo_tecnico') ? desgloseCostos.domicilio : 0;
    var montoFinal = Number(orden.monto_total || 0) + desgloseCostos.total - domicilioExclude;

    return new Response(JSON.stringify({
      success: true,
      orden: {
        ...orden,
        desglose_costos: desgloseCostos,
        costos_adicionales: costosAdicionales,
        total_costos_adicionales: desgloseCostos.total,
        cargo_domicilio: desgloseCostos.domicilio,
        distancia_km: Number(orden.distancia_km || 0),
        domicilio_modo_cobro: modoDomicilio,
        monto_final: montoFinal,
        servicios_seleccionados: serviciosSeleccionados
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al ver orden:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
