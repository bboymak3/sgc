// ============================================
// SGC ADMIN - Calendario unificado
// GET /api/calendario?inicio=YYYY-MM-DD&fin=YYYY-MM-DD
// Devuelve eventos de AgendaTecnicos + Citas pendientes/aprobadas + OT programadas
// ============================================

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  try {
    const inicio = url.searchParams.get('inicio') || '';
    const fin = url.searchParams.get('fin') || '';
    const tecnicoId = url.searchParams.get('tecnico_id') || '';

    if (!inicio || !fin) {
      return new Response(JSON.stringify({ success: false, error: 'inicio y fin son requeridos' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const eventos = [];

    // ============================================
    // 1. Eventos de AgendaTecnicos (sgc_ordenes_db)
    // ============================================
    let agendaConds = [];
    let agendaParams = [];
    if (tecnicoId) {
      agendaConds.push('a.tecnico_id = ?');
      agendaParams.push(tecnicoId);
    }
    if (inicio) {
      agendaConds.push('a.fecha_inicio >= ?');
      agendaParams.push(inicio);
    }
    if (fin) {
      agendaConds.push('a.fecha_fin <= ?');
      agendaParams.push(fin + 'T23:59:59');
    }
    const agendaWhere = agendaConds.length ? 'WHERE ' + agendaConds.join(' AND ') : '';

    const agendaResult = await env.ORDENES_DB.prepare(
      `SELECT a.id, a.tecnico_id, a.orden_id, a.titulo, a.tipo_servicio,
              a.fecha_inicio, a.fecha_fin, a.color, a.observaciones, a.estado,
              a.creado_por, a.fecha_creacion,
              t.nombre as tecnico_nombre,
              o.numero_orden, o.patente_placa, o.estado_trabajo,
              COALESCE(o.cliente_nombre, c.nombre) as cliente_nombre,
              COALESCE(NULLIF(o.marca,''), v.marca) as marca,
              COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo
       FROM AgendaTecnicos a
       LEFT JOIN Tecnicos t ON a.tecnico_id = t.id
       LEFT JOIN OrdenesTrabajo o ON a.orden_id = o.id
       LEFT JOIN Clientes c ON o.cliente_id = c.id
       LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
       ${agendaWhere}
       ORDER BY a.fecha_inicio ASC`
    ).bind(...agendaParams).all();

    (agendaResult.results || []).forEach(ev => {
      eventos.push({
        id: 'agenda-' + ev.id,
        tipo: 'agenda',
        agendaId: ev.id,
        titulo: ev.titulo || '',
        start: ev.fecha_inicio,
        end: ev.fecha_fin,
        color: ev.color || '#0d6efd',
        tecnico_id: ev.tecnico_id,
        tecnico_nombre: ev.tecnico_nombre,
        orden_id: ev.orden_id,
        numero_orden: ev.numero_orden,
        tipo_servicio: ev.tipo_servicio,
        estado: ev.estado,
        patente: ev.patente_placa,
        marca: ev.marca,
        modelo: ev.modelo,
        cliente_nombre: ev.cliente_nombre,
        observaciones: ev.observaciones
      });
    });

    // ============================================
    // 2. OT con fecha_programada que NO están en AgendaTecnicos
    // ============================================
    const agendaOrdenIds = new Set((agendaResult.results || [])
      .filter(e => e.orden_id)
      .map(e => e.orden_id));

    let otConds = ['o.fecha_programada IS NOT NULL'];
    let otParams = [];
    if (tecnicoId) {
      otConds.push('o.tecnico_asignado_id = ?');
      otParams.push(tecnicoId);
    }
    if (inicio) {
      otConds.push('o.fecha_programada >= ?');
      otParams.push(inicio);
    }
    if (fin) {
      otConds.push('o.fecha_programada <= ?');
      otParams.push(fin);
    }

    const otResult = await env.ORDENES_DB.prepare(
      `SELECT o.id, o.numero_orden, o.patente_placa, o.estado_trabajo,
              o.fecha_programada, o.hora_programada, o.direccion,
              o.es_express, o.diagnostico_observaciones,
              o.tecnico_asignado_id,
              t.nombre as tecnico_nombre,
              COALESCE(o.cliente_nombre, c.nombre) as cliente_nombre,
              COALESCE(NULLIF(o.marca,''), v.marca) as marca,
              COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo
       FROM OrdenesTrabajo o
       LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
       LEFT JOIN Clientes c ON o.cliente_id = c.id
       LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
       WHERE ${otConds.join(' AND ')}
       ORDER BY o.fecha_programada ASC`
    ).bind(...otParams).all();

    (otResult.results || []).forEach(o => {
      if (agendaOrdenIds.has(o.id)) return;
      const hora = o.hora_programada || '09:00';
      const inicioISO = o.fecha_programada + 'T' + hora;
      const finDate = new Date(inicioISO);
      finDate.setHours(finDate.getHours() + 2);
      const finISO = finDate.toISOString();

      eventos.push({
        id: 'orden-' + o.id,
        tipo: 'orden',
        ordenId: o.id,
        titulo: (o.es_express ? '⚡ ' : '🔧 ') + 'OT#' + String(o.numero_orden || 0).padStart(6, '0'),
        start: inicioISO,
        end: finISO,
        color: o.es_express ? '#a80000' : '#0d6efd',
        tecnico_id: o.tecnico_asignado_id,
        tecnico_nombre: o.tecnico_nombre,
        patente: o.patente_placa,
        marca: o.marca,
        modelo: o.modelo,
        cliente_nombre: o.cliente_nombre,
        direccion: o.direccion,
        estado_trabajo: o.estado_trabajo,
        es_express: o.es_express === 1
      });
    });

    // ============================================
    // 3. Citas del chat IA (sgc_citas_db)
    // IMPORTANTE: No mostrar citas que ya tienen OT creada (orden_enviada=1)
    // porque ya están representadas en la sección de OT/AgendaTecnicos.
    // Solo mostrar citas pendientes (sin OT asociada).
    // ============================================
    let citasConds = ['fecha_cita >= ?', 'fecha_cita <= ?', 'orden_enviada = 0'];
    let citasParams = [inicio, fin];
    // No filtramos por estado_aprobacion para mostrar todas las pendientes

    const citasResult = await env.CITAS_DB.prepare(
      `SELECT id, fecha_cita, hora_cita, servicio, estado, estado_aprobacion,
              nombre_cliente, telefono, patente, marca, modelo, color,
              tipo_atencion, direccion, observaciones, canal,
              orden_enviada, numero_orden_sgc
       FROM Citas
       WHERE ${citasConds.join(' AND ')}
       ORDER BY fecha_cita ASC, hora_cita ASC`
    ).bind(...citasParams).all();

    (citasResult.results || []).forEach(c => {
      const hora = c.hora_cita || '09:00';
      const inicioISO = c.fecha_cita + 'T' + hora;
      const finDate = new Date(inicioISO);
      const durMin = 60;
      finDate.setMinutes(finDate.getMinutes() + durMin);
      const finISO = finDate.toISOString();

      const esChat = c.canal === 'chat';
      const tipoLabel = c.tipo_atencion === 'domicilio' ? '🏠 Dom.' : '🔧 Taller';
      const estadoAprob = c.estado_aprobacion || 'pendiente';
      const prefijo = esChat ? '📅' : '📋';
      const titulo = `${prefijo} ${tipoLabel}: ${c.servicio}${c.patente ? ' | ' + c.patente : ''}${c.nombre_cliente ? ' - ' + c.nombre_cliente : ''}`;

      // Color según estado de aprobación
      let color = '#16a34a'; // verde por defecto (pendiente)
      if (estadoAprob === 'aprobada') color = '#0d6efd'; // azul
      else if (estadoAprob === 'rechazada') color = '#dc3545'; // rojo

      eventos.push({
        id: 'cita-' + c.id,
        tipo: 'cita_ia',
        citaId: c.id,
        titulo,
        start: inicioISO,
        end: finISO,
        color,
        servicio: c.servicio,
        nombre_cliente: c.nombre_cliente,
        telefono: c.telefono,
        patente: c.patente,
        marca: c.marca,
        modelo: c.modelo,
        tipo_atencion: c.tipo_atencion,
        direccion: c.direccion,
        canal: c.canal,
        estado: c.estado,
        estado_aprobacion: estadoAprob,
        orden_enviada: c.orden_enviada,
        numero_orden_sgc: c.numero_orden_sgc
      });
    });

    // ============================================
    // Lista de técnicos (para filtro)
    // ============================================
    const tecnicosResult = await env.ORDENES_DB.prepare(
      'SELECT id, nombre, apellido FROM Tecnicos WHERE activo = 1 ORDER BY nombre'
    ).all();

    return new Response(JSON.stringify({
      success: true,
      eventos,
      total: eventos.length,
      tecnicos: tecnicosResult.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
