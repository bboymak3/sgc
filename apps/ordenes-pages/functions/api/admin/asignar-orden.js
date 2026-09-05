// ============================================
// API: ASIGNAR / REASIGNAR ORDEN A TÉCNICO
// SGC
// Soporta:
//   - Asignación nueva (orden sin técnico)
//   - Reasignación (quitarle la OT a un técnico y dársela a otro)
// ============================================

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    if (!data.orden_id || !data.tecnico_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos: orden_id y tecnico_id'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Verificar que la orden existe
    const orden = await env.DB.prepare(
      'SELECT id, numero_orden, estado, estado_trabajo, tecnico_asignado_id, patente_placa FROM OrdenesTrabajo WHERE id = ?'
    ).bind(data.orden_id).first();

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // No asignar si la orden está completada o cerrada
    const estadosBloqueados = ['Completada', 'Cerrada'];
    if (estadosBloqueados.includes(orden.estado_trabajo)) {
      return new Response(JSON.stringify({
        success: false,
        error: `No se puede reasignar: la orden ya está ${orden.estado_trabajo}`
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    if (orden.estado === 'Cancelada') {
      return new Response(JSON.stringify({
        success: false,
        error: 'No se puede reasignar: la orden está cancelada'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Verificar que el técnico existe y está activo
    const tecnico = await env.DB.prepare(
      'SELECT id, nombre FROM Tecnicos WHERE id = ? AND activo = 1'
    ).bind(data.tecnico_id).first();

    if (!tecnico) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Técnico no encontrado o no está activo'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    const esReasignacion = orden.tecnico_asignado_id !== null && orden.tecnico_asignado_id !== undefined;
    const mismoTecnico = orden.tecnico_asignado_id === data.tecnico_id;

    if (mismoTecnico) {
      return new Response(JSON.stringify({
        success: false,
        error: 'La orden ya está asignada a este técnico'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Obtener nombre del técnico anterior (para log/notificación)
    let tecnicoAnterior = null;
    if (esReasignacion && orden.tecnico_asignado_id) {
      const t = await env.DB.prepare(
        'SELECT nombre FROM Tecnicos WHERE id = ?'
      ).bind(orden.tecnico_asignado_id).first();
      tecnicoAnterior = t ? t.nombre : 'Desconocido';
    }

    // Asignar o reasignar la orden al nuevo técnico
    // Si es reasignación, el estado_trabajo vuelve a 'Pendiente Visita'
    await env.DB.prepare(`
      UPDATE OrdenesTrabajo
      SET tecnico_asignado_id = ?,
          estado_trabajo = 'Pendiente Visita'
      WHERE id = ?
    `).bind(data.tecnico_id, data.orden_id).run();

    // Si es reasignación, también actualizar los eventos del calendario
    if (esReasignacion) {
      try {
        await env.DB.prepare(
          'UPDATE AgendaTecnicos SET tecnico_id = ? WHERE orden_id = ?'
        ).bind(data.tecnico_id, data.orden_id).run();
      } catch (e) { /* no hay eventos de agenda */ }
    }

    const mensaje = esReasignacion
      ? `Orden reasignada: de ${tecnicoAnterior} a ${tecnico.nombre}`
      : `Orden asignada al técnico ${tecnico.nombre}`;

    return new Response(JSON.stringify({
      success: true,
      mensaje: mensaje,
      reasignacion: esReasignacion,
      tecnico_anterior: tecnicoAnterior,
      tecnico_nuevo: tecnico.nombre
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al asignar/reasignar orden:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
