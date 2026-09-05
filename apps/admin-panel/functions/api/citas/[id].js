// ============================================
// SGC ADMIN - Cita individual
// GET    /api/citas/[id]  - Detalle
// PUT    /api/citas/[id]  - Actualizar
// DELETE /api/citas/[id]  - Eliminar
// ============================================

export async function onRequestGet(context) {
  const { env, params } = context;
  try {
    const cita = await env.CITAS_DB.prepare('SELECT * FROM Citas WHERE id = ?').bind(params.id).first();
    if (!cita) {
      return new Response(JSON.stringify({ success: false, error: 'Cita no encontrada' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ success: true, cita }), {
      headers: { 'Content-Type': 'application/json' }
    });
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
      'fecha_cita', 'hora_cita', 'servicio', 'estado', 'estado_aprobacion',
      'nombre_cliente', 'telefono', 'email',
      'patente', 'marca', 'modelo', 'anio', 'color',
      'tipo_atencion', 'direccion', 'referencia_direccion',
      'observaciones', 'duracion_minutos', 'motivo_rechazo'
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

    campos.push("updated_at = datetime('now', '-3 hours')");
    valores.push(params.id);

    await env.CITAS_DB.prepare(
      `UPDATE Citas SET ${campos.join(', ')} WHERE id = ?`
    ).bind(...valores).run();

    const actualizada = await env.CITAS_DB.prepare('SELECT * FROM Citas WHERE id = ?').bind(params.id).first();

    return new Response(JSON.stringify({ success: true, cita: actualizada }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  try {
    await env.CITAS_DB.prepare('DELETE FROM Citas WHERE id = ?').bind(params.id).run();
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
