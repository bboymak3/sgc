// ============================================
// SGC ADMIN - Aprobar cita
// POST /api/citas/[id]/aprobar
// Marca la cita como aprobada y crea una OT Express en sgc-ordenes
// ============================================

export async function onRequestPost(context) {
  const { request, env, params } = context;

  try {
    const citaId = params.id;
    const body = await request.json().catch(() => ({}));
    const tecnicoId = body.tecnico_id || null;

    const cita = await env.CITAS_DB.prepare('SELECT * FROM Citas WHERE id = ?').bind(citaId).first();
    if (!cita) {
      return new Response(JSON.stringify({ success: false, error: 'Cita no encontrada' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (cita.estado_aprobacion === 'aprobada') {
      return new Response(JSON.stringify({ success: false, error: 'La cita ya está aprobada' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const prox = await env.ORDENES_DB.prepare(
      'SELECT COALESCE(MAX(numero_orden), 0) + 1 as next FROM OrdenesTrabajo'
    ).first();
    const nuevoNum = prox?.next || 1;

    const otResult = await env.ORDENES_DB.prepare(
      `INSERT INTO OrdenesTrabajo (
        numero_orden, patente_placa, marca, modelo, anio, color,
        cliente_nombre, cliente_telefono,
        fecha_ingreso, hora_ingreso,
        direccion, referencia_direccion,
        diagnostico_observaciones,
        servicios_seleccionados,
        fecha_programada, hora_programada,
        es_express, estado, estado_trabajo,
        recepcionista, tecnico_asignado_id,
        fecha_creacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, date('now', '-3 hours'), time('now', '-3 hours'), ?, ?, ?, ?, ?, ?, 1, 'Enviada', 'Pendiente', 'sgc-admin', ?, datetime('now', '-3 hours'))`
    ).bind(
      nuevoNum,
      cita.patente || null,
      cita.marca || null,
      cita.modelo || null,
      cita.anio || null,
      cita.color || null,
      cita.nombre_cliente || null,
      cita.telefono || null,
      cita.direccion || null,
      cita.referencia_direccion || null,
      cita.observaciones || null,
      cita.servicio || null,
      cita.fecha_cita || null,
      cita.hora_cita || null,
      tecnicoId
    ).run();

    const otId = otResult.meta?.last_row_id;

    await env.CITAS_DB.prepare(
      `UPDATE Citas
       SET estado_aprobacion = 'aprobada',
           estado = 'confirmada',
           orden_enviada = 1,
           numero_orden_sgc = ?,
           updated_at = datetime('now', '-3 hours')
       WHERE id = ?`
    ).bind(nuevoNum, citaId).run();

    if (tecnicoId && cita.fecha_cita) {
      const inicio = cita.fecha_cita + 'T' + (cita.hora_cita || '09:00');
      const finDate = new Date(inicio);
      const duracion = cita.duracion_minutos || 60;
      finDate.setMinutes(finDate.getMinutes() + duracion);

      await env.ORDENES_DB.prepare(
        `INSERT INTO AgendaTecnicos (
          tecnico_id, orden_id, titulo, tipo_servicio,
          fecha_inicio, fecha_fin, color, observaciones, estado,
          creado_por, fecha_creacion
        ) VALUES (?, ?, ?, 'domicilio', ?, ?, '#2563eb', ?, 'pendiente', 'sgc-admin', datetime('now', '-3 hours'))`
      ).bind(
        tecnicoId, otId,
        `OT#${String(nuevoNum).padStart(6, '0')} - ${cita.servicio} - ${cita.nombre_cliente || 'Cliente'}`,
        inicio, finDate.toISOString(),
        `Cita aprobada desde SGC Admin (cita #${citaId})`
      ).run();
    }

    return new Response(JSON.stringify({
      success: true,
      mensaje: 'Cita aprobada y orden de trabajo creada',
      orden_trabajo_id: otId,
      numero_orden: nuevoNum,
      cita_id: citaId
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
