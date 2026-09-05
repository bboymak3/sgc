// ============================================
// APP.JS - Aplicación Móvil para Técnicos
// Global Pro Automotriz
// ============================================

const API_BASE = '/api/tecnico';
let tecnicoActual = null;
let ordenActual = null;
let ordenes = [];
let fotoTipoActual = null;
let pollingInterval = null;        // Intervalo de polling para detectar nuevas órdenes
let ordenesConocidas = [];         // IDs de órdenes que ya conocemos
let alertasActivadas = false;      // Si las alertas están activadas
let nuevaOrdenPendiente = null;    // Datos de la nueva orden detectada
let trackingViajeActivo = false;   // Si el tracking de viaje está activo
let trackingInterval = null;       // Intervalo para enviar GPS cada 30s
let trackingOrdenId = null;        // ID de la orden en tracking activo

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    // Verificar si hay sesión activa
    const sesionGuardada = localStorage.getItem('tecnico_sesion');
    if (sesionGuardada) {
        tecnicoActual = JSON.parse(sesionGuardada);
        mostrarApp();
    }

    // Configurar input de foto
    document.getElementById('foto-input').addEventListener('change', handleFotoSeleccionada);
});

// ============================================
// AUTENTICACIÓN
// ============================================

async function login() {
    const telefono = document.getElementById('telefono-login').value.trim();
    const pin = document.getElementById('pin-login').value.trim();
    const errorMsg = document.getElementById('login-error');

    if (!telefono || !pin) {
        mostrarErrorLogin('Ingrese teléfono y PIN');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefono, pin })
        });

        const data = await response.json();

        if (data.success) {
            tecnicoActual = data.tecnico;
            localStorage.setItem('tecnico_sesion', JSON.stringify(tecnicoActual));
            mostrarApp();
        } else {
            mostrarErrorLogin(data.error || 'Credenciales incorrectas');
        }
    } catch (error) {
        console.error('Error en login:', error);
        mostrarErrorLogin('Error de conexión');
    }
}

function mostrarErrorLogin(mensaje) {
    const errorMsg = document.getElementById('login-error');
    errorMsg.textContent = mensaje;
    errorMsg.style.display = 'block';
}

function logout() {
    tecnicoActual = null;
    ordenActual = null;
    ordenesConocidas = [];
    nuevaOrdenPendiente = null;
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    localStorage.removeItem('tecnico_sesion');
    document.getElementById('login-screen').style.display = 'block';
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('telefono-login').value = '';
    document.getElementById('pin-login').value = '';
}

function mostrarApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    document.getElementById('tecnico-nombre').textContent = tecnicoActual.nombre;

    // Mostrar botón de alertas si no están activadas
    if (!alertasActivadas) {
        document.getElementById('btn-alertas').style.display = 'inline-block';
    }

    // Cargar órdenes y comenzar polling para detectar nuevas
    cargarOrdenes().then(function() {
        // Guardar IDs de órdenes actuales como "ya conocidas"
        ordenesConocidas = ordenes.map(function(o) { return o.id; });
    });
    iniciarPolling();
}

// ============================================
// NAVEGACIÓN Y TABS
// ============================================

function showTab(tabName) {
    // Ocultar todos los tabs
    document.getElementById('tab-pendientes').style.display = 'none';
    document.getElementById('tab-en-curso').style.display = 'none';
    document.getElementById('tab-completadas').style.display = 'none';

    // Mostrar el tab seleccionado
    document.getElementById(`tab-${tabName}`).style.display = 'block';

    // Actualizar tabs superiores
    document.querySelectorAll('#main-tabs .nav-link').forEach(link => {
        link.classList.remove('active');
    });
    event.target.classList.add('active');

    // Actualizar navegación inferior
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.classList.add('active');
}

// ============================================
// CARGAR ÓRDENES
// ============================================

async function cargarOrdenes() {
    if (!tecnicoActual) return;

    try {
        const response = await fetch(`${API_BASE}/ordenes?tecnico_id=${tecnicoActual.id}`);
        const data = await response.json();

        if (data.success) {
            ordenes = data.ordenes;
            renderizarOrdenes();
        }
    } catch (error) {
        console.error('Error al cargar órdenes:', error);
        mostrarNotificacion('error', 'Error', 'No se pudieron cargar las órdenes');
    }
}

function renderizarOrdenes() {
    const pendientes = ordenes.filter(o =>
        ['Pendiente Visita', 'Pendiente Piezas'].includes(o.estado_trabajo)
    );

    const enCurso = ordenes.filter(o =>
        ['En Sitio', 'En Progreso'].includes(o.estado_trabajo)
    );

    const completadas = ordenes.filter(o =>
        ['Completada', 'Aprobada', 'Usuario Satisfecho', 'No Completada', 'Cerrada'].includes(o.estado_trabajo)
    );

    renderizarListaOrdenes('ordenes-pendientes', pendientes);
    renderizarListaOrdenes('ordenes-en-curso', enCurso);
    renderizarListaOrdenes('ordenes-completadas', completadas);
}

function renderizarListaOrdenes(containerId, ordenesLista) {
    const container = document.getElementById(containerId);

    if (ordenesLista.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 text-white">
                <i class="fas fa-inbox fa-3x mb-3"></i>
                <p>No hay órdenes en esta categoría</p>
            </div>
        `;
        return;
    }

    let html = '';
    ordenesLista.forEach(orden => {
        const estadoClass = obtenerClaseEstado(orden.estado_trabajo);
        const numeroFormateado = String(orden.numero_orden).padStart(6, '0');
        const distKmLista = Number(orden.distancia_km || 0);
        const cargoDomLista = Number(orden.cargo_domicilio || 0);
        const tieneDomicilioLista = distKmLista > 0;
        const domicilioBadge = tieneDomicilioLista
            ? (cargoDomLista > 0
                ? `<span class="badge" style="background:#d90429; font-size:0.65rem; margin-left:6px;"><i class="fas fa-truck me-1"></i>$${cargoDomLista.toLocaleString('es-CL')}</span>`
                : `<span class="badge" style="background:#28a745; font-size:0.65rem; margin-left:6px;"><i class="fas fa-truck me-1"></i>Gratis</span>`)
            : '';

        html += `
            <div class="orden-card" onclick="verOrden(${orden.id})">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <h6 class="mb-1 fw-bold">#${numeroFormateado}${domicilioBadge}</h6>
                        <span class="estado-badge ${estadoClass}">${orden.estado_trabajo}</span>
                    </div>
                    <i class="fas fa-chevron-right text-muted"></i>
                </div>
                <div class="detail-row mb-0">
                    <i class="fas fa-car"></i>
                    <span>${orden.marca} ${orden.modelo} <strong>${orden.patente_placa}</strong></span>
                </div>
                <div class="detail-row mb-0">
                    <i class="fas fa-user"></i>
                    <span>${orden.cliente_nombre}</span>
                </div>
                <div class="detail-row mb-0">
                    <i class="fas fa-map-marker-alt"></i>
                    <span class="text-truncate" style="max-width: 200px;">${orden.direccion || 'Sin dirección'}${orden.referencia_direccion ? ' (' + orden.referencia_direccion + ')' : ''}</span>
                </div>
                ${tieneDomicilioLista ? `
                <div class="detail-row mb-0">
                    <i class="fas fa-route" style="color:#6c757d;"></i>
                    <span class="text-muted" style="font-size:0.8rem;">${distKmLista} km — ${cargoDomLista > 0 ? '$' + cargoDomLista.toLocaleString('es-CL') : 'Sin cargo'}</span>
                </div>` : ''}
            </div>
        `;
    });

    container.innerHTML = html;
}

// ============================================
// VER DETALLE DE ORDEN
// ============================================

async function verOrden(ordenId) {
    try {
        const response = await fetch(`${API_BASE}/orden?id=${ordenId}&tecnico_id=${tecnicoActual.id}`);
        const data = await response.json();

        if (data.success) {
            ordenActual = data.orden;
            mostrarOrdenEnModal(ordenActual);
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo cargar la orden');
        }
    } catch (error) {
        console.error('Error al ver orden:', error);
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

function mostrarOrdenEnModal(orden) {
    const numeroFormateado = String(orden.numero_orden).padStart(6, '0');
    const estadoClass = obtenerClaseEstado(orden.estado_trabajo);

    // Información básica
    document.getElementById('modal-numero-orden').textContent = numeroFormateado;
    document.getElementById('modal-cliente').textContent = orden.cliente_nombre || 'N/A';
    const dirCompleta = orden.direccion || 'Sin dirección';
    const dirRef = orden.referencia_direccion ? ` — Ref: ${orden.referencia_direccion}` : '';
    document.getElementById('modal-direccion').textContent = dirCompleta + dirRef;
    document.getElementById('modal-vehiculo').textContent = `${orden.marca || ''} ${orden.modelo || ''} ${orden.anio || ''}`;
    document.getElementById('modal-patente').textContent = orden.patente_placa || 'N/A';
    document.getElementById('modal-estado').textContent = orden.estado_trabajo;
    document.getElementById('modal-estado').className = `estado-badge ${estadoClass}`;

    // Mapa oculto (API key no configurada)
    document.getElementById('map-container').style.display = 'none';

    // =============================================
    // RENDERIZAR DIAGNÓSTICOS / TRABAJOS (sin precios)
    // =============================================
    let serviciosSeleccionados = [];
    try {
        serviciosSeleccionados = orden.servicios_seleccionados
            ? (typeof orden.servicios_seleccionados === 'string' ? JSON.parse(orden.servicios_seleccionados) : orden.servicios_seleccionados)
            : [];
    } catch(e) { serviciosSeleccionados = []; }

    // También intentar con diagnostico_checks como fallback
    let diagnosticoChecks = [];
    try {
        diagnosticoChecks = orden.diagnostico_checks
            ? (typeof orden.diagnostico_checks === 'string' ? JSON.parse(orden.diagnostico_checks) : orden.diagnostico_checks)
            : [];
    } catch(e) { diagnosticoChecks = []; }

    const cardDiagnosticos = document.getElementById('card-diagnosticos');
    const cardTrabajosFallback = document.getElementById('card-trabajos-fallback');

    if (serviciosSeleccionados.length > 0) {
        // Mostrar servicios del catálogo SIN precios
        let diagnosticosHtml = '<div class="list-group list-group-flush">';
        serviciosSeleccionados.forEach((serv, idx) => {
            const nombre = serv.nombre || serv.servicio || 'Servicio';
            const categoria = serv.categoria || '';
            const tipo = serv.tipo_comision || serv.tipo || '';
            diagnosticosHtml += `
                <div class="list-group-item d-flex justify-content-between align-items-center px-0 border-bottom" style="background:transparent;">
                    <div>
                        <i class="fas fa-wrench me-2" style="color:#d90429;"></i>
                        <strong>${nombre}</strong>
                        ${categoria ? `<span class="badge bg-secondary ms-2" style="font-size:0.7rem;">${categoria}</span>` : ''}
                    </div>
                    ${tipo ? `<span class="text-muted" style="font-size:0.8rem;">${tipo}</span>` : ''}
                </div>
            `;
        });
        // Agregar requerimientos del cliente como ítem dentro de diagnóstico
        if (orden.diagnostico_observaciones) {
            diagnosticosHtml += `
                <div class="list-group-item px-0 border-bottom" style="background:transparent;">
                    <div class="d-flex align-items-start">
                        <i class="fas fa-clipboard-list me-2 mt-1" style="color:#ffc800;"></i>
                        <div>
                            <strong style="color:#ffc800;">Requerimientos</strong>
                            <p class="mb-0 mt-1" style="font-size:0.9rem;">${orden.diagnostico_observaciones.replace(/\n/g, '<br>')}</p>
                        </div>
                    </div>
                </div>
            `;
        }
        diagnosticosHtml += '</div>';
        document.getElementById('modal-diagnosticos').innerHTML = diagnosticosHtml;
        cardDiagnosticos.style.display = 'block';
        cardTrabajosFallback.style.display = 'none';
    } else if (diagnosticoChecks.length > 0) {
        // Fallback: mostrar checks de diagnóstico sin precios
        let diagnosticosHtml = '<div class="list-group list-group-flush">';
        diagnosticoChecks.forEach(check => {
            const nombre = typeof check === 'string' ? check : (check.nombre || check.servicio || 'Check');
            diagnosticosHtml += `
                <div class="list-group-item d-flex align-items-center px-0 border-bottom" style="background:transparent;">
                    <i class="fas fa-check-circle me-2" style="color:#28a745;"></i>
                    <span>${nombre}</span>
                </div>
            `;
        });
        // Agregar requerimientos del cliente como ítem dentro de diagnóstico
        if (orden.diagnostico_observaciones) {
            diagnosticosHtml += `
                <div class="list-group-item px-0 border-bottom" style="background:transparent;">
                    <div class="d-flex align-items-start">
                        <i class="fas fa-clipboard-list me-2 mt-1" style="color:#ffc800;"></i>
                        <div>
                            <strong style="color:#ffc800;">Requerimientos</strong>
                            <p class="mb-0 mt-1" style="font-size:0.9rem;">${orden.diagnostico_observaciones.replace(/\n/g, '<br>')}</p>
                        </div>
                    </div>
                </div>
            `;
        }
        diagnosticosHtml += '</div>';
        document.getElementById('modal-diagnosticos').innerHTML = diagnosticosHtml;
        cardDiagnosticos.style.display = 'block';
        cardTrabajosFallback.style.display = 'none';
    } else if (orden.diagnostico_observaciones) {
        // Solo hay requerimientos, sin servicios ni checks
        let diagnosticosHtml = '<div class="list-group list-group-flush">';
        diagnosticosHtml += `
            <div class="list-group-item px-0 border-bottom" style="background:transparent;">
                <div class="d-flex align-items-start">
                    <i class="fas fa-clipboard-list me-2 mt-1" style="color:#ffc800;"></i>
                    <div>
                        <strong style="color:#ffc800;">Requerimientos</strong>
                        <p class="mb-0 mt-1" style="font-size:0.9rem;">${orden.diagnostico_observaciones.replace(/\n/g, '<br>')}</p>
                    </div>
                </div>
            </div>
        `;
        diagnosticosHtml += '</div>';
        document.getElementById('modal-diagnosticos').innerHTML = diagnosticosHtml;
        cardDiagnosticos.style.display = 'block';
        cardTrabajosFallback.style.display = 'none';
    } else {
        // Fallback final: campos booleanos viejos
        let trabajosHtml = '';
        if (orden.trabajo_frenos) trabajosHtml += `<p>✓ Frenos: ${orden.detalle_frenos || 'Sin detalle'}</p>`;
        if (orden.trabajo_luces) trabajosHtml += `<p>✓ Luces: ${orden.detalle_luces || 'Sin detalle'}</p>`;
        if (orden.trabajo_tren_delantero) trabajosHtml += `<p>✓ Tren Delantero: ${orden.detalle_tren_delantero || 'Sin detalle'}</p>`;
        if (orden.trabajo_correas) trabajosHtml += `<p>✓ Correas: ${orden.detalle_correas || 'Sin detalle'}</p>`;
        if (orden.trabajo_componentes) trabajosHtml += `<p>✓ Componentes: ${orden.detalle_componentes || 'Sin detalle'}</p>`;
        if (trabajosHtml) {
            document.getElementById('modal-trabajos').innerHTML = trabajosHtml;
            cardTrabajosFallback.style.display = 'block';
        } else {
            cardDiagnosticos.style.display = 'none';
            cardTrabajosFallback.style.display = 'none';
        }
    }

    // =============================================
    // RENDERIZAR CHECKLIST DEL VEHÍCULO
    // =============================================
    const cardChecklist = document.getElementById('card-checklist');
    const tieneChecklist = orden.nivel_combustible
        || orden.check_paragolfe_delantero_der
        || orden.check_puerta_delantera_der
        || orden.check_puerta_trasera_der
        || orden.check_paragolfe_trasero_izq
        || orden.check_otros_carroceria;

    if (tieneChecklist) {
        let checklistHtml = '';

        // Nivel de combustible
        if (orden.nivel_combustible) {
            checklistHtml += `
                <div class="d-flex align-items-center mb-2">
                    <i class="fas fa-gas-pump me-2" style="color:#ffc800; width:20px;"></i>
                    <div>
                        <strong>Combustible:</strong> ${orden.nivel_combustible}
                    </div>
                </div>
            `;
        }

        // Estado de carrocería
        const danios = [];
        if (orden.check_paragolfe_delantero_der) danios.push('Parachoques delantero derecho');
        if (orden.check_puerta_delantera_der) danios.push('Puerta delantera derecha');
        if (orden.check_puerta_trasera_der) danios.push('Puerta trasera derecha');
        if (orden.check_paragolfe_trasero_izq) danios.push('Parachoques trasero izquierdo');
        if (orden.check_otros_carroceria) danios.push(orden.check_otros_carroceria);

        if (danios.length > 0) {
            checklistHtml += `
                <div class="mb-2">
                    <div class="d-flex align-items-center mb-1">
                        <i class="fas fa-car-crash me-2" style="color:#d90429; width:20px;"></i>
                        <strong>Estado de Carrocería:</strong>
                    </div>
                    <div class="ms-4">
                        ${danios.map(d => `
                            <div class="d-flex align-items-center mb-1">
                                <i class="fas fa-exclamation-triangle me-2" style="color:#ffc800; font-size:0.8rem;"></i>
                                <span>${d}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (!orden.nivel_combustible) {
            // Si no hay nada que mostrar
            cardChecklist.style.display = 'none';
        }

        if (checklistHtml) {
            document.getElementById('modal-checklist').innerHTML = checklistHtml;
            cardChecklist.style.display = 'block';
        }
    } else {
        cardChecklist.style.display = 'none';
    }

    // =============================================
    // OCULTAR OBSERVACIONES SEPARADAS (ya están dentro de Diagnóstico como Requerimientos)
    // =============================================
    const cardObservaciones = document.getElementById('card-observaciones');
    cardObservaciones.style.display = 'none';

    // Mostrar notas de cierre si existen
    document.getElementById('modal-notas').innerHTML = orden.notas ? `<p>${orden.notas.replace(/\n/g, '<br>')}</p>` : '<p class="text-muted">Sin notas de cierre</p>';

    // Mostrar info de domicilio SIEMPRE (incluso si es $0 o no calculado)
    const cardDomicilio = document.getElementById('card-domicilio');
    const estadosConDomicilio = ['En Sitio', 'En Progreso', 'Completada', 'Aprobada', 'Usuario Satisfecho', 'No Completada', 'Cerrada'];
    const mostrarDomicilio = estadosConDomicilio.includes(orden.estado_trabajo);
    if (mostrarDomicilio) {
        const distKm = Number(orden.distancia_km || 0);
        const cargo = Number(orden.cargo_domicilio || 0);
        const modo = orden.domicilio_modo_cobro || 'no_cobrar';

        let modoTexto = '';
        let modoClase = 'text-muted';
        if (modo === 'sumar_factura') { modoTexto = 'Incluido en la factura'; modoClase = 'text-success'; }
        else if (modo === 'pago_directo_tecnico') { modoTexto = 'Pago directo al tecnico'; modoClase = 'text-warning'; }
        else { modoTexto = 'Solo informativo (no se cobra)'; }

        let distanciaTexto = distKm > 0 ? distKm + ' km' : 'N/A';
        let cargoTexto = distKm > 0 ? (cargo > 0 ? '$' + cargo.toLocaleString('es-CL') : 'Gratis') : 'No calculado';
        let cargoColor = cargo > 0 ? 'color:#d90429;' : (distKm > 0 ? 'color:#28a745;' : 'color:#6c757d;');

        document.getElementById('modal-domicilio').innerHTML = `
            <div class="row text-center mb-2">
                <div class="col-4">
                    <div class="text-muted" style="font-size:0.75rem;">Distancia</div>
                    <div class="fw-bold" style="font-size:1.1rem;">${distanciaTexto}</div>
                </div>
                <div class="col-4">
                    <div class="text-muted" style="font-size:0.75rem;">Cargo</div>
                    <div class="fw-bold" style="font-size:1.1rem; ${cargoColor}">${cargoTexto}</div>
                </div>
                <div class="col-4">
                    <div class="text-muted" style="font-size:0.75rem;">Metodo</div>
                    <div class="fw-bold ${modoClase}" style="font-size:0.75rem;">${modoTexto}</div>
                </div>
            </div>
        `;
        cardDomicilio.style.display = 'block';
    } else {
        cardDomicilio.style.display = 'none';
    }

    // Mostrar flag de orden cerrada según estado_trabajo
    const estaCerrada = orden.estado_trabajo === 'Cerrada';
    const checkboxCerrada = document.getElementById('modal-orden-cerrada');
    if (checkboxCerrada) {
        checkboxCerrada.checked = estaCerrada;
    }

    // Renderizar acciones según estado
    renderizarAcciones(orden);

    // Cargar fotos, notas y historial
    cargarFotos(orden.id);
    cargarNotas(orden.id);
    cargarHistorial(orden.id);

    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalOrden'));
    modal.show();
}

function renderizarAcciones(orden) {
    const container = document.getElementById('acciones-container');
    let html = '';

    switch (orden.estado_trabajo) {
        case 'Pendiente Visita':
            html = `
                <button class="btn btn-gps action-btn" onclick="navegarGPS()">
                    <i class="fas fa-route me-2"></i>Navegar con Waze
                </button>
                <button class="btn btn-iniciar action-btn" onclick="llegarAlSitio()">
                    <i class="fas fa-map-pin me-2"></i>Llegué al Sitio
                </button>
                <button class="btn action-btn" style="background:#000; color:#ffc800; border:2px solid #ffc800;" onclick="compartirTracking()">
                    <i class="fas fa-share-alt me-2"></i>Compartir Tracking
                </button>
            `;
            break;
        case 'En Sitio':
            html = `
                <button class="btn btn-iniciar action-btn" onclick="iniciarTrabajo()">
                    <i class="fas fa-play me-2"></i>Iniciar Trabajo
                </button>
                <button class="btn action-btn" style="background:#000; color:#ffc800; border:2px solid #ffc800;" onclick="compartirTracking()">
                    <i class="fas fa-share-alt me-2"></i>Compartir Tracking
                </button>
            `;
            break;
        case 'En Progreso':
            html = `
                <button class="btn btn-completar action-btn" onclick="mostrarConfirmacionCompletar()">
                    <i class="fas fa-check me-2"></i>Completar Trabajo
                </button>
                <button class="btn btn-no-completar action-btn" onclick="abrirModalNoCompletada()">
                    <i class="fas fa-times me-2"></i>No Completado
                </button>
            `;
            break;
        case 'Pendiente Piezas':
            html = `
                <button class="btn btn-iniciar action-btn" onclick="retomarTrabajo()">
                    <i class="fas fa-play me-2"></i>Retomar Trabajo
                </button>
            `;
            break;
        case 'Completada':
            html = `
                <div id="cierre-panel" class="orden-card mb-3">
                    <h6 class="fw-bold mb-3"><i class="fas fa-check-circle me-2"></i>Completar Cierre de Orden</h6>
                    <div class="mb-3">
                        <label class="form-label">Notas de cierre <span class="text-danger">*</span></label>
                        <textarea id="notas-cierre" class="form-control" rows="3" placeholder="Describe lo que se hizo..." required></textarea>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">¿El cliente pagó?</label>
                        <div class="btn-radio-group">
                            <input type="radio" class="btn-check" name="pago-cerrado" id="pago-cerrado-si" value="si" onclick="actualizarPanelPagoCierre()">
                            <label class="btn btn-outline-dark" for="pago-cerrado-si">Sí</label>
                            <input type="radio" class="btn-check" name="pago-cerrado" id="pago-cerrado-no" value="no" onclick="actualizarPanelPagoCierre()">
                            <label class="btn btn-outline-dark" for="pago-cerrado-no">No</label>
                        </div>
                    </div>
                    <div id="pago-metodo-panel" class="mb-3" style="display:none;">
                        <label class="form-label">Método de pago</label>
                        <div class="btn-option-group">
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Efectivo')">Efectivo</button>
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Transferencia')">Transferencia</button>
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Mercado Pago')">Mercado Pago</button>
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Cheque')">Cheque</button>
                        </div>
                        <select id="metodo-pago-cierre" class="form-select" style="display:none;">
                            <option value="">Seleccione método...</option>
                            <option value="Efectivo">Efectivo</option>
                            <option value="Transferencia">Transferencia</option>
                            <option value="Mercado Pago">Mercado Pago</option>
                            <option value="Cheque">Cheque</option>
                        </select>
                    </div>
                    <div id="pago-motivo-panel" class="mb-3" style="display:none;">
                        <label class="form-label">Motivo de pago pendiente</label>
                        <div class="btn-option-group">
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Cliente no tenía efectivo')">Sin efectivo</button>
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Pago pendiente por transferencia')">Transferencia</button>
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Cliente no se encontraba')">No estaba</button>
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Otro')">Otro</button>
                        </div>
                        <select id="motivo-no-pago-cierre" class="form-select" style="display:none;">
                            <option value="">Seleccione motivo...</option>
                            <option value="Cliente no tenía efectivo">Cliente no tenía efectivo</option>
                            <option value="Pago pendiente por transferencia">Pago pendiente por transferencia</option>
                            <option value="Cliente no se encontraba">Cliente no se encontraba</option>
                            <option value="Otro">Otro</option>
                        </select>
                    </div>
                    <button class="btn btn-completar action-btn" onclick="aceptarYCerrarOrden()">
                        <i class="fas fa-check me-2"></i>Cerrar Orden
                    </button>
                </div>
            `;
            break;
        case 'Usuario Satisfecho':
            html = `
                <div id="cierre-panel" class="orden-card mb-3">
                    <h6 class="fw-bold mb-3"><i class="fas fa-check-double me-2"></i>Completar Cierre de Orden</h6>
                    <div class="mb-3">
                        <label class="form-label">Notas de cierre <span class="text-danger">*</span></label>
                        <textarea id="notas-cierre" class="form-control" rows="3" placeholder="Describe lo que se hizo..." required></textarea>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">¿El cliente pagó?</label>
                        <div class="btn-radio-group">
                            <input type="radio" class="btn-check" name="pago-cerrado" id="pago-cerrado-si" value="si" onclick="actualizarPanelPagoCierre()">
                            <label class="btn btn-outline-dark" for="pago-cerrado-si">Sí</label>
                            <input type="radio" class="btn-check" name="pago-cerrado" id="pago-cerrado-no" value="no" onclick="actualizarPanelPagoCierre()">
                            <label class="btn btn-outline-dark" for="pago-cerrado-no">No</label>
                        </div>
                    </div>
                    <div id="pago-metodo-panel" class="mb-3" style="display:none;">
                        <label class="form-label">Método de pago</label>
                        <div class="btn-option-group">
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Efectivo')">Efectivo</button>
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Transferencia')">Transferencia</button>
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Mercado Pago')">Mercado Pago</button>
                            <button type="button" class="option-btn" onclick="seleccionarMetodoPagoCierre('Cheque')">Cheque</button>
                        </div>
                        <select id="metodo-pago-cierre" class="form-select" style="display:none;">
                            <option value="">Seleccione método...</option>
                            <option value="Efectivo">Efectivo</option>
                            <option value="Transferencia">Transferencia</option>
                            <option value="Mercado Pago">Mercado Pago</option>
                            <option value="Cheque">Cheque</option>
                        </select>
                    </div>
                    <div id="pago-motivo-panel" class="mb-3" style="display:none;">
                        <label class="form-label">Motivo de pago pendiente</label>
                        <div class="btn-option-group">
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Cliente no tenía efectivo')">Sin efectivo</button>
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Pago pendiente por transferencia')">Transferencia</button>
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Cliente no se encontraba')">No estaba</button>
                            <button type="button" class="option-btn" onclick="seleccionarMotivoNoPagoCierre('Otro')">Otro</button>
                        </div>
                        <select id="motivo-no-pago-cierre" class="form-select" style="display:none;">
                            <option value="">Seleccione motivo...</option>
                            <option value="Cliente no tenía efectivo">Cliente no tenía efectivo</option>
                            <option value="Pago pendiente por transferencia">Pago pendiente por transferencia</option>
                            <option value="Cliente no se encontraba">Cliente no se encontraba</option>
                            <option value="Otro">Otro</option>
                        </select>
                    </div>
                    <button class="btn btn-completar action-btn" onclick="aceptarYCerrarOrden()">
                        <i class="fas fa-check me-2"></i>Cerrar Orden
                    </button>
                </div>
            `;
            break;
        case 'Cerrada':
            html = `
                <div class="text-center">
                    <p class="text-success"><i class="fas fa-check-circle me-2"></i>Orden ya cerrada</p>
                    <button class="btn btn-secondary action-btn" disabled>
                        <i class="fas fa-lock me-2"></i>Ya cerrada
                    </button>
                </div>
            `;
            break;
        case 'No Completada':
            html = `<p class="text-center text-warning"><i class="fas fa-exclamation-triangle me-2"></i>Orden No Completada</p>`;
            break;
    }

    container.innerHTML = html;
}

// ============================================
// ACCIONES DE TRABAJO
// ============================================

async function navegarGPS() {
    if (!ordenActual || !ordenActual.direccion) {
        mostrarNotificacion('warning', 'Sin Dirección', 'Esta orden no tiene dirección registrada');
        return;
    }

    // Construir dirección completa
    let dirParaWaze = ordenActual.direccion;
    if (ordenActual.referencia_direccion) {
        dirParaWaze += ', ' + ordenActual.referencia_direccion;
    }

    // Iniciar viaje/tracking automáticamente al navegar (sin confirmación)
    if (!trackingViajeActivo) {
        await iniciarViaje(true);
    }

    // Si la orden tiene coordenadas guardadas (cliente_lat/cliente_lng), usarlas directamente
    // Esto es mas preciso que geocodificar la dirección y evita llamadas a Nominatim
    let wazeUrl;
    const cLat = Number(ordenActual.cliente_lat) || 0;
    const cLng = Number(ordenActual.cliente_lng) || 0;

    if (cLat !== 0 && cLng !== 0) {
        // Coordenadas guardadas en la orden (desde el mapa selector de OT Express)
        wazeUrl = `https://waze.com/ul?ll=${cLat},${cLng}&navigate=yes`;
    } else {
        // Fallback: geocodificar la dirección con Nominatim
        try {
            const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(dirParaWaze)}&format=json&limit=1&countrycodes=cl`, {
                headers: { 'Accept-Language': 'es' }
            });
            const geoData = await geoResp.json();

            if (geoData && geoData.length > 0 && geoData[0].lat && geoData[0].lon) {
                const lat = parseFloat(geoData[0].lat).toFixed(6);
                const lng = parseFloat(geoData[0].lon).toFixed(6);
                wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
            } else {
                wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(dirParaWaze)}&navigate=yes`;
            }
        } catch (e) {
            wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(dirParaWaze)}&navigate=yes`;
        }
    }

    // Abrir Waze — usar _system para forzar navegador externo (no WebView)
    window.open(wazeUrl, '_system');
}

async function llegarAlSitio() {
    try {
        const posicion = await obtenerPosicionGPS();

        const response = await fetch(`${API_BASE}/cambiar-estado`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenActual.id,
                tecnico_id: tecnicoActual.id,
                nuevo_estado: 'En Sitio',
                latitud: posicion.lat,
                longitud: posicion.lng
            })
        });

        const data = await response.json();

        if (data.success) {
            ordenActual.estado_trabajo = 'En Sitio';

            // Detener tracking/viaje automáticamente al llegar al sitio
            if (trackingViajeActivo) {
                trackingViajeActivo = false;
                trackingOrdenId = null;
                if (trackingInterval) {
                    clearInterval(trackingInterval);
                    trackingInterval = null;
                }
                mostrarNotificacion('info', 'Viaje finalizado', 'Tracking detenido automáticamente — llegaste al destino');
            }

            // Actualizar datos de domicilio si se calcularon
            if (data.domicilio && data.domicilio.calculado) {
                ordenActual.distancia_km = data.domicilio.distancia_km;
                ordenActual.cargo_domicilio = data.domicilio.cargo;
                ordenActual.domicilio_modo_cobro = data.domicilio.modo_cobro;

                if (data.domicilio.cargo > 0) {
                    mostrarNotificacion('success', 'Llegada registrada',
                        'Distancia: ' + data.domicilio.distancia_km + ' km — Cargo: $' + data.domicilio.cargo.toLocaleString('es-CL'));
                } else {
                    mostrarNotificacion('success', 'Llegada registrada',
                        'Distancia: ' + data.domicilio.distancia_km + ' km — Dentro del radio gratis');
                }
            } else {
                mostrarNotificacion('success', '¡Bien!', 'Has marcado que llegaste al sitio');
            }

            mostrarOrdenEnModal(ordenActual);
            cargarOrdenes();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al actualizar estado');
        }
    } catch (error) {
        console.error('Error al llegar al sitio:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo actualizar el estado');
    }
}

async function iniciarTrabajo() {
    try {
        const posicion = await obtenerPosicionGPS();

        const response = await fetch(`${API_BASE}/cambiar-estado`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenActual.id,
                tecnico_id: tecnicoActual.id,
                nuevo_estado: 'En Progreso',
                latitud: posicion.lat,
                longitud: posicion.lng
            })
        });

        const data = await response.json();

        if (data.success) {
            ordenActual.estado_trabajo = 'En Progreso';
            mostrarNotificacion('success', '¡Excelente!', 'Trabajo iniciado');
            mostrarOrdenEnModal(ordenActual);
            cargarOrdenes();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al actualizar estado');
        }
    } catch (error) {
        console.error('Error al iniciar trabajo:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo iniciar el trabajo');
    }
}

function retomarTrabajo() {
    cambiarEstadoSimple('En Progreso', 'Trabajo retomado');
}

function mostrarConfirmacionCompletar() {
    if (confirm('¿Estás seguro de que has completado el trabajo?')) {
        cambiarEstadoSimple('Completada', 'Trabajo completado exitosamente');
    }
}

function cambiarEstadoSimple(nuevoEstado, mensaje) {
    fetch(`${API_BASE}/cambiar-estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            orden_id: ordenActual.id,
            tecnico_id: tecnicoActual.id,
            nuevo_estado: nuevoEstado
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            ordenActual.estado_trabajo = nuevoEstado;
            mostrarNotificacion('success', '¡Listo!', mensaje);
            mostrarOrdenEnModal(ordenActual);
            cargarOrdenes();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al actualizar');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo actualizar el estado');
    });
}

// ============================================
// FOTOS
// ============================================

function tomarFoto(tipo) {
    fotoTipoActual = tipo;
    document.getElementById('foto-input').click();
}

// Comprimir imagen antes de subir: resize a max 1200px + calidad 75%
function comprimirImagen(file, maxWidth, calidad) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                // Calcular dimensiones manteniendo aspecto
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Convertir a base64 comprimido (JPEG calidad 75%)
                const base64 = canvas.toDataURL('image/jpeg', calidad);
                resolve(base64);
            };
            img.onerror = () => reject(new Error('Error al cargar imagen'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Error al leer archivo'));
        reader.readAsDataURL(file);
    });
}

async function handleFotoSeleccionada(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        mostrarNotificacion('info', 'Procesando...', 'Comprimiendo imagen');

        // Comprimir: max 1200px ancho, calidad 75% → ~50-150KB por foto
        const base64 = await comprimirImagen(file, 1200, 0.75);

        const response = await fetch(`${API_BASE}/subir-foto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenActual.id,
                tecnico_id: tecnicoActual.id,
                tipo_foto: fotoTipoActual,
                imagen: base64
            })
        });

        const data = await response.json();

        if (data.success) {
            const tamanoKB = Math.round(data.tamano / 1024);
            mostrarNotificacion('success', '¡Foto Guardada!', `Foto subida (${tamanoKB}KB)`);
            cargarFotos(ordenActual.id);
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al subir foto');
        }
    } catch (error) {
        console.error('Error al subir foto:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo subir la foto');
    }

    event.target.value = ''; // Reset input
}

async function cargarFotos(ordenId) {
    try {
        const response = await fetch(`${API_BASE}/fotos?orden_id=${ordenId}`);
        const data = await response.json();

        if (data.success && data.fotos.length > 0) {
            const labels = { antes: 'Antes', despues: 'Después', evidencia: 'Evidencia' };
            let html = '';
            data.fotos.forEach(foto => {
                const lbl = labels[foto.tipo_foto] || foto.tipo_foto;
                html += `
                    <div class="photo-item" onclick="verFotoZoom('${foto.url_imagen}')">
                        <img src="${foto.url_imagen}" alt="${lbl}" loading="lazy">
                        <div class="position-absolute top-0 start-0 m-1">
                            <span class="badge bg-dark">${lbl}</span>
                        </div>
                    </div>
                `;
            });
            document.getElementById('fotos-grid').innerHTML = html;
        } else {
            document.getElementById('fotos-grid').innerHTML = '<p class="text-muted text-center">Sin fotos adjuntas</p>';
        }
    } catch (error) {
        console.error('Error al cargar fotos:', error);
        document.getElementById('fotos-grid').innerHTML = '<p class="text-muted text-center">Error al cargar fotos</p>';
    }
}

function verFotoZoom(src) {
    const overlay = document.getElementById('foto-overlay');
    const img = document.getElementById('foto-overlay-img');
    img.src = src;
    overlay.classList.add('visible');
}

// ============================================
// NOTAS
// ============================================

async function agregarNota() {
    const notaInput = document.getElementById('nueva-nota');
    const nota = notaInput.value.trim();

    if (!nota) return;

    try {
        const response = await fetch(`${API_BASE}/agregar-nota`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenActual.id,
                tecnico_id: tecnicoActual.id,
                nota: nota
            })
        });

        const data = await response.json();

        if (data.success) {
            notaInput.value = '';
            cargarNotas(ordenActual.id);
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al agregar nota');
        }
    } catch (error) {
        console.error('Error al agregar nota:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo agregar la nota');
    }
}

async function cargarNotas(ordenId) {
    try {
        const response = await fetch(`${API_BASE}/notas?orden_id=${ordenId}`);
        const data = await response.json();

        if (data.success && data.notas.length > 0) {
            let html = '';
            data.notas.forEach(nota => {
                const fecha = new Date(nota.fecha_nota);
                const hora = fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
                html += `
                    <div class="note-item">
                        <div class="note-time">${hora}</div>
                        <div>${nota.nota}</div>
                    </div>
                `;
            });
            document.getElementById('notas-lista').innerHTML = html;
        } else {
            document.getElementById('notas-lista').innerHTML = '<p class="text-muted text-center">Sin notas</p>';
        }
    } catch (error) {
        console.error('Error al cargar notas:', error);
    }
}

// ============================================
// HISTORIAL
// ============================================

async function cargarHistorial(ordenId) {
    try {
        const response = await fetch(`${API_BASE}/historial?orden_id=${ordenId}`);
        const data = await response.json();

        if (data.success && data.historial.length > 0) {
            let html = '';
            data.historial.forEach(item => {
                const fecha = new Date(item.fecha_hora);
                const fechaFormateada = fecha.toLocaleString('es-CL');
                html += `
                    <div class="d-flex mb-2">
                        <div class="me-2">
                            <i class="fas fa-circle text-success" style="font-size: 8px;"></i>
                        </div>
                        <div>
                            <div class="fw-bold">${item.estado_nuevo}</div>
                            <div class="small text-muted">${fechaFormateada}</div>
                            ${item.observaciones ? `<div class="small text-info">${item.observaciones}</div>` : ''}
                        </div>
                    </div>
                `;
            });
            document.getElementById('historial-lista').innerHTML = html;
        } else {
            document.getElementById('historial-lista').innerHTML = '<p class="text-muted text-center">Sin historial</p>';
        }
    } catch (error) {
        console.error('Error al cargar historial:', error);
    }
}

// ============================================
// ENVIAR LINK DE FIRMA AL CLIENTE
// ============================================

async function generarTokenFirma() {
    try {
        const response = await fetch(`${API_BASE}/generar-token-firma`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenActual.id,
                tecnico_id: tecnicoActual.id
            })
        });

        const data = await response.json();

        if (data.success) {
            return data.token;
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al generar token');
            return null;
        }
    } catch (error) {
        console.error('Error al generar token:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo generar el link');
        return null;
    }
}

function enviarLinkFirma(notasCierre = null, pagoCompletado = null, metodoPago = null) {
    generarTokenFirma().then(token => {
        if (!token) return;

        let linkFirma = `${window.location.origin}/aprobar-tecnico?token=${token}`;
        if (notasCierre) linkFirma += `&notas=${encodeURIComponent(notasCierre)}`;
        if (pagoCompletado !== null) linkFirma += `&pago_completado=${pagoCompletado}`;
        if (metodoPago) linkFirma += `&metodo_pago=${encodeURIComponent(metodoPago)}`;

        let mensajeCompleto = `Hola, su orden de trabajo #${String(ordenActual.numero_orden).padStart(6,'0')} está lista para su aceptación final.\n` +
            `Resumen:\n` +
            `Cliente: ${ordenActual.cliente_nombre || 'N/A'}\n` +
            `Patente: ${ordenActual.patente_placa || 'N/A'}\n` +
            `Trabajo: ${ordenActual.trabajo_frenos ? 'Frenos ' : ''}${ordenActual.trabajo_luces ? 'Luces ' : ''}${ordenActual.trabajo_tren_delantero ? 'Tren delantero ' : ''}${ordenActual.trabajo_correas ? 'Correas ' : ''}${ordenActual.trabajo_componentes ? 'Componentes ' : ''}\n` +
            `Monto total: $${Number(ordenActual.monto_total || 0).toFixed(2)}\n` +
            `Restante: $${Number(ordenActual.monto_restante || 0).toFixed(2)}\n`;

        if (notasCierre) {
            mensajeCompleto += `Notas del técnico: ${notasCierre}\n`;
        }

        mensajeCompleto += `Por favor ingrese al siguiente link para revisar y firmar la aceptación:\n${linkFirma}`;

        // Abrir WhatsApp si teléfono cliente existe
        if (ordenActual && ordenActual.cliente_telefono) {
            const telefonoLimpio = normalizarTelefonoWhatsApp(ordenActual.cliente_telefono);
            if (telefonoLimpio) {
                const whatsappUrl = `https://wa.me/${telefonoLimpio}?text=${encodeURIComponent(mensajeCompleto)}`;
                window.open(whatsappUrl, '_blank');
            }
        }

        // Mostrar modal con link + opción para abrir la página de firma directamente
        mostrarModalLinkFirma(linkFirma, mensajeCompleto);
    });
}

function copiarLinkFirma(url) {
    navigator.clipboard.writeText(url).then(() => {
        mostrarNotificacion('success', 'Link Copiado', 'El link ha sido copiado al portapapeles');
    }).catch(err => {
        console.error('Error al copiar:', err);
        mostrarNotificacion('error', 'Error', 'No se pudo copiar el link');
    });
}

function mostrarModalLinkFirma(link, mensaje = null) {
    const modalHtml = `
        <div class="modal fade" id="modalLinkFirma" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">Link de Firma Generado</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="text-muted">Envíe este link al cliente para que firme la orden y confirme el trabajo:</p>
                        <div class="input-group mb-3">
                            <input type="text" class="form-control" value="${link}" readonly id="link-firma-input">
                            <button class="btn btn-outline-success" onclick="copiarLinkFirmaModal('${link}')">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                        <div class="d-grid gap-2 mb-3">
                            <button class="btn btn-primary" onclick="window.open('${link}', '_blank')">
                                <i class="fas fa-external-link-alt me-2"></i>Abrir página de firma
                            </button>
                        </div>
                        ${mensaje ? `<p class="small text-muted">Mensaje prellenado WhatsApp:<br>${mensaje.replace(/\n/g,'<br>')}</p>` : ''}
                        <div class="alert alert-info small">
                            <i class="fas fa-info-circle me-2"></i>
                            El cliente tendrá un resumen de la orden + canvas de firma en la página.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Eliminar modal existente si hay uno
    const modalExistente = document.getElementById('modalLinkFirma');
    if (modalExistente) {
        modalExistente.remove();
    }

    // Agregar nuevo modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalLinkFirma'));
    modal.show();
}

function copiarLinkFirmaModal(link) {
    navigator.clipboard.writeText(link).then(() => {
        mostrarNotificacion('success', 'Link Copiado', 'El link ha sido copiado al portapapeles');
    }).catch(() => {
        const input = document.createElement('input');
        input.value = link;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        mostrarNotificacion('success', 'Link Copiado', 'El link ha sido copiado al portapapeles');
    });
}

async function aceptarYCerrarOrden() {
    if (!ordenActual || !tecnicoActual) {
        mostrarNotificacion('error', 'Error', 'No se puede procesar la orden en este momento');
        return;
    }

    if (ordenActual.estado_trabajo === 'Cerrada') {
        mostrarNotificacion('warning', 'Orden cerrada', 'Esta orden ya está cerrada y no puede volver a procesarse.');
        return;
    }

    const notasCierreInput = document.getElementById('notas-cierre');
    const notasCierre = notasCierreInput ? notasCierreInput.value.trim() : '';
    if (!notasCierre) {
        mostrarNotificacion('warning', 'Notas obligatorias', 'Debe ingresar las notas de cierre antes de cerrar la orden');
        if (notasCierreInput) notasCierreInput.focus();
        return;
    }

    const pagoSeleccionado = document.querySelector('input[name="pago-cerrado"]:checked');
    if (!pagoSeleccionado) {
        mostrarNotificacion('warning', 'Pago obligatorio', 'Debe indicar si el cliente pagó o no antes de cerrar la orden');
        return;
    }

    const pagoCompletado = pagoSeleccionado.value === 'si';
    let metodoPago = null;
    let motivoNoPago = null;

    if (pagoCompletado) {
        const metodoSelect = document.getElementById('metodo-pago-cierre');
        metodoPago = metodoSelect ? metodoSelect.value : '';
        if (!metodoPago) {
            mostrarNotificacion('warning', 'Método obligatorio', 'Debe seleccionar el método de pago del cliente');
            if (metodoSelect) metodoSelect.focus();
            return;
        }
    } else {
        const motivoSelect = document.getElementById('motivo-no-pago-cierre');
        motivoNoPago = motivoSelect ? motivoSelect.value : '';
        if (!motivoNoPago) {
            mostrarNotificacion('warning', 'Motivo obligatorio', 'Debe seleccionar el motivo por el cual no pagó el cliente');
            if (motivoSelect) motivoSelect.focus();
            return;
        }
    }

    // Generar token de firma
    try {
        const tokenResponse = await fetch(`${API_BASE}/generar-token-firma`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenActual.id,
                tecnico_id: tecnicoActual.id
            })
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.success) {
            mostrarNotificacion('error', 'Error', tokenData.error || 'No se pudo generar el token de firma');
            return;
        }

        const token = tokenData.token;
        const metodoPagoParam = pagoCompletado ? metodoPago : `Pago pendiente: ${motivoNoPago}`;

        // Construir URL de firma con parámetros
        const firmaUrl = `${window.location.origin}/aprobar-tecnico?token=${encodeURIComponent(token)}&notas=${encodeURIComponent(notasCierre)}&pago_completado=${pagoCompletado}&metodo_pago=${encodeURIComponent(metodoPagoParam)}`;

        // Mostrar botones para compartir el link
        const cierrePanel = document.getElementById('cierre-panel');
        if (cierrePanel) {
            cierrePanel.innerHTML = `
                <div class="orden-card mb-3">
                    <h6 class="fw-bold mb-3"><i class="fas fa-share-alt me-2"></i>Compartir Link de Firma</h6>
                    <p class="text-muted mb-3">Envía este link al cliente para que firme y cierre la orden.</p>
                    <div class="d-grid gap-2">
                        <button class="btn btn-primary" onclick="copiarLinkFirma('${firmaUrl}')">
                            <i class="fas fa-copy me-2"></i>Copiar Link
                        </button>
                        <button class="btn btn-success" onclick="enviarWhatsApp('${firmaUrl}')">
                            <i class="fab fa-whatsapp me-2"></i>Enviar por WhatsApp
                        </button>
                    </div>
                </div>
            `;
        }

        mostrarNotificacion('success', 'Link generado', 'Se ha generado el link de firma. Compártelo con el cliente.');

    } catch (error) {
        console.error('Error al generar token de firma:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo iniciar el proceso de firma. Intente nuevamente.');
    }
}

function actualizarPanelPagoCierre() {
    const pagoSi = document.getElementById('pago-cerrado-si')?.checked;
    const pagoNo = document.getElementById('pago-cerrado-no')?.checked;
    const metodoPanel = document.getElementById('pago-metodo-panel');
    const motivoPanel = document.getElementById('pago-motivo-panel');
    const metodoSelect = document.getElementById('metodo-pago-cierre');
    const motivoSelect = document.getElementById('motivo-no-pago-cierre');

    if (metodoPanel) metodoPanel.style.display = pagoSi ? 'block' : 'none';
    if (motivoPanel) motivoPanel.style.display = pagoNo ? 'block' : 'none';

    if (pagoSi && motivoSelect) {
        motivoSelect.value = '';
        document.querySelectorAll('#pago-motivo-panel .option-btn').forEach(btn => btn.classList.remove('active'));
    }
    if (pagoNo && metodoSelect) {
        metodoSelect.value = '';
        document.querySelectorAll('#pago-metodo-panel .option-btn').forEach(btn => btn.classList.remove('active'));
    }
}

function seleccionarMetodoPagoCierre(metodo) {
    const metodoSelect = document.getElementById('metodo-pago-cierre');
    if (!metodoSelect) return;
    metodoSelect.value = metodo;
    document.querySelectorAll('#pago-metodo-panel .option-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === metodo);
    });
}

function seleccionarMotivoNoPagoCierre(motivo) {
    const motivoSelect = document.getElementById('motivo-no-pago-cierre');
    if (!motivoSelect) return;
    motivoSelect.value = motivo;
    document.querySelectorAll('#pago-motivo-panel .option-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === motivo);
    });
}

function enviarResumenWhatsApp() {
    if (!ordenActual) return;

    const tel = normalizarTelefonoWhatsApp(ordenActual.cliente_telefono);
    if (!tel) {
        mostrarNotificacion('error', 'Error', 'Número de teléfono inválido');
        return;
    }

    const mensaje = encodeURIComponent(`Pedido #${String(ordenActual.numero_orden).padStart(6, '0')} cerrado.\n` +
        `Cliente: ${ordenActual.cliente_nombre || 'N/A'}\n` +
        `Vehículo: ${ordenActual.marca || 'N/A'} ${ordenActual.modelo || ''} ${ordenActual.patente_placa || ''}\n` +
        `Estado final: ${ordenActual.estado_trabajo || ordenActual.estado}\n` +
        `Fecha cierre: ${new Date().toLocaleString('es-CL')}\n` +
        `Gracias por su confianza en Global Pro!`);

    const whatsappUrl = `https://wa.me/${tel}?text=${mensaje}`;
    window.open(whatsappUrl, '_blank');
}

// ============================================
// ORDEN NO COMPLETADA
// ============================================

function abrirModalNoCompletada() {
    const modal = new bootstrap.Modal(document.getElementById('modalNoCompletada'));
    modal.show();
}

async function guardarNoCompletada() {
    const motivo = document.getElementById('motivo-no-completada').value;
    const detalles = document.getElementById('detalles-no-completada').value.trim();

    if (!motivo) {
        mostrarNotificacion('warning', 'Falta Motivo', 'Seleccione el motivo por el cual no se completó');
        return;
    }

    try {
        let posicion = {};
        try {
            posicion = await obtenerPosicionGPS();
        } catch (e) {
            console.log('No se pudo obtener GPS');
        }

        const response = await fetch(`${API_BASE}/cambiar-estado`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenActual.id,
                tecnico_id: tecnicoActual.id,
                nuevo_estado: 'No Completada',
                observaciones: `${motivo}. ${detalles}`,
                latitud: posicion.lat || null,
                longitud: posicion.lng || null
            })
        });

        const data = await response.json();

        if (data.success) {
            ordenActual.estado_trabajo = 'No Completada';
            mostrarNotificacion('warning', 'Reportado', 'La orden ha sido marcada como no completada');

            // Cerrar modal y actualizar
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalNoCompletada'));
            modal.hide();

            mostrarOrdenEnModal(ordenActual);
            cargarOrdenes();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al reportar');
        }
    } catch (error) {
        console.error('Error al guardar no completada:', error);
        mostrarNotificacion('error', 'Error', 'No se pudo reportar');
    }
}

// ============================================
// UTILIDADES
// ============================================

function obtenerPosicionGPS() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocalización no soportada'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

function obtenerClaseEstado(estado) {
    const clases = {
        'Pendiente Visita': 'estado-pendiente-visita',
        'En Sitio': 'estado-en-sitio',
        'En Progreso': 'estado-en-progreso',
        'Pendiente Piezas': 'estado-pendiente-piezas',
        'Completada': 'estado-completada',
        'Aprobada': 'estado-aprobada',
        'Usuario Satisfecho': 'estado-aprobada',
        'No Completada': 'estado-no-completada',
        'Cerrada': 'estado-cerrada'
    };
    return clases[estado] || 'bg-secondary';
}

function mostrarNotificacion(tipo, titulo, mensaje) {
    // Crear toast dinámicamente
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    toastContainer.style.zIndex = '9999';

    const bgClass = tipo === 'success' ? 'bg-success' :
                    tipo === 'error' ? 'bg-danger' :
                    tipo === 'warning' ? 'bg-warning' : 'bg-primary';

    toastContainer.innerHTML = `
        <div class="toast show" role="alert">
            <div class="toast-header ${bgClass} text-white">
                <strong class="me-auto">${titulo}</strong>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
            </div>
            <div class="toast-body">
                ${mensaje}
            </div>
        </div>
    `;

    document.body.appendChild(toastContainer);

    // Remover después de 3 segundos
    setTimeout(() => {
        toastContainer.remove();
    }, 3000);
}

// ============================================
// HELPER: Normalizar teléfono para WhatsApp (wa.me)
// wa.me necesita SOLO digitos, sin +
// - Chile (empieza con 9): agregar 56 al inicio
// - Internacional (+58, +1, etc): dejar tal cual (sin +)
// ============================================
function normalizarTelefonoWhatsApp(telefono) {
    if (!telefono) return '';
    // Quitar todo lo que no sea digito
    let tel = String(telefono).replace(/\D/g, '');
    // Si empieza con 9 (formato local chileno), agregar prefijo 56
    if (tel.startsWith('9') && tel.length <= 9) {
        tel = '56' + tel;
    }
    // Validar longitud minima
    if (tel.length < 10) return '';
    return tel;
}

function enviarWhatsApp(url) {
    if (!ordenActual || !ordenActual.cliente_telefono) {
        mostrarNotificacion('error', 'Error', 'No se encontró el número de teléfono del cliente');
        return;
    }

    const telefono = normalizarTelefonoWhatsApp(ordenActual.cliente_telefono);
    if (!telefono) {
        mostrarNotificacion('error', 'Error', 'Número de teléfono inválido');
        return;
    }

    const mensaje = encodeURIComponent(`Firma la orden aquí: ${url}`);
    const whatsappUrl = `https://wa.me/${telefono}?text=${mensaje}`;

    window.open(whatsappUrl, '_blank');
}

// Actualizar órdenes cada 30 segundos (solo si no hay alertas activas, el polling silencioso ya lo hace)
// setInterval eliminado - reemplazado por sistema de polling con detección de nuevas órdenes

// ============================================
// SISTEMA DE ALERTAS PARA NUEVAS ÓRDENES
// ============================================

// Iniciar polling cada 30 segundos para detectar nuevas órdenes
function iniciarPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(function() {
        if (tecnicoActual && document.getElementById('app-screen').style.display !== 'none') {
            verificarNuevasOrdenes();
        }
    }, 30000); // cada 30 segundos
}

// Verificar si hay nuevas órdenes asignadas
async function verificarNuevasOrdenes() {
    if (!tecnicoActual) return;
    try {
        var response = await fetch(`${API_BASE}/ordenes?tecnico_id=${tecnicoActual.id}`);
        var data = await response.json();
        if (!data.success) return;

        var nuevasOrdenes = data.ordenes;
        var nuevosIds = nuevasOrdenes.map(function(o) { return o.id; });

        // Detectar órdenes que no estaban antes
        var ordenesNuevas = nuevasOrdenes.filter(function(o) {
            return !ordenesConocidas.includes(o.id);
        });

        if (ordenesNuevas.length > 0) {
            // Actualizar lista y renderizar
            ordenes = nuevasOrdenes;
            renderizarOrdenes();

            // Actualizar IDs conocidos
            ordenesConocidas = nuevosIds;

            // Disparar alerta por cada nueva orden
            ordenesNuevas.forEach(function(orden) {
                dispararAlerta(orden);
            });
        } else {
            // Actualizar datos silenciosamente
            ordenes = nuevasOrdenes;
            renderizarOrdenes();
            ordenesConocidas = nuevosIds;
        }
    } catch (error) {
        console.log('Error en polling de nuevas órdenes:', error.message);
    }
}

// Disparar alerta: sonido + vibración + notificación + banner
function dispararAlerta(orden) {
    var numOT = String(orden.numero_orden || 0).padStart(6, '0');
    var info = 'OT #' + numOT + ' - ' + (orden.cliente_nombre || '') + ' - ' + (orden.marca || '') + ' ' + (orden.modelo || '');

    // 1. Reproducir sonido de alarma
    try {
        var audio = document.getElementById('alerta-sonido');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(function() {
                // Si falla el autoplay, generar sonido con Web Audio API
                generarSonidoAlarma();
            });
        } else {
            generarSonidoAlarma();
        }
    } catch(e) { generarSonidoAlarma(); }

    // 2. Vibrar el teléfono (3 pulsaciones largas)
    try {
        if (navigator.vibrate) {
            navigator.vibrate([500, 200, 500, 200, 500]);
        }
    } catch(e) {}

    // 3. Mostrar notificación del navegador (si están activadas)
    try {
        if (Notification && Notification.permission === 'granted') {
            var notif = new Notification('Nueva Orden Asignada!', {
                body: info,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: 'nueva-orden-' + orden.id,
                requireInteraction: true
            });
            notif.onclick = function() {
                window.focus();
                aceptarNuevaOrden();
            };
        }
    } catch(e) {}

    // 4. Mostrar banner en la app
    nuevaOrdenPendiente = orden;
    document.getElementById('banner-nueva-orden-info').textContent = info;
    document.getElementById('banner-nueva-orden').style.display = 'block';

    // Auto-ocultar después de 15 segundos
    setTimeout(function() {
        document.getElementById('banner-nueva-orden').style.display = 'none';
    }, 15000);
}

// Generar sonido de alarma con Web Audio API (fallback si no hay archivo mp3)
function generarSonidoAlarma() {
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        // Reproducir 3 pitidos agudos
        [0, 0.3, 0.6].forEach(function(delay) {
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.5, ctx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.2);
            osc.start(ctx.currentTime + delay);
            osc.stop(ctx.currentTime + delay + 0.25);
        });
    } catch(e) {}
}

// Aceptar nueva orden (al tocar el banner)
function aceptarNuevaOrden() {
    document.getElementById('banner-nueva-orden').style.display = 'none';
    if (nuevaOrdenPendiente) {
        verOrden(nuevaOrdenPendiente.id);
        nuevaOrdenPendiente = null;
    } else {
        cargarOrdenes();
    }
}

// Activar alertas (pedir permisos de notificación)
async function activarAlertas() {
    try {
        // Pedir permiso de notificaciones del navegador
        if ('Notification' in window) {
            var permiso = await Notification.requestPermission();
            if (permiso === 'granted') {
                alertasActivadas = true;
                document.getElementById('btn-alertas').style.display = 'none';
                mostrarNotificacion('success', 'Alertas Activadas', 'Recibirás alertas con sonido y vibración cuando te asignen nuevas órdenes');

                // Probar sonido
                generarSonidoAlarma();
                try { if (navigator.vibrate) navigator.vibrate(300); } catch(e) {}
            } else {
                mostrarNotificacion('warning', 'Permiso Denegado', 'Activa las notificaciones en tu navegador para recibir alertas');
            }
        } else {
            // Navegador no soporta notificaciones, pero activamos sonido y vibración
            alertasActivadas = true;
            document.getElementById('btn-alertas').style.display = 'none';
            mostrarNotificacion('success', 'Alertas Activadas', 'Recibirás alertas con sonido y vibración');
            generarSonidoAlarma();
        }
    } catch(e) {
        alertasActivadas = true;
        document.getElementById('btn-alertas').style.display = 'none';
        mostrarNotificacion('success', 'Alertas Activadas', 'Alertas activadas con sonido');
    }
}

// ============================================
// TRACKING EN TIEMPO REAL (INICIAR VIAJE)
// ============================================

// Iniciar el tracking de viaje
// silencioso=true cuando se llama automáticamente desde navegarGPS()
async function iniciarViaje(silencioso) {
    if (!ordenActual) return;

    if (trackingViajeActivo) {
        if (!silencioso) mostrarNotificacion('warning', 'Viaje en Curso', 'Ya tienes un viaje activo. Detenlo primero.');
        return;
    }

    // Solo pedir confirmación si se presionó manualmente el botón
    if (!silencioso) {
        if (!confirm('Iniciar viaje? El cliente podrá ver tu ubicación en tiempo real en el mapa.')) return;
    }

    trackingViajeActivo = true;
    trackingOrdenId = ordenActual.id;

    if (silencioso) {
        mostrarNotificacion('success', 'Viaje Iniciado', 'Tracking activado automaticamente. El cliente puede verte en el mapa.');
    } else {
        mostrarNotificacion('success', 'Viaje Iniciado', 'Tu ubicación se envía cada 30 segundos. El cliente puede verte en el mapa.');
    }

    // Enviar ubicación inmediatamente
    await enviarUbicacionTracking();

    // Iniciar envío cada 30 segundos
    trackingInterval = setInterval(async function() {
        if (trackingViajeActivo && ordenActual) {
            await enviarUbicacionTracking();
        }
    }, 30000);

    // Actualizar botones en el modal
    renderizarAcciones(ordenActual);
}

// Detener el tracking de viaje
function detenerViaje() {
    if (!confirm('Detener viaje? El cliente dejará de ver tu ubicación.')) return;

    trackingViajeActivo = false;
    trackingOrdenId = null;

    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }

    mostrarNotificacion('success', 'Viaje Detenido', 'Tracking detenido. El cliente ya no ve tu ubicación.');

    // Actualizar botones
    if (ordenActual) renderizarAcciones(ordenActual);
}

// Enviar ubicación GPS al servidor
async function enviarUbicacionTracking() {
    if (!tecnicoActual || !ordenActual) return;

    try {
        var posicion = await obtenerPosicionGPS();

        await fetch(`${API_BASE}/tracking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenActual.id,
                tecnico_id: tecnicoActual.id,
                latitud: posicion.lat,
                longitud: posicion.lng,
                velocidad: posicion.velocidad || 0
            })
        });
    } catch (error) {
        console.log('Error enviando tracking:', error.message);
    }
}

// Compartir link de tracking con el cliente
async function compartirTracking() {
    if (!ordenActual) return;

    var token = ordenActual.token;
    if (!token) {
        // Intentar obtener el token de la orden completa
        try {
            var resp = await fetch(`${API_BASE}/orden?id=${ordenActual.id}&tecnico_id=${tecnicoActual.id}`);
            var data = await resp.json();
            if (data.success && data.orden && data.orden.token) {
                token = data.orden.token;
            }
        } catch(e) {}
    }

    if (!token) {
        mostrarNotificacion('error', 'Error', 'No se pudo obtener el link de tracking');
        return;
    }

    var trackingUrl = 'https://sgc-ordenes.pages.dev/tracking?token=' + token;
    var estadoTracking = trackingViajeActivo
        ? '<div class="alert alert-success mt-3 mb-0 py-2"><i class="fas fa-broadcast-tower me-2"></i>Tracking ACTIVO - El cliente puede verte en el mapa</div>'
        : '<div class="alert alert-warning mt-3 mb-0 py-2"><i class="fas fa-exclamation-triangle me-2"></i>Debes iniciar el viaje para que el cliente te vea en el mapa</div>';

    // Crear o actualizar modal de tracking
    var modalExistente = document.getElementById('modalTracking');
    if (modalExistente) modalExistente.remove();

    var modalHTML = `
        <div class="modal fade" id="modalTracking" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="border-radius:22px; overflow:hidden;">
                    <div class="modal-header" style="background:#000; color:#ffc800; border-bottom:3px solid #ffc800;">
                        <h5 class="modal-title"><i class="fas fa-map-marked-alt me-2"></i>Compartir Tracking</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body" style="background:#1a1a1a; color:#fff;">
                        <p class="text-muted mb-3" style="font-size:0.9rem;">Comparte este link con el cliente para que vea tu ubicacion en tiempo real en el mapa.</p>
                        <div class="input-group mb-3">
                            <input type="text" class="form-control" value="${trackingUrl}" id="tracking-link-input" readonly style="font-size:0.8rem; background:#222; color:#ffc800; border:1px solid #444;">
                            <button class="btn" style="background:#ffc800; color:#111; font-weight:700;" onclick="copiarLinkTracking()">
                                <i class="fas fa-copy me-1"></i>Copiar
                            </button>
                        </div>
                        <div class="d-grid gap-2">
                            <button class="btn btn-success btn-lg" style="border-radius:14px; font-weight:700;" onclick="enviarTrackingWhatsApp('${trackingUrl}')">
                                <i class="fab fa-whatsapp me-2"></i>Enviar por WhatsApp
                            </button>
                        </div>
                        ${estadoTracking}
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    var modal = new bootstrap.Modal(document.getElementById('modalTracking'));
    modal.show();

    // Limpiar modal del DOM cuando se cierre
    document.getElementById('modalTracking').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

function copiarLinkTracking() {
    var input = document.getElementById('tracking-link-input');
    if (input) {
        navigator.clipboard.writeText(input.value).then(function() {
            mostrarNotificacion('success', 'Link Copiado', 'Link de tracking copiado al portapapeles');
        }).catch(function() {
            input.select();
            document.execCommand('copy');
            mostrarNotificacion('success', 'Link Copiado', 'Link de tracking copiado');
        });
    }
}

function enviarTrackingWhatsApp(url) {
    if (!ordenActual) return;
    var telefono = ordenActual.cliente_telefono;
    if (!telefono) {
        mostrarNotificacion('error', 'Sin Teléfono', 'No hay teléfono del cliente para enviar WhatsApp');
        return;
    }
    var tel = String(telefono).replace(/[^0-9]/g, '');
    var mensaje = encodeURIComponent('Hola! Puedes ver mi ubicación en tiempo real mientras voy a tu domicilio en este link: ' + url + '\n\nGlobal Pro Automotriz');
    window.open('https://wa.me/' + tel + '?text=' + mensaje, '_blank');
}
