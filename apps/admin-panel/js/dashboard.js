// ============================================
// SGC ADMIN - Dashboard
// ============================================

async function loadDashboard() {
  try {
    const resp = await apiFetch('/api/dashboard');
    const data = await resp.json();
    if (!data.success) throw new Error(data.error);

    const k = data.kpis;
    const fmt = (n) => new Intl.NumberFormat('es-CL').format(n);
    const fmtMoney = (n) => '$' + new Intl.NumberFormat('es-CL').format(Math.round(n));

    document.getElementById('view-dashboard').innerHTML = `
      <h2 class="mb-4"><i class="fas fa-tachometer-alt"></i> Dashboard</h2>

      <div class="kpi-grid">
        <div class="kpi-card">
          <i class="fas fa-calendar-day kpi-icon"></i>
          <div class="kpi-value">${k.citas_hoy}</div>
          <p class="kpi-label">Citas Hoy</p>
        </div>
        <div class="kpi-card kpi-warning">
          <i class="fas fa-clock kpi-icon"></i>
          <div class="kpi-value">${k.citas_pendientes_aprobacion}</div>
          <p class="kpi-label">Citas por aprobar</p>
        </div>
        <div class="kpi-card kpi-info">
          <i class="fas fa-check-circle kpi-icon"></i>
          <div class="kpi-value">${k.citas_aprobadas_total}</div>
          <p class="kpi-label">Citas aprobadas (total)</p>
        </div>
        <div class="kpi-card">
          <i class="fas fa-calendar-alt kpi-icon"></i>
          <div class="kpi-value">${k.citas_mes_actual}</div>
          <p class="kpi-label">Citas este mes</p>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card kpi-warning">
          <i class="fas fa-clipboard-list kpi-icon"></i>
          <div class="kpi-value">${k.ot_pendientes}</div>
          <p class="kpi-label">OT pendientes</p>
        </div>
        <div class="kpi-card">
          <i class="fas fa-check-double kpi-icon"></i>
          <div class="kpi-value">${k.ot_completadas_mes}</div>
          <p class="kpi-label">OT completadas (mes)</p>
        </div>
        <div class="kpi-card kpi-danger">
          <i class="fas fa-bolt kpi-icon"></i>
          <div class="kpi-value">${k.ot_express_pendientes}</div>
          <p class="kpi-label">OT Express pendientes</p>
        </div>
        <div class="kpi-card kpi-info">
          <i class="fas fa-dollar-sign kpi-icon"></i>
          <div class="kpi-value" style="font-size:1.6rem;">${fmtMoney(k.ingresos_mes)}</div>
          <p class="kpi-label">Ingresos del mes</p>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <i class="fas fa-user-cog kpi-icon"></i>
          <div class="kpi-value">${k.tecnicos_activos}</div>
          <p class="kpi-label">Técnicos activos</p>
        </div>
      </div>

      <div class="row">
        <div class="col-md-6">
          <div class="section-card">
            <div class="section-card-header">
              <h3><i class="fas fa-history"></i> Últimas 10 citas</h3>
            </div>
            <div class="table-responsive">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Servicio</th>
                    <th>Estado</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.ultimas_citas.map(c => `
                    <tr>
                      <td>${c.fecha_cita}<br><small class="text-muted">${c.hora_cita}</small></td>
                      <td>${c.nombre_cliente || '—'}<br><small class="text-muted">${c.telefono || ''}</small></td>
                      <td>${c.servicio || '—'}</td>
                      <td><span class="badge badge-${c.estado_aprobacion || 'pendiente'}">${c.estado_aprobacion || 'pendiente'}</span></td>
                      <td>${c.tipo_atencion === 'domicilio' ? '🏠 Dom.' : '🔧 Taller'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="section-card">
            <div class="section-card-header">
              <h3><i class="fas fa-calendar-plus"></i> Próximas citas</h3>
            </div>
            <div class="table-responsive">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Hora</th>
                    <th>Cliente</th>
                    <th>Servicio</th>
                    <th>Patente</th>
                  </tr>
                </thead>
                <tbody>
                  ${(data.proximas_citas || []).map(c => `
                    <tr>
                      <td>${c.fecha_cita}</td>
                      <td>${c.hora_cita}</td>
                      <td>${c.nombre_cliente || '—'}</td>
                      <td>${c.servicio || '—'}</td>
                      <td>${c.patente || '—'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="row">
        <div class="col-md-12">
          <div class="section-card">
            <div class="section-card-header">
              <h3><i class="fas fa-chart-pie"></i> Citas por servicio (mes actual)</h3>
            </div>
            <div class="table-responsive">
              <table class="table table-sm">
                <thead>
                  <tr><th>Servicio</th><th class="text-end">Total</th></tr>
                </thead>
                <tbody>
                  ${(data.citas_por_servicio || []).map(s => `
                    <tr>
                      <td>${s.servicio}</td>
                      <td class="text-end"><strong>${s.total}</strong></td>
                    </tr>
                  `).join('')}
                  ${data.citas_por_servicio.length === 0 ? '<tr><td colspan="2" class="text-muted text-center">Sin datos este mes</td></tr>' : ''}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

  } catch (err) {
    document.getElementById('view-dashboard').innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-triangle"></i> Error cargando dashboard: ${err.message}
      </div>
    `;
  }
}
