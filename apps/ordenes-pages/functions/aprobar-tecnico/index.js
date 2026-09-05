import { chileNow } from '../lib/db-helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const notas = url.searchParams.get('notas');
  const pagoCompletado = url.searchParams.get('pago_completado') === 'true';
  const metodoPago = url.searchParams.get('metodo_pago');

  if (!token) {
    return new Response('Token no proporcionado', { status: 400 });
  }

  try {
    // Buscar orden por el token de firma del técnico
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
      WHERE o.token_firma_tecnico = ?
    `).bind(token).first();

    if (!orden) {
      return getHTMLResponse('Token Inválido', 'El link de firma no es válido o ha expirado.', false);
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
    const tieneFirma = !!orden.firma_imagen;

    // Generar HTML con toda la información
    const html = getApprovalPage(orden, numeroFormateado, token, tieneFirma, notas, pagoCompletado, metodoPago, costosAdicionales, totalCostos);

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });

  } catch (error) {
    console.error('Error en aprobación de técnico:', error);
    return new Response('Error interno del servidor', { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const notas = url.searchParams.get('notas');
  const pagoCompletado = url.searchParams.get('pago_completado') === 'true';
  const metodoPago = url.searchParams.get('metodo_pago');

  if (!token) {
    return new Response(JSON.stringify({ success: false, error: 'Token no proporcionado' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400
    });
  }

  try {
    const data = await request.json();
    const firma = data.firma;

    if (!firma) {
      return new Response(JSON.stringify({ success: false, error: 'Firma no proporcionada' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Buscar orden y verificar token
    const orden = await env.DB.prepare(
      `SELECT o.id, o.estado, o.estado_trabajo, o.notas, o.monto_total, o.monto_abono, o.monto_restante, c.telefono as cliente_telefono
       FROM OrdenesTrabajo o
       LEFT JOIN Clientes c ON o.cliente_id = c.id
       WHERE o.token_firma_tecnico = ?`
    ).bind(token).first();

    if (!orden) {
      return new Response(JSON.stringify({ success: false, error: 'Orden no encontrada' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    const esPrimeraVez = !orden.firma_imagen;

    // Aplicar notas de cierre si existen
    let notasActualizadas = orden.notas || '';
    if (notas) {
      notasActualizadas = notasActualizadas ? `${notasActualizadas}\nCierre: ${notas}` : `Cierre: ${notas}`;
    }

    // Guardar firma y cerrar la orden — al cerrar: restante=0, abono=total (sin deuda)
    const montoTotal = Number(orden.monto_total || 0);
    const nuevoAbono = pagoCompletado ? montoTotal : Number(orden.monto_abono || 0);
    const nuevoRestante = pagoCompletado ? 0 : (Number(orden.monto_restante || 0) > 0 ? Number(orden.monto_restante) : 0);

    await env.DB.prepare(`
      UPDATE OrdenesTrabajo
      SET firma_imagen = ?, estado = 'Aprobada', estado_trabajo = 'Cerrada',
          fecha_aprobacion = ${chileNow()}, fecha_completado = ${chileNow()},
          notas = ?, pagado = ?, metodo_pago = ?, monto_abono = ?, monto_restante = ?
      WHERE id = ?
    `).bind(firma, notasActualizadas, pagoCompletado ? 1 : 0, metodoPago || null, nuevoAbono, nuevoRestante, orden.id).run();

    // Registrar en seguimiento
    await env.DB.prepare(`
      INSERT INTO SeguimientoTrabajo (orden_id, tecnico_id, estado_anterior, estado_nuevo, observaciones)
      VALUES (?, (SELECT tecnico_asignado_id FROM OrdenesTrabajo WHERE id = ?), ?, ?, ?)
    `).bind(
      orden.id,
      orden.id,
      orden.estado_trabajo,
      'Cerrada',
      `Firma del cliente y cierre final. ${notas ? 'Notas: ' + notas : ''}`
    ).run();

    // Si es la primera vez que firma, enviar notificación
    if (esPrimeraVez) {
      console.log('PRIMERA FIRMA - Enviando notificación con PDF a:', orden.cliente_telefono);
    }

    return new Response(JSON.stringify({
      success: true,
      es_primera_vez: esPrimeraVez,
      mensaje: 'Orden aceptada y cerrada correctamente'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al aprobar orden:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
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
    '<title>' + titulo + '</title>' +
    '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">' +
    '<style>' +
    'body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }' +
    '.card { border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 500px; width: 90%; }' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="card">' +
    '<div class="card-body text-center py-5">' +
    '<div style="font-size: 5rem; color: ' + color + ';">' + icono + '</div>' +
    '<h3 class="mt-4">' + titulo + '</h3>' +
    '<p class="text-muted">' + mensaje + '</p>' +
    '</div>' +
    '</div>' +
    '</body>' +
    '</html>';

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function getApprovalPage(orden, numeroFormateado, token, tieneFirma, notas = null, pagoCompletado = null, metodoPago = null, costosAdicionales = [], totalCostos = 0) {
  const estadoClass = obtenerClaseEstado(orden.estado_trabajo);
  const montoBase = Number(orden.monto_total || 0);
  const montoFinal = montoBase + totalCostos;

  // =============================================
  // CONSTRUIR HTML DE TRABAJOS (con precios)
  // =============================================
  let trabajosHtml = '';
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
    trabajosHtml += '<div class="table-responsive"><table class="table table-sm table-bordered"><thead class="table-light"><tr><th>Servicio</th><th>Categoría</th><th>Tipo</th><th>Técnico</th><th>Descripción</th><th class="text-end">Precio</th></tr></thead><tbody>';
    servicios.forEach(function(s) {
      const precio = Number(s.precio_final || s.precio_sugerido || 0);
      subtotal += precio;
      if (s.editado) hasEdited = true;
      const tipo = s.tipo_comision === 'mano_obra' ? '<span class="badge bg-warning text-dark" style="font-size:0.65rem;">Mano de Obra</span>' : '<span class="badge bg-secondary" style="font-size:0.65rem;">Repuestos</span>';
      const editMark = s.editado ? ' *' : '';
      var tecnicoLabel = s.tecnico_nombre ? '<span class="badge bg-info text-dark" style="font-size:0.65rem;">' + s.tecnico_nombre + '</span>' : '-';
      var descLabel = s.descripcion ? '<small class="text-muted">' + s.descripcion + '</small>' : '-';
      trabajosHtml += '<tr><td>' + (s.nombre || s.nombre_servicio || '') + editMark + '</td><td>' + (s.categoria || '') + '</td><td>' + tipo + '</td><td>' + tecnicoLabel + '</td><td>' + descLabel + '</td><td class="text-end fw-bold">$' + precio.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + '</td></tr>';
    });
    trabajosHtml += '<tr class="table-warning"><td class="fw-bold" colspan="5">Subtotal Servicios</td><td class="text-end fw-bold fs-5">$' + subtotal.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + '</td></tr>';
    trabajosHtml += '</tbody></table></div>';
    if (hasEdited) {
      trabajosHtml += '<small class="text-muted">* Precio editado manualmente</small>';
    }
  } else {
    trabajosHtml += '<ul>';
    if (orden.trabajo_frenos) trabajosHtml += '<li><strong>Frenos:</strong> ' + (orden.detalle_frenos || 'Sin detalle') + '</li>';
    if (orden.trabajo_luces) trabajosHtml += '<li><strong>Luces:</strong> ' + (orden.detalle_luces || 'Sin detalle') + '</li>';
    if (orden.trabajo_tren_delantero) trabajosHtml += '<li><strong>Tren Delantero:</strong> ' + (orden.detalle_tren_delantero || 'Sin detalle') + '</li>';
    if (orden.trabajo_correas) trabajosHtml += '<li><strong>Correas:</strong> ' + (orden.detalle_correas || 'Sin detalle') + '</li>';
    if (orden.trabajo_componentes) trabajosHtml += '<li><strong>Componentes:</strong> ' + (orden.detalle_componentes || 'Sin detalle') + '</li>';
    if (trabajosHtml === '<ul>') trabajosHtml += '<li>No hay trabajos seleccionados</li>';
    trabajosHtml += '</ul>';
  }

  // =============================================
  // CONSTRUIR HTML DE CHECKLIST DEL VEHÍCULO
  // =============================================
  let checklistHtml = '<div class="row"><div class="col-md-6">';
  checklistHtml += '<p><strong>Nivel de Combustible:</strong> ' + (orden.nivel_combustible || 'No registrado') + '</p>';
  checklistHtml += '</div><div class="col-md-6">';
  checklistHtml += '<p><strong>Estado de Carrocería:</strong></p><ul>';
  const danios = [];
  if (orden.check_paragolfe_delantero_der) danios.push('Parachoques delantero derecho');
  if (orden.check_puerta_delantera_der) danios.push('Puerta delantera derecha');
  if (orden.check_puerta_trasera_der) danios.push('Puerta trasera derecha');
  if (orden.check_paragolfe_trasero_izq) danios.push('Parachoques trasero izquierdo');
  if (orden.check_otros_carroceria) danios.push(orden.check_otros_carroceria);
  if (danios.length === 0) {
    checklistHtml += '<li class="text-muted">Sin daños registrados</li>';
  } else {
    danios.forEach(function(d) {
      checklistHtml += '<li><span class="text-warning">&#9888;&#65039;</span> ' + d + '</li>';
    });
  }
  checklistHtml += '</ul></div></div>';
  const tieneChecklist = orden.nivel_combustible || danios.length > 0;

  // =============================================
  // CONSTRUIR HTML DE OBSERVACIONES
  // =============================================
  const diagnosticoObs = orden.diagnostico_observaciones || '';
  let observacionesHtml = '';
  if (diagnosticoObs) {
    observacionesHtml = '<p>' + diagnosticoObs.replace(/\n/g, '<br>') + '</p>';
  }

  // =============================================
  // CONSTRUIR HTML DE COSTOS ADICIONALES
  // =============================================
  let costosHtml = '';
  if (costosAdicionales && costosAdicionales.length > 0) {
    costosHtml += '<div class="table-responsive"><table class="table table-sm table-bordered">';
    costosHtml += '<thead><tr><th>Concepto</th><th>Tipo</th><th class="text-end">Monto</th></tr></thead><tbody>';
    costosAdicionales.forEach(function(c) {
      const catBadge = c.categoria === 'Repuestos/Materiales'
        ? '<span class="badge bg-secondary">Repuesto</span>'
        : '<span class="badge bg-warning text-dark">Mano de Obra</span>';
      costosHtml += '<tr><td>' + (c.concepto || 'Gasto adicional') + '</td><td>' + catBadge + '</td><td class="text-end fw-bold text-danger">$' + Number(c.monto || 0).toLocaleString('es-CL') + '</td></tr>';
    });
    costosHtml += '</tbody></table></div>';
    if (totalCostos > 0) {
      costosHtml += '<small class="text-muted">Base: $' + montoBase.toLocaleString('es-CL') + ' + Extras: $' + totalCostos.toLocaleString('es-CL') + ' = <strong class="text-danger">Total: $' + montoFinal.toLocaleString('es-CL') + '</strong></small>';
    }
  }

  // =============================================
  // PROCESAR NOTAS
  // =============================================
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
  let notasHtml = '';
  if (notasCierre || otrasNotas || diagnosticoObs) {
    notasHtml += '<h6 class="fw-bold">OBSERVACIONES</h6>';
    if (diagnosticoObs) notasHtml += '<p><em>' + diagnosticoObs.replace(/\n/g, '<br>') + '</em></p>';
    if (notasCierre) notasHtml += '<p><strong>Notas de cierre:</strong> ' + notasCierre + '</p>';
    if (otrasNotas) notasHtml += '<p>' + otrasNotas.replace(/\n/g, '<br>') + '</p>';
  }

  // =============================================
  // CONTENIDO PRINCIPAL (firma o cerrada)
  // =============================================
  let contenidoPrincipal = '';

  if (orden.estado_trabajo === 'Cerrada') {
    // ORDEN CERRADA - Mostrar firma + botón descargar PDF
    contenidoPrincipal = '' +
      '<div class="text-center py-4">' +
      '<div style="font-size: 4rem; color: #28a745;">&#10003;</div>' +
      '<h3 class="mt-3">¡Orden Aprobada!</h3>' +
      '<p class="text-muted">Su firma ha sido guardada exitosamente.</p>' +
      '<p class="small text-muted mb-3">Fecha de aprobación: ' + (orden.fecha_aprobacion || 'N/A') + '</p>' +
      '</div>' +
      // Firma
      '<div class="card mb-4 border-success">' +
      '<div class="card-header bg-success text-white">' +
      '<h6 class="mb-0"><i class="fas fa-signature me-2"></i>Firma del Cliente</h6>' +
      '</div>' +
      '<div class="card-body text-center">' +
      '<img src="' + orden.firma_imagen + '" alt="Firma del cliente" style="max-width: 100%; max-height: 200px; border: 1px solid #ddd; border-radius: 10px;" />' +
      '</div>' +
      '</div>' +
      // Botón Descargar PDF
      '<div class="d-grid gap-2 mb-3">' +
      '<button class="btn btn-danger btn-lg" onclick="descargarPDF()">' +
      '<i class="fas fa-file-pdf me-2"></i>Descargar PDF de la Orden</button>' +
      '<button class="btn btn-outline-secondary btn-lg" onclick="window.print()">' +
      '<i class="fas fa-print me-2"></i>Imprimir</button>' +
      '</div>' +
      // Link a ver-ot (usando el token correcto de la orden)
      '<p class="text-center mt-3">' +
      '<a href="/ver-ot?token=' + (orden.token || '') + '" target="_blank" class="text-decoration-none">' +
      '<i class="fas fa-external-link-alt me-1"></i>Ver OT completa en otra pestaña</a>' +
      '</p>';
  } else {
    // ORDEN ABIERTA - Mostrar canvas de firma
    contenidoPrincipal = '' +
      '<div class="alert alert-info">' +
      '<h5><i class="fas fa-info-circle me-2"></i>Información Importante</h5>' +
      '<p>Por favor revise detalladamente la orden de trabajo antes de firmar. ' +
      'Al firmar, usted autoriza los trabajos indicados y sus montos.</p>' +
      '</div>' +
      '<div class="card mb-4">' +
      '<div class="card-header">' +
      '<h6 class="mb-0"><i class="fas fa-signature me-2"></i>Firma del Cliente</h6>' +
      '</div>' +
      '<div class="card-body">' +
      '<p class="text-muted">Utilice el mouse o toque la pantalla para firmar en el área a continuación:</p>' +
      '<canvas id="firma-canvas" style="width: 100%; height: 200px; border: 2px dashed #ccc; border-radius: 10px;"></canvas>' +
      '<button class="btn btn-outline-secondary btn-sm w-100 mt-2" onclick="limpiarFirma()">' +
      '<i class="fas fa-eraser me-2"></i>Limpiar Firma' +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="d-grid gap-2">' +
      '<button class="btn btn-success btn-lg" onclick="guardarFirma()">' +
      '<i class="fas fa-check-circle me-2"></i>Aprobar y Firmar Orden' +
      '</button>' +
      '</div>';
  }

  // =============================================
  // ARMAR HTML COMPLETO
  // =============================================
  const ordenJson = JSON.stringify(orden);
  const costosJson = JSON.stringify(costosAdicionales || []);
  const totalCostosNum = totalCostos;
  const montoFinalNum = montoFinal;

  const html = '' +
    '<!DOCTYPE html>' +
    '<html lang="es">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Orden de Trabajo #' + numeroFormateado + ' - Global Pro Automotriz</title>' +
    '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">' +
    '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">' +
    '<style>' +
    '@media print { .no-print { display: none !important; } body { background: white !important; } }' +
    'body { background: #f5f5f5; }' +
    '.orden-card { box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-radius: 15px; margin-bottom: 20px; }' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<nav class="navbar navbar-dark no-print" style="background: #a80000;">' +
    '<div class="container">' +
    '<a class="navbar-brand fw-bold" href="#">' +
    '<i class="fas fa-wrench me-2"></i>GLOBAL PRO AUTOMOTRIZ' +
    '</a>' +
    '</div>' +
    '</nav>' +
    '<div style="width:100%;text-align:center;line-height:0;"><img src="/banner.jpeg" alt="Global Pro Automotriz" style="width:100%;max-width:600px;height:auto;display:block;margin:0 auto;border-radius:12px;box-shadow:0 4px 15px rgba(0,0,0,0.15);"></div>' +
    '<div class="container py-4">' +

    // === TARJETA PRINCIPAL DE LA OT ===
    '<div class="orden-card card">' +
    '<div class="card-header bg-danger text-white">' +
    '<h5 class="mb-0"><i class="fas fa-file-alt me-2"></i>ORDEN DE TRABAJO #' + numeroFormateado + '</h5>' +
    '</div>' +
    '<div class="card-body">' +

    // Datos del cliente
    '<div class="row mb-4">' +
    '<div class="col-md-6">' +
    '<h6 class="fw-bold">DATOS DEL CLIENTE</h6>' +
    '<p><strong>Nombre:</strong> ' + (orden.cliente_nombre || 'N/A') + '</p>' +
    '<p><strong>RUT:</strong> ' + (orden.cliente_rut || 'N/A') + '</p>' +
    '<p><strong>Fecha Ingreso:</strong> ' + (orden.fecha_ingreso || 'N/A') + '</p>' +
    '<p><strong>Técnico:</strong> ' + (orden.tecnico_nombre || 'N/A') + '</p>' +
    '</div>' +

    // Datos del vehículo
    '<div class="col-md-6">' +
    '<h6 class="fw-bold">DATOS DEL VEHÍCULO</h6>' +
    '<p><strong>Patente:</strong> ' + (orden.patente_placa || 'N/A') + '</p>' +
    '<p><strong>Marca/Modelo:</strong> ' + (orden.marca || '') + ' ' + (orden.modelo || '') + ' (' + (orden.anio || 'N/A') + ')</p>' +
    '<p><strong>Estado:</strong> <span class="badge ' + estadoClass + '">' + (orden.estado_trabajo || 'N/A') + '</span></p>' +
    '</div>' +
    '</div>' +

    '<hr>' +

    // Diagnóstico / Trabajos
    '<h6 class="fw-bold">DIAGNÓSTICO / TRABAJOS</h6>' +
    trabajosHtml +
    '<hr>' +

    // Checklist del vehículo
    (tieneChecklist ? '<h6 class="fw-bold">CHECKLIST DEL VEHÍCULO</h6>' + checklistHtml + '<hr>' : '') +

    // Observaciones
    (notasHtml ? notasHtml + '<hr>' : '') +

    // Costos adicionales
    (costosHtml ? '<h6 class="fw-bold"><i class="fas fa-receipt me-2"></i>GASTOS ADICIONALES</h6>' + costosHtml + '<hr>' : '') +

    // Domicilio (informativo)
    (Number(orden.distancia_km || 0) > 0 ?
      '<h6 class="fw-bold" style="color:#0066cc;"><i class="fas fa-truck me-2"></i>DOMICILIO (Pago directo al tecnico)</h6>' +
      '<div class="alert alert-info py-2 mb-3">' +
      '<p class="mb-1"><strong>Distancia recorrida:</strong> ' + Number(orden.distancia_km).toFixed(1) + ' km</p>' +
      (Number(orden.cargo_domicilio || 0) > 0 ?
        '<p class="mb-1"><strong>Cargo por domicilio:</strong> <span class="text-danger fw-bold">$' + Number(orden.cargo_domicilio).toLocaleString('es-CL') + '</span></p>' :
        '<p class="mb-1"><strong>Cargo:</strong> <span class="text-success">Dentro del radio gratuito</span></p>'
      ) +
      '<small class="text-muted"><em>NOTA: Este valor NO esta incluido en el total de la factura. El pago se realiza directamente al tecnico.</em></small>' +
      '</div><hr>' : '') +

    // Valores
    '<h6 class="fw-bold">VALORES</h6>' +
    '<div class="row text-center mb-3">' +
    '<div class="col-4">' +
    '<div class="p-3 bg-light rounded"><small class="text-muted">Total</small><div class="h4">$' + montoFinal.toLocaleString('es-CL') + '</div></div>' +
    '</div>' +
    '<div class="col-4">' +
    '<div class="p-3 bg-light rounded"><small class="text-muted">Abono</small><div class="h4">$' + ((orden.monto_abono || 0).toLocaleString('es-CL')) + '</div></div>' +
    '</div>' +
    '<div class="col-4">' +
    '<div class="p-3 bg-light rounded"><small class="text-muted">Restante</small><div class="h4">$' + ((montoFinal - Number(orden.monto_abono || 0)).toLocaleString('es-CL')) + '</div></div>' +
    '</div>' +
    '</div>' +
    (orden.metodo_pago ? '<p class="text-center"><strong>Método de Pago:</strong> ' + orden.metodo_pago + '</p>' : '') +
    (notas ? '<hr><h6 class="fw-bold">NOTAS DEL TÉCNICO</h6><p>' + notas.replace(/\n/g, '<br>') + '</p>' : '') +
    (pagoCompletado !== null ? '<hr><h6 class="fw-bold">PAGO</h6><p>' + (pagoCompletado ? '<span class="text-success fw-bold">Pago completado</span>' : '<span class="text-danger fw-bold">Pago pendiente</span>') + (metodoPago ? ' (' + metodoPago + ')' : '') + '</p>' : '') +

    '</div>' +
    '</div>' +

    // === CONTENIDO PRINCIPAL (firma o cerrada) ===
    contenidoPrincipal +

    '</div>' + // cierra container

    // === SCRIPTS ===
    '<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"><\/script>' +
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>' +
    '<script>' +

    // === CANVAS DE FIRMA ===
    'let canvas, ctx, drawing = false;' +
    'document.addEventListener("DOMContentLoaded", function() {' +
    '  canvas = document.getElementById("firma-canvas");' +
    '  if (canvas) {' +
    '    const rect = canvas.getBoundingClientRect();' +
    '    canvas.width = rect.width;' +
    '    canvas.height = 200;' +
    '    ctx = canvas.getContext("2d");' +
    '    ctx.strokeStyle = "#000";' +
    '    ctx.lineWidth = 2;' +
    '    ctx.lineCap = "round";' +
    '    canvas.addEventListener("mousedown", startDrawing);' +
    '    canvas.addEventListener("mousemove", draw);' +
    '    canvas.addEventListener("mouseup", stopDrawing);' +
    '    canvas.addEventListener("mouseout", stopDrawing);' +
    '    canvas.addEventListener("touchstart", function(e) { e.preventDefault(); startDrawing(e.touches[0]); });' +
    '    canvas.addEventListener("touchmove", function(e) { e.preventDefault(); draw(e.touches[0]); });' +
    '    canvas.addEventListener("touchend", stopDrawing);' +
    '  }' +
    '});' +
    'function startDrawing(e) { drawing = true; ctx.beginPath(); const rect = canvas.getBoundingClientRect(); ctx.moveTo((e.clientX||e.pageX) - rect.left, (e.clientY||e.pageY) - rect.top); }' +
    'function draw(e) { if (!drawing) return; const rect = canvas.getBoundingClientRect(); ctx.lineTo((e.clientX||e.pageX) - rect.left, (e.clientY||e.pageY) - rect.top); ctx.stroke(); }' +
    'function stopDrawing() { drawing = false; }' +
    'function limpiarFirma() { ctx.clearRect(0, 0, canvas.width, canvas.height); }' +

    // === GUARDAR FIRMA ===
    'async function guardarFirma() {' +
    '  const blank = document.createElement("canvas"); blank.width = canvas.width; blank.height = canvas.height;' +
    '  if (canvas.toDataURL() === blank.toDataURL()) { alert("Por favor, firme en el área designada"); return; }' +
    '  const firmaData = canvas.toDataURL("image/png");' +
    '  try {' +
    '    const response = await fetch(window.location.href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firma: firmaData }) });' +
    '    const data = await response.json();' +
    '    if (data.success) { window.location.reload(); } else { alert("Error: " + data.error); }' +
    '  } catch (error) { console.error("Error:", error); alert("Error al guardar la firma. Intente nuevamente."); }' +
    '}' +

    // === GENERAR PDF COMPLETO ===
    'function loadImage(src) {' +
    '  return new Promise(function(resolve) {' +
    '    var img = new Image(); img.crossOrigin = "anonymous";' +
    '    var t = setTimeout(function() { resolve(null); }, 3000);' +
    '    img.onload = function() { clearTimeout(t); resolve(img); };' +
    '    img.onerror = function() { clearTimeout(t); resolve(null); };' +
    '    img.src = src;' +
    '  });' +
    '}' +

    'async function descargarPDF() {' +
    '  const { jsPDF } = window.jspdf;' +
    '  const doc = new jsPDF("p", "mm", "a4");' +
    '  const ordenData = ' + ordenJson + ';' +
    '  const costosData = ' + costosJson + ';' +
    '  const totalExtras = ' + totalCostosNum + ';' +
    '  const montoFinal = ' + montoFinalNum + ';' +
    '  const numeroFormateado = "' + numeroFormateado + '";' +
    '  const pageWidth = doc.internal.pageSize.getWidth();' +
    '  const pageHeight = doc.internal.pageSize.getHeight();' +
    '  const leftMargin = 10;' +
    '  let yPos = 15;' +

    // Watermark + Banner
    '  var logoImg = await loadImage("/corto.jpg");' +
    '  var bannerImg = await loadImage("/banner.jpeg");' +
    '  if (logoImg) { doc.setGState(new doc.GState({ opacity: 0.08 })); var wmW = 80; var wmH = (logoImg.naturalHeight / logoImg.naturalWidth) * wmW; doc.addImage(logoImg, "JPEG", (pageWidth - wmW) / 2, (pageHeight - wmH) / 2, wmW, wmH); doc.setGState(new doc.GState({ opacity: 1 })); }' +
    '  if (logoImg) { doc.addImage(logoImg, "JPEG", leftMargin, 5, 15, 10); }' +
    '  if (bannerImg) { var bw = pageWidth - (leftMargin * 2); var bh = (bannerImg.naturalHeight / bannerImg.naturalWidth) * bw; var maxH = 30; var fbh = Math.min(bh, maxH); var fbw = (bannerImg.naturalWidth / bannerImg.naturalHeight) * fbh; doc.addImage(bannerImg, "JPEG", (pageWidth - fbw) / 2, yPos, fbw, fbh); yPos += fbh + 3; }' +

    // Header
    '  doc.setFontSize(8); doc.setTextColor(128,128,128); doc.text("OT #" + numeroFormateado, pageWidth - 15, 10, { align: "right" });' +
    '  doc.setFontSize(16); doc.setTextColor(168,0,0); doc.text("ORDEN DE TRABAJO", pageWidth / 2, yPos, { align: "center" }); yPos += 8;' +
    '  doc.setFontSize(10); doc.text("GLOBAL PRO AUTOMOTRIZ", pageWidth / 2, yPos, { align: "center" }); yPos += 10;' +

    // Sección 1: Info Taller
    '  doc.setTextColor(0,0,0); doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("1. INFORMACION DEL TALLER", leftMargin, yPos); yPos += 6;' +
    '  doc.setFont(undefined, "normal"); doc.setFontSize(7);' +
    '  doc.text("Empresa: Global Pro Automotriz", leftMargin, yPos); yPos += 4;' +
    '  doc.text("Direccion: Padre Alberto Hurtado 3596, Pedro Aguirre Cerda", leftMargin, yPos); yPos += 4;' +
    '  doc.text("Contactos: +56 9 3902 6185", leftMargin, yPos); yPos += 10;' +

    // Sección 2: Datos del Cliente
    '  doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("2. DATOS DEL CLIENTE", leftMargin, yPos); yPos += 6;' +
    '  doc.setFont(undefined, "normal"); doc.setFontSize(7);' +
    '  doc.text("Cliente: " + (ordenData.cliente_nombre || "N/A"), leftMargin, yPos); yPos += 4;' +
    '  doc.text("RUT: " + (ordenData.cliente_rut || "N/A"), leftMargin, yPos); yPos += 4;' +
    '  doc.text("Telefono: " + (ordenData.cliente_telefono || "N/A"), leftMargin, yPos); yPos += 4;' +
    '  doc.text("Fecha Ingreso: " + (ordenData.fecha_ingreso || "N/A"), leftMargin, yPos); yPos += 10;' +

    // Sección 3: Datos del Vehículo
    '  doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("3. DATOS DEL VEHICULO", leftMargin, yPos); yPos += 6;' +
    '  doc.setFont(undefined, "normal"); doc.setFontSize(7);' +
    '  doc.text("Patente: " + (ordenData.patente_placa || "N/A"), leftMargin, yPos); yPos += 4;' +
    '  doc.text("Marca/Modelo: " + (ordenData.marca || "N/A") + " " + (ordenData.modelo || "") + " (" + (ordenData.anio || "N/A") + ")", leftMargin, yPos); yPos += 10;' +

    // Sección 4: Diagnóstico / Trabajos
    '  doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("4. DIAGNOSTICO / TRABAJOS", leftMargin, yPos); yPos += 6;' +
    '  doc.setFont(undefined, "normal"); doc.setFontSize(7);' +
    '  var srvs = [];' +
    '  if (ordenData.servicios_seleccionados) { try { var sp = typeof ordenData.servicios_seleccionados === "string" ? JSON.parse(ordenData.servicios_seleccionados) : ordenData.servicios_seleccionados; if (Array.isArray(sp) && sp.length > 0) srvs = sp; } catch(e) {} }' +
    '  if (srvs.length > 0) {' +
    '    var sub = 0;' +
    '    srvs.forEach(function(s) {' +
    '      if (yPos > 260) { doc.addPage(); yPos = 20; }' +
    '      var pr = Number(s.precio_final || s.precio_sugerido || 0); sub += pr;' +
    '      var tp = s.tipo_comision === "mano_obra" ? "MO" : "Rep";' +
    '      var tecLabelPDF = s.tecnico_nombre ? " [" + s.tecnico_nombre + "]" : "";' +
    '      doc.text("[x] " + (s.nombre || s.nombre_servicio || "") + tecLabelPDF + " [" + tp + "] $" + pr.toLocaleString("es-CL", {maximumFractionDigits: 0}), leftMargin, yPos);' +
    '      yPos += 5;' +
    '      if (s.descripcion) {' +
    '        doc.setFontSize(6); doc.setTextColor(100, 100, 100);' +
    '        var descLinesPDF = doc.splitTextToSize("     > " + s.descripcion, pageWidth - leftMargin * 2 - 30);' +
    '        descLinesPDF.forEach(function(line) { yPos += 3; if (yPos > 270) { doc.addPage(); yPos = 20; } doc.text(line, leftMargin, yPos); });' +
    '        yPos += 1; doc.setFontSize(7); doc.setTextColor(0, 0, 0);' +
    '      }' +
    '    });' +
    '    if (yPos > 260) { doc.addPage(); yPos = 20; }' +
    '    doc.setFont(undefined, "bold"); doc.setFontSize(8);' +
    '    doc.text("Subtotal Servicios: $" + sub.toLocaleString("es-CL", {maximumFractionDigits: 0}), leftMargin, yPos);' +
    '    yPos += 6; doc.setFont(undefined, "normal"); doc.setFontSize(7);' +
    '  } else {' +
    '    var diagChecks = [];' +
    '    if (ordenData.diagnostico_checks) { try { var dp = typeof ordenData.diagnostico_checks === "string" ? JSON.parse(ordenData.diagnostico_checks) : ordenData.diagnostico_checks; if (Array.isArray(dp) && dp.length > 0) diagChecks = dp; } catch(e) {} }' +
    '    if (diagChecks.length === 0) {' +
    '      if (ordenData.trabajo_frenos) diagChecks.push("Frenos");' +
    '      if (ordenData.trabajo_luces) diagChecks.push("Luces");' +
    '      if (ordenData.trabajo_tren_delantero) diagChecks.push("Tren Delantero");' +
    '      if (ordenData.trabajo_correas) diagChecks.push("Correas");' +
    '      if (ordenData.trabajo_componentes) diagChecks.push("Componentes");' +
    '    }' +
    '    if (diagChecks.length === 0) { doc.text("- Sin diagnostico", leftMargin, yPos); yPos += 5; }' +
    '    else { diagChecks.forEach(function(item) { if (yPos > 260) { doc.addPage(); yPos = 20; } doc.text("- " + item, leftMargin, yPos); yPos += 5; }); }' +
    '  }' +
    '  yPos += 5;' +

    // Sección 5: Checklist del vehículo
    '  var tieneCheck = ordenData.nivel_combustible || ordenData.check_paragolfe_delantero_der || ordenData.check_puerta_delantera_der || ordenData.check_puerta_trasera_der || ordenData.check_paragolfe_trasero_izq || ordenData.check_otros_carroceria;' +
    '  if (tieneCheck) {' +
    '    if (yPos > 245) { doc.addPage(); yPos = 20; }' +
    '    doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("5. CHECKLIST DEL VEHICULO", leftMargin, yPos); yPos += 6;' +
    '    doc.setFont(undefined, "normal"); doc.setFontSize(7);' +
    '    doc.text("Combustible: " + (ordenData.nivel_combustible || "No registrado"), leftMargin, yPos); yPos += 5;' +
    '    doc.text("Estado de Carroceria:", leftMargin, yPos); yPos += 4;' +
    '    var danios = [];' +
    '    if (ordenData.check_paragolfe_delantero_der) danios.push("Parachoques delantero derecho");' +
    '    if (ordenData.check_puerta_delantera_der) danios.push("Puerta delantera derecha");' +
    '    if (ordenData.check_puerta_trasera_der) danios.push("Puerta trasera derecha");' +
    '    if (ordenData.check_paragolfe_trasero_izq) danios.push("Parachoques trasero izquierdo");' +
    '    if (ordenData.check_otros_carroceria) danios.push(ordenData.check_otros_carroceria);' +
    '    if (danios.length === 0) { doc.text("  Sin daños registrados", leftMargin, yPos); yPos += 5; }' +
    '    else { danios.forEach(function(d) { if (yPos > 260) { doc.addPage(); yPos = 20; } doc.text("  * " + d, leftMargin, yPos); yPos += 4; }); }' +
    '    yPos += 5;' +
    '  }' +

    // Sección 6: Observaciones
    '  var diagnosticoObs = ordenData.diagnostico_observaciones || "";' +
    '  if (diagnosticoObs) {' +
    '    if (yPos > 245) { doc.addPage(); yPos = 20; }' +
    '    doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("OBSERVACIONES", leftMargin, yPos); yPos += 6;' +
    '    doc.setFont(undefined, "normal"); doc.setFontSize(7);' +
    '    doc.setFont(undefined, "italic"); doc.setTextColor(80,80,80);' +
    '    doc.text(diagnosticoObs, leftMargin, yPos); yPos += 5;' +
    '    doc.setFont(undefined, "normal"); doc.setTextColor(0,0,0);' +
    '    yPos += 3;' +
    '  }' +

    // Sección 7: Valores
    '  if (yPos > 245) { doc.addPage(); yPos = 20; }' +
    '  doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("6. VALORES", leftMargin, yPos); yPos += 6;' +
    '  doc.setFont(undefined, "normal"); doc.setFontSize(7);' +
    '  doc.text("Total: $" + montoFinal.toLocaleString("es-CL"), leftMargin, yPos); yPos += 4;' +
    (totalCostos > 0 ? '  doc.text("(Base: $" + (montoBase.toLocaleString("es-CL")) + " + Extras: $" + totalCostos.toLocaleString("es-CL") + ")", leftMargin, yPos); yPos += 4;' : '') +
    '  doc.text("Abono: $" + ((ordenData.monto_abono || 0).toLocaleString("es-CL")), leftMargin, yPos); yPos += 4;' +
    '  doc.text("Restante: $" + (montoFinal - (ordenData.monto_abono || 0)).toLocaleString("es-CL"), leftMargin, yPos); yPos += 10;' +

    // Sección 8: Domicilio (informativo, pago directo al tecnico)
    '  var domDist = Number(ordenData.distancia_km || 0);' +
    '  var domCargo = Number(ordenData.cargo_domicilio || 0);' +
    '  var domModo = ordenData.domicilio_modo_cobro || "";' +
    '  if (domDist > 0) {' +
    '    if (yPos > 245) { doc.addPage(); yPos = 20; }' +
    '    doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.setTextColor(0,102,204); doc.text("8. DOMICILIO (Pago directo al tecnico)", leftMargin, yPos); yPos += 6;' +
    '    doc.setFont(undefined, "normal"); doc.setFontSize(7); doc.setTextColor(0,0,0);' +
    '    doc.text("Distancia recorrida: " + domDist + " km", leftMargin, yPos); yPos += 4;' +
    '    if (domCargo > 0) {' +
    '      doc.text("Cargo por domicilio: $" + domCargo.toLocaleString("es-CL") + " (pago directo al tecnico)", leftMargin, yPos); yPos += 4;' +
    '    } else {' +
    '      doc.text("Dentro del radio de cobertura gratuito", leftMargin, yPos); yPos += 4;' +
    '    }' +
    '    doc.setFont(undefined, "italic"); doc.setTextColor(100,100,100); doc.text("NOTA: Este valor NO esta incluido en el total de la factura. El pago se realiza directamente al tecnico.", leftMargin, yPos); yPos += 8;' +
    '    doc.setFont(undefined, "normal"); doc.setTextColor(0,0,0);' +
    '  }' +

    // Sección 9: Gastos adicionales
    '  if (costosData && costosData.length > 0) {' +
    '    if (yPos > 245) { doc.addPage(); yPos = 20; }' +
    '    doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.setTextColor(168,0,0); doc.text("9. GASTOS ADICIONALES", leftMargin, yPos); yPos += 6;' +
    '    doc.setFont(undefined, "normal"); doc.setFontSize(7); doc.setTextColor(0,0,0);' +
    '    costosData.forEach(function(c) { if (yPos > 260) { doc.addPage(); yPos = 20; } doc.text("  - " + (c.concepto || "Gasto") + " (" + (c.categoria || "N/A") + "): $" + Number(c.monto || 0).toLocaleString("es-CL"), leftMargin, yPos); yPos += 5; });' +
    '    yPos += 4;' +
    '  }' +

    // Sección 9: Notas
    '  const notas = ' + JSON.stringify(orden.notas || '') + ';' +
    '  if (notas) {' +
    '    if (yPos > 245) { doc.addPage(); yPos = 20; }' +
    '    const notasArr = notas.split("\\n");' +
    '    let ncierre = ""; let notras = "";' +
    '    for (const n of notasArr) { if (n.startsWith("Cierre: ")) { ncierre = n.replace("Cierre: ", ""); } else { notras += (notras ? "\\n" : "") + n; } }' +
    '    doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("10. NOTAS", leftMargin, yPos); yPos += 6;' +
    '    doc.setFont(undefined, "normal"); doc.setFontSize(7);' +
    '    if (ncierre) { doc.text("Cierre: " + ncierre, leftMargin, yPos); yPos += 4; }' +
    '    if (notras) { doc.text("Otras: " + notras.replace(/\\n/g, ", "), leftMargin, yPos); yPos += 4; }' +
    '    yPos += 6;' +
    '  }' +

    // Firma
    '  if (ordenData.firma_imagen) {' +
    '    if (yPos > 235) { doc.addPage(); yPos = 20; }' +
    '    try {' +
    '      doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text("FIRMA DEL CLIENTE", leftMargin, yPos); yPos += 4;' +
    '      doc.setFont(undefined, "normal"); doc.setFontSize(7); doc.text("Fecha: " + (ordenData.fecha_aprobacion || "N/A"), leftMargin, yPos); yPos += 6;' +
    '      doc.addImage(ordenData.firma_imagen, "PNG", leftMargin, yPos, 50, 30);' +
    '    } catch(e) { console.error("Error firma PDF:", e); }' +
    '  }' +

    // Footer
    '  doc.setFontSize(6); doc.setTextColor(128,128,128);' +
    '  doc.text("Generado: " + new Date().toLocaleString("es-CL"), pageWidth / 2, pageHeight - 10, { align: "center" });' +
    '  doc.text("Global Pro Automotriz - Padre Alberto Hurtado 3596, Pedro Aguirre Cerda", pageWidth / 2, pageHeight - 6, { align: "center" });' +

    '  doc.save("OT-' + numeroFormateado + '-' + (orden.patente_placa || 'N/A') + '.pdf");' +
    '}' +

    '<\/script>' +
    '</body>' +
    '</html>';

  return html;
}

function obtenerClaseEstado(estado) {
  const clases = {
    'Pendiente Visita': 'bg-warning',
    'En Sitio': 'bg-info',
    'En Progreso': 'bg-primary',
    'Pendiente Piezas': 'bg-secondary',
    'Completada': 'bg-success',
    'Aprobada': 'bg-success',
    'Usuario Satisfecho': 'bg-success',
    'No Completada': 'bg-danger',
    'Cerrada': 'bg-success'
  };
  return clases[estado] || 'bg-secondary';
}
