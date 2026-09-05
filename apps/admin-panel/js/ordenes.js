// ============================================
// SGC ADMIN - Órdenes de Trabajo
// ============================================

async function loadOrdenes() {
  try {
    const resp = await apiFetch('/api/ordenes?limit=200');
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);

    window._ordenes = data.ordenes;

    document.getElementById('view-ordenes').innerHTML = `
      <div class="section-card-header mb-3">
        <h2><i class="fas fa-clipboard-list"></i> Órdenes de Trabajo</h2>
        <button class="btn btn-primary" onclick="showCrearOrdenModal()">
          <i class="fas fa-plus"></i> Nueva OT
        </button>
      </div>

      <div class="mb-3">
        <div class="row g-2">
          <div class="col-md-4">
            <input type="text" id="ordenes-search" class="form-control" placeholder="Buscar por patente..." oninput="filtrarOrdenes()">
          </div>
          <div class="col-md-3">
            <select id="ordenes-filter-estado" class="form-select" onchange="filtrarOrdenes()">
              <option value="">Todos los estados</option>
              <option value="Pendiente">Pendiente</option>
              <option value="En Proceso">En Proceso</option>
              <option value="Completada">Completada</option>
              <option value="Cerrada">Cerrada</option>
            </select>
          </div>
        </div>
      </div>

      <div class="section-card">
        <div class="table-responsive">
          <table class="table table-hover">
            <thead>
              <tr>
                <th>OT#</th>
                <th>Cliente</th>
                <th class="d-none-mobile">Vehículo</th>
                <th class="d-none-mobile">Fecha</th>
                <th class="d-none-mobile">Técnico</th>
                <th>Total</th>
                <th>Estado</th>
                <th class="d-none-mobile">Tipo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="ordenes-tbody">
              ${data.ordenes.map(renderOrdenRow).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

  } catch (err) {
    document.getElementById('view-ordenes').innerHTML = `
      <div class="alert alert-danger"><i class="fas fa-exclamation-triangle"></i> ${err.message}</div>
    `;
  }
}

function renderOrdenRow(o) {
  const num = String(o.numero_orden || 0).padStart(6, '0');
  const vehiculo = [o.marca, o.modelo, o.anio].filter(Boolean).join(' ') || '—';
  const patente = o.patente_placa ? `<span class="badge bg-secondary">${o.patente_placa}</span>` : '';
  const estadoColors = {
    'Pendiente': 'badge-pendiente',
    'En Proceso': 'badge-aprobada',
    'Completada': 'badge-aprobada',
    'Cerrada': 'badge-confirmada'
  };
  const estadoClass = estadoColors[o.estado_trabajo] || 'badge-cancelada';
  const tipoIcon = o.es_express ? '⚡ Express' : '🔧 Normal';
  const fmtMoney = (n) => '$' + new Intl.NumberFormat('es-CL').format(Math.round(n || 0));

  return `
    <tr>
      <td><strong>#${num}</strong></td>
      <td>${o.cliente_nombre || '—'}<br><small class="text-muted">${o.cliente_telefono || ''}</small></td>
      <td class="d-none-mobile">${vehiculo} ${patente}</td>
      <td class="d-none-mobile">${o.fecha_programada || o.fecha_ingreso || '—'}</td>
      <td class="d-none-mobile">${o.tecnico_nombre || '<span class="text-muted">Sin asignar</span>'}</td>
      <td>${fmtMoney(o.monto_total)}</td>
      <td><span class="badge ${estadoClass}">${o.estado_trabajo || '—'}</span></td>
      <td class="d-none-mobile">${tipoIcon}</td>
      <td>
        <button class="btn btn-info btn-sm btn-accion" onclick="verOrden(${o.id})">
          <i class="fas fa-eye"></i>
        </button>
      </td>
    </tr>
  `;
}

function filtrarOrdenes() {
  const q = (document.getElementById('ordenes-search')?.value || '').toLowerCase();
  const estado = document.getElementById('ordenes-filter-estado')?.value || '';
  const filtradas = (window._ordenes || []).filter(o => {
    if (estado && o.estado_trabajo !== estado) return false;
    if (q && !(o.patente_placa || '').toLowerCase().includes(q)) return false;
    return true;
  });
  document.getElementById('ordenes-tbody').innerHTML = filtradas.map(renderOrdenRow).join('') ||
    '<tr><td colspan="9" class="text-center text-muted py-4">No se encontraron órdenes</td></tr>';
}

function showCrearOrdenModal() {
  document.getElementById('sgc-modal-title').textContent = 'Nueva Orden de Trabajo';
  document.getElementById('sgc-modal-body').innerHTML = `
    <form id="form-crear-orden">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label">Patente *</label>
          <input type="text" id="orden-patente" class="form-control" required>
        </div>
        <div class="col-md-6">
          <label class="form-label">Tipo</label>
          <select id="orden-tipo" class="form-select">
            <option value="0">🔧 Normal</option>
            <option value="1">⚡ Express</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label">Marca</label>
          <input type="text" id="orden-marca" class="form-control">
        </div>
        <div class="col-md-4">
          <label class="form-label">Modelo</label>
          <input type="text" id="orden-modelo" class="form-control">
        </div>
        <div class="col-md-4">
          <label class="form-label">Año</label>
          <input type="number" id="orden-anio" class="form-control">
        </div>
        <div class="col-md-6">
          <label class="form-label">Nombre cliente</label>
          <input type="text" id="orden-cliente" class="form-control">
        </div>
        <div class="col-md-6">
          <label class="form-label">Teléfono cliente</label>
          <input type="tel" id="orden-telefono" class="form-control">
        </div>
        <div class="col-md-12">
          <label class="form-label">Dirección (si a domicilio)</label>
          <input type="text" id="orden-direccion" class="form-control">
        </div>
        <div class="col-md-4">
          <label class="form-label">Fecha programada</label>
          <input type="date" id="orden-fecha-prog" class="form-control">
        </div>
        <div class="col-md-4">
          <label class="form-label">Hora programada</label>
          <input type="time" id="orden-hora-prog" class="form-control" value="09:00">
        </div>
        <div class="col-md-4">
          <label class="form-label">Monto total</label>
          <input type="number" id="orden-monto" class="form-control" value="0">
        </div>
        <div class="col-md-12">
          <label class="form-label">Diagnóstico / observaciones</label>
          <textarea id="orden-obs" class="form-control" rows="2"></textarea>
        </div>
      </div>
    </form>
  `;
  document.getElementById('sgc-modal-footer').innerHTML = `
    <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
    <button class="btn btn-primary" onclick="crearOrden()">
      <i class="fas fa-save"></i> Guardar
    </button>
  `;
  new bootstrap.Modal(document.getElementById('sgc-modal')).show();
}

async function crearOrden() {
  const body = {
    patente_placa: document.getElementById('orden-patente').value,
    es_express: parseInt(document.getElementById('orden-tipo').value),
    marca: document.getElementById('orden-marca').value,
    modelo: document.getElementById('orden-modelo').value,
    anio: parseInt(document.getElementById('orden-anio').value) || null,
    cliente_nombre: document.getElementById('orden-cliente').value,
    cliente_telefono: document.getElementById('orden-telefono').value,
    direccion: document.getElementById('orden-direccion').value,
    fecha_programada: document.getElementById('orden-fecha-prog').value || null,
    hora_programada: document.getElementById('orden-hora-prog').value,
    monto_total: parseFloat(document.getElementById('orden-monto').value) || 0,
    diagnostico_observaciones: document.getElementById('orden-obs').value
  };

  if (!body.patente_placa) {
    showToast('Patente es obligatoria', 'error');
    return;
  }

  try {
    const resp = await apiFetch('/api/ordenes', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    bootstrap.Modal.getInstance(document.getElementById('sgc-modal')).hide();
    showToast('Orden creada correctamente');
    loadOrdenes();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function verOrden(id) {
  try {
    const resp = await apiFetch(`/api/ordenes/${id}`);
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);
    const o = data.orden;
    const num = String(o.numero_orden || 0).padStart(6, '0');
    const fmtMoney = (n) => '$' + new Intl.NumberFormat('es-CL').format(Math.round(n || 0));

    document.getElementById('sgc-modal-title').textContent = `OT #${num}`;
    document.getElementById('sgc-modal-body').innerHTML = `
      <table class="table table-sm">
        <tr><th>Patente</th><td>${o.patente_placa || '—'}</td></tr>
        <tr><th>Vehículo</th><td>${[o.marca, o.modelo, o.anio].filter(Boolean).join(' ')}</td></tr>
        <tr><th>Cliente</th><td>${o.cliente_nombre || '—'}<br>${o.cliente_telefono || ''}</td></tr>
        <tr><th>Dirección</th><td>${o.direccion || '—'}</td></tr>
        <tr><th>Fecha programada</th><td>${o.fecha_programada || '—'} ${o.hora_programada || ''}</td></tr>
        <tr><th>Técnico</th><td>${o.tecnico_nombre || '<span class="text-muted">Sin asignar</span>'}</td></tr>
        <tr><th>Monto total</th><td><strong>${fmtMoney(o.monto_total)}</strong></td></tr>
        <tr><th>Abono</th><td>${fmtMoney(o.monto_abono)}</td></tr>
        <tr><th>Restante</th><td>${fmtMoney(o.monto_restante)}</td></tr>
        <tr><th>Estado</th><td><span class="badge badge-${o.estado_trabajo === 'Completada' ? 'aprobada' : 'pendiente'}">${o.estado_trabajo}</span></td></tr>
        <tr><th>Tipo</th><td>${o.es_express ? '⚡ Express' : '🔧 Normal'}</td></tr>
        ${o.diagnostico_observaciones ? `<tr><th>Diagnóstico</th><td>${o.diagnostico_observaciones}</td></tr>` : ''}
        ${o.servicios_seleccionados ? `<tr><th>Servicios</th><td>${o.servicios_seleccionados}</td></tr>` : ''}
        <tr><th>Creada</th><td>${o.fecha_creacion || '—'}</td></tr>
      </table>

      ${(data.costos || []).length > 0 ? `
        <h6 class="mt-3">Costos adicionales</h6>
        <ul class="list-group list-group-flush">
          ${data.costos.map(c => `
            <li class="list-group-item d-flex justify-content-between">
              <span>${c.concepto}</span>
              <strong>${fmtMoney(c.monto)}</strong>
            </li>
          `).join('')}
        </ul>
      ` : ''}

      ${(data.notas || []).length > 0 ? `
        <h6 class="mt-3">Notas del técnico</h6>
        <ul class="list-group list-group-flush">
          ${data.notas.map(n => `
            <li class="list-group-item">
              <small class="text-muted">${n.fecha_nota} - ${n.tecnico_nombre || 'Técnico'}</small><br>
              ${n.nota}
            </li>
          `).join('')}
        </ul>
      ` : ''}
    `;
    document.getElementById('sgc-modal-footer').innerHTML = `
      <button class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
    `;
    new bootstrap.Modal(document.getElementById('sgc-modal')).show();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
