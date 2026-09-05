// ============================================
// SGC ADMIN - Técnicos CRUD
// ============================================

async function loadTecnicos() {
  try {
    const resp = await apiFetch('/api/tecnicos');
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);

    window._tecnicos = data.tecnicos;

    document.getElementById('view-tecnicos').innerHTML = `
      <div class="section-card-header mb-3">
        <h2><i class="fas fa-user-cog"></i> Técnicos</h2>
        <button class="btn btn-primary" onclick="showCrearTecnicoModal()">
          <i class="fas fa-plus"></i> Nuevo Técnico
        </button>
      </div>

      <div class="section-card">
        <div class="table-responsive">
          <table class="table table-hover">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th class="d-none-mobile">Teléfono</th>
                <th class="d-none-mobile">Especialidad</th>
                <th class="d-none-mobile">Zona</th>
                <th class="d-none-mobile">Comisión</th>
                <th class="d-none-mobile">OT</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="tecnicos-tbody">
              ${data.tecnicos.map(renderTecnicoRow).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('view-tecnicos').innerHTML = `
      <div class="alert alert-danger"><i class="fas fa-exclamation-triangle"></i> ${err.message}</div>
    `;
  }
}

function renderTecnicoRow(t) {
  return `
    <tr>
      <td>#${t.id}</td>
      <td><strong>${t.nombre} ${t.apellido || ''}</strong><br><small class="text-muted d-mobile-only">${t.telefono || ''}</small></td>
      <td class="d-none-mobile">${t.telefono || '—'}</td>
      <td class="d-none-mobile">${t.especialidad || '—'}</td>
      <td class="d-none-mobile">${t.zona_cobertura || '—'}</td>
      <td class="d-none-mobile">${t.comision_porcentaje || 40}%</td>
      <td class="d-none-mobile">${t.ot_activas > 0 ? `<span class="badge bg-info">${t.ot_activas}</span>` : '<span class="text-muted">0</span>'}</td>
      <td>${t.activo ? '<span class="badge badge-aprobada">Activo</span>' : '<span class="badge badge-cancelada">Inactivo</span>'}</td>
      <td>
        <button class="btn btn-info btn-sm btn-accion" onclick="editarTecnico(${t.id})">
          <i class="fas fa-edit"></i>
        </button>
        ${t.activo ? `<button class="btn btn-danger btn-sm btn-accion" onclick="desactivarTecnico(${t.id})"><i class="fas fa-ban"></i></button>` : ''}
      </td>
    </tr>
  `;
}

function showCrearTecnicoModal() {
  document.getElementById('sgc-modal-title').textContent = 'Nuevo Técnico';
  document.getElementById('sgc-modal-body').innerHTML = `
    <form id="form-crear-tecnico">
      <div class="row g-3">
        <div class="col-md-8">
          <label class="form-label">Nombre *</label>
          <input type="text" id="tec-nombre" class="form-control" required>
        </div>
        <div class="col-md-4">
          <label class="form-label">Apellido</label>
          <input type="text" id="tec-apellido" class="form-control">
        </div>
        <div class="col-md-6">
          <label class="form-label">Teléfono</label>
          <input type="tel" id="tec-telefono" class="form-control">
        </div>
        <div class="col-md-6">
          <label class="form-label">Email</label>
          <input type="email" id="tec-email" class="form-control">
        </div>
        <div class="col-md-6">
          <label class="form-label">Especialidad</label>
          <input type="text" id="tec-especialidad" class="form-control" placeholder="Ej: Mecánica general, Electricidad...">
        </div>
        <div class="col-md-6">
          <label class="form-label">Zona de cobertura</label>
          <input type="text" id="tec-zona" class="form-control" placeholder="Ej: Maipú, Pudahuel...">
        </div>
        <div class="col-md-6">
          <label class="form-label">Comisión (%)</label>
          <input type="number" id="tec-comision" class="form-control" value="40" min="0" max="100">
        </div>
      </div>
    </form>
  `;
  document.getElementById('sgc-modal-footer').innerHTML = `
    <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
    <button class="btn btn-primary" onclick="crearTecnico()">
      <i class="fas fa-save"></i> Guardar
    </button>
  `;
  new bootstrap.Modal(document.getElementById('sgc-modal')).show();
}

async function crearTecnico() {
  const body = {
    nombre: document.getElementById('tec-nombre').value,
    apellido: document.getElementById('tec-apellido').value,
    telefono: document.getElementById('tec-telefono').value,
    email: document.getElementById('tec-email').value,
    especialidad: document.getElementById('tec-especialidad').value,
    zona_cobertura: document.getElementById('tec-zona').value,
    comision_porcentaje: parseFloat(document.getElementById('tec-comision').value) || 40
  };

  if (!body.nombre) {
    showToast('Nombre es obligatorio', 'error');
    return;
  }

  try {
    const resp = await apiFetch('/api/tecnicos', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    bootstrap.Modal.getInstance(document.getElementById('sgc-modal')).hide();
    showToast('Técnico creado correctamente');
    loadTecnicos();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function editarTecnico(id) {
  const t = (window._tecnicos || []).find(x => x.id === id);
  if (!t) return;

  document.getElementById('sgc-modal-title').textContent = `Editar ${t.nombre}`;
  document.getElementById('sgc-modal-body').innerHTML = `
    <form id="form-editar-tecnico">
      <div class="row g-3">
        <div class="col-md-8">
          <label class="form-label">Nombre</label>
          <input type="text" id="etec-nombre" class="form-control" value="${t.nombre}">
        </div>
        <div class="col-md-4">
          <label class="form-label">Apellido</label>
          <input type="text" id="etec-apellido" class="form-control" value="${t.apellido || ''}">
        </div>
        <div class="col-md-6">
          <label class="form-label">Teléfono</label>
          <input type="tel" id="etec-telefono" class="form-control" value="${t.telefono || ''}">
        </div>
        <div class="col-md-6">
          <label class="form-label">Email</label>
          <input type="email" id="etec-email" class="form-control" value="${t.email || ''}">
        </div>
        <div class="col-md-6">
          <label class="form-label">Especialidad</label>
          <input type="text" id="etec-especialidad" class="form-control" value="${t.especialidad || ''}">
        </div>
        <div class="col-md-6">
          <label class="form-label">Zona</label>
          <input type="text" id="etec-zona" class="form-control" value="${t.zona_cobertura || ''}">
        </div>
        <div class="col-md-6">
          <label class="form-label">Comisión (%)</label>
          <input type="number" id="etec-comision" class="form-control" value="${t.comision_porcentaje || 40}" min="0" max="100">
        </div>
        <div class="col-md-6">
          <label class="form-label">Estado</label>
          <select id="etec-activo" class="form-select">
            <option value="1" ${t.activo ? 'selected' : ''}>Activo</option>
            <option value="0" ${!t.activo ? 'selected' : ''}>Inactivo</option>
          </select>
        </div>
      </div>
    </form>
  `;
  document.getElementById('sgc-modal-footer').innerHTML = `
    <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
    <button class="btn btn-primary" onclick="guardarTecnico(${id})">
      <i class="fas fa-save"></i> Guardar cambios
    </button>
  `;
  new bootstrap.Modal(document.getElementById('sgc-modal')).show();
}

async function guardarTecnico(id) {
  const body = {
    nombre: document.getElementById('etec-nombre').value,
    apellido: document.getElementById('etec-apellido').value,
    telefono: document.getElementById('etec-telefono').value,
    email: document.getElementById('etec-email').value,
    especialidad: document.getElementById('etec-especialidad').value,
    zona_cobertura: document.getElementById('etec-zona').value,
    comision_porcentaje: parseFloat(document.getElementById('etec-comision').value) || 40,
    activo: parseInt(document.getElementById('etec-activo').value)
  };

  try {
    const resp = await apiFetch(`/api/tecnicos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    bootstrap.Modal.getInstance(document.getElementById('sgc-modal')).hide();
    showToast('Técnico actualizado');
    loadTecnicos();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function desactivarTecnico(id) {
  if (!confirm('¿Desactivar este técnico? Se podrá reactivar después.')) return;
  try {
    const resp = await apiFetch(`/api/tecnicos/${id}`, { method: 'DELETE' });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    showToast('Técnico desactivado');
    loadTecnicos();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
