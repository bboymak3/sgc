// ============================================
// SGC ADMIN - Crear evento en agenda
// POST /api/calendario
// body: { tecnico_id, orden_id, titulo, tipo_servicio, fecha_inicio, fecha_fin, observaciones, color }
// PUT /api/calendario/[id]   - Actualizar evento (mover/editar)
// DELETE /api/calendario/[id] - Eliminar evento
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const data = await request.json();

    if (!data.tecnico_id) {
      return new Response(JSON.stringify({ success: false, error: 'Selecciona un técnico' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (!data.titulo) {
      return new Response(JSON.stringify({ success: false, error: 'Ingresa un título' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (!data.fecha_inicio || !data.fecha_fin) {
      return new Response(JSON.stringify({ success: false, error: 'Fechas de inicio y fin requeridas' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const colores = {
      'taller': '#0d6efd',
      'domicilio': '#ff6b00',
      'inspeccion': '#28a745',
      'urgencia': '#dc3545',
      'otro': '#6c757d'
    };
    const color = data.color || colores[data.tipo_servicio] || colores.taller;

    const result = await env.ORDENES_DB.prepare(
      `INSERT INTO AgendaTecnicos (
        tecnico_id, orden_id, titulo, tipo_servicio,
        fecha_inicio, fecha_fin, color, observaciones, estado, creado_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', 'sgc-admin')`
    ).bind(
      data.tecnico_id,
      data.orden_id || null,
      data.titulo,
      data.tipo_servicio || 'taller',
      data.fecha_inicio,
      data.fecha_fin,
      color,
      data.observaciones || null
    ).run();

    const nuevoId = result.meta?.last_row_id;
    const nuevo = await env.ORDENES_DB.prepare(
      'SELECT * FROM AgendaTecnicos WHERE id = ?'
    ).bind(nuevoId).first();

    // Si tiene orden_id, actualizar fecha_programada en la OT
    if (data.orden_id && data.fecha_inicio) {
      const fechaSolo = data.fecha_inicio.split('T')[0];
      const horaSolo = data.fecha_inicio.includes('T') ? data.fecha_inicio.split('T')[1]?.substring(0, 5) : null;
      try {
        await env.ORDENES_DB.prepare(
          "UPDATE OrdenesTrabajo SET fecha_programada = ?, hora_programada = ? WHERE id = ?"
        ).bind(fechaSolo, horaSolo, data.orden_id).run();
      } catch (e) {}
    }

    return new Response(JSON.stringify({
      success: true,
      evento: nuevo
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
    if (!params.id) {
      return new Response(JSON.stringify({ success: false, error: 'ID requerido' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const campos = [];
    const valores = [];

    const allowed = ['titulo', 'tipo_servicio', 'fecha_inicio', 'fecha_fin',
                     'color', 'observaciones', 'estado', 'tecnico_id'];
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
      `UPDATE AgendaTecnicos SET ${campos.join(', ')} WHERE id = ?`
    ).bind(...valores).run();

    return new Response(JSON.stringify({ success: true }), {
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
    await env.ORDENES_DB.prepare('DELETE FROM AgendaTecnicos WHERE id = ?').bind(params.id).run();
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
