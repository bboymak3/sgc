// ============================================
// SGC ADMIN - Citas CRUD
// ============================================

async function loadCitas() {
  try {
    const resp = await apiFetch('/api/citas?limit=200');
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);

    document.getElementById('view-citas').innerHTML = `
      <div class="section-card-header mb-3">
        <h2><i class="fas fa-calendar"></i> Citas</h2>
        <button class="btn btn-primary" onclick="showCrearCitaModal()">
          <i class="fas fa-plus"></i> Nueva Cita
        </button>
      </div>

      <div class="mb-3">
        <div class="row g-2">
          <div class="col-md-4">
            <input type="text" id="citas-search" class="form-control" placeholder="Buscar nombre, teléfono o patente..." oninput="filtrarCitas()">
          </div>
          <div class="col-md-3">
            <select id="citas-filter-estado" class="form-select" onchange="filtrarCitas()">
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente aprobación</option>
              <option value="aprobada">Aprobada</option>
              <option value="rechazada">Rechazada</option>
            </select>
          </div>
        </div>
      </div>

      <div class="section-card">
        <div class="table-responsive">
          <table class="table table-hover" id="citas-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Vehículo</th>
                <th>Servicio</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Canal</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="citas-tbody">
              ${data.citas.map(c => renderCitaRow(c)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Guardar para filtro
    window._citas = data.citas;

  } catch (err) {
    document.getElementById('view-citas').innerHTML = `
      <div class="alert alert-danger"><i class="fas fa-exclamation-triangle"></i> ${err.message}</div>
    `;
  }
}

function renderCitaRow(c) {
  const vehiculo = [c.marca, c.modelo, c.anio].filter(Boolean).join(' ') || '—';
  const patente = c.patente ? `<span class="badge bg-secondary">${c.patente}</span>` : '';
  const estadoBadge = `<span class="badge badge-${c.estado_aprobacion || 'pendiente'}">${c.estado_aprobacion || 'pendiente'}</span>`;
  const tipoIcon = c.tipo_atencion === 'domicilio' ? '🏠 Dom.' : '🔧 Taller';
  const canalIcon = c.canal === 'chat' ? '🤖' : '👤';

  let acciones = '';
  if (c.estado_aprobacion === 'pendiente') {
    acciones = `
      <button class="btn btn-success btn-sm btn-accion" onclick="aprobarCita(${c.id})">
        <i class="fas fa-check"></i>
      </button>
      <button class="btn btn-danger btn-sm btn-accion" onclick="rechazarCita(${c.id})">
        <i class="fas fa-times"></i>
      </button>
    `;
  }
  acciones += `
    <button class="btn btn-info btn-sm btn-accion" onclick="verCita(${c.id})">
      <i class="fas fa-eye"></i>
    </button>
  `;

  return `
    <tr>
      <td>#${c.id}</td>
      <td>${c.fecha_cita}<br><small class="text-muted">${c.hora_cita}</small></td>
      <td>${c.nombre_cliente || '—'}<br><small class="text-muted">${c.telefono || ''}</small></td>
      <td>${vehiculo} ${patente}</td>
      <td>${c.servicio || '—'}</td>
      <td>${tipoIcon}</td>
      <td>${estadoBadge}</td>
      <td>${canalIcon} ${c.canal}</td>
      <td>${acciones}</td>
    </tr>
  `;
}

function filtrarCitas() {
  const q = (document.getElementById('citas-search')?.value || '').toLowerCase();
  const estado = document.getElementById('citas-filter-estado')?.value || '';
  const filtradas = (window._citas || []).filter(c => {
    if (estado && c.estado_aprobacion !== estado) return false;
    if (q) {
      const txt = `${c.nombre_cliente || ''} ${c.telefono || ''} ${c.patente || ''}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  });
  document.getElementById('citas-tbody').innerHTML = filtradas.map(c => renderCitaRow(c)).join('') ||
    '<tr><td colspan="9" class="text-center text-muted py-4">No se encontraron citas</td></tr>';
}

function showCrearCitaModal() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('sgc-modal-title').textContent = 'Nueva Cita';
  document.getElementById('sgc-modal-body').innerHTML = `
    <form id="form-crear-cita">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label">Fecha *</label>
          <input type="date" id="cita-fecha" class="form-control" value="${today}" required>
        </div>
        <div class="col-md-6">
          <label class="form-label">Hora *</label>
          <input type="time" id="cita-hora" class="form-control" value="09:00" required>
        </div>
        <div class="col-md-12">
          <label class="form-label">Servicio *</label>
          <select id="cita-servicio" class="form-select" required>
            <option value="">Seleccionar...</option>
            <option>Diagnóstico y Scanner en Terreno</option>
            <option>Mantención Preventiva y Cambio de Aceite</option>
            <option>Reparación de Tren Delantero y Frenos</option>
            <option>Baterías, Sistema Eléctrico y Auxilio Mecánico</option>
            <option>Aire Acondicionado Automotriz</option>
            <option>Inspección para Revisión Técnica</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label">Nombre cliente</label>
          <input type="text" id="cita-nombre" class="form-control">
        </div>
        <div class="col-md-6">
          <label class="form-label">Teléfono</label>
          <input type="tel" id="cita-telefono" class="form-control">
        </div>
        <div class="col-md-4">
          <label class="form-label">Patente</label>
          <input type="text" id="cita-patente" class="form-control" maxlength="8">
        </div>
        <div class="col-md-4">
          <label class="form-label">Marca</label>
          <input type="text" id="cita-marca" class="form-control">
        </div>
        <div class="col-md-4">
          <label class="form-label">Modelo</label>
          <input type="text" id="cita-modelo" class="form-control">
        </div>
        <div class="col-md-6">
          <label class="form-label">Tipo de atención</label>
          <select id="cita-tipo" class="form-select">
            <option value="taller">🔧 Taller</option>
            <option value="domicilio">🏠 Domicilio</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label">Dirección (si domicilio)</label>
          <input type="text" id="cita-direccion" class="form-control">
        </div>
        <div class="col-md-12">
          <label class="form-label">Observaciones</label>
          <textarea id="cita-obs" class="form-control" rows="2"></textarea>
        </div>
      </div>
    </form>
  `;
  document.getElementById('sgc-modal-footer').innerHTML = `
    <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
    <button class="btn btn-primary" onclick="crearCita()">
      <i class="fas fa-save"></i> Guardar
    </button>
  `;
  new bootstrap.Modal(document.getElementById('sgc-modal')).show();
}

async function crearCita() {
  const body = {
    fecha_cita: document.getElementById('cita-fecha').value,
    hora_cita: document.getElementById('cita-hora').value,
    servicio: document.getElementById('cita-servicio').value,
    nombre_cliente: document.getElementById('cita-nombre').value,
    telefono: document.getElementById('cita-telefono').value,
    patente: document.getElementById('cita-patente').value,
    marca: document.getElementById('cita-marca').value,
    modelo: document.getElementById('cita-modelo').value,
    tipo_atencion: document.getElementById('cita-tipo').value,
    direccion: document.getElementById('cita-direccion').value,
    observaciones: document.getElementById('cita-obs').value
  };

  if (!body.fecha_cita || !body.hora_cita || !body.servicio) {
    showToast('Completa fecha, hora y servicio', 'error');
    return;
  }

  try {
    const resp = await apiFetch('/api/citas', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    bootstrap.Modal.getInstance(document.getElementById('sgc-modal')).hide();
    showToast('Cita creada correctamente');
    loadCitas();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function aprobarCita(id) {
  // Preguntar técnico asignado
  try {
    const tecResp = await apiFetch('/api/tecnicos');
    const tecData = await tecResp.json();
    const tecnicos = tecData.tecnicos || [];

    document.getElementById('sgc-modal-title').textContent = `Aprobar cita #${id}`;
    document.getElementById('sgc-modal-body').innerHTML = `
      <div class="mb-3">
        <label class="form-label">Asignar a técnico</label>
        <select id="aprobar-tecnico" class="form-select">
          <option value="">Sin asignar (se asignará luego)</option>
          ${tecnicos.map(t => `<option value="${t.id}">${t.nombre} ${t.apellido || ''} - ${t.ot_activas} OT activas</option>`).join('')}
        </select>
      </div>
      <p class="text-muted">Se creará una OT Express en sgc-ordenes y se agendará en el calendario.</p>
    `;
    document.getElementById('sgc-modal-footer').innerHTML = `
      <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
      <button class="btn btn-success" onclick="confirmarAprobacion(${id})">
        <i class="fas fa-check"></i> Aprobar y crear OT
      </button>
    `;
    new bootstrap.Modal(document.getElementById('sgc-modal')).show();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmarAprobacion(id) {
  const tecnicoId = document.getElementById('aprobar-tecnico').value;
  try {
    const resp = await apiFetch(`/api/citas/${id}/aprobar`, {
      method: 'POST',
      body: JSON.stringify({ tecnico_id: tecnicoId || null })
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    bootstrap.Modal.getInstance(document.getElementById('sgc-modal')).hide();
    showToast(`Cita aprobada. OT #${String(data.numero_orden).padStart(6,'0')} creada.`);
    loadCitas();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function rechazarCita(id) {
  document.getElementById('sgc-modal-title').textContent = `Rechazar cita #${id}`;
  document.getElementById('sgc-modal-body').innerHTML = `
    <div class="mb-3">
      <label class="form-label">Motivo del rechazo</label>
      <textarea id="rechazar-motivo" class="form-control" rows="3" placeholder="Ej: Horario no disponible, no se ofrece ese servicio, etc."></textarea>
    </div>
  `;
  document.getElementById('sgc-modal-footer').innerHTML = `
    <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
    <button class="btn btn-danger" onclick="confirmarRechazo(${id})">
      <i class="fas fa-times"></i> Rechazar
    </button>
  `;
  new bootstrap.Modal(document.getElementById('sgc-modal')).show();
}

async function confirmarRechazo(id) {
  const motivo = document.getElementById('rechazar-motivo').value;
  try {
    const resp = await apiFetch(`/api/citas/${id}/rechazar`, {
      method: 'POST',
      body: JSON.stringify({ motivo })
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    bootstrap.Modal.getInstance(document.getElementById('sgc-modal')).hide();
    showToast('Cita rechazada');
    loadCitas();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function verCita(id) {
  try {
    const resp = await apiFetch(`/api/citas/${id}`);
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    const c = data.cita;

    document.getElementById('sgc-modal-title').textContent = `Cita #${c.id}`;
    document.getElementById('sgc-modal-body').innerHTML = `
      <table class="table table-sm">
        <tr><th>Fecha</th><td>${c.fecha_cita} ${c.hora_cita}</td></tr>
        <tr><th>Cliente</th><td>${c.nombre_cliente || '—'}<br>${c.telefono || ''}<br>${c.email || ''}</td></tr>
        <tr><th>Vehículo</th><td>${[c.marca, c.modelo, c.anio].filter(Boolean).join(' ')} ${c.patente ? `<span class="badge bg-secondary">${c.patente}</span>` : ''}</td></tr>
        <tr><th>Servicio</th><td>${c.servicio || '—'}</td></tr>
        <tr><th>Tipo atención</th><td>${c.tipo_atencion === 'domicilio' ? '🏠 Domicilio' : '🔧 Taller'}</td></tr>
        ${c.direccion ? `<tr><th>Dirección</th><td>${c.direccion}${c.referencia_direccion ? '<br><small>'+c.referencia_direccion+'</small>' : ''}</td></tr>` : ''}
        <tr><th>Estado</th><td><span class="badge badge-${c.estado_aprobacion}">${c.estado_aprobacion}</span></td></tr>
        <tr><th>Canal</th><td>${c.canal}</td></tr>
        <tr><th>Creada</th><td>${c.created_at}</td></tr>
        ${c.observaciones ? `<tr><th>Observaciones</th><td>${c.observaciones}</td></tr>` : ''}
        ${c.numero_orden_sgc ? `<tr><th>OT creada</th><td><span class="badge bg-success">#${String(c.numero_orden_sgc).padStart(6,'0')}</span></td></tr>` : ''}
        ${c.motivo_rechazo ? `<tr><th>Motivo rechazo</th><td>${c.motivo_rechazo}</td></tr>` : ''}
      </table>
    `;
    document.getElementById('sgc-modal-footer').innerHTML = `
      <button class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
    `;
    new bootstrap.Modal(document.getElementById('sgc-modal')).show();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
