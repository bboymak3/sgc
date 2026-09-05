// ============================================
// PÁGINA DE APROBACIÓN DE ORDEN
// SGC
// Incluye gastos adicionales con descripción
// Diagnóstico: checkbox-based (diagnostico_checks + diagnostico_observaciones)
// ============================================

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(getErrorPage('Token no proporcionado', 'No se proporcionó un token válido'), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Buscar orden
    const orden = await env.DB.prepare(
      'SELECT o.*, c.nombre as cliente_nombre, c.rut as cliente_rut, c.telefono as cliente_telefono FROM OrdenesTrabajo o LEFT JOIN Clientes c ON o.cliente_id = c.id WHERE o.token = ?'
    ).bind(token).first();

    if (!orden) {
      return new Response(getErrorPage('Orden no encontrada', 'El enlace no es válido o ha expirado'), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Obtener costos adicionales de la orden
    let costosAdicionales = [];
    let totalCostosAdicionales = 0;
    try {
      const { results } = await env.DB.prepare(
        'SELECT concepto, monto, categoria FROM CostosAdicionales WHERE orden_id = ? ORDER BY fecha_registro DESC'
      ).bind(orden.id).all();
      costosAdicionales = results || [];
      totalCostosAdicionales = costosAdicionales.reduce((sum, c) => sum + Number(c.monto || 0), 0);
    } catch (e) {
      // La tabla puede no existir
      console.log('CostosAdicionales no disponible:', e.message);
    }

    if (orden.estado === 'Aprobada') {
      return new Response(getApprovedPage(orden, costosAdicionales, totalCostosAdicionales), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (orden.estado === 'Cancelada') {
      return new Response(getCancelledPage(orden), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    return new Response(getApprovalPage(orden, token, costosAdicionales, totalCostosAdicionales), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });

  } catch (error) {
    console.error('Error en /aprobar:', error);
    return new Response(getErrorPage('Error del servidor', error.message), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 500
    });
  }
}

function getErrorPage(title, message) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Error</title></head><body style="font-family:Arial,sans-serif;text-align:center;padding:50px;background:#f3f4f6;"><h1 style="color:#dc2626;">' + title + '</h1><p style="color:#4b5563;">' + message + '</p></body></html>';
}

// ============================================
// HELPER: Build diagnosis items from new or old format
// ============================================
function buildDiagnosticoItems(orden) {
  let checks = [];
  let observaciones = orden.diagnostico_observaciones || '';

  // Try new checkbox format first
  if (orden.diagnostico_checks) {
    try {
      const parsed = typeof orden.diagnostico_checks === 'string'
        ? JSON.parse(orden.diagnostico_checks)
        : orden.diagnostico_checks;
      if (Array.isArray(parsed) && parsed.length > 0) {
        checks = parsed;
      }
    } catch (e) {
      // Not valid JSON, fall back to old format
    }
  }

  // Fall back to old individual fields
  if (checks.length === 0) {
    if (orden.trabajo_frenos) checks.push('Frenos' + (orden.detalle_frenos ? ': ' + orden.detalle_frenos : ''));
    if (orden.trabajo_luces) checks.push('Luces' + (orden.detalle_luces ? ': ' + orden.detalle_luces : ''));
    if (orden.trabajo_tren_delantero) checks.push('Tren Delantero' + (orden.detalle_tren_delantero ? ': ' + orden.detalle_tren_delantero : ''));
    if (orden.trabajo_correas) checks.push('Correas' + (orden.detalle_correas ? ': ' + orden.detalle_correas : ''));
    if (orden.trabajo_componentes) checks.push('Componentes' + (orden.detalle_componentes ? ': ' + orden.detalle_componentes : ''));
  }

  return { checks, observaciones };
}

// ============================================
// HELPER: Diagnosis as styled HTML list (Bootstrap)
// ============================================
function buildDiagnosticoHtmlBootstrap(orden, title) {
  // Check for servicios_seleccionados (catalog services with prices)
  let servicios = [];
  if (orden.servicios_seleccionados) {
    try {
      const parsed = typeof orden.servicios_seleccionados === 'string'
        ? JSON.parse(orden.servicios_seleccionados)
        : orden.servicios_seleccionados;
      if (Array.isArray(parsed) && parsed.length > 0) {
        servicios = parsed;
      }
    } catch (e) {}
  }

  if (servicios.length > 0) {
    let subtotal = 0;
    let hasEdited = false;
    let html = '<h6 class="fw-bold text-danger">' + (title || 'DIAGNÓSTICO') + '</h6>';
    html += '<div class="table-responsive"><table class="table table-sm table-bordered"><thead class="table-light"><tr><th>Servicio</th><th>Categoría</th><th>Tipo</th><th>Técnico</th><th>Descripción</th><th class="text-end">Precio</th></tr></thead><tbody>';
    servicios.forEach(function(s) {
      const precio = Number(s.precio_final || s.precio_sugerido || 0);
      subtotal += precio;
      if (s.editado) hasEdited = true;
      const tipo = s.tipo_comision === 'mano_obra' ? '<span class="badge bg-warning text-dark" style="font-size:0.65rem;">Mano de Obra</span>' : '<span class="badge bg-secondary" style="font-size:0.65rem;">Repuestos</span>';
      const editMark = s.editado ? ' *' : '';
      var tecnicoLabel = s.tecnico_nombre ? '<span class="badge bg-info text-dark" style="font-size:0.65rem;">' + s.tecnico_nombre + '</span>' : '-';
      var descLabel = s.descripcion ? '<small class="text-muted">' + s.descripcion + '</small>' : '-';
      html += '<tr><td>' + (s.nombre || s.nombre_servicio || '') + editMark + '</td><td>' + (s.categoria || '') + '</td><td>' + tipo + '</td><td>' + tecnicoLabel + '</td><td>' + descLabel + '</td><td class="text-end fw-bold">$' + precio.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + '</td></tr>';
    });
    html += '<tr class="table-warning"><td class="fw-bold" colspan="5">Subtotal Servicios</td><td class="text-end fw-bold fs-5">$' + subtotal.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + '</td></tr>';
    html += '</tbody></table></div>';
    if (hasEdited) {
      html += '<small class="text-muted">* Precio editado manualmente</small>';
    }
    // SIEMPRE mostrar observaciones
    const obs = orden.diagnostico_observaciones || '';
    if (obs) {
      html += '<div class="mt-3 p-3 bg-light rounded-lg border border-warning"><h6 class="fw-bold text-warning mb-1"><i class="fas fa-eye me-1"></i>OBSERVACIONES</h6><p class="text-muted mb-0" style="font-size:0.9rem;">' + obs + '</p></div>';
    }
    return html;
  }

  // Fallback to old diagnostic format
  const { checks, observaciones } = buildDiagnosticoItems(orden);
  let html = '<h6 class="fw-bold text-danger">' + (title || 'DIAGNÓSTICO') + '</h6>';
  if (checks.length === 0) {
    html += '<p class="text-muted">Sin diagnóstico registrado</p>';
  } else {
    html += '<ul class="list-unstyled mb-0">';
    checks.forEach(function(item) {
      html += '<li class="mb-1"><span style="color:#16a34a;font-size:1rem;">✅</span> ' + item + '</li>';
    });
    html += '</ul>';
  }
  if (observaciones) {
    html += '<p class="text-muted mt-2 mb-0" style="font-size:0.9rem;"><em>📝 Observaciones: ' + observaciones + '</em></p>';
  }
  return html;
}

// ============================================
// HELPER: Diagnosis as styled HTML list (Tailwind)
// ============================================
function buildDiagnosticoHtmlTailwind(orden, title) {
  // Check for servicios_seleccionados (catalog services with prices)
  let servicios = [];
  if (orden.servicios_seleccionados) {
    try {
      const parsed = typeof orden.servicios_seleccionados === 'string'
        ? JSON.parse(orden.servicios_seleccionados)
        : orden.servicios_seleccionados;
      if (Array.isArray(parsed) && parsed.length > 0) {
        servicios = parsed;
      }
    } catch (e) {}
  }

  if (servicios.length > 0) {
    let subtotal = 0;
    let hasEdited = false;
    let html = '<h3 class="font-bold text-lg mb-3 text-gray-800">' + (title || '🔧 Diagnóstico') + '</h3>';
    html += '<div class="overflow-x-auto rounded-lg border border-gray-200"><table class="w-full text-sm"><thead class="bg-gray-100"><tr><th class="text-left p-2">Servicio</th><th class="text-left p-2">Categoría</th><th class="text-left p-2">Tipo</th><th class="text-left p-2">Técnico</th><th class="text-left p-2">Descripción</th><th class="text-right p-2">Precio</th></tr></thead><tbody>';
    servicios.forEach(function(s) {
      const precio = Number(s.precio_final || s.precio_sugerido || 0);
      subtotal += precio;
      if (s.editado) hasEdited = true;
      const tipo = s.tipo_comision === 'mano_obra' ? '<span class="text-xs px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 font-bold">Mano de Obra</span>' : '<span class="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-bold">Repuestos</span>';
      const editMark = s.editado ? ' *' : '';
      var tecnicoLabel = s.tecnico_nombre ? '<span class="text-xs px-2 py-0.5 rounded-full bg-cyan-200 text-cyan-800 font-bold">' + s.tecnico_nombre + '</span>' : '-';
      var descLabel = s.descripcion ? '<small class="text-gray-500">' + s.descripcion + '</small>' : '-';
      html += '<tr class="border-t border-gray-100"><td class="p-2">' + (s.nombre || s.nombre_servicio || '') + editMark + '</td><td class="p-2">' + (s.categoria || '') + '</td><td class="p-2">' + tipo + '</td><td class="p-2">' + tecnicoLabel + '</td><td class="p-2">' + descLabel + '</td><td class="p-2 text-right font-bold text-red-600">$' + precio.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + '</td></tr>';
    });
    html += '<tr class="bg-amber-50 border-t-2 border-amber-300"><td class="p-2 font-bold" colspan="5">Subtotal Servicios</td><td class="p-2 text-right font-black text-lg text-red-600">$' + subtotal.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + '</td></tr>';
    html += '</tbody></table></div>';
    if (hasEdited) {
      html += '<p class="text-xs text-gray-500 mt-2">* Precio editado manualmente</p>';
    }
    // SIEMPRE mostrar observaciones
    const obs = orden.diagnostico_observaciones || '';
    if (obs) {
      html += '<div class="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200"><h4 class="font-bold text-amber-700 mb-1">👁️ OBSERVACIONES</h4><p class="text-gray-600 text-sm">' + obs + '</p></div>';
    }
    return html;
  }

  // Fallback to old diagnostic format
  const { checks, observaciones } = buildDiagnosticoItems(orden);
  let html = '<h3 class="font-bold text-lg mb-3 text-gray-800">' + (title || '🔧 Diagnóstico') + '</h3>';
  if (checks.length === 0) {
    html += '<p class="text-sm text-gray-500">Sin diagnóstico registrado</p>';
  } else {
    html += '<ul class="space-y-2">';
    checks.forEach(function(item) {
      html += '<li class="flex items-center gap-2"><span class="text-green-600">✅</span><span class="text-sm">' + item + '</span></li>';
    });
    html += '</ul>';
  }
  if (observaciones) {
    html += '<p class="text-sm text-gray-500 mt-3 italic">📝 Observaciones: ' + observaciones + '</p>';
  }
  return html;
}

// ============================================
// HELPER: Checklist del vehículo (Tailwind)
// ============================================
function buildChecklistHtmlTailwind(orden) {
  const items = [];
  const nivel = orden.nivel_combustible || '';
  if (orden.check_paragolfe_delantero_der) items.push('Parachoques delantero derecho');
  if (orden.check_puerta_delantera_der) items.push('Puerta delantera derecha');
  if (orden.check_puerta_trasera_der) items.push('Puerta trasera derecha');
  if (orden.check_paragolfe_trasero_izq) items.push('Parachoques trasero izquierdo');
  if (orden.check_otros_carroceria) items.push(orden.check_otros_carroceria);

  if (!nivel && items.length === 0) return '';

  let html = '<div class="mb-6">';
  html += '<h3 class="font-bold text-lg mb-3 text-gray-800">🚗 Checklist del Vehículo</h3>';
  html += '<div class="bg-gray-50 rounded-xl p-4 space-y-3">';
  if (nivel) {
    html += '<div class="flex items-center gap-2"><span class="text-xs px-2 py-1 rounded-full bg-blue-200 text-blue-800 font-bold">Combustible</span><span class="text-sm">' + nivel + '</span></div>';
  }
  if (items.length > 0) {
    html += '<div class="text-xs text-gray-500 font-bold uppercase mb-1">Estado de Carrocería:</div>';
    items.forEach(function(item) {
      html += '<div class="flex items-center gap-2"><span class="text-yellow-500">⚠️</span><span class="text-sm">' + item + '</span></div>';
    });
  }
  if (!items.length && !nivel) {
    html += '<p class="text-sm text-gray-500">Sin observaciones registradas</p>';
  }
  html += '</div></div>';
  return html;
}

// ============================================
// HELPER: Checklist del vehículo (Bootstrap)
// ============================================
function buildChecklistHtmlBootstrap(orden) {
  const items = [];
  const nivel = orden.nivel_combustible || '';
  if (orden.check_paragolpe_delantero_der) items.push('Parachoques delantero derecho');
  if (orden.check_puerta_delantera_der) items.push('Puerta delantera derecha');
  if (orden.check_puerta_trasera_der) items.push('Puerta trasera derecha');
  if (orden.check_paragolpe_trasero_izq) items.push('Parachoques trasero izquierdo');
  if (orden.check_otros_carroceria) items.push(orden.check_otros_carroceria);

  if (!nivel && items.length === 0) return '';

  let html = '<div class="mt-3"><h6 class="fw-bold text-danger"><i class="fas fa-car me-1"></i>CHECKLIST DEL VEHÍCULO</h6>';
  html += '<div class="bg-light rounded p-3">';
  if (nivel) html += '<p class="mb-1"><strong>Combustible:</strong> ' + nivel + '</p>';
  if (items.length > 0) {
    html += '<p class="mb-1 fw-bold">Estado de Carrocería:</p><ul class="list-unstyled mb-0">';
    items.forEach(function(item) { html += '<li>⚠️ ' + item + '</li>'; });
    html += '</ul>';
  }
  html += '</div></div>';
  return html;
}

function getApprovedPage(orden, costosAdicionales, totalCostos) {
  const n = String(orden.numero_orden).padStart(6, '0');
  const firmaImg = orden.firma_imagen ? '<img src="' + orden.firma_imagen + '" alt="Firma del cliente" style="max-width: 300px; border: 1px solid #ddd; border-radius: 5px;">' : '';

  const cliente = orden.cliente_nombre || 'Cliente';
  const patente = orden.patente_placa || 'N/A';
  const marca = orden.marca || 'N/A';
  const modelo = orden.modelo || 'N/A';

  // Build diagnosis HTML using new checkbox format
  const diagnosticoHtml = buildDiagnosticoHtmlBootstrap(orden, 'DIAGNÓSTICO / TRABAJOS');
  const checklistHtml = buildChecklistHtmlBootstrap(orden);

  // Calcular subtotal desde servicios_seleccionados
  let subtotalServicios = 0;
  if (orden.servicios_seleccionados) {
    try {
      const parsed = typeof orden.servicios_seleccionados === 'string'
        ? JSON.parse(orden.servicios_seleccionados)
        : orden.servicios_seleccionados;
      if (Array.isArray(parsed)) {
        parsed.forEach(function(s) {
          subtotalServicios += Number(s.precio_final || s.precio_sugerido || 0);
        });
      }
    } catch (e) {}
  }

  const montoBase = Number(orden.monto_total || 0);
  const subtotalBase = Math.max(montoBase, subtotalServicios);
  const montoFinal = subtotalBase + totalCostos;
  const total = montoFinal.toLocaleString('es-CL');
  const abono = (orden.monto_abono || 0).toLocaleString('es-CL');
  const esCerrada = orden.estado_trabajo === 'Cerrada' || orden.estado === 'Aprobada';
  const restanteNum = esCerrada ? 0 : Math.max(0, montoFinal - Number(orden.monto_abono || 0));
  const restante = restanteNum.toLocaleString('es-CL');

  // HTML de costos adicionales
  let costosHtml = '';
  if (costosAdicionales && costosAdicionales.length > 0) {
    costosHtml = '<div class="mt-3"><h6 class="fw-bold text-danger">GASTOS ADICIONALES</h6><ul class="list-group list-group-flush">';
    costosAdicionales.forEach(c => {
      const catBadge = c.categoria === 'Repuestos/Materiales'
        ? '<span class="badge bg-secondary me-1" style="font-size:0.7rem;">Repuesto</span>'
        : '<span class="badge bg-warning text-dark me-1" style="font-size:0.7rem;">Mano de Obra</span>';
      costosHtml += '<li class="list-group-item d-flex justify-content-between align-items-center px-0 py-2">';
      costosHtml += '<div>' + catBadge + '<span>' + (c.concepto || 'Gasto adicional') + '</span></div>';
      costosHtml += '<strong class="text-danger">$' + Number(c.monto || 0).toLocaleString('es-CL') + '</strong>';
      costosHtml += '</li>';
    });
    costosHtml += '</ul>';
    costosHtml += '<div class="text-end mt-2"><small class="text-muted">Subtotal base: $' + montoBase.toLocaleString('es-CL') + ' + Extras: $' + totalCostos.toLocaleString('es-CL') + '</small></div>';
    costosHtml += '</div>';
  }

  const costosJson = JSON.stringify(costosAdicionales || []);
  const totalCostosNum = totalCostos;

  // Domicilio (always visible, even when $0)
  const domDist = Number(orden.distancia_km || 0);
  const domCargo = Number(orden.cargo_domicilio || 0);
  const domicilioHtml = '<div class="mt-3 alert ' + (domDist > 0 ? 'alert-info' : 'alert-secondary') + ' py-2 mb-0">' +
    '<h6 class="fw-bold mb-2" style="color:' + (domCargo > 0 ? '#0066cc' : '#6c757d') + ';"><i class="fas fa-truck me-2"></i>DOMICILIO' + (domDist === 0 ? ' (No calculado)' : '') + '</h6>' +
    '<div class="row text-center"><div class="col-6"><small class="text-muted">Distancia recorrida</small><div class="h5">' + (domDist > 0 ? domDist.toFixed(1) + ' km' : 'N/A') + '</div></div>' +
    '<div class="col-6"><small class="text-muted">Cargo por domicilio</small><div class="h5 ' + (domCargo > 0 ? 'text-danger' : (domDist > 0 ? 'text-success' : 'text-muted')) + '">' + (domDist > 0 ? (domCargo > 0 ? '$' + domCargo.toLocaleString('es-CL') : 'Gratis') : 'No calculado') + '</div></div></div>' +
    (domDist > 0 ? '<small class="text-muted"><em>NOTA: Este valor NO esta incluido en el total. Pago directo al tecnico.</em></small>' : '') +
    '</div>';

  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Orden Aprobada #' + n + ' - SGC</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"><style>@media print { .no-print { display: none !important; } .print-only { display: block !important; } body { background: white !important; } } body { background: #f5f5f5; } .ot-card { box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-radius: 15px; margin-bottom: 20px; }</style></head><body><nav class="navbar navbar-dark no-print" style="background: #a80000;"><div class="container"><a class="navbar-brand fw-bold" href="#"><i class="fas fa-wrench me-2"></i>SGC</a></div></nav><div style="width:100%;text-align:center;line-height:0;"><img src="/banner.jpeg" alt="SGC" style="width:100%;max-width:600px;height:auto;display:block;margin:0 auto;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,0.15);"></div><div class="container py-4"><div class="d-flex justify-content-between align-items-center mb-4 no-print"><h2 class="mb-0">Orden Aprobada #' + n + '</h2><div class="d-flex gap-2"><button class="btn btn-primary" onclick="descargarPDF()"><i class="fas fa-download me-2"></i>Descargar PDF</button><button class="btn btn-secondary" onclick="verPDFEnLinea()"><i class="fas fa-eye me-2"></i>Ver en Línea</button></div></div><div class="ot-card card"><div class="card-header bg-success text-white"><h5 class="mb-0"><i class="fas fa-check-circle me-2"></i>ORDEN APROBADA #' + n + '</h5></div><div class="card-body"><div class="alert alert-success text-center"><h4 class="alert-heading">¡Orden Aprobada!</h4><p>Su firma ha sido guardada exitosamente.</p><hr><p class="mb-0">Fecha de aprobación: ' + (orden.fecha_aprobacion || 'N/A') + '</p></div>' + (firmaImg ? '<div class="text-center mt-4 p-4 bg-light rounded"><h6 class="fw-bold"><i class="fas fa-signature me-2"></i>Firma del Cliente</h6>' + firmaImg + '</div>' : '') + '<div class="row mt-4"><div class="col-md-6"><h6 class="fw-bold text-danger">DATOS DEL CLIENTE</h6><p><strong>Nombre:</strong> ' + cliente + '</p><p><strong>Fecha Ingreso:</strong> ' + (orden.fecha_ingreso || 'N/A') + '</p></div><div class="col-md-6"><h6 class="fw-bold text-danger">DATOS DEL VEHÍCULO</h6><p><strong>Patente:</strong> <span style="font-size: 1.2rem; font-weight: bold; color: #a80000;">' + patente + '</span></p><p><strong>Marca/Modelo:</strong> ' + marca + ' ' + modelo + '</p></div></div>' + domicilioHtml + '<div class="row mt-3"><div class="col-md-6">' + diagnosticoHtml + '</div><div class="col-md-6"><h6 class="fw-bold text-danger">VALORES</h6><div class="row text-center"><div class="col-4"><div class="p-3 bg-light rounded"><small class="text-muted">Total</small><div class="h5">$' + total + '</div></div></div><div class="col-4"><div class="p-3 bg-light rounded"><small class="text-muted">Abono</small><div class="h5">$' + abono + '</div></div></div><div class="col-4"><div class="p-3 bg-light rounded"><small class="text-muted">Restante</small><div class="h5">$' + restante + '</div></div></div></div></div>' + costosHtml + checklistHtml + '</div></div></div><footer class="text-center py-3 text-muted no-print"><small>Generado el ' + new Date().toLocaleString('es-CL') + '</small></footer><script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script><script>const ordenData = ' + JSON.stringify(orden) + '; const costosData = ' + costosJson + '; const totalCostosExtras = ' + totalCostosNum + '; function generarDomicilioPDF(doc, y) { var domDist = Number(ordenData.distancia_km || 0); var domCargo = Number(ordenData.cargo_domicilio || 0); if (y > 255) { doc.addPage(); y = 20; } doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 102, 204); doc.text("DOMICILIO", 14, y); y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(0, 0, 0); if (domDist > 0) { doc.text("Distancia recorrida: " + domDist.toFixed(1) + " km", 14, y); y += 5; if (domCargo > 0) { doc.text("Cargo por domicilio: $" + domCargo.toLocaleString("es-CL") + " (pago directo al tecnico)", 14, y); } else { doc.text("Cargo por domicilio: Gratis (dentro del radio de cobertura)", 14, y); } y += 5; } else { doc.text("Domicilio: No calculado", 14, y); y += 5; } y += 4; return y; } function generarCostosPDF(doc, y) { if (!costosData || costosData.length === 0) return y; doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(168, 0, 0); doc.text("GASTOS ADICIONALES", 14, y); y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(8); costosData.forEach(function(c) { if (y > 260) { doc.addPage(); y = 20; } doc.setTextColor(80, 80, 80); doc.text("  - " + (c.concepto || "Gasto adicional") + " (" + (c.categoria || "N/A") + "): $" + Number(c.monto || 0).toLocaleString("es-CL"), 14, y); y += 5; }); doc.setFontSize(8); doc.setTextColor(100, 100, 100); doc.text("  Subtotal extras: $" + totalCostosExtras.toLocaleString("es-CL"), 14, y); y += 8; return y; } function buildDiagItems(od) { var chks = []; var obs = od.diagnostico_observaciones || ""; if (od.diagnostico_checks) { try { var p = typeof od.diagnostico_checks === "string" ? JSON.parse(od.diagnostico_checks) : od.diagnostico_checks; if (Array.isArray(p) && p.length > 0) chks = p; } catch(e) {} } if (chks.length === 0) { if (od.trabajo_frenos) chks.push("Frenos" + (od.detalle_frenos ? ": " + od.detalle_frenos : "")); if (od.trabajo_luces) chks.push("Luces" + (od.detalle_luces ? ": " + od.detalle_luces : "")); if (od.trabajo_tren_delantero) chks.push("Tren Delantero" + (od.detalle_tren_delantero ? ": " + od.detalle_tren_delantero : "")); if (od.trabajo_correas) chks.push("Correas" + (od.detalle_correas ? ": " + od.detalle_correas : "")); if (od.trabajo_componentes) chks.push("Componentes" + (od.detalle_componentes ? ": " + od.detalle_componentes : "")); } return { checks: chks, obs: obs }; } function renderDiagPDF(doc, y, od) { doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(168, 0, 0); doc.text("DIAGNOSTICO / TRABAJOS", 14, y); y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(0, 0, 0); var srvs = []; if (od.servicios_seleccionados) { try { var sp = typeof od.servicios_seleccionados === "string" ? JSON.parse(od.servicios_seleccionados) : od.servicios_seleccionados; if (Array.isArray(sp) && sp.length > 0) srvs = sp; } catch(e) {} } if (srvs.length > 0) { var sub = 0; srvs.forEach(function(s) { if (y > 260) { doc.addPage(); y = 20; } var pr = Number(s.precio_final || s.precio_sugerido || 0); sub += pr; var tp = s.tipo_comision === "mano_obra" ? "MO" : "Rep"; var em = s.editado ? " *" : ""; var tecLabelPDF = s.tecnico_nombre ? " [" + s.tecnico_nombre + "]" : ""; doc.text("[x] " + (s.nombre || s.nombre_servicio || "") + em + tecLabelPDF + " [" + tp + "] $" + pr.toLocaleString("es-CL", {maximumFractionDigits: 0}), 14, y); y += 5; if (s.descripcion) { doc.setFontSize(6); doc.setTextColor(100, 100, 100); var descLinesPDF = doc.splitTextToSize("     > " + s.descripcion, 180); descLinesPDF.forEach(function(line) { y += 3; if (y > 270) { doc.addPage(); y = 20; } doc.text(line, 14, y); }); y += 1; doc.setFontSize(8); doc.setTextColor(0, 0, 0); } }); if (y > 260) { doc.addPage(); y = 20; } doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Subtotal Servicios: $" + sub.toLocaleString("es-CL", {maximumFractionDigits: 0}), 14, y); y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(8); } else { var d = buildDiagItems(od); if (d.checks.length === 0) { doc.text("- Sin diagnostico", 14, y); y += 6; } else { d.checks.forEach(function(item) { if (y > 260) { doc.addPage(); y = 20; } doc.text("- " + item, 14, y); y += 5; }); } if (d.obs) { if (y > 260) { doc.addPage(); y = 20; } doc.setFont("helvetica", "italic"); doc.setTextColor(80, 80, 80); doc.text("Observaciones: " + d.obs, 14, y); y += 5; doc.setFont("helvetica", "normal"); } } return y; } function loadImage(src) { return new Promise(function(r) { var i = new Image(); i.crossOrigin = "anonymous"; var t = setTimeout(function() { r(null); }, 2000); i.onload = function() { clearTimeout(t); r(i); }; i.onerror = function() { clearTimeout(t); r(null); }; i.src = src; }); } async function descargarPDF() { const { jsPDF } = window.jspdf; const doc = new jsPDF("p", "mm", "a4"); const numeroFormateado = "' + n + '"; const pw = 210; const ph = 297; var logoImg = await loadImage("/corto.jpg"); var bannerImg = await loadImage("/banner.jpeg"); if (logoImg) { doc.setGState(new doc.GState({ opacity: 0.08 })); var wmW = 80; var wmH = (logoImg.naturalHeight / logoImg.naturalWidth) * wmW; doc.addImage(logoImg, "JPEG", (pw - wmW) / 2, (ph - wmH) / 2, wmW, wmH); doc.setGState(new doc.GState({ opacity: 1 })); } doc.setFillColor(168, 0, 0); doc.rect(0, 0, 210, 20, "F"); doc.setFontSize(20); doc.setTextColor(255, 255, 255); doc.text("ORDEN DE TRABAJO #" + numeroFormateado, 105, 14, { align: "center" }); doc.setTextColor(0, 0, 0); if (logoImg) { doc.addImage(logoImg, "JPEG", 10, 22, 15, 10); } var by = 22; if (bannerImg) { var bw = pw - 20; var bh = (bannerImg.naturalHeight / bannerImg.naturalWidth) * bw; var mH = 30; var fbh = Math.min(bh, mH); var fbw = (bannerImg.naturalWidth / bannerImg.naturalHeight) * fbh; doc.addImage(bannerImg, "JPEG", (pw - fbw) / 2, by, fbw, fbh); by += fbh + 3; } var y = Math.max(by, 35); doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("INFORMACION CLIENTE", 14, y); y += 6; doc.setFont("helvetica", "normal"); doc.text("Nombre: ' + cliente + '", 14, y); y += 6; doc.text("Patente: ' + patente + '", 14, y); y += 6; doc.text("Vehiculo: ' + marca + ' ' + modelo + '", 14, y); y += 6; doc.text("Fecha de ingreso: " + (ordenData.fecha_ingreso || "N/A") + " " + (ordenData.hora_ingreso || ""), 14, y); y += 10; y = generarDomicilioPDF(doc, y); y = renderDiagPDF(doc, y, ordenData); y += 4; y = generarCostosPDF(doc, y); doc.setFont("helvetica", "bold"); doc.text("VALORES", 14, y); y += 6; doc.setFont("helvetica", "normal"); doc.text("Total: $' + total + '", 14, y); y += 6; doc.text("Abono: $' + abono + '", 14, y); y += 6; doc.text("Restante: $' + restante + '", 14, y); y += 10; if (ordenData.firma_imagen) { doc.setTextColor(0, 0, 128); doc.text("Firma del cliente: Si", 14, y); } else { doc.setTextColor(128, 0, 0); doc.text("Firma del cliente: No", 14, y); } doc.setTextColor(0, 0, 0); doc.save("OT-" + numeroFormateado + "-" + (ordenData.patente_placa || "N/A") + ".pdf"); } async function verPDFEnLinea() { const { jsPDF } = window.jspdf; const doc = new jsPDF("p", "mm", "a4"); const numeroFormateado = "' + n + '"; const pw = 210; const ph = 297; var logoImg = await loadImage("/corto.jpg"); var bannerImg = await loadImage("/banner.jpeg"); if (logoImg) { doc.setGState(new doc.GState({ opacity: 0.08 })); var wmW = 80; var wmH = (logoImg.naturalHeight / logoImg.naturalWidth) * wmW; doc.addImage(logoImg, "JPEG", (pw - wmW) / 2, (ph - wmH) / 2, wmW, wmH); doc.setGState(new doc.GState({ opacity: 1 })); } doc.setFillColor(168, 0, 0); doc.rect(0, 0, 210, 20, "F"); doc.setFontSize(20); doc.setTextColor(255, 255, 255); doc.text("ORDEN DE TRABAJO #" + numeroFormateado, 105, 14, { align: "center" }); doc.setTextColor(0, 0, 0); if (logoImg) { doc.addImage(logoImg, "JPEG", 10, 22, 15, 10); } var by = 22; if (bannerImg) { var bw = pw - 20; var bh = (bannerImg.naturalHeight / bannerImg.naturalWidth) * bw; var mH = 30; var fbh = Math.min(bh, mH); var fbw = (bannerImg.naturalWidth / bannerImg.naturalHeight) * fbh; doc.addImage(bannerImg, "JPEG", (pw - fbw) / 2, by, fbw, fbh); by += fbh + 3; } var y = Math.max(by, 35); doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("INFORMACION CLIENTE", 14, y); y += 6; doc.setFont("helvetica", "normal"); doc.text("Nombre: ' + cliente + '", 14, y); y += 6; doc.text("Patente: ' + patente + '", 14, y); y += 6; doc.text("Vehiculo: ' + marca + ' ' + modelo + '", 14, y); y += 6; doc.text("Fecha de ingreso: " + (ordenData.fecha_ingreso || "N/A") + " " + (ordenData.hora_ingreso || ""), 14, y); y += 10; y = generarDomicilioPDF(doc, y); y = renderDiagPDF(doc, y, ordenData); y += 4; y = generarCostosPDF(doc, y); doc.setFont("helvetica", "bold"); doc.text("VALORES", 14, y); y += 6; doc.setFont("helvetica", "normal"); doc.text("Total: $' + total + '", 14, y); y += 6; doc.text("Abono: $' + abono + '", 14, y); y += 6; doc.text("Restante: $' + restante + '", 14, y); const pdfBlob = doc.output("blob"); const pdfUrl = URL.createObjectURL(pdfBlob); window.open(pdfUrl, "_blank"); }</script></body></html>';
}

function getCancelledPage(orden) {
  const n = String(orden.numero_orden).padStart(6, '0');
  const motivo = orden.motivo_cancelacion || 'No especificado';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Orden Cancelada</title><script src="https://cdn.tailwindcss.com"><\/script></head><body class="bg-red-100 flex items-center justify-center min-h-screen p-4"><div style="width:100%;text-align:center;margin-bottom:16px;"><img src="/banner.jpeg" alt="SGC" style="width:100%;max-width:600px;height:auto;display:block;margin:0 auto;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,0.15);"></div><div class="bg-white rounded-2xl shadow-2xl p-8 text-center max-w-md"><div class="text-8xl mb-4">❌</div><h1 class="text-3xl font-black text-red-700 mb-2">Orden Cancelada</h1><p class="text-gray-600 mb-4">Esta orden de trabajo ha sido cancelada.</p><div class="bg-red-50 rounded-xl p-4 mb-6"><p class="text-sm text-gray-600">Orden N°</p><p class="text-2xl font-bold text-red-700">' + n + '</p><p class="text-xs text-gray-500 mt-2">Fecha: ' + (orden.fecha_cancelacion || 'N/A') + '</p></div><div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6"><p class="text-sm font-bold text-yellow-800">Motivo:</p><p class="text-sm text-yellow-700">' + motivo + '</p></div></div></body></html>';
}

function getApprovalPage(orden, token, costosAdicionales, totalCostos) {
  const n = String(orden.numero_orden).padStart(6, '0');
  const cliente = orden.cliente_nombre || 'Cliente';

  // Calcular subtotal desde servicios_seleccionados
  let subtotalServicios = 0;
  if (orden.servicios_seleccionados) {
    try {
      const parsed = typeof orden.servicios_seleccionados === 'string'
        ? JSON.parse(orden.servicios_seleccionados)
        : orden.servicios_seleccionados;
      if (Array.isArray(parsed)) {
        parsed.forEach(function(s) {
          subtotalServicios += Number(s.precio_final || s.precio_sugerido || 0);
        });
      }
    } catch (e) {}
  }

  const montoBase = Number(orden.monto_total || 0);
  const subtotalBase = Math.max(montoBase, subtotalServicios);
  const montoFinal = subtotalBase + totalCostos;
  const total = montoFinal.toLocaleString('es-CL');
  const abono = (orden.monto_abono || 0).toLocaleString('es-CL');
  const esCerrada = orden.estado_trabajo === 'Cerrada' || orden.estado === 'Aprobada';
  const restanteNum = esCerrada ? 0 : Math.max(0, montoFinal - Number(orden.monto_abono || 0));
  const restante = restanteNum.toLocaleString('es-CL');

  // Build diagnosis HTML using new checkbox format (Tailwind style)
  const diagnosticoHtml = buildDiagnosticoHtmlTailwind(orden, '🔧 Diagnóstico');

  // Checklist del vehículo
  const checklistHtml = buildChecklistHtmlTailwind(orden);

  // Costos adicionales HTML
  var costosHtmlSection = '';
  if (costosAdicionales && costosAdicionales.length > 0) {
    costosHtmlSection += '<div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">';
    costosHtmlSection += '<h3 class="font-bold text-lg mb-3 text-amber-800">📋 Gastos Adicionales</h3>';
    costosAdicionales.forEach(function(c) {
      const catLabel = c.categoria === 'Repuestos/Materiales' ? 'Repuesto' : 'Mano de Obra';
      const catColor = c.categoria === 'Repuestos/Materiales' ? 'bg-gray-200 text-gray-700' : 'bg-amber-200 text-amber-800';
      costosHtmlSection += '<div class="flex justify-between items-center py-2 border-b border-amber-100 last:border-b-0">';
      costosHtmlSection += '<div class="flex items-center gap-2">';
      costosHtmlSection += '<span class="text-xs px-2 py-0.5 rounded-full font-bold ' + catColor + '">' + catLabel + '</span>';
      costosHtmlSection += '<span class="text-sm">' + (c.concepto || 'Gasto adicional') + '</span>';
      costosHtmlSection += '</div>';
      costosHtmlSection += '<span class="font-bold text-red-600">$' + Number(c.monto || 0).toLocaleString('es-CL') + '</span>';
      costosHtmlSection += '</div>';
    });
    costosHtmlSection += '<div class="mt-3 pt-2 border-t border-amber-300 text-sm text-amber-700">';
    costosHtmlSection += '<span>Base: $' + montoBase.toLocaleString('es-CL') + ' + Extras: $' + totalCostos.toLocaleString('es-CL') + ' = <strong>$' + montoFinal.toLocaleString('es-CL') + '</strong></span>';
    costosHtmlSection += '</div>';
    costosHtmlSection += '</div>';
  }

  var html = '<!DOCTYPE html>';
  html += '<html lang="es">';
  html += '<head>';
  html += '<meta charset="UTF-8">';
  html += '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">';
  html += '<title>Aprobar Orden #' + n + '</title>';
  html += '<script src="https://cdn.tailwindcss.com"><\/script>';
  html += '<style>';
  html += '#sig-canvas { touch-action: none; background: white; border-radius: 10px; cursor: crosshair; border: 2px solid #e5e7eb; }';
  html += '.btn-clear { position: absolute; top: 10px; right: 10px; z-index: 50; background: white; border: 2px solid #ef4444; color: #ef4444; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; }';
  html += '.signature-container { position: relative; }';
  html += '</style>';
  html += '</head>';
  html += '<body class="p-4" style="font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh;">';
  html += '<div class="max-w-2xl mx-auto">';
  html += '<img src="/banner.jpeg" alt="SGC" style="width:100%;max-width:600px;height:auto;display:block;margin:0 auto;border-radius:12px 12px 0 0;box-shadow:0 4px 15px rgba(0,0,0,0.15);">';
  html += '<div class="bg-white shadow-2xl overflow-hidden">';
  html += '<div class="bg-gradient-to-r from-red-800 to-red-600 p-4 text-center">';
  html += '<h1 class="text-white text-2xl font-black">SGC</h1>';
  html += '<p class="text-red-200 text-sm">ORDEN DE TRABAJO #' + n + '</p>';
  html += '</div>';
  html += '</div>';
  html += '<div class="bg-white shadow-2xl p-4 md:p-6">';
  html += '<div class="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-r-lg">';
  html += '<p class="text-blue-800"><strong>Estimado/a ' + cliente + ':</strong></p>';
  html += '<p class="text-blue-700 mt-2">Ha recibido una <strong>ORDEN DE TRABAJO</strong> de parte de <strong>SGC</strong></p>';
  html += '</div>';
  html += '<div class="bg-gray-50 rounded-xl p-4 mb-6">';
  html += '<h3 class="font-bold text-lg mb-3 text-gray-800">📋 Información de la Orden</h3>';
  html += '<div class="grid grid-cols-2 gap-3 text-sm">';
  html += '<div><span class="text-gray-600">N° Orden:</span><p class="font-bold text-red-700">' + n + '</p></div>';
  html += '<div><span class="text-gray-600">Patente:</span><p class="font-bold text-red-700">' + orden.patente_placa + '</p></div>';
  html += '<div><span class="text-gray-600">Fecha:</span><p class="font-bold">' + (orden.fecha_ingreso || 'N/A') + ' ' + (orden.hora_ingreso || '') + '</p></div>';
  html += '<div><span class="text-gray-600">Técnico:</span><p class="font-bold">' + (orden.recepcionista || 'N/A') + '</p></div>';
  html += '</div>';
  html += '</div>';
  html += '<div class="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-4 mb-6 text-white">';
  html += '<h3 class="font-bold text-lg mb-3">💰 Valores</h3>';
  html += '<div class="text-center bg-white/20 rounded-lg p-2 mb-2"><p class="text-xs opacity-80">Subtotal Servicios</p><p class="font-bold text-lg">$' + subtotalServicios.toLocaleString('es-CL') + '</p></div>';
  html += '<div class="grid grid-cols-3 gap-3 text-center">';
  html += '<div class="bg-white/20 rounded-lg p-3">';
  html += '<p class="text-xs opacity-80">Total</p>';
  html += '<p class="font-bold text-xl">$' + total + '</p>';
  html += '</div>';
  html += '<div class="bg-white/20 rounded-lg p-3">';
  html += '<p class="text-xs opacity-80">Abono</p>';
  html += '<p class="font-bold text-xl">$' + abono + '</p>';
  html += '</div>';
  html += '<div class="bg-white/20 rounded-lg p-3">';
  html += '<p class="text-xs opacity-80">Restante</p>';
  html += '<p class="font-bold text-xl' + (esCerrada ? ' text-green-300' : '') + '">$' + restante + (esCerrada ? ' ✓' : '') + '</p>';
  html += '</div>';
  html += '</div>';
  html += '</div>';
  // Domicilio section
  var domDist2 = Number(orden.distancia_km || 0);
  var domCargo2 = Number(orden.cargo_domicilio || 0);
  html += '<div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">';
  html += '<h3 class="font-bold text-lg mb-3 text-blue-800"><i class="fas fa-truck me-2"></i>Domicilio</h3>';
  html += '<div class="grid grid-cols-2 gap-3 text-center">';
  html += '<div><p class="text-xs text-gray-500">Distancia recorrida</p><p class="font-bold text-lg">' + (domDist2 > 0 ? domDist2.toFixed(1) + ' km' : 'N/A') + '</p></div>';
  html += '<div><p class="text-xs text-gray-500">Cargo por domicilio</p><p class="font-bold text-lg ' + (domCargo2 > 0 ? 'text-red-600' : (domDist2 > 0 ? 'text-green-600' : 'text-gray-400')) + '">' + (domDist2 > 0 ? (domCargo2 > 0 ? '$' + domCargo2.toLocaleString('es-CL') : 'Gratis') : 'No calculado') + '</p></div>';
  html += '</div>';
  if (domDist2 > 0) {
    html += '<p class="text-xs text-gray-500 mt-2"><em>NOTA: Este valor NO esta incluido en el total. Pago directo al tecnico.</em></p>';
  }
  html += '</div>';
  // Sección de costos adicionales
  html += costosHtmlSection;
  // Sección de diagnóstico (new checkbox format)
  html += '<div class="mb-6">';
  html += diagnosticoHtml;
  html += '</div>';
  // Sección de checklist del vehículo
  html += checklistHtml;
  html += '<div class="mb-6">';
  html += '<h3 class="font-bold text-lg mb-3 text-gray-800">✍️ Firma para Aprobar</h3>';
  html += '<div class="signature-container">';
  html += '<button type="button" onclick="limpiarFirma()" class="btn-clear">X Borrar</button>';
  html += '<canvas id="sig-canvas" height="250"></canvas>';
  html += '</div>';
  html += '<p class="text-sm text-gray-600 mt-2 text-center">Nombre: <strong>' + cliente + '</strong> | RUT: <strong>' + (orden.cliente_rut || 'N/A') + '</strong></p>';
  html += '</div>';
  html += '<div class="bg-gray-100 rounded-lg p-4 mb-6 text-sm text-gray-700">';
  html += '<p class="mb-2"><strong>Al firmar usted autoriza:</strong></p>';
  html += '<ul class="list-disc list-inside space-y-1">';
  html += '<li>La intervención del vehículo</li>';
  html += '<li>Pruebas de carretera necesarias</li>';
  html += '<li>La empresa no se responsabiliza por objetos no declarados</li>';
  html += '</ul>';
  html += '</div>';
  html += '<div class="grid grid-cols-2 gap-4">';
  html += '<button onclick="cancelarOrden()" class="bg-red-500 hover:bg-red-600 text-white font-bold py-4 px-6 rounded-xl transition transform hover:scale-105">❌ Cancelar</button>';
  html += '<button onclick="aprobarOrden()" id="btnAprobar" class="bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-xl transition transform hover:scale-105">✅ Aceptar y Firmar</button>';
  html += '</div>';
  html += '</div>';
  html += '<div class="bg-white rounded-b-2xl shadow-2xl p-4 text-center text-sm text-gray-600">';
  html += '<p>SGC</p>';
  html += '<p class="text-xs">Padre Alberto Hurtado 3596, Pedro Aguirre Cerda</p>';
  html += '<p class="text-xs">+56 9 3902 6185</p>';
  html += '</div>';
  html += '</div>';
  html += '<script>';
  html += 'var canvas = document.getElementById("sig-canvas");';
  html += 'var ctx = canvas.getContext("2d");';
  html += 'var drawing = false;';
  html += 'var TOKEN = "' + token + '";';
  html += 'function resizeCanvas() {';
  html += '  var container = canvas.parentElement;';
  html += '  var rect = container.getBoundingClientRect();';
  html += '  canvas.width = rect.width - 24;';
  html += '  canvas.height = 250;';
  html += '  ctx.lineWidth = 4;';
  html += '  ctx.lineCap = "round";';
  html += '  ctx.strokeStyle = "#000000";';
  html += '}';
  html += 'window.onload = resizeCanvas;';
  html += 'window.onresize = resizeCanvas;';
  html += 'function getPos(e) {';
  html += '  var rect = canvas.getBoundingClientRect();';
  html += '  var clientX = e.clientX;';
  html += '  var clientY = e.clientY;';
  html += '  if (e.touches && e.touches.length > 0) {';
  html += '    clientX = e.touches[0].clientX;';
  html += '    clientY = e.touches[0].clientY;';
  html += '  }';
  html += '  return { x: clientX - rect.left, y: clientY - rect.top };';
  html += '}';
  html += 'function startDraw(e) {';
  html += '  e.preventDefault();';
  html += '  drawing = true;';
  html += '  var pos = getPos(e);';
  html += '  ctx.beginPath();';
  html += '  ctx.moveTo(pos.x, pos.y);';
  html += '}';
  html += 'function moveDraw(e) {';
  html += '  if (!drawing) return;';
  html += '  e.preventDefault();';
  html += '  var pos = getPos(e);';
  html += '  ctx.lineTo(pos.x, pos.y);';
  html += '  ctx.stroke();';
  html += '}';
  html += 'function endDraw() {';
  html += '  drawing = false;';
  html += '  ctx.beginPath();';
  html += '}';
  html += 'canvas.addEventListener("mousedown", startDraw);';
  html += 'canvas.addEventListener("mousemove", moveDraw);';
  html += 'canvas.addEventListener("mouseup", endDraw);';
  html += 'canvas.addEventListener("mouseout", endDraw);';
  html += 'canvas.addEventListener("touchstart", startDraw, { passive: false });';
  html += 'canvas.addEventListener("touchmove", moveDraw, { passive: false });';
  html += 'canvas.addEventListener("touchend", endDraw);';
  html += 'function limpiarFirma() {';
  html += '  ctx.clearRect(0, 0, canvas.width, canvas.height);';
  html += '}';
  html += 'async function aprobarOrden() {';
  html += '  var imageData = canvas.toDataURL();';
  html += '  var blank = document.createElement("canvas");';
  html += '  blank.width = canvas.width;';
  html += '  blank.height = canvas.height;';
  html += '  if (canvas.toDataURL() === blank.toDataURL()) {';
  html += '    alert("Por favor, firme antes de aceptar la orden.");';
  html += '    return;';
  html += '  }';
  html += '  var btn = document.getElementById("btnAprobar");';
  html += '  btn.innerHTML = "Procesando...";';
  html += '  btn.disabled = true;';
  html += '  try {';
  html += '    console.log("Enviando firma...");';
  html += '    var response = await fetch("/api/aprobar-orden", {';
  html += '      method: "POST",';
  html += '      headers: { "Content-Type": "application/json" },';
  html += '      body: JSON.stringify({ token: TOKEN, firma: imageData })';
  html += '    });';
  html += '    console.log("Status:", response.status);';
  html += '    var data = await response.json();';
  html += '    console.log("Data:", data);';
  html += '    if (data.success) {';
  html += '      mostrarExito(data.orden);';
  html += '    } else {';
  html += '      alert("Error al aprobar: " + data.error);';
  html += '      btn.innerHTML = "✅ Aceptar y Firmar";';
  html += '      btn.disabled = false;';
  html += '    }';
  html += '  } catch (error) {';
  html += '    console.error("Error:", error);';
  html += '    alert("Error de conexión: " + error.message);';
  html += '    btn.innerHTML = "✅ Aceptar y Firmar";';
  html += '    btn.disabled = false;';
  html += '  }';
  html += '}';
  html += 'async function cancelarOrden() {';
  html += '  var motivo = prompt("¿Cuál es el motivo de la cancelación?");';
  html += '  if (!confirm("¿Está seguro de cancelar esta orden de trabajo?")) return;';
  html += '  try {';
  html += '    var response = await fetch("/api/cancelar-orden", {';
  html += '      method: "POST",';
  html += '      headers: { "Content-Type": "application/json" },';
  html += '      body: JSON.stringify({ token: TOKEN, motivo: motivo })';
  html += '    });';
  html += '    var data = await response.json();';
  html += '    if (data.success) {';
  html += '      mostrarCancelada(data.orden);';
  html += '    } else {';
  html += '      alert("Error al cancelar: " + data.error);';
  html += '    }';
  html += '  } catch (error) {';
  html += '    console.error("Error:", error);';
  html += '    alert("Error de conexión");';
  html += '  }';
  html += '}';
  html += 'function mostrarExito(orden) {';
  html += '  var numeroOrden = String(orden.numero_orden).padStart(6, "0");';
  html += '  var verFacturaUrl = window.location.origin + "/ver-ot?token=" + orden.token;';
  html += '  var mensajeWhatsapp = "Hola, he aprobado la orden de trabajo #" + numeroOrden + ".\\n\\nPuede ver y descargar su factura en línea aquí: " + verFacturaUrl;';
  html += '  var whatsappUrl = "https://wa.me/56939026185?text=" + encodeURIComponent(mensajeWhatsapp);';
  html += '  var successHTML = "";';
  html += '  successHTML += "<!DOCTYPE html>";';
  html += '  successHTML += "<html><head><meta charset=\\"UTF-8\\"><title>Orden Aprobada</title>";';
  html += '  successHTML += "<script src=\\"https://cdn.tailwindcss.com\\"><\\/script>";';
  html += '  successHTML += "</head>";';
  html += '  successHTML += "<body class=\\"bg-green-100 flex items-center justify-center min-h-screen p-4\\">";';
  html += '  successHTML += "<div class=\\"bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center\\">";';
  html += '  successHTML += "<div class=\\"text-8xl mb-4\\">✅</div>";';
  html += '  successHTML += "<h1 class=\\"text-3xl font-black text-green-700 mb-2\\">¡Orden Aprobada!</h1>";';
  html += '  successHTML += "<p class=\\"text-gray-600 mb-6\\">Su firma ha sido guardada exitosamente.</p>";';
  html += '  successHTML += "<div class=\\"bg-green-50 rounded-xl p-4 mb-6\\">";';
  html += '  successHTML += "<p class=\\"text-sm text-gray-600\\">Orden N°</p>";';
  html += '  successHTML += "<p class=\\"text-2xl font-bold text-green-700\\">" + numeroOrden + "</p>";';
  html += '  successHTML += "<p class=\\"text-sm text-gray-600 mt-2\\">Patente: <strong>" + orden.patente_placa + "</strong></p>";';
  html += '  successHTML += "</div>";';
  html += '  successHTML += "<a href=\\"" + verFacturaUrl + "\\" target=\\"_blank\\" class=\\"block w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-xl mb-3 transition\\">📄 Ver Factura en Línea</a>";';
  html += '  successHTML += "<a href=\\"" + whatsappUrl + "\\" target=\\"_blank\\" class=\\"block w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-xl mb-3 transition\\">📱 Enviar Factura por WhatsApp</a>";';
  html += '  successHTML += "<button onclick=\\"cerrarPagina()\\" class=\\"w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-xl mb-3 transition\\">✅ Finalizar</button>";';
  html += '  successHTML += "<p class=\\"text-sm text-gray-500 mt-4\\">¡Gracias por confiar en SGC!</p>";';
  html += '  successHTML += "</div>";';
  html += '  successHTML += "<script>";';
  html += '  successHTML += "function cerrarPagina() {";';
  html += '  successHTML += "  try { window.close(); } catch(e) {}";';
  html += '  successHTML += "  setTimeout(function() { alert(\\"Puede cerrar esta ventana ahora.\\"); }, 100);";';
  html += '  successHTML += "}";';
  html += '  successHTML += "<\\/script>";';
  html += '  successHTML += "</body></html>";';
  html += '  document.body.innerHTML = successHTML;';
  html += '}';
  html += 'function mostrarCancelada(orden) {';
  html += '  var numeroOrden = String(orden.numero_orden).padStart(6, "0");';
  html += '  var motivo = orden.motivo_cancelacion || "No especificado";';
  html += '  var cancelHTML = "";';
  html += '  cancelHTML += "<!DOCTYPE html>";';
  html += '  cancelHTML += "<html><head><meta charset=\\"UTF-8\\"><title>Orden Cancelada</title>";';
  html += '  cancelHTML += "<script src=\\"https://cdn.tailwindcss.com\\"><\\/script>";';
  html += '  cancelHTML += "</head>";';
  html += '  cancelHTML += "<body class=\\"bg-red-100 flex items-center justify-center min-h-screen p-4\\">";';
  html += '  cancelHTML += "<div class=\\"bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center\\">";';
  html += '  cancelHTML += "<div class=\\"text-8xl mb-4\\">❌</div>";';
  html += '  cancelHTML += "<h1 class=\\"text-3xl font-black text-red-700 mb-2\\">Orden Cancelada</h1>";';
  html += '  cancelHTML += "<p class=\\"text-gray-600 mb-4\\">Esta orden de trabajo ha sido cancelada.</p>";';
  html += '  cancelHTML += "<div class=\\"bg-red-50 rounded-xl p-4 mb-6\\">";';
  html += '  cancelHTML += "<p class=\\"text-sm text-gray-600\\">Orden N°</p>";';
  html += '  cancelHTML += "<p class=\\"text-2xl font-bold text-red-700\\">" + numeroOrden + "</p>";';
  html += '  cancelHTML += "<p class=\\"text-xs text-gray-500 mt-2\\">Fecha: " + (orden.fecha_cancelacion || "N/A") + "</p>";';
  html += '  cancelHTML += "</div>";';
  html += '  cancelHTML += "<div class=\\"bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6\\">";';
  html += '  cancelHTML += "<p class=\\"text-sm font-bold text-yellow-800\\">Motivo:</p>";';
  html += '  cancelHTML += "<p class=\\"text-sm text-yellow-700\\">" + motivo + "</p>";';
  html += '  cancelHTML += "</div>";';
  html += '  cancelHTML += "</div>";';
  html += '  cancelHTML += "</body></html>";';
  html += '  document.body.innerHTML = cancelHTML;';
  html += '}';
  html += '<\/script>';
  html += '</body>';
  html += '</html>';

  return html;
}
