// ============================================
// SGC ADMIN - Calendario FullCalendar
// ============================================

let calendarInstance = null;

async function loadCalendario() {
  // Cargar técnicos en el filtro
  try {
    const resp = await apiFetch('/api/tecnicos');
    const data = await resp.json();
    const select = document.getElementById('cal-filtro-tecnico');
    if (select) {
      select.innerHTML = '<option value="">Todos los técnicos</option>';
      (data.tecnicos || []).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.nombre} ${t.apellido || ''}`;
        select.appendChild(opt);
      });
    }
  } catch (e) {
    console.error('Error cargando técnicos para filtro:', e);
  }

  // Inicializar calendario si no existe
  if (!calendarInstance) {
    const el = document.getElementById('fullcalendar');
    if (!el) return;

    // Detectar móvil para elegir vista inicial
    const isMobile = window.innerWidth < 768;
    const initialView = isMobile ? 'listWeek' : 'dayGridMonth';

    calendarInstance = new FullCalendar.Calendar(el, {
      locale: 'es',
      initialView,
      headerToolbar: isMobile
        ? { left: 'prev,next,today', center: 'title', right: 'dayGridDay,listWeek' }
        : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
      buttonText: {
        today: 'Hoy',
        month: 'Mes',
        week: 'Semana',
        day: 'Día',
        list: 'Lista'
      },
      height: 'auto',
      nowIndicator: true,
      editable: true,
      droppable: true,
      eventDurationEditable: true,
      slotMinTime: '07:00:00',
      slotMaxTime: '21:00:00',
      firstDay: 1,
      handleWindowResize: true,
      windowResizeDelay: 200,
      windowResize: function(view) {
        // Cambiar vista automáticamente al redimensionar
        const w = window.innerWidth;
        if (w < 768 && !['listWeek', 'dayGridDay', 'timeGridDay'].includes(view.type)) {
          calendarInstance.changeView('listWeek');
        } else if (w >= 768 && view.type === 'listWeek' && calendarInstance.currentData?.viewSpecs?.dayGridMonth) {
          // No forzar cambio en desktop si el usuario eligió Lista
        }
      },

      events: function(info, successCallback, failureCallback) {
        const inicio = info.startStr.split('T')[0];
        const fin = info.endStr.split('T')[0];
        const tecnicoId = document.getElementById('cal-filtro-tecnico')?.value || '';
        let url = `/api/calendario?inicio=${inicio}&fin=${fin}`;
        if (tecnicoId) url += `&tecnico_id=${tecnicoId}`;

        apiFetch(url)
          .then(r => r.json())
          .then(data => {
            if (!data.success) throw new Error(data.error);
            const eventos = (data.eventos || []).map(ev => ({
              id: ev.id,
              title: ev.titulo,
              start: ev.start,
              end: ev.end,
              color: ev.color,
              extendedProps: ev
            }));
            successCallback(eventos);
          })
          .catch(err => {
            console.error('Error cargando eventos:', err);
            failureCallback(err);
          });
      },

      // Click en evento = ver detalle
      eventClick: function(info) {
        info.jsEvent.preventDefault();
        // Cerrar/ocultar cualquier tooltip abierto antes de mostrar el modal
        // para evitar que el tooltip se quede solapado encima del modal
        document.querySelectorAll('.tooltip.show').forEach(t => t.remove());
        const bsTooltip = bootstrap.Tooltip.getInstance(info.el);
        if (bsTooltip) bsTooltip.hide();
        verDetalleEvento(info.event);
      },

      // Drag & drop = actualizar fechas
      eventDrop: function(info) {
        actualizarFechasEvento(info.event);
      },

      eventResize: function(info) {
        actualizarFechasEvento(info.event);
      },

      // Click en día vacío = crear evento
      dateClick: function(info) {
        showCrearEventoModal(info.dateStr);
      },

      // Tooltip al hover
      eventDidMount: function(info) {
        const p = info.event.extendedProps;
        let html = '<div style="font-size:0.82rem;line-height:1.4;">';
        html += '<strong>' + (info.event.title || '') + '</strong><br>';
        if (p.tipo === 'cita_ia') {
          html += '📅 Cita del chat IA<br>';
          html += '👤 ' + (p.nombre_cliente || '—') + '<br>';
          if (p.telefono) html += '📞 ' + p.telefono + '<br>';
          if (p.patente) html += '🏷️ ' + p.patente + '<br>';
          html += '🛠️ ' + (p.servicio || '—') + '<br>';
          html += '📋 Estado: ' + (p.estado_aprobacion || '—');
        } else if (p.tipo === 'orden') {
          html += '📋 OT#' + String(p.ordenId || 0).padStart(6, '0') + (p.es_express ? ' ⚡' : '') + '<br>';
          if (p.cliente_nombre) html += '👤 ' + p.cliente_nombre + '<br>';
          if (p.patente) html += '🏷️ ' + p.patente + '<br>';
          if (p.tecnico_nombre) html += '🔧 ' + p.tecnico_nombre + '<br>';
          html += '📋 Estado: ' + (p.estado_trabajo || '—');
        } else if (p.tipo === 'agenda') {
          if (p.tecnico_nombre) html += '🔧 ' + p.tecnico_nombre + '<br>';
          if (p.numero_orden) html += '📋 OT#' + String(p.numero_orden).padStart(6, '0') + '<br>';
          if (p.cliente_nombre) html += '👤 ' + p.cliente_nombre + '<br>';
          if (p.patente) html += '🏷️ ' + p.patente + '<br>';
          html += '📋 Estado: ' + (p.estado || '—');
        }
        html += '</div>';
        info.el.setAttribute('title', '');
        info.el.setAttribute('data-bs-toggle', 'tooltip');
        info.el.setAttribute('data-bs-html', 'true');
        info.el.setAttribute('data-bs-original-title', html);
        new bootstrap.Tooltip(info.el, { html: true, placement: 'top' });
      }
    });

    calendarInstance.render();
  } else {
    calendarInstance.refetchEvents();
  }
}

function recargarCalendario() {
  if (calendarInstance) {
    calendarInstance.refetchEvents();
  }
}

// === Ver detalle de evento en modal ===
async function verDetalleEvento(event) {
  const p = event.extendedProps;

  let bodyHtml = '<table class="table table-sm">';
  bodyHtml += '<tr><th>Tipo</th><td>';

  if (p.tipo === 'cita_ia') {
    bodyHtml += '📅 Cita del Chat IA';
  } else if (p.tipo === 'orden') {
    bodyHtml += '📋 Orden de Trabajo' + (p.es_express ? ' ⚡Express' : '');
  } else {
    bodyHtml += '🗓️ Evento de Agenda';
  }
  bodyHtml += '</td></tr>';

  bodyHtml += `<tr><th>Título</th><td>${event.title}</td></tr>`;
  bodyHtml += `<tr><th>Inicio</th><td>${formatFecha(p.start || event.start?.toISOString())}</td></tr>`;
  if (p.end || event.end) {
    bodyHtml += `<tr><th>Fin</th><td>${formatFecha(p.end || event.end?.toISOString())}</td></tr>`;
  }

  if (p.cliente_nombre) bodyHtml += `<tr><th>Cliente</th><td>${p.cliente_nombre}</td></tr>`;
  if (p.telefono) bodyHtml += `<tr><th>Teléfono</th><td>${p.telefono}</td></tr>`;
  if (p.patente) bodyHtml += `<tr><th>Patente</th><td><span class="badge bg-secondary">${p.patente}</span></td></tr>`;
  if (p.marca || p.modelo) bodyHtml += `<tr><th>Vehículo</th><td>${[p.marca, p.modelo].filter(Boolean).join(' ')}</td></tr>`;
  if (p.servicio) bodyHtml += `<tr><th>Servicio</th><td>${p.servicio}</td></tr>`;
  if (p.direccion) bodyHtml += `<tr><th>Dirección</th><td>${p.direccion}</td></tr>`;
  if (p.tecnico_nombre) bodyHtml += `<tr><th>Técnico</th><td>${p.tecnico_nombre}</td></tr>`;
  if (p.tipo_servicio) bodyHtml += `<tr><th>Tipo servicio</th><td>${p.tipo_servicio}</td></tr>`;
  if (p.estado) bodyHtml += `<tr><th>Estado</th><td>${p.estado}</td></tr>`;
  if (p.estado_aprobacion) bodyHtml += `<tr><th>Aprobación</th><td><span class="badge badge-${p.estado_aprobacion}">${p.estado_aprobacion}</span></td></tr>`;
  if (p.estado_trabajo) bodyHtml += `<tr><th>Estado trabajo</th><td>${p.estado_trabajo}</td></tr>`;
  if (p.observaciones) bodyHtml += `<tr><th>Observaciones</th><td>${p.observaciones}</td></tr>`;
  if (p.numero_orden || p.numero_orden_sgc) {
    bodyHtml += `<tr><th>OT #</th><td><span class="badge bg-success">#${String(p.numero_orden || p.numero_orden_sgc).padStart(6, '0')}</span></td></tr>`;
  }
  bodyHtml += '</table>';

  let footerHtml = '<button class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>';
  if (p.tipo === 'cita_ia' && p.estado_aprobacion === 'pendiente') {
    footerHtml += `<button class="btn btn-success" onclick="aprobarCita(${p.citaId}); bootstrap.Modal.getInstance(document.getElementById('sgc-modal')).hide();">
      <i class="fas fa-check"></i> Aprobar y crear OT
    </button>`;
    footerHtml += `<button class="btn btn-danger" onclick="rechazarCita(${p.citaId}); bootstrap.Modal.getInstance(document.getElementById('sgc-modal')).hide();">
      <i class="fas fa-times"></i> Rechazar
    </button>`;
  }
  if (p.tipo === 'agenda' && p.agendaId) {
    footerHtml += `<button class="btn btn-danger" onclick="eliminarEvento(${p.agendaId})">
      <i class="fas fa-trash"></i> Eliminar
    </button>`;
  }

  document.getElementById('sgc-modal-title').textContent = 'Detalle del evento';
  document.getElementById('sgc-modal-body').innerHTML = bodyHtml;
  document.getElementById('sgc-modal-footer').innerHTML = footerHtml;
  new bootstrap.Modal(document.getElementById('sgc-modal')).show();
}

function formatFecha(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('es-CL', {
      weekday: 'short', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  } catch { return isoStr; }
}

// === Actualizar fechas tras drag&drop ===
async function actualizarFechasEvento(event) {
  const p = event.extendedProps;
  if (p.tipo === 'cita_ia') {
    showToast('Las citas del chat IA no se pueden mover (edítalas desde Citas)', 'warning');
    calendarInstance.refetchEvents();
    return;
  }

  const id = p.tipo === 'agenda' ? p.agendaId : (p.tipo === 'orden' ? null : null);
  if (!id) {
    showToast('Solo se pueden mover eventos de agenda', 'warning');
    calendarInstance.refetchEvents();
    return;
  }

  try {
    const resp = await apiFetch(`/api/calendario/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        fecha_inicio: event.start?.toISOString(),
        fecha_fin: event.end?.toISOString()
      })
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    showToast('Evento actualizado');
  } catch (err) {
    showToast(err.message, 'error');
    calendarInstance.refetchEvents();
  }
}

async function eliminarEvento(id) {
  if (!confirm('¿Eliminar este evento de la agenda?')) return;
  try {
    const resp = await apiFetch(`/api/calendario/${id}`, { method: 'DELETE' });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    bootstrap.Modal.getInstance(document.getElementById('sgc-modal')).hide();
    showToast('Evento eliminado');
    calendarInstance.refetchEvents();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// === Crear evento nuevo ===
async function showCrearEventoModal(fechaStr) {
  // Cargar técnicos y órdenes disponibles
  let tecnicosOpts = '';
  try {
    const resp = await apiFetch('/api/tecnicos');
    const data = await resp.json();
    tecnicosOpts = (data.tecnicos || []).map(t =>
      `<option value="${t.id}">${t.nombre} ${t.apellido || ''}</option>`
    ).join('');
  } catch (e) {}

  const defaultFecha = fechaStr ? fechaStr.split('T')[0] : new Date().toISOString().split('T')[0];
  const defaultHora = fechaStr && fechaStr.includes('T') ? fechaStr.split('T')[1].substring(0,5) : '09:00';

  document.getElementById('sgc-modal-title').textContent = 'Nuevo evento en agenda';
  document.getElementById('sgc-modal-body').innerHTML = `
    <form id="form-crear-evento">
      <div class="row g-3">
        <div class="col-md-12">
          <label class="form-label">Técnico *</label>
          <select id="evt-tecnico" class="form-select" required>
            <option value="">Seleccionar...</option>
            ${tecnicosOpts}
          </select>
        </div>
        <div class="col-md-12">
          <label class="form-label">Título *</label>
          <input type="text" id="evt-titulo" class="form-control" placeholder="Ej: Mantención Toyota Corolla ABCD12" required>
        </div>
        <div class="col-md-6">
          <label class="form-label">Fecha y hora inicio *</label>
          <input type="datetime-local" id="evt-inicio" class="form-control"
                 value="${defaultFecha}T${defaultHora}" required>
        </div>
        <div class="col-md-6">
          <label class="form-label">Fecha y hora fin *</label>
          <input type="datetime-local" id="evt-fin" class="form-control"
                 value="${defaultFecha}T${(parseInt(defaultHora.substring(0,2))+2).toString().padStart(2,'0')}:00" required>
        </div>
        <div class="col-md-6">
          <label class="form-label">Tipo de servicio</label>
          <select id="evt-tipo" class="form-select">
            <option value="taller">🔧 Taller</option>
            <option value="domicilio">🏠 Domicilio</option>
            <option value="inspeccion">📋 Inspección</option>
            <option value="urgencia">⚡ Urgencia</option>
            <option value="otro">📝 Otro</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label">Color</label>
          <input type="color" id="evt-color" class="form-control form-control-color" value="#0d6efd">
        </div>
        <div class="col-md-12">
          <label class="form-label">Observaciones</label>
          <textarea id="evt-obs" class="form-control" rows="2"></textarea>
        </div>
      </div>
    </form>
  `;
  document.getElementById('sgc-modal-footer').innerHTML = `
    <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
    <button class="btn btn-primary" onclick="crearEventoAgenda()">
      <i class="fas fa-save"></i> Guardar evento
    </button>
  `;
  new bootstrap.Modal(document.getElementById('sgc-modal')).show();
}

async function crearEventoAgenda() {
  const body = {
    tecnico_id: document.getElementById('evt-tecnico').value,
    titulo: document.getElementById('evt-titulo').value,
    fecha_inicio: document.getElementById('evt-inicio').value,
    fecha_fin: document.getElementById('evt-fin').value,
    tipo_servicio: document.getElementById('evt-tipo').value,
    color: document.getElementById('evt-color').value,
    observaciones: document.getElementById('evt-obs').value
  };

  if (!body.tecnico_id || !body.titulo || !body.fecha_inicio || !body.fecha_fin) {
    showToast('Completa todos los campos obligatorios', 'error');
    return;
  }

  try {
    const resp = await apiFetch('/api/calendario', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    bootstrap.Modal.getInstance(document.getElementById('sgc-modal')).hide();
    showToast('Evento creado correctamente');
    calendarInstance.refetchEvents();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
