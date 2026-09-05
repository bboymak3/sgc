export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return getHTMLResponse('Token no proporcionado', 'Debe proporcionar un token para ver la orden.', false);
  }

  try {
    // Buscar orden por el token
    const orden = await env.DB.prepare(`
      SELECT
        o.*,
        c.nombre as cliente_nombre,
        c.telefono as cliente_telefono,
        c.rut as cliente_rut,
        t.nombre as tecnico_nombre
      FROM OrdenesTrabajo o
      LEFT JOIN Clientes c ON o.cliente_id = c.id
      LEFT JOIN Tecnicos t ON o.tecnico_asignado_id = t.id
      WHERE o.token = ?
    `).bind(token).first();

    if (!orden) {
      return getHTMLResponse('Orden no encontrada', 'El link no es válido o la orden no existe.', false);
    }

    // Obtener costos adicionales
    let costosAdicionales = [];
    let totalCostos = 0;
    try {
      const { results } = await env.DB.prepare(
        'SELECT concepto, monto, categoria FROM CostosAdicionales WHERE orden_id = ? ORDER BY fecha_registro DESC'
      ).bind(orden.id).all();
      costosAdicionales = results || [];
      totalCostos = costosAdicionales.reduce((sum, c) => sum + Number(c.monto || 0), 0);
    } catch (e) {
      console.log('CostosAdicionales no disponible:', e.message);
    }

    const numeroFormateado = String(orden.numero_orden).padStart(6, '0');
    const html = generateOTViewerPage(orden, numeroFormateado, token, costosAdicionales, totalCostos);

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });

  } catch (error) {
    console.error('Error al ver orden:', error);
    return new Response('Error interno del servidor', { status: 500 });
  }
}

function getHTMLResponse(titulo, mensaje, esExito) {
  const color = esExito ? '#28a745' : '#dc3545';
  const icono = esExito ? '✓' : '✗';

  const html = '' +
    '<!DOCTYPE html>' +
    '<html lang="es">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>' + titulo + ' - SGC</title>' +
    '<script src="https://cdn.tailwindcss.com"><\/script>' +
    '</head>' +
    '<body class="bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center min-h-screen p-4">' +
    '<div class="bg-white rounded-2xl shadow-2xl p-8 text-center max-w-md">' +
    '<div style="font-size: 5rem; color: ' + color + ';">' + icono + '</div>' +
    '<h3 class="mt-4 text-xl font-bold text-gray-800">' + titulo + '</h3>' +
    '<p class="text-gray-500 mt-2">' + mensaje + '</p>' +
    '</div>' +
    '</body>' +
    '</html>';

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// ============================================
// HELPER: Build diagnosis items from new or old format
// ============================================
function buildDiagnosticoItems(orden) {
  let checks = [];
  let observaciones = orden.diagnostico_observaciones || '';

  if (orden.diagnostico_checks) {
    try {
      const parsed = typeof orden.diagnostico_checks === 'string'
        ? JSON.parse(orden.diagnostico_checks)
        : orden.diagnostico_checks;
      if (Array.isArray(parsed) && parsed.length > 0) {
        checks = parsed;
      }
    } catch (e) {}
  }

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
// HELPER: Diagnosis as styled HTML (Tailwind)
// ============================================
function buildDiagnosticoHtml(orden, title) {
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
    html += '<div class="overflow-x-auto rounded-lg border border-gray-200"><table class="w-full text-sm" style="table-layout:fixed;"><colgroup><col style="width:30%;"><col style="width:16%;"><col style="width:10%;"><col style="width:16%;"><col style="width:12%;"><col style="width:16%;"></colgroup><thead class="bg-gray-100"><tr><th class="text-left p-2">Servicio</th><th class="text-left p-2">Categoría</th><th class="text-left p-2">Tipo</th><th class="text-left p-2">Técnico</th><th class="text-left p-2">Descripción</th><th class="text-right p-2">Precio</th></tr></thead><tbody>';
    servicios.forEach(function(s) {
      const precio = Number(s.precio_final || s.precio_sugerido || 0);
      subtotal += precio;
      if (s.editado) hasEdited = true;
      const tipo = s.tipo_comision === 'mano_obra' ? '<span class="text-xs px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 font-bold">MO</span>' : '<span class="text-xs px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700 font-bold">Rep</span>';
      const editMark = s.editado ? ' <span class="text-xs text-amber-500">*</span>' : '';
      var tecnicoLabel = s.tecnico_nombre ? '<span class="text-xs px-1.5 py-0.5 rounded-full bg-cyan-200 text-cyan-800 font-bold">' + s.tecnico_nombre + '</span>' : '-';
      var descLabel = s.descripcion ? '<span class="text-gray-500 text-xs">' + s.descripcion + '</span>' : '-';
      html += '<tr class="border-t border-gray-100"><td class="p-2 truncate">' + (s.nombre || s.nombre_servicio || '') + editMark + '</td><td class="p-2"><span class="text-xs">' + (s.categoria || '') + '</span></td><td class="p-2 text-center">' + tipo + '</td><td class="p-2 text-center truncate">' + tecnicoLabel + '</td><td class="p-2 truncate">' + descLabel + '</td><td class="p-2 text-right font-bold text-red-600 whitespace-nowrap">$' + precio.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + '</td></tr>';
    });
    html += '<tr class="bg-amber-50 border-t-2 border-amber-300"><td class="p-2 font-bold" colspan="5">Subtotal Servicios</td><td class="p-2 text-right font-black text-lg text-red-600 whitespace-nowrap">$' + subtotal.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + '</td></tr>';
    html += '</tbody></table></div>';
    if (hasEdited) {
      html += '<p class="text-xs text-gray-500 mt-2">* Precio editado manualmente</p>';
    }
    const obs = orden.diagnostico_observaciones || '';
    if (obs) {
      html += '<div class="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200"><h4 class="font-bold text-amber-700 mb-1 text-sm">👁️ OBSERVACIONES</h4><p class="text-gray-600 text-sm">' + obs + '</p></div>';
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
function buildChecklistHtml(orden) {
  const items = [];
  const nivel = orden.nivel_combustible || '';
  if (orden.check_paragolfe_delantero_der) items.push('Parachoques delantero derecho');
  if (orden.check_puerta_delantera_der) items.push('Puerta delantera derecha');
  if (orden.check_puerta_trasera_der) items.push('Puerta trasera derecha');
  if (orden.check_paragolfe_trasero_izq) items.push('Parachoques trasero izquierdo');
  if (orden.check_otros_carroceria) items.push(orden.check_otros_carroceria);

  if (!nivel && items.length === 0) return '';

  let html = '<div class="bg-gray-50 rounded-xl p-4">';
  html += '<h3 class="font-bold text-lg mb-3 text-gray-800">🚗 Checklist del Vehículo</h3>';
  html += '<div class="space-y-3">';
  if (nivel) {
    html += '<div class="flex items-center gap-2"><span class="text-xs px-2 py-1 rounded-full bg-blue-200 text-blue-800 font-bold">Combustible</span><span class="text-sm">' + nivel + '</span></div>';
  }
  if (items.length > 0) {
    html += '<div class="text-xs text-gray-500 font-bold uppercase mb-1">Estado de Carrocería:</div>';
    items.forEach(function(item) {
      html += '<div class="flex items-center gap-2"><span class="text-yellow-500">⚠️</span><span class="text-sm">' + item + '</span></div>';
    });
  }
  html += '</div></div>';
  return html;
}

// ============================================
// MAIN: Generate the OT Viewer page (Tailwind)
// ============================================
function generateOTViewerPage(orden, numeroFormateado, token, costosAdicionales, totalCostos) {
  const estadoClass = obtenerClaseEstado(orden.estado);

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
  // Usar el mayor entre monto_total y subtotalServicios para el cálculo
  const subtotalBase = Math.max(montoBase, subtotalServicios);
  const montoFinal = subtotalBase + totalCostos;
  const total = montoFinal.toLocaleString('es-CL');
  const abono = (orden.monto_abono || 0).toLocaleString('es-CL');
  // Si la orden está cerrada, restante = 0
  const esCerrada = orden.estado_trabajo === 'Cerrada' || orden.estado === 'Aprobada';
  const restanteNum = esCerrada ? 0 : Math.max(0, montoFinal - Number(orden.monto_abono || 0));
  const restante = restanteNum.toLocaleString('es-CL');

  // Domicilio data
  const distanciaKm = Number(orden.distancia_km || 0);
  const cargoDomicilio = Number(orden.cargo_domicilio || 0);

  // Build sections
  const diagnosticoHtml = buildDiagnosticoHtml(orden, '🔧 DIAGNÓSTICO / TRABAJOS');
  const checklistHtml = buildChecklistHtml(orden);

  // Procesar notas
  let notasCierre = '';
  let otrasNotas = '';
  if (orden.notas) {
    const notasArray = orden.notas.split('\n');
    for (const nota of notasArray) {
      if (nota.startsWith('Cierre: ')) {
        notasCierre = nota.replace('Cierre: ', '');
      } else {
        otrasNotas += (otrasNotas ? '\n' : '') + nota;
      }
    }
  }

  // Firma
  let firmaHtml = '';
  if (orden.firma_imagen) {
    firmaHtml = '<div class="bg-gray-50 rounded-xl p-4 text-center">' +
      '<h3 class="font-bold text-lg mb-3 text-gray-800">✍️ Firma del Cliente</h3>' +
      '<img src="' + orden.firma_imagen + '" alt="Firma" style="max-width:300px;border:1px solid #ddd;border-radius:8px;display:inline-block;">' +
      '<p class="text-xs text-gray-500 mt-2">Fecha de aprobación: ' + (orden.fecha_aprobacion || 'N/A') + '</p>' +
      '</div>';
  } else {
    firmaHtml = '<div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">' +
      '<p class="text-amber-700 text-sm"><strong>⚠️ Esta orden aún no ha sido firmada por el cliente.</strong></p>' +
      '</div>';
  }

  // Costos adicionales
  var costosHtmlSection = '';
  if (costosAdicionales && costosAdicionales.length > 0) {
    costosHtmlSection += '<div class="bg-amber-50 border border-amber-200 rounded-xl p-4">';
    costosHtmlSection += '<h3 class="font-bold text-lg mb-3 text-amber-800">📋 Gastos Adicionales</h3>';
    costosAdicionales.forEach(function(c) {
      const catLabel = c.categoria === 'Repuestos/Materiales' ? 'Repuesto' : 'Mano de Obra';
      const catColor = c.categoria === 'Repuestos/Materiales' ? 'bg-gray-200 text-gray-700' : 'bg-amber-200 text-amber-800';
      costosHtmlSection += '<div class="flex justify-between items-center py-2 border-b border-amber-100 last:border-b-0">';
      costosHtmlSection += '<div class="flex items-center gap-2">';
      costosHtmlSection += '<span class="text-xs px-2 py-0.5 rounded-full font-bold ' + catColor + '">' + catLabel + '</span>';
      costosHtmlSection += '<span class="text-sm">' + (c.concepto || 'Gasto adicional') + '</span>';
      costosHtmlSection += '</div>';
      costosHtmlSection += '<span class="font-bold text-red-600 whitespace-nowrap">$' + Number(c.monto || 0).toLocaleString('es-CL') + '</span>';
      costosHtmlSection += '</div>';
    });
    costosHtmlSection += '<div class="mt-3 pt-2 border-t border-amber-300 text-sm text-amber-700">';
    costosHtmlSection += '<span>Base: $' + montoBase.toLocaleString('es-CL') + ' + Extras: $' + totalCostos.toLocaleString('es-CL') + ' = <strong>$' + montoFinal.toLocaleString('es-CL') + '</strong></span>';
    costosHtmlSection += '</div>';
    costosHtmlSection += '</div>';
  }

  // Notas
  let notasHtml = '';
  if (notasCierre || otrasNotas) {
    notasHtml += '<div class="bg-blue-50 border border-blue-200 rounded-xl p-4">';
    notasHtml += '<h3 class="font-bold text-lg mb-3 text-blue-800">📝 Notas</h3>';
    if (notasCierre) {
      notasHtml += '<div class="mb-2"><span class="text-xs px-2 py-0.5 rounded-full bg-green-200 text-green-800 font-bold">Cierre</span> <span class="text-sm ml-1">' + notasCierre + '</span></div>';
    }
    if (otrasNotas) {
      notasHtml += '<p class="text-sm text-gray-600">' + otrasNotas.replace(/\n/g, '<br>') + '</p>';
    }
    notasHtml += '</div>';
  }

  // Técnico asignado
  const tecnicoLabel = orden.tecnico_nombre || 'No asignado';

  // Método de pago
  const metodoPagoHtml = orden.metodo_pago ? '<p class="text-center text-sm text-gray-500 mt-3"><strong>Método de Pago:</strong> ' + orden.metodo_pago + '</p>' : '';

  var html = '<!DOCTYPE html>';
  html += '<html lang="es">';
  html += '<head>';
  html += '<meta charset="UTF-8">';
  html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
  html += '<title>Orden de Trabajo #' + numeroFormateado + ' - SGC</title>';
  html += '<script src="https://cdn.tailwindcss.com"><\/script>';
  html += '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">';
  html += '<style>';
  html += '@media print { .no-print { display: none !important; } body { background: white !important; } }';
  html += '</style>';
  html += '</head>';
  html += '<body class="p-4" style="font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh;">';
  html += '<div class="max-w-2xl mx-auto">';

  // Banner
  html += '<img src="/banner.jpeg" alt="SGC" style="width:100%;max-width:600px;height:auto;display:block;margin:0 auto;border-radius:12px 12px 0 0;box-shadow:0 4px 15px rgba(0,0,0,0.15);">';

  // Header card
  html += '<div class="bg-white shadow-2xl overflow-hidden">';
  html += '<div class="bg-gradient-to-r from-red-800 to-red-600 p-4 text-center">';
  html += '<h1 class="text-white text-2xl font-black">SGC</h1>';
  html += '<p class="text-red-200 text-sm">ORDEN DE TRABAJO #' + numeroFormateado + '</p>';
  html += '</div>';
  html += '</div>';

  // Main content card
  html += '<div class="bg-white shadow-2xl p-4 md:p-6">';

  // Action buttons (top)
  html += '<div class="flex justify-between items-center mb-4 no-print">';
  html += '<span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ' + estadoClass + '">' + (orden.estado || 'N/A') + '</span>';
  html += '<div class="flex gap-2">';
  html += '<button class="bg-red-700 hover:bg-red-800 text-white px-3 py-2 rounded-lg text-sm font-bold shadow" onclick="descargarPDF()"><i class="fas fa-download mr-1"></i>PDF</button>';
  html += '<button class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-bold" onclick="window.print()"><i class="fas fa-print mr-1"></i>Imprimir</button>';
  html += '</div>';
  html += '</div>';

  // Información de la Orden (client + vehicle)
  html += '<div class="bg-gray-50 rounded-xl p-4 mb-6">';
  html += '<h3 class="font-bold text-lg mb-3 text-gray-800">📋 Información de la Orden</h3>';
  html += '<div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">';
  html += '<div><span class="text-gray-500">N° Orden:</span><p class="font-bold text-red-700">' + numeroFormateado + '</p></div>';
  html += '<div><span class="text-gray-500">Patente:</span><p class="font-bold text-red-700 text-lg">' + (orden.patente_placa || 'N/A') + '</p></div>';
  html += '<div><span class="text-gray-500">Cliente:</span><p class="font-bold">' + (orden.cliente_nombre || 'N/A') + '</p></div>';
  html += '<div><span class="text-gray-500">RUT:</span><p class="font-bold">' + (orden.cliente_rut || 'N/A') + '</p></div>';
  html += '<div><span class="text-gray-500">Teléfono:</span><p class="font-bold">' + (orden.cliente_telefono || 'N/A') + '</p></div>';
  html += '<div><span class="text-gray-500">Recepcionista:</span><p class="font-bold">' + (orden.recepcionista || 'N/A') + '</p></div>';
  html += '<div><span class="text-gray-500">Fecha Ingreso:</span><p class="font-bold">' + (orden.fecha_ingreso || 'N/A') + ' ' + (orden.hora_ingreso || '') + '</p></div>';
  html += '<div><span class="text-gray-500">Técnico:</span><p class="font-bold">' + tecnicoLabel + '</p></div>';
  html += '<div><span class="text-gray-500">Marca/Modelo:</span><p class="font-bold">' + (orden.marca || 'N/A') + ' ' + (orden.modelo || '') + ' (' + (orden.anio || 'N/A') + ')</p></div>';
  html += '<div><span class="text-gray-500">Cilindrada:</span><p class="font-bold">' + (orden.cilindrada || 'N/A') + '</p></div>';
  html += '<div><span class="text-gray-500">Combustible:</span><p class="font-bold">' + (orden.combustible || 'N/A') + '</p></div>';
  html += '<div><span class="text-gray-500">Kilometraje:</span><p class="font-bold">' + (orden.kilometraje || 'N/A') + '</p></div>';
  if (orden.direccion) {
    html += '<div class="col-span-2"><span class="text-gray-500">Dirección:</span><p class="font-bold">' + orden.direccion + (orden.referencia_direccion ? ' — Ref: ' + orden.referencia_direccion : '') + '</p></div>';
  }
  html += '</div>';
  // Extra states
  if (orden.estado_trabajo === 'Cerrada') {
    html += '<div class="mt-2"><span class="text-xs px-2 py-0.5 rounded-full bg-green-200 text-green-800 font-bold">Orden cerrada</span>' + (orden.fecha_completado ? ' <span class="text-xs text-gray-500 ml-1">— ' + orden.fecha_completado + '</span>' : '') + '</div>';
  }
  html += '</div>';

  // Taller info
  html += '<div class="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">';
  html += '<h3 class="font-bold text-lg mb-2 text-red-800">🏢 Información del Taller</h3>';
  html += '<div class="grid grid-cols-1 gap-1 text-sm">';
  html += '<p class="text-gray-700"><strong>Empresa:</strong> SGC</p>';
  html += '<p class="text-gray-700"><strong>Dirección:</strong> Padre Alberto Hurtado 3596, Pedro Aguirre Cerda</p>';
  html += '<p class="text-gray-700"><strong>Contactos:</strong> +56 9 3902 6185</p>';
  html += '<p class="text-gray-700"><strong>RRSS:</strong> @sgc</p>';
  html += '</div>';
  html += '</div>';

  // Valores (purple gradient card)
  html += '<div class="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-4 mb-6 text-white">';
  html += '<h3 class="font-bold text-lg mb-3">💰 Valores</h3>';
  // Subtotal Servicios siempre visible
  html += '<div class="text-center bg-white/20 rounded-lg p-2 mb-2"><p class="text-xs opacity-80">Subtotal Servicios</p><p class="font-bold text-lg">$' + subtotalServicios.toLocaleString('es-CL') + '</p></div>';
  if (totalCostos > 0) {
    // With extra costs
    html += '<div class="grid grid-cols-2 gap-2 text-center mb-2">';
    html += '<div class="bg-white/20 rounded-lg p-2"><p class="text-xs opacity-80">Base Original</p><p class="font-bold">$' + montoBase.toLocaleString('es-CL') + '</p></div>';
    html += '<div class="bg-white/20 rounded-lg p-2"><p class="text-xs opacity-80">Costos Extra</p><p class="font-bold text-yellow-200">+$' + totalCostos.toLocaleString('es-CL') + '</p></div>';
    html += '</div>';
    html += '<div class="text-center bg-white/20 rounded-lg p-3"><p class="text-xs opacity-80">TOTAL FINAL</p><p class="font-black text-2xl">$' + montoFinal.toLocaleString('es-CL') + '</p></div>';
  } else {
    html += '<div class="text-center bg-white/20 rounded-lg p-3 mb-2"><p class="text-xs opacity-80">Total</p><p class="font-black text-2xl">$' + total + '</p></div>';
  }
  html += '<div class="grid grid-cols-2 gap-2 text-center mt-2">';
  html += '<div class="bg-white/20 rounded-lg p-2"><p class="text-xs opacity-80">Abono</p><p class="font-bold text-lg">$' + abono + '</p></div>';
  html += '<div class="bg-white/20 rounded-lg p-2"><p class="text-xs opacity-80">Restante</p><p class="font-bold text-lg' + (esCerrada ? ' text-green-300' : '') + '">$' + restante + (esCerrada ? ' ✓' : '') + '</p></div>';
  html += '</div>';
  html += metodoPagoHtml;
  html += '</div>';

  // Costos adicionales
  if (costosHtmlSection) {
    html += '<div class="mb-6">' + costosHtmlSection + '</div>';
  }

  // Domicilio
  html += '<div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">';
  html += '<h3 class="font-bold text-lg mb-3 text-blue-800"><i class="fas fa-truck mr-2"></i>Domicilio</h3>';
  html += '<div class="grid grid-cols-2 gap-3 text-center">';
  html += '<div><p class="text-xs text-gray-500">Distancia recorrida</p><p class="font-bold text-lg">' + (distanciaKm > 0 ? distanciaKm.toFixed(1) + ' km' : 'N/A') + '</p></div>';
  html += '<div><p class="text-xs text-gray-500">Cargo por domicilio</p><p class="font-bold text-lg ' + (cargoDomicilio > 0 ? 'text-red-600' : (distanciaKm > 0 ? 'text-green-600' : 'text-gray-400')) + '">' + (distanciaKm > 0 ? (cargoDomicilio > 0 ? '$' + cargoDomicilio.toLocaleString('es-CL') : 'Gratis') : 'No calculado') + '</p></div>';
  html += '</div>';
  if (distanciaKm > 0) {
    html += '<p class="text-xs text-gray-500 mt-2"><em>NOTA: Este valor NO esta incluido en el total de la factura. El pago se realiza directamente al tecnico.</em></p>';
  }
  html += '</div>';

  // Diagnóstico y Trabajos
  html += '<div class="mb-6">' + diagnosticoHtml + '</div>';

  // Checklist
  if (checklistHtml) {
    html += '<div class="mb-6">' + checklistHtml + '</div>';
  }

  // Notas
  if (notasHtml) {
    html += '<div class="mb-6">' + notasHtml + '</div>';
  }

  // Firma
  html += '<div class="mb-6">' + firmaHtml + '</div>';

  // Validez y responsabilidad
  html += '<div class="bg-gray-100 rounded-lg p-4 text-sm text-gray-700">';
  html += '<p class="mb-2"><strong>Validez y Responsabilidad:</strong></p>';
  html += '<ul class="space-y-1 text-xs">';
  html += '<li>• El cliente autoriza la intervención del vehículo</li>';
  html += '<li>• Se autorizan pruebas de carretera necesarias</li>';
  html += '<li>• La empresa no se hace responsable por objetos no declarados</li>';
  html += '</ul>';
  html += '</div>';

  html += '</div>'; // end main content card

  // Footer
  html += '<div class="text-center py-3 text-gray-300 text-xs no-print">';
  html += '<p>Generado el ' + new Date().toLocaleString('es-CL') + '</p>';
  html += '</div>';

  html += '</div>'; // end container

  // PDF Script
  const costosJson = JSON.stringify(costosAdicionales || []);
  const totalCostosNum = totalCostos;
  const montoFinalNum = montoFinal;

  html += '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>';
  html += '<script>';
  html += 'function loadImage(src) { return new Promise(function(resolve) { var img = new Image(); img.crossOrigin = "anonymous"; var t = setTimeout(function() { resolve(null); }, 2000); img.onload = function() { clearTimeout(t); resolve(img); }; img.onerror = function() { clearTimeout(t); resolve(null); }; img.src = src; }); }';
  html += 'async function descargarPDF() {';
  html += '  const { jsPDF } = window.jspdf;';
  html += '  const doc = new jsPDF("p", "mm", "a4");';
  html += '  const ordenData = ' + JSON.stringify(orden) + ';';
  html += '  const costosData = ' + costosJson + ';';
  html += '  const totalExtras = ' + totalCostosNum + ';';
  html += '  const montoFinal = ' + montoFinalNum + ';';
  html += '  const numeroFormateado = "' + numeroFormateado + '";';
  html += '  const pageWidth = doc.internal.pageSize.getWidth();';
  html += '  const pageHeight = doc.internal.pageSize.getHeight();';
  html += '  const leftMargin = 10;';
  html += '  let yPos = 15;';
  html += '  var logoImg = await loadImage("/corto.jpg");';
  html += '  var bannerImg = await loadImage("/banner.jpeg");';
  html += '  if (logoImg) { doc.setGState(new doc.GState({ opacity: 0.08 })); var wmW = 80; var wmH = (logoImg.naturalHeight / logoImg.naturalWidth) * wmW; doc.addImage(logoImg, "JPEG", (pageWidth - wmW) / 2, (pageHeight - wmH) / 2, wmW, wmH); doc.setGState(new doc.GState({ opacity: 1 })); }';
  html += '  if (logoImg) { doc.addImage(logoImg, "JPEG", leftMargin, 5, 15, 10); }';
  html += '  if (bannerImg) { var bw = pageWidth - (leftMargin * 2); var bh = (bannerImg.naturalHeight / bannerImg.naturalWidth) * bw; var maxH = 30; var fbh = Math.min(bh, maxH); var fbw = (bannerImg.naturalWidth / bannerImg.naturalHeight) * fbh; doc.addImage(bannerImg, "JPEG", (pageWidth - fbw) / 2, yPos, fbw, fbh); yPos += fbh + 3; }';
  // Header
  html += '  doc.setFontSize(8); doc.setTextColor(128,128,128); doc.text("OT #" + numeroFormateado, pageWidth - 15, 10, { align: "right" });';
  html += '  doc.setFontSize(16); doc.setTextColor(168,0,0); doc.text("ORDEN DE TRABAJO", pageWidth / 2, yPos, { align: "center" }); yPos += 8;';
  html += '  doc.setFontSize(10); doc.text("SGC", pageWidth / 2, yPos, { align: "center" }); yPos += 10;';
  // Section 1: Info
  html += '  doc.setTextColor(0,0,0); doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("1. INFORMACION", leftMargin, yPos); yPos += 6; doc.setFont(undefined, "normal"); doc.setFontSize(7);';
  html += '  doc.text("Cliente: " + (ordenData.cliente_nombre || "N/A") + " | RUT: " + (ordenData.cliente_rut || "N/A"), leftMargin, yPos); yPos += 4;';
  html += '  doc.text("Telefono: " + (ordenData.cliente_telefono || "N/A") + " | Direccion: " + (ordenData.direccion || "N/A"), leftMargin, yPos); yPos += 4;';
  html += '  doc.text("Fecha: " + (ordenData.fecha_ingreso || "N/A") + " " + (ordenData.hora_ingreso || "") + " | Recepcionista: " + (ordenData.recepcionista || "N/A"), leftMargin, yPos); yPos += 10;';
  // Section 2: Vehiculo
  html += '  doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("2. DATOS DEL VEHICULO", leftMargin, yPos); yPos += 6; doc.setFont(undefined, "normal"); doc.setFontSize(7);';
  html += '  doc.text("Patente: " + (ordenData.patente_placa || "N/A") + " | Marca/Modelo: " + (ordenData.marca || "N/A") + " " + (ordenData.modelo || "") + " (" + (ordenData.anio || "N/A") + ")", leftMargin, yPos); yPos += 4;';
  html += '  doc.text("Cilindrada: " + (ordenData.cilindrada || "N/A") + " | Combustible: " + (ordenData.combustible || "N/A") + " | Km: " + (ordenData.kilometraje || "N/A"), leftMargin, yPos); yPos += 4;';
  html += '  doc.text("Tecnico: " + (ordenData.tecnico_nombre || "No asignado"), leftMargin, yPos); yPos += 10;';
  // Section 3: Domicilio
  html += '  var domDist = Number(ordenData.distancia_km || 0); var domCargo = Number(ordenData.cargo_domicilio || 0);';
  html += '  if (yPos > 255) { doc.addPage(); yPos = 20; }';
  html += '  doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("3. DOMICILIO", leftMargin, yPos); yPos += 6; doc.setFont(undefined, "normal"); doc.setFontSize(7);';
  html += '  if (domDist > 0) { doc.text("Distancia: " + domDist.toFixed(1) + " km | Cargo: " + (domCargo > 0 ? "$" + domCargo.toLocaleString("es-CL") : "Gratis"), leftMargin, yPos); } else { doc.text("Domicilio: No calculado", leftMargin, yPos); } yPos += 10;';
  // Section 4: Diagnostico
  html += '  doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("4. DIAGNOSTICO / TRABAJOS", leftMargin, yPos); yPos += 6; doc.setFont(undefined, "normal"); doc.setFontSize(7);';
  html += '  var srvs = []; if (ordenData.servicios_seleccionados) { try { var sp = typeof ordenData.servicios_seleccionados === "string" ? JSON.parse(ordenData.servicios_seleccionados) : ordenData.servicios_seleccionados; if (Array.isArray(sp) && sp.length > 0) srvs = sp; } catch(e) {} }';
  html += '  if (srvs.length > 0) { var sub = 0; srvs.forEach(function(s) { if (yPos > 260) { doc.addPage(); yPos = 20; } var pr = Number(s.precio_final || s.precio_sugerido || 0); sub += pr; var tp = s.tipo_comision === "mano_obra" ? "MO" : "Rep"; var tecL = s.tecnico_nombre ? " [" + s.tecnico_nombre + "]" : ""; doc.text("[x] " + (s.nombre || s.nombre_servicio || "") + " [" + tp + "]" + tecL + " $" + pr.toLocaleString("es-CL", {maximumFractionDigits: 0}), leftMargin, yPos); yPos += 5; }); if (yPos > 260) { doc.addPage(); yPos = 20; } doc.setFont(undefined, "bold"); doc.setFontSize(8); doc.text("Subtotal: $" + sub.toLocaleString("es-CL", {maximumFractionDigits: 0}), leftMargin, yPos); yPos += 6; doc.setFont(undefined, "normal"); doc.setFontSize(7); }';
  html += '  else { var dc = []; if (ordenData.diagnostico_checks) { try { var dp = typeof ordenData.diagnostico_checks === "string" ? JSON.parse(ordenData.diagnostico_checks) : ordenData.diagnostico_checks; if (Array.isArray(dp)) dc = dp; } catch(e) {} } if (dc.length === 0) { if (ordenData.trabajo_frenos) dc.push("Frenos"); if (ordenData.trabajo_luces) dc.push("Luces"); if (ordenData.trabajo_tren_delantero) dc.push("Tren Delantero"); if (ordenData.trabajo_correas) dc.push("Correas"); if (ordenData.trabajo_componentes) dc.push("Componentes"); } if (dc.length === 0) { doc.text("- Sin diagnostico", leftMargin, yPos); } else { dc.forEach(function(i) { if (yPos > 260) { doc.addPage(); yPos = 20; } doc.text("- " + i, leftMargin, yPos); yPos += 5; }); } yPos += 4; }';
  // Section 5: Valores
  html += '  yPos += 2; doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("5. VALORES", leftMargin, yPos); yPos += 6; doc.setFont(undefined, "normal"); doc.setFontSize(7);';
  html += '  doc.text("Total: $" + montoFinal.toLocaleString("es-CL"), leftMargin, yPos); yPos += 4;';
  html += '  doc.text("Abono: $" + ((ordenData.monto_abono || 0).toLocaleString("es-CL")) + " | Restante: $" + (montoFinal - (ordenData.monto_abono || 0)).toLocaleString("es-CL"), leftMargin, yPos); yPos += 4;';
  if (orden.metodo_pago) {
    html += '  doc.text("Metodo de Pago: ' + orden.metodo_pago + '", leftMargin, yPos); yPos += 4;';
  }
  html += '  yPos += 4;';
  // Section 6: Gastos
  html += '  if (costosData && costosData.length > 0) { doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.setTextColor(168,0,0); doc.text("6. GASTOS ADICIONALES", leftMargin, yPos); yPos += 6; doc.setFont(undefined, "normal"); doc.setFontSize(7); doc.setTextColor(0,0,0); costosData.forEach(function(c) { if (yPos > 260) { doc.addPage(); yPos = 20; } doc.text("  - " + (c.concepto || "Gasto") + " (" + (c.categoria || "N/A") + "): $" + Number(c.monto || 0).toLocaleString("es-CL"), leftMargin, yPos); yPos += 5; }); yPos += 4; }';
  // Section 7: Notas
  html += '  const notas = ' + JSON.stringify(orden.notas || '') + ';';
  html += '  if (notas) { if (yPos > 255) { doc.addPage(); yPos = 20; } doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("7. NOTAS", leftMargin, yPos); yPos += 6; doc.setFont(undefined, "normal"); doc.setFontSize(7); var nArr = notas.split("\\n"); nArr.forEach(function(n) { if (yPos > 260) { doc.addPage(); yPos = 20; } doc.text(n, leftMargin, yPos); yPos += 4; }); yPos += 4; }';
  // Firma
  html += '  if (ordenData.firma_imagen) { if (yPos > 245) { doc.addPage(); yPos = 20; } try { doc.text("Firma del Cliente:", leftMargin, yPos); yPos += 4; doc.addImage(ordenData.firma_imagen, "PNG", leftMargin, yPos, 40, 25); } catch(e) {} }';
  // Footer
  html += '  doc.setFontSize(6); doc.setTextColor(128,128,128); doc.text("Generado: " + new Date().toLocaleString("es-CL"), pageWidth / 2, pageHeight - 10, { align: "center" });';
  html += '  doc.save("OT-" + numeroFormateado + "-" + (ordenData.patente_placa || "N/A") + ".pdf");';
  html += '}';
  html += '<\/script>';

  html += '</body>';
  html += '</html>';

  return html;
}

function obtenerClaseEstado(estado) {
  const clases = {
    'Enviada': 'bg-yellow-100 text-yellow-800',
    'Aprobada': 'bg-green-100 text-green-800',
    'Cancelada': 'bg-red-100 text-red-800',
    'Pendiente': 'bg-gray-100 text-gray-800',
    'En Progreso': 'bg-blue-100 text-blue-800',
    'Completada': 'bg-green-100 text-green-800',
    'Cerrada': 'bg-green-100 text-green-800'
  };
  return clases[estado] || 'bg-gray-100 text-gray-800';
}
