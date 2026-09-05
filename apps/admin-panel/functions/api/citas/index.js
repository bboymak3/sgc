// ============================================
// SGC ADMIN - Citas CRUD
// GET    /api/citas            - Listar con filtros (estado, fecha, etc.)
// POST   /api/citas            - Crear nueva cita
// GET    /api/citas/[id]       - Obtener detalle
// PUT    /api/citas/[id]       - Actualizar
// POST   /api/citas/[id]/aprobar  - Aprobar (crea OT en sgc-ordenes)
// POST   /api/citas/[id]/rechazar - Rechazar
// ============================================

// === LISTAR CITAS ===
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  try {
    const estado = url.searchParams.get('estado') || '';
    const desde = url.searchParams.get('desde') || '';
    const hasta = url.searchParams.get('hasta') || '';
    const busqueda = url.searchParams.get('q') || '';
    const limite = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

    let condiciones = [];
    let params = [];

    if (estado) {
      condiciones.push('estado = ?');
      params.push(estado);
    }
    if (desde) {
      condiciones.push('fecha_cita >= ?');
      params.push(desde);
    }
    if (hasta) {
      condiciones.push('fecha_cita <= ?');
      params.push(hasta);
    }
    if (busqueda) {
      condiciones.push('(nombre_cliente LIKE ? OR telefono LIKE ? OR patente LIKE ?)');
      params.push(`%${busqueda}%`, `%${busqueda}%`, `%${busqueda}%`);
    }

    const where = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';

    const result = await env.CITAS_DB.prepare(
      `SELECT id, fecha_cita, hora_cita, servicio, estado, estado_aprobacion,
              nombre_cliente, telefono, patente, marca, modelo, anio, color,
              tipo_atencion, direccion, observaciones, canal, created_at,
              orden_enviada, numero_orden_sgc
       FROM Citas
       ${where}
       ORDER BY created_at DESC
       LIMIT ?`
    ).bind(...params, limite).all();

    return new Response(JSON.stringify({
      success: true,
      citas: result.results || [],
      total: (result.results || []).length
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

// === CREAR CITA ===
export async function onRequestPost(context) {
  const { request, env, data } = context;

  try {
    const body = await request.json();
    const {
      fecha_cita, hora_cita, servicio,
      nombre_cliente, telefono, email,
      patente, marca, modelo, anio, color,
      tipo_atencion, direccion, referencia_direccion,
      observaciones, duracion_minutos
    } = body;

    if (!fecha_cita || !hora_cita || !servicio) {
      return new Response(JSON.stringify({ success: false, error: 'fecha_cita, hora_cita y servicio son obligatorios' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await env.CITAS_DB.prepare(
      `INSERT INTO Citas (
        fecha_cita, hora_cita, servicio, estado, estado_aprobacion,
        nombre_cliente, telefono, email,
        patente, marca, modelo, anio, color,
        tipo_atencion, direccion, referencia_direccion,
        observaciones, duracion_minutos, canal, created_at, updated_at
      ) VALUES (?, ?, ?, 'confirmada', 'pendiente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', datetime('now', '-3 hours'), datetime('now', '-3 hours'))`
    ).bind(
      fecha_cita, hora_cita, servicio,
      nombre_cliente || null, telefono || null, email || null,
      patente || null, marca || null, modelo || null, anio || null, color || null,
      tipo_atencion || 'taller', direccion || null, referencia_direccion || null,
      observaciones || null, duracion_minutos || 60
    ).run();

    const nuevoId = result.meta?.last_row_id;
    const nueva = await env.CITAS_DB.prepare('SELECT * FROM Citas WHERE id = ?').bind(nuevoId).first();

    return new Response(JSON.stringify({
      success: true,
      cita: nueva
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
