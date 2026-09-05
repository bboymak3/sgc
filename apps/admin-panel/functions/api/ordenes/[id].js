// ============================================
// SGC ADMIN - Orden individual
// GET    /api/ordenes/[id]  - Detalle
// PUT    /api/ordenes/[id]  - Actualizar (estado, tecnico, etc.)
// ============================================

export async function onRequestGet(context) {
  const { env, params } = context;
  try {
    const orden = await env.ORDENES_DB.prepare(
      `SELECT o.*, t.nombre as tecnico_nombre
       FROM OrdenesTrabajo o
       LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
       WHERE o.id = ?`
    ).bind(params.id).first();

    if (!orden) {
      return new Response(JSON.stringify({ success: false, error: 'Orden no encontrada' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Costos adicionales
    const costos = await env.ORDENES_DB.prepare(
      'SELECT * FROM CostosAdicionales WHERE orden_id = ? ORDER BY fecha_registro DESC'
    ).bind(params.id).all();

    // Fotos
    const fotos = await env.ORDENES_DB.prepare(
      'SELECT * FROM FotosTrabajo WHERE orden_id = ? ORDER BY fecha_subida DESC'
    ).bind(params.id).all();

    // Notas
    const notas = await env.ORDENES_DB.prepare(
      `SELECT n.*, t.nombre as tecnico_nombre FROM NotasTrabajo n
       LEFT JOIN Tecnicos t ON n.tecnico_id = t.id
       WHERE n.orden_id = ? ORDER BY n.fecha_nota DESC`
    ).bind(params.id).all();

    return new Response(JSON.stringify({
      success: true,
      orden,
      costos: costos.results || [],
      fotos: fotos.results || [],
      notas: notas.results || []
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  try {
    const data = await request.json();
    const campos = [];
    const valores = [];

    const allowed = [
      'estado', 'estado_trabajo',
      'tecnico_asignado_id',
      'monto_total', 'monto_abono', 'monto_restante',
      'fecha_programada', 'hora_programada',
      'direccion', 'referencia_direccion',
      'diagnostico_observaciones',
      'cliente_nombre', 'cliente_telefono',
      'patente_placa', 'marca', 'modelo', 'anio', 'color',
      'servicios_seleccionados',
      'es_express',
      'fecha_completado'
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        campos.push(`${key} = ?`);
        valores.push(data[key]);
      }
    }

    if (campos.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Nada que actualizar' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    valores.push(params.id);

    await env.ORDENES_DB.prepare(
      `UPDATE OrdenesTrabajo SET ${campos.join(', ')} WHERE id = ?`
    ).bind(...valores).run();

    const actualizada = await env.ORDENES_DB.prepare(
      `SELECT o.*, t.nombre as tecnico_nombre FROM OrdenesTrabajo o
       LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id WHERE o.id = ?`
    ).bind(params.id).first();

    return new Response(JSON.stringify({ success: true, orden: actualizada }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
