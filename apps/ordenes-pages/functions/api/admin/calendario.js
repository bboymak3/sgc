// ============================================
// API: CALENDARIO DE AGENDAMIENTO POR TECNICO
// SGC
// GET: Lista eventos (con filtros por tecnico, fecha, tipo)
// POST: Crea nuevo evento en agenda
// PUT: Actualiza evento (mover, editar)
// DELETE: Elimina evento
// ============================================

import { asegurarColumnasFaltantes } from '../../lib/db-helpers.js';

// ==========================================
// GET - Obtener eventos del calendario
// ==========================================
export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const url = new URL(request.url);
    const tecnicoId = url.searchParams.get('tecnico_id') || '';
    const fechaInicio = url.searchParams.get('inicio') || '';
    const fechaFin = url.searchParams.get('fin') || '';
    const tipoServicio = url.searchParams.get('tipo') || '';
    const incluirOrdenes = url.searchParams.get('ordenes') === '1';

    let condiciones = [];
    let params = [];

    if (tecnicoId) {
      condiciones.push('a.tecnico_id = ?');
      params.push(tecnicoId);
    }
    if (fechaInicio) {
      condiciones.push('a.fecha_inicio >= ?');
      params.push(fechaInicio);
    }
    if (fechaFin) {
      condiciones.push('a.fecha_fin <= ?');
      params.push(fechaFin);
    }
    if (tipoServicio) {
      condiciones.push('a.tipo_servicio = ?');
      params.push(tipoServicio);
    }

    const whereClause = condiciones.length > 0 ? 'WHERE ' + condiciones.join(' AND ') : '';

    // Obtener eventos de agenda (mostrar TODOS los estados)
    const agendaQuery = `
      SELECT
        a.id, a.tecnico_id, a.orden_id, a.titulo, a.tipo_servicio,
        a.fecha_inicio, a.fecha_fin, a.color, a.observaciones, a.estado,
        a.creado_por, a.fecha_creacion,
        t.nombre as tecnico_nombre,
        o.numero_orden, o.patente_placa, o.estado_trabajo, o.estado,
        COALESCE(NULLIF(o.marca,''), v.marca) as marca,
        COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo,
        COALESCE(NULLIF(o.color,''), v.color) as color_vehiculo,
        COALESCE(o.cliente_nombre, c.nombre) as cliente_nombre
      FROM AgendaTecnicos a
      LEFT JOIN Tecnicos t ON a.tecnico_id = t.id
      LEFT JOIN OrdenesTrabajo o ON a.orden_id = o.id
      LEFT JOIN Clientes c ON o.cliente_id = c.id
      LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
      ${whereClause}
      ORDER BY a.fecha_inicio ASC
    `;

    const { results: eventos } = await env.DB.prepare(agendaQuery).bind(...params).all();

    // Tambien obtener OT con fecha_programada para mostrar en calendario (TODAS las OTs)
    let ordenesProgramadas = [];
    if (incluirOrdenes) {
      let ordConds = ["o.fecha_programada IS NOT NULL"];
      // Mostrar TODAS las OTs programadas, sin excluir por estado
      let ordParams = [];
      if (tecnicoId) {
        ordConds.push("o.tecnico_asignado_id = ?");
        ordParams.push(tecnicoId);
      }
      if (fechaInicio) {
        ordConds.push("o.fecha_programada >= ?");
        ordParams.push(fechaInicio);
      }
      if (fechaFin) {
        ordConds.push("o.fecha_programada <= ?");
        ordParams.push(fechaFin);
      }

      const ordQuery = `
        SELECT
          o.id, o.numero_orden, o.patente_placa, o.estado_trabajo,
          o.fecha_programada, o.hora_programada, o.direccion,
          o.es_express, o.diagnostico_observaciones,
          o.tecnico_asignado_id,
          t.nombre as tecnico_nombre,
          c.nombre as cliente_nombre,
          COALESCE(NULLIF(o.marca,''), v.marca) as marca,
          COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo,
          COALESCE(NULLIF(o.color,''), v.color) as color_vehiculo
        FROM OrdenesTrabajo o
        LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
        LEFT JOIN Clientes c ON o.cliente_id = c.id
        LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
        WHERE ${ordConds.join(' AND ')}
        ORDER BY o.fecha_programada ASC
      `;
      const ordResult = await env.DB.prepare(ordQuery).bind(...ordParams).all();
      ordenesProgramadas = ordResult.results || [];
    }

    // Lista de tecnicos para el filtro
    const { results: tecnicos } = await env.DB.prepare(
      'SELECT id, nombre FROM Tecnicos WHERE activo = 1 ORDER BY nombre'
    ).all();

    return new Response(JSON.stringify({
      success: true,
      eventos: eventos || [],
      ordenes_programadas: ordenesProgramadas,
      tecnicos: tecnicos || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener agenda:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// ==========================================
// POST - Crear nuevo evento en agenda
// Usa DB.prepare().bind().run() en vez de DB.exec()
// DB.exec() corta SQL multilinea causando "incomplete input"
// ==========================================
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const data = await request.json();

    // Validaciones
    if (!data.tecnico_id) {
      return new Response(JSON.stringify({ success: false, error: 'Selecciona un tecnico' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }
    if (!data.titulo) {
      return new Response(JSON.stringify({ success: false, error: 'Ingresa un titulo para el evento' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }
    if (!data.fecha_inicio) {
      return new Response(JSON.stringify({ success: false, error: 'Selecciona fecha de inicio' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }
    if (!data.fecha_fin) {
      return new Response(JSON.stringify({ success: false, error: 'Selecciona fecha de fin' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    // Colores por tipo de servicio
    const colores = {
      'taller': '#0d6efd',
      'domicilio': '#ff6b00',
      'inspeccion': '#28a745',
      'urgencia': '#dc3545',
      'otro': '#6c757d'
    };
    const color = data.color || colores[data.tipo_servicio] || colores.taller;

    // Usar prepare().bind().run() - seguro contra SQL injection y multilinea
    const resultado = await env.DB.prepare(
      `INSERT INTO AgendaTecnicos (tecnico_id, orden_id, titulo, tipo_servicio, fecha_inicio, fecha_fin, color, observaciones, estado, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      data.tecnico_id,
      data.orden_id || null,
      data.titulo,
      data.tipo_servicio || 'taller',
      data.fecha_inicio,
      data.fecha_fin,
      color,
      data.observaciones || null,
      data.estado || 'pendiente',
      data.creado_por || 'admin'
    ).run();

    const nuevoId = resultado.meta?.last_row_id;

    // Obtener el evento recien creado
    const nuevo = await env.DB.prepare(
      'SELECT * FROM AgendaTecnicos WHERE id = ?'
    ).bind(nuevoId).first();

    // Si tiene orden_id, actualizar fecha_programada en la OT
    if (data.orden_id && data.fecha_inicio) {
      const fechaSolo = data.fecha_inicio.split('T')[0];
      const horaSolo = data.fecha_inicio.includes('T') ? data.fecha_inicio.split('T')[1]?.substring(0, 5) : null;
      try {
        await env.DB.prepare(
          "UPDATE OrdenesTrabajo SET fecha_programada = ?, hora_programada = ? WHERE id = ?"
        ).bind(fechaSolo, horaSolo, data.orden_id).run();
      } catch (e) { /* columna puede no existir */ }
    }

    // Si se asigno una OT, tambien asignar el tecnico a la OT
    if (data.orden_id && data.tecnico_id) {
      try {
        await env.DB.prepare(
          "UPDATE OrdenesTrabajo SET tecnico_asignado_id = ? WHERE id = ? AND (tecnico_asignado_id IS NULL OR tecnico_asignado_id = 0)"
        ).bind(data.tecnico_id, data.orden_id).run();
      } catch (e) {}
    }

    return new Response(JSON.stringify({
      success: true,
      evento: nuevo
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al crear evento:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// ==========================================
// PUT - Actualizar evento (mover, editar)
// Usa DB.prepare().bind().run() para evitar "incomplete input"
// Construye UPDATE dinamico con parametros bind
// ==========================================
export async function onRequestPut(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const data = await request.json();

    if (!data.id) {
      return new Response(JSON.stringify({ success: false, error: 'ID del evento requerido' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    // Construir SET dinamico con parametros (?) para bind
    const campos = [];
    const valores = [];

    if (data.titulo !== undefined) { campos.push('titulo = ?'); valores.push(data.titulo); }
    if (data.tipo_servicio !== undefined) { campos.push('tipo_servicio = ?'); valores.push(data.tipo_servicio); }
    if (data.fecha_inicio !== undefined) { campos.push('fecha_inicio = ?'); valores.push(data.fecha_inicio); }
    if (data.fecha_fin !== undefined) { campos.push('fecha_fin = ?'); valores.push(data.fecha_fin); }
    if (data.color !== undefined) { campos.push('color = ?'); valores.push(data.color); }
    if (data.observaciones !== undefined) { campos.push('observaciones = ?'); valores.push(data.observaciones || null); }
    if (data.estado !== undefined) { campos.push('estado = ?'); valores.push(data.estado); }
    if (data.tecnico_id !== undefined) { campos.push('tecnico_id = ?'); valores.push(data.tecnico_id); }

    if (campos.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No hay campos para actualizar' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    // Agregar el id al final para el WHERE
    valores.push(data.id);

    await env.DB.prepare(
      `UPDATE AgendaTecnicos SET ${campos.join(', ')} WHERE id = ?`
    ).bind(...valores).run();

    // Si se movio de fecha y tiene orden asociada, actualizar OT
    if (data.fecha_inicio) {
      const evento = await env.DB.prepare('SELECT orden_id FROM AgendaTecnicos WHERE id = ?').bind(data.id).first();
      if (evento && evento.orden_id) {
        const fechaSolo = data.fecha_inicio.split('T')[0];
        const horaSolo = data.fecha_inicio.includes('T') ? data.fecha_inicio.split('T')[1]?.substring(0, 5) : null;
        try {
          await env.DB.prepare(
            "UPDATE OrdenesTrabajo SET fecha_programada = ?, hora_programada = ? WHERE id = ?"
          ).bind(fechaSolo, horaSolo, evento.orden_id).run();
        } catch (e) {}
      }
    }

    // Si es actualización de OT directa (sin agenda, tipo 'orden'), actualizar fecha_programada
    if (data.tipo === 'orden' && data.orden_id && data.fecha_inicio) {
      const fechaSolo = data.fecha_inicio.split('T')[0];
      const horaSolo = data.fecha_inicio.includes('T') ? data.fecha_inicio.split('T')[1]?.substring(0, 5) : null;
      try {
        await env.DB.prepare(
          "UPDATE OrdenesTrabajo SET fecha_programada = ?, hora_programada = ? WHERE id = ?"
        ).bind(fechaSolo, horaSolo, data.orden_id).run();
      } catch (e) {}
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al actualizar evento:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// ==========================================
// DELETE - Eliminar evento (eliminación lógica de la OT)
// Elimina el evento de agenda y libera la OT asociada:
// - Limpia fecha_programada y hora_programada
// - Des-asigna el técnico (tecnico_asignado_id = NULL)
// - Cambia estado a PENDIENTE_ASIGNACION para que la OT quede libre
// ==========================================
export async function onRequestDelete(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return new Response(JSON.stringify({ success: false, error: 'ID del evento requerido' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    // Antes de eliminar, obtener la OT asociada
    const evento = await env.DB.prepare('SELECT orden_id FROM AgendaTecnicos WHERE id = ?').bind(id).first();

    // Eliminar el evento de agenda
    await env.DB.prepare('DELETE FROM AgendaTecnicos WHERE id = ?').bind(id).run();

    // Si tenia OT asociada, liberarla completamente para reasignación
    if (evento && evento.orden_id) {
      try {
        await env.DB.prepare(
          "UPDATE OrdenesTrabajo SET fecha_programada = NULL, hora_programada = NULL, tecnico_asignado_id = NULL, estado = 'PENDIENTE_ASIGNACION' WHERE id = ?"
        ).bind(evento.orden_id).run();
      } catch (e) {
        // Fallback si alguna columna no existe - intentar sin estado
        try {
          await env.DB.prepare(
            "UPDATE OrdenesTrabajo SET fecha_programada = NULL, hora_programada = NULL, tecnico_asignado_id = NULL WHERE id = ?"
          ).bind(evento.orden_id).run();
        } catch (e2) {}
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al eliminar evento:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
