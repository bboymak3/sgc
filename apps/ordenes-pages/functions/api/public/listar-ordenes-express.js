// ============================================
// API PUBLICA READ-ONLY: Listar órdenes express
// Solo lectura - no modifica nada
// Global Pro Automotriz
// ============================================

const ALLOWED_ORIGINS = [
  'https://mecanico247.com',
  'https://www.mecanico247.com',
  'https://sgc-ordenes.pages.dev',
  'https://sgc-ordenes.pages.dev',
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: getCorsHeaders(context.request) });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const cors = getCorsHeaders(request);

  try {
    // Asegurar columna es_express existe
    try { await env.DB.exec('ALTER TABLE OrdenesTrabajo ADD COLUMN es_express INTEGER DEFAULT 0'); } catch (e) {}

    // Query: solo lectura, solo campos necesarios
    const { results: ordenes } = await env.DB.prepare(`
      SELECT
        o.numero_orden,
        o.patente_placa,
        COALESCE(NULLIF(o.marca, ''), v.marca) as marca,
        COALESCE(NULLIF(o.modelo, ''), v.modelo) as modelo,
        c.nombre as cliente_nombre,
        c.telefono as cliente_telefono,
        o.estado,
        o.estado_trabajo,
        o.fecha_creacion,
        o.fecha_ingreso,
        o.direccion,
        o.diagnostico_observaciones
      FROM OrdenesTrabajo o
      LEFT JOIN Clientes c ON o.cliente_id = c.id
      LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
      WHERE o.es_express = 1
      ORDER BY COALESCE(o.fecha_creacion, o.fecha_ingreso) DESC
      LIMIT 200
    `).all();

    // Conteo total
    const conteo = await env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN o.estado_trabajo IS NULL OR o.estado_trabajo = '' THEN 1 ELSE 0 END) as aprobadas,
        SUM(CASE WHEN o.estado_trabajo IN ('En Sitio', 'En Progreso') THEN 1 ELSE 0 END) as en_proceso,
        SUM(CASE WHEN o.estado_trabajo IN ('Completada', 'Cerrada') THEN 1 ELSE 0 END) as finalizadas
      FROM OrdenesTrabajo o
      WHERE o.es_express = 1
    `).first();

    return new Response(JSON.stringify({
      success: true,
      ordenes: ordenes || [],
      total: conteo?.total || 0,
      aprobadas: conteo?.aprobadas || 0,
      en_proceso: conteo?.en_proceso || 0,
      finalizadas: conteo?.finalizadas || 0
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Error interno del servidor'
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
