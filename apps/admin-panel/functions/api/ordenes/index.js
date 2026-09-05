// ============================================
// SGC ADMIN - Órdenes de Trabajo
// GET  /api/ordenes              - Listar con filtros
// POST /api/ordenes              - Crear nueva OT
// GET  /api/ordenes/[id]         - Detalle
// PUT  /api/ordenes/[id]         - Actualizar (estado, tecnico, etc.)
// ============================================

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  try {
    const estado = url.searchParams.get('estado') || '';
    const estadoTrabajo = url.searchParams.get('estado_trabajo') || '';
    const patente = url.searchParams.get('patente') || '';
    const tecnicoId = url.searchParams.get('tecnico_id') || '';
    const limite = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

    let condiciones = [];
    let params = [];

    if (estado) { condiciones.push('estado = ?'); params.push(estado); }
    if (estadoTrabajo) { condiciones.push('estado_trabajo = ?'); params.push(estadoTrabajo); }
    if (patente) { condiciones.push('patente_placa LIKE ?'); params.push(`%${patente}%`); }
    if (tecnicoId) { condiciones.push('tecnico_asignado_id = ?'); params.push(tecnicoId); }

    const where = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';

    const result = await env.ORDENES_DB.prepare(
      `SELECT o.id, o.numero_orden, o.patente_placa, o.marca, o.modelo, o.anio, o.color,
              o.cliente_nombre, o.cliente_telefono,
              o.fecha_ingreso, o.fecha_programada, o.hora_programada,
              o.direccion, o.referencia_direccion,
              o.monto_total, o.monto_abono, o.monto_restante,
              o.estado, o.estado_trabajo,
              o.es_express, o.tecnico_asignado_id,
              o.fecha_creacion, o.fecha_completado,
              o.diagnostico_observaciones, o.servicios_seleccionados,
              t.nombre as tecnico_nombre
       FROM OrdenesTrabajo o
       LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
       ${where}
       ORDER BY o.fecha_creacion DESC
       LIMIT ?`
    ).bind(...params, limite).all();

    return new Response(JSON.stringify({
      success: true,
      ordenes: result.results || [],
      total: (result.results || []).length
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const b = await request.json();

    // Validaciones
    if (!b.patente_placa) {
      return new Response(JSON.stringify({ success: false, error: 'Patente es obligatoria' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const prox = await env.ORDENES_DB.prepare(
      'SELECT COALESCE(MAX(numero_orden), 0) + 1 as next FROM OrdenesTrabajo'
    ).first();
    const nuevoNum = prox?.next || 1;

    const result = await env.ORDENES_DB.prepare(
      `INSERT INTO OrdenesTrabajo (
        numero_orden, patente_placa, marca, modelo, anio, color,
        cliente_nombre, cliente_telefono,
        direccion, referencia_direccion,
        diagnostico_observaciones, servicios_seleccionados,
        fecha_programada, hora_programada,
        monto_total, monto_abono, monto_restante,
        es_express, estado, estado_trabajo,
        recepcionista, tecnico_asignado_id,
        fecha_creacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Enviada', 'Pendiente', 'sgc-admin', ?, datetime('now', '-3 hours'))`
    ).bind(
      nuevoNum,
      b.patente_placa,
      b.marca || null, b.modelo || null, b.anio || null, b.color || null,
      b.cliente_nombre || null, b.cliente_telefono || null,
      b.direccion || null, b.referencia_direccion || null,
      b.diagnostico_observaciones || null, b.servicios_seleccionados || null,
      b.fecha_programada || null, b.hora_programada || null,
      b.monto_total || 0, b.monto_abono || 0, b.monto_restante || (b.monto_total || 0) - (b.monto_abono || 0),
      b.es_express ? 1 : 0,
      b.tecnico_asignado_id || null
    ).run();

    const otId = result.meta?.last_row_id;
    const nueva = await env.ORDENES_DB.prepare(
      `SELECT o.*, t.nombre as tecnico_nombre FROM OrdenesTrabajo o
       LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id WHERE o.id = ?`
    ).bind(otId).first();

    return new Response(JSON.stringify({
      success: true,
      orden: nueva
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
