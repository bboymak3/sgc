// ============================================
// APP.JS - Lógica del Panel Administrativo
// Global Pro Automotriz
// ============================================

// Configuración
const API_BASE = '/api';

// Fecha y hora actual en Chile (UTC-3)
function getChileNow() {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + (-3 * 60 * 60000));
}
function getChileDate() {
    return getChileNow().toISOString().split('T')[0];
}
function getChileMonth() {
    return getChileNow().toISOString().slice(0, 7);
}

let ordenActual = null;
let ordenesFiltradas = [];
let adminToken = null;

// ============================================
// LOGIN ADMIN
// ============================================
(function() {
    var token = localStorage.getItem('gp_admin_token');
    if (token) {
        adminToken = token;
        mostrarApp();
    }
})();

function doLogin() {
    var btn = document.getElementById('login-btn');
    var errDiv = document.getElementById('login-error');
    var usuario = document.getElementById('login-usuario').value.trim();
    var password = document.getElementById('login-password').value.trim();
    if (!usuario || !password) { errDiv.style.display = 'block'; errDiv.textContent = 'Usuario y contrasena requeridos'; return; }
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Verificando...';
    errDiv.style.display = 'none';
    fetch(API_BASE + '/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuario, password: password })
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.success) {
            adminToken = data.token;
            localStorage.setItem('gp_admin_token', data.token);
            mostrarApp();
        } else {
            errDiv.style.display = 'block'; errDiv.textContent = data.error || 'Error al iniciar sesion';
            btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>Ingresar';
        }
    }).catch(function(e) {
        errDiv.style.display = 'block'; errDiv.textContent = 'Error de conexion';
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>Ingresar';
    });
}

function mostrarApp() {
    var overlay = document.getElementById('login-overlay');
    var mainApp = document.getElementById('main-app');
    if (overlay) overlay.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';

    // Si hay hash en URL, navegar a esa sección (usado desde calendario.html links)
    var hash = window.location.hash.replace('#', '');
    if (hash) {
        setTimeout(function() { mostrarSeccion(hash); }, 100);
    }

    // Si viene de calendario.html con ?ver_orden=XXX, abrir esa orden directamente
    var params = new URLSearchParams(window.location.search);
    var verOrdenNum = params.get('ver_orden');
    if (verOrdenNum) {
        setTimeout(function() {
            if (typeof verOrdenPorNumero === 'function') {
                verOrdenPorNumero(parseInt(verOrdenNum));
            }
        }, 500);
        // Limpiar URL sin recargar
        window.history.replaceState({}, '', '/index.html' + (hash ? '#' + hash : ''));
    }
}

function doLogout() {
    localStorage.removeItem('gp_admin_token');
    adminToken = null;
    location.reload();
}

// ============================================
// MODO OSCURO
// ============================================
function toggleDarkMode() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    if (isDark) {
        html.removeAttribute('data-theme');
        localStorage.setItem('gp_dark_mode', 'light');
        const icon = document.getElementById('icon-dark-mode-sidebar');
        if (icon) icon.className = 'fas fa-moon';
        const label = document.getElementById('darkmode-label-sidebar');
        if (label) label.textContent = 'Modo Oscuro';
    } else {
        html.setAttribute('data-theme', 'dark');
        localStorage.setItem('gp_dark_mode', 'dark');
        const icon = document.getElementById('icon-dark-mode-sidebar');
        if (icon) icon.className = 'fas fa-sun';
        const label = document.getElementById('darkmode-label-sidebar');
        if (label) label.textContent = 'Modo Claro';
    }
}

// Restaurar modo oscuro guardado
(function initDarkMode() {
    const saved = localStorage.getItem('gp_dark_mode');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        // Cambiar ícono y label cuando DOM esté listo
        document.addEventListener('DOMContentLoaded', () => {
            const icon = document.getElementById('icon-dark-mode-sidebar');
            if (icon) icon.className = 'fas fa-sun';
            const label = document.getElementById('darkmode-label-sidebar');
            if (label) label.textContent = 'Modo Claro';
        });
    }
})();

// ============================================
// CATÁLOGO DE SERVICIOS (variable global)
// ============================================
let serviciosCatalogo = [];
let costosExtraTemporales = []; // Costos extra manuales en el form de crear OT
let tecnicosGlobal = []; // Lista global de técnicos para selectores por item
let diagnosticosItemsTemporales = []; // Items de diagnóstico en el form de crear OT (técnico + notas + valor)

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    // Establecer fecha y hora actual
    const ahora = new Date();
    document.getElementById('fecha-ingreso').value = getChileDate();
    document.getElementById('hora-ingreso').value = ahora.toTimeString().slice(0, 5);
    
    // Cargar próximo número de orden
    cargarProximoNumeroOrden();
    
    // Cargar técnicos para el selector de diagnóstico
    cargarTecnicosParaDiagnostico();
});

// ============================================
// NAVEGACIÓN
// ============================================
// NOTA: mostrarSeccion se define más abajo (línea ~1078) con todas las secciones
// ============================================

// ============================================
// DIAGNÓSTICO SIMPLIFICADO (técnico + notas + valor)
// ============================================

async function cargarTecnicosParaDiagnostico() {
    try {
        const tecResp = await fetch(`${API_BASE}/admin/tecnicos`);
        const tecData = await tecResp.json();
        if (tecData.success && tecData.tecnicos) {
            tecnicosGlobal = tecData.tecnicos.filter(t => t.activo);
            // Llenar selector del formulario crear OT
            llenarSelectorTecnicos('diag-nuevo-tecnico');
        }
    } catch(e) {
        console.error('Error cargando técnicos para diagnóstico:', e);
    }
}

function llenarSelectorTecnicos(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Seleccione...</option>';
    tecnicosGlobal.forEach(t => {
        const comision = t.comision_porcentaje || 40;
        sel.innerHTML += `<option value="${t.id}">${t.nombre}${t.apellido ? ' ' + t.apellido : ''} (${comision}%)</option>`;
    });
}

function agregarItemDiagnostico() {
    const tecSel = document.getElementById('diag-nuevo-tecnico');
    const notas = document.getElementById('diag-nuevo-notas').value.trim();
    const valor = parseFloat(document.getElementById('diag-nuevo-valor').value) || 0;
    const tipo = document.getElementById('diag-nuevo-tipo').value;

    if (!tecSel.value) { mostrarNotificacion('warning', 'Advertencia', 'Seleccione un técnico'); return; }
    if (!notas) { mostrarNotificacion('warning', 'Advertencia', 'Escriba una descripción'); return; }
    if (valor <= 0) { mostrarNotificacion('warning', 'Advertencia', 'Ingrese un valor mayor a 0'); return; }

    const tec = tecnicosGlobal.find(t => String(t.id) === tecSel.value);
    diagnosticosItemsTemporales.push({
        id: Date.now(),
        tecnico_id: parseInt(tecSel.value),
        tecnico_nombre: tec ? (tec.nombre + (tec.apellido ? ' ' + tec.apellido : '')) : '',
        comision_porcentaje: tec ? (tec.comision_porcentaje || 40) : 40,
        nombre: notas,
        descripcion: notas,
        precio_final: valor,
        tipo_comision: tipo
    });

    // Limpiar campos
    document.getElementById('diag-nuevo-notas').value = '';
    document.getElementById('diag-nuevo-valor').value = '';
    document.getElementById('diag-nuevo-notas').focus();

    renderizarItemsDiagnostico();
    calcularMontoTotalFormCrear();
}

function eliminarItemDiagnostico(index) {
    diagnosticosItemsTemporales.splice(index, 1);
    renderizarItemsDiagnostico();
    calcularMontoTotalFormCrear();
}

function renderizarItemsDiagnostico() {
    const container = document.getElementById('diag-items-lista');
    if (!container) return;

    if (diagnosticosItemsTemporales.length === 0) {
        container.innerHTML = '';
        document.getElementById('diag-total-mo').textContent = '$0';
        document.getElementById('diag-total-repuestos').textContent = '$0';
        document.getElementById('diag-subtotal-valor').textContent = '$0';
        return;
    }

    let html = '<div class="table-responsive"><table class="table table-sm table-bordered mb-0"><thead class="table-light"><tr><th>Técnico</th><th>Descripción</th><th>Tipo</th><th class="text-end">Valor</th><th class="text-end">Comisión</th><th width="40"></th></tr></thead><tbody>';
    let totalMO = 0, totalRep = 0, total = 0;
    diagnosticosItemsTemporales.forEach((item, i) => {
        const precio = Number(item.precio_final) || 0;
        const esMO = item.tipo_comision === 'mano_obra';
        if (esMO) totalMO += precio; else totalRep += precio;
        total += precio;
        const comision = Math.round(precio * (item.comision_porcentaje || 40) / 100);
        html += `<tr>
            <td><span class="badge bg-primary">${item.tecnico_nombre || 'N/A'}</span></td>
            <td>${item.nombre || item.descripcion || '-'}</td>
            <td><span class="badge ${esMO ? 'bg-warning text-dark' : 'bg-secondary'}">${esMO ? '🔧 MO' : '🔩 Rep'}</span></td>
            <td class="text-end fw-bold">$${precio.toLocaleString('es-CL',{maximumFractionDigits:0})}</td>
            <td class="text-end text-muted small">${esMO ? '$' + comision.toLocaleString('es-CL',{maximumFractionDigits:0}) : '-'}</td>
            <td class="text-center"><button type="button" class="btn btn-outline-danger btn-sm py-0 px-1" onclick="eliminarItemDiagnostico(${i})" title="Eliminar"><i class="fas fa-trash"></i></button></td>
        </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;

    document.getElementById('diag-total-mo').textContent = '$' + totalMO.toLocaleString('es-CL',{maximumFractionDigits:0});
    document.getElementById('diag-total-repuestos').textContent = '$' + totalRep.toLocaleString('es-CL',{maximumFractionDigits:0});
    document.getElementById('diag-subtotal-valor').textContent = '$' + total.toLocaleString('es-CL',{maximumFractionDigits:0});
}

function calcularMontoTotalFormCrear() {
    const subtotalDiag = diagnosticosItemsTemporales.reduce((sum, s) => sum + (Number(s.precio_final) || 0), 0);
    const costosExtra = costosExtraTemporales.reduce((sum, c) => sum + (Number(c.monto) || 0), 0);
    const total = subtotalDiag + costosExtra;

    // Actualizar desglose en Montos y Pagos
    const elSubtotal = document.getElementById('monto-subtotal-servicios');
    const elCostos = document.getElementById('monto-costos-extra');
    const elTotal = document.getElementById('monto-total-estimado');
    const elMO = document.getElementById('monto-mano-obra');
    const elRep = document.getElementById('monto-repuestos');
    const resumenTotal = document.getElementById('resumen-total');
    const resumenAbono = document.getElementById('resumen-abono');
    const resumenRestante = document.getElementById('resumen-restante');

    if (elSubtotal) elSubtotal.textContent = '$' + subtotalDiag.toLocaleString('es-CL',{maximumFractionDigits:0});
    if (elCostos) elCostos.textContent = '$' + costosExtra.toLocaleString('es-CL',{maximumFractionDigits:0});
    if (elTotal) elTotal.textContent = '$' + total.toLocaleString('es-CL',{maximumFractionDigits:0});

    const totalMO = diagnosticosItemsTemporales.filter(s => s.tipo_comision === 'mano_obra').reduce((sum, s) => sum + (Number(s.precio_final) || 0), 0);
    const totalRep = diagnosticosItemsTemporales.filter(s => s.tipo_comision === 'repuestos').reduce((sum, s) => sum + (Number(s.precio_final) || 0), 0);
    if (elMO) elMO.textContent = '$' + totalMO.toLocaleString('es-CL',{maximumFractionDigits:0});
    if (elRep) elRep.textContent = '$' + totalRep.toLocaleString('es-CL',{maximumFractionDigits:0});

    // Resumen automático
    const abono = document.getElementById('tiene-abono')?.checked ? (parseFloat(document.getElementById('monto-abono')?.value) || 0) : 0;
    if (resumenTotal) resumenTotal.textContent = '$' + total.toLocaleString('es-CL',{maximumFractionDigits:0});
    if (resumenAbono) resumenAbono.textContent = '$' + abono.toLocaleString('es-CL',{maximumFractionDigits:0});
    if (resumenRestante) resumenRestante.textContent = '$' + (total - abono).toLocaleString('es-CL',{maximumFractionDigits:0});

    return total;
}

// ============================================
// FUNCIONES DEL FORMULARIO
// ============================================


function toggleAbono() {
    const tieneAbono = document.getElementById('tiene-abono').checked;
    const seccionAbono = document.getElementById('seccion-abono');
    seccionAbono.style.display = tieneAbono ? 'block' : 'none';
    
    if (!tieneAbono) {
        document.getElementById('monto-abono').value = '';
        document.getElementById('metodo-pago').value = 'Efectivo';
    }
    
    calcularRestante();
}

function calcularRestante() {
    calcularMontoTotalFormCrear();
}

function calcularMontoTotalDesdeServicios(serviciosSeleccionados) {
    const subtotalServicios = serviciosSeleccionados.reduce((sum, s) => sum + (Number(s.precio_final) || 0), 0);
    const costosExtra = costosExtraTemporales.reduce((sum, c) => sum + (Number(c.monto) || 0), 0);
    return subtotalServicios + costosExtra;
}

// ============================================
// BUSCAR VEHÍCULO POR PATENTE
// ============================================

async function buscarVehiculoPorPatente(patente) {
    if (!patente || patente.length < 3) return;

    // Limpiar espacios de la patente
    patente = patente.replace(/\s+/g, '').toUpperCase();

    try {
        const response = await fetch(`${API_BASE}/buscar-patente?patente=${encodeURIComponent(patente)}`);
        const data = await response.json();
        
        if (data.vehiculo) {
            // Autocompletar datos del vehículo
            document.getElementById('marca').value = data.vehiculo.marca || '';
            document.getElementById('modelo').value = data.vehiculo.modelo || '';
            document.getElementById('anio').value = data.vehiculo.anio || '';
            document.getElementById('cilindrada').value = data.vehiculo.cilindrada || '';
            document.getElementById('combustible').value = data.vehiculo.combustible || '';
            document.getElementById('kilometraje').value = data.vehiculo.kilometraje || '';
            document.getElementById('color').value = data.vehiculo.color || '';
            if (data.vehiculo.color && data.vehiculo.color.startsWith('#')) document.getElementById('color-picker').value = data.vehiculo.color;
            // Express auto-fill too
            const expressColorEl = document.getElementById('express-color');
            if (expressColorEl) expressColorEl.value = data.vehiculo.color || '';
            const expressColorPicker = document.getElementById('express-color-picker');
            if (expressColorPicker && data.vehiculo.color && data.vehiculo.color.startsWith('#')) expressColorPicker.value = data.vehiculo.color;
            
            // Si hay cliente asociado
            if (data.cliente) {
                document.getElementById('cliente').value = data.cliente.nombre || '';
                document.getElementById('rut').value = data.cliente.rut || '';
                document.getElementById('telefono').value = data.cliente.telefono || '';
            }
            
            mostrarNotificacion('success', 'Vehículo encontrado', 'Datos cargados automáticamente');
        }
    } catch (error) {
        console.error('Error al buscar vehículo:', error);
    }
}

// ============================================
// CARGAR PRÓXIMO NÚMERO DE ORDEN
// ============================================

async function cargarProximoNumeroOrden() {
    try {
        const response = await fetch(`${API_BASE}/proximo-numero-orden`);
        const data = await response.json();
        
        if (data.numero) {
            const numeroFormateado = String(data.numero).padStart(6, '0');
            document.getElementById('num-orden').textContent = numeroFormateado;
        }
    } catch (error) {
        console.error('Error al cargar número de orden:', error);
    }
}

// ============================================
// OT EXPRESS - Abrir modal y guardar
// ============================================

function abrirModalOTExpress() {
    // Limpiar campos
    document.getElementById('express-patente').value = '';
    document.getElementById('express-marca').value = '';
    document.getElementById('express-modelo').value = '';
    document.getElementById('express-anio').value = '';
    document.getElementById('express-nombre').value = '';
    document.getElementById('express-apellido').value = '';
    document.getElementById('express-telefono').value = '';
    document.getElementById('express-direccion').value = '';
    document.getElementById('express-referencia').value = '';
    document.getElementById('express-notas').value = '';
    document.getElementById('express-cliente-lat').value = '0';
    document.getElementById('express-cliente-lng').value = '0';
    document.getElementById('express-coordenadas-info').style.display = 'none';

    // Cargar próximo número para el display
    fetch(`${API_BASE}/proximo-numero-orden`)
        .then(r => r.json())
        .then(data => {
            if (data.numero) {
                const num = String(data.numero).padStart(6, '0');
                document.getElementById('num-ot-express').textContent = num;
            }
        })
        .catch(() => {});

    const modal = new bootstrap.Modal(document.getElementById('modalOTExpress'));
    modal.show();
}

// ============================================
// MAPA SELECTOR - OT EXPRESS (Leaflet + Nominatim)
// ============================================
let mapaExpress = null;
let markerExpress = null;
let _expressMapaLat = 0;
let _expressMapaLng = 0;

function abrirMapaExpress() {
    _expressMapaLat = 0;
    _expressMapaLng = 0;
    document.getElementById('express-mapa-direccion-preview').textContent = 'Esperando seleccion...';
    document.getElementById('btn-confirmar-mapa-express').disabled = true;

    // Cerrar sub-modal anterior si existe
    const prevModal = bootstrap.Modal.getInstance(document.getElementById('modalMapaExpress'));
    if (prevModal) prevModal.hide();

    // Abrir sub-modal
    const modal = new bootstrap.Modal(document.getElementById('modalMapaExpress'));
    modal.show();

    // Inicializar mapa despues de que el modal sea visible
    setTimeout(() => {
        if (mapaExpress) {
            mapaExpress.invalidateSize();
            if (markerExpress) {
                mapaExpress.removeLayer(markerExpress);
                markerExpress = null;
            }
            return;
        }

        // Centro: Santiago, Chile (por defecto)
        mapaExpress = L.map('express-mapa-container').setView([-33.4489, -70.6693], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap',
            maxZoom: 19
        }).addTo(mapaExpress);

        // Click en el mapa → colocar marker + reverse geocoding
        mapaExpress.on('click', function(e) {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;
            _expressMapaLat = lat;
            _expressMapaLng = lng;

            // Colocar o mover marker
            if (markerExpress) {
                markerExpress.setLatLng([lat, lng]);
            } else {
                const greenIcon = L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                });
                markerExpress = L.marker([lat, lng], { icon: greenIcon }).addTo(mapaExpress);
            }
            markerExpress.bindPopup('<b>Ubicacion seleccionada</b><br>Obteniendo direccion...').openPopup();

            // Reverse geocoding con Nominatim (OpenStreetMap)
            document.getElementById('express-mapa-direccion-preview').textContent = 'Detectando direccion...';
            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`, {
                headers: { 'User-Agent': 'GlobalProAutomotriz/1.0' }
            })
            .then(r => r.json())
            .then(data => {
                let direccion = '';
                if (data && data.display_name) {
                    // Usar las partes principales: road, house_number, suburb, city, state
                    const parts = [];
                    if (data.address) {
                        if (data.address.road) parts.push(data.address.road);
                        if (data.address.house_number) parts.push(data.address.house_number);
                        if (data.address.suburb) parts.push(data.address.suburb);
                        if (data.address.city || data.address.town) parts.push(data.address.city || data.address.town);
                        if (data.address.state) parts.push(data.address.state);
                    }
                    if (parts.length > 0) {
                        direccion = parts.join(', ');
                    } else {
                        direccion = data.display_name.split(',').slice(0, 3).join(', ');
                    }
                } else {
                    direccion = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                }
                document.getElementById('express-mapa-direccion-preview').textContent = direccion;
                if (markerExpress) markerExpress.setPopupContent(`<b>Ubicacion</b><br>${direccion}`);
                document.getElementById('btn-confirmar-mapa-express').disabled = false;
            })
            .catch(() => {
                document.getElementById('express-mapa-direccion-preview').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)} (sin direccion detectada)`;
                document.getElementById('btn-confirmar-mapa-express').disabled = false;
            });
        });
    }, 300);
}

function confirmarUbicacionExpress() {
    if (_expressMapaLat === 0 && _expressMapaLng === 0) {
        mostrarNotificacion('warning', 'Sin seleccion', 'Selecciona un punto en el mapa');
        return;
    }
    const direccionMapa = document.getElementById('express-mapa-direccion-preview').textContent;
    if (direccionMapa && !direccionMapa.startsWith('Esperando') && !direccionMapa.startsWith('Detectando')) {
        document.getElementById('express-direccion').value = direccionMapa;
    }
    document.getElementById('express-cliente-lat').value = _expressMapaLat;
    document.getElementById('express-cliente-lng').value = _expressMapaLng;
    document.getElementById('express-coordenadas-info').style.display = '';
    document.getElementById('express-coordenadas-info').innerHTML = `<i class="fas fa-check-circle text-success me-1"></i>Ubicacion guardada (${_expressMapaLat.toFixed(4)}, ${_expressMapaLng.toFixed(4)})`;

    // Cerrar sub-modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('modalMapaExpress'));
    if (modal) modal.hide();

    mostrarNotificacion('success', 'Ubicacion guardada', 'Direccion y coordenadas actualizadas');
}

async function guardarOrdenExpress() {
    const patente = document.getElementById('express-patente').value.trim().toUpperCase();
    const marca = document.getElementById('express-marca').value.trim();
    const modelo = document.getElementById('express-modelo').value.trim();
    const color = document.getElementById('express-color').value.trim();
    const anio = document.getElementById('express-anio').value.trim();
    const nombre = document.getElementById('express-nombre').value.trim();
    const apellido = document.getElementById('express-apellido').value.trim();
    const telefono = document.getElementById('express-telefono').value.trim();
    const direccion = document.getElementById('express-direccion').value.trim();
    const referencia = document.getElementById('express-referencia').value.trim();
    const notas = document.getElementById('express-notas').value.trim();

    // Validaciones
    if (!patente) { mostrarNotificacion('error', 'Error', 'Ingresa la patente'); return; }
    if (!nombre) { mostrarNotificacion('error', 'Error', 'Ingresa el nombre del cliente'); return; }
    if (!telefono) { mostrarNotificacion('error', 'Error', 'Ingresa el telefono'); return; }
    if (!direccion) { mostrarNotificacion('error', 'Error', 'Ingresa la direccion'); return; }

    // Deshabilitar botón
    const btn = document.getElementById('btn-guardar-express');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Creando...';

    try {
        const response = await fetch(`${API_BASE}/crear-orden`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                express: true,
                patente: patente,
                marca: marca || null,
                color: color || null,
                modelo: modelo || null,
                anio: anio ? parseInt(anio) : null,
                cliente: nombre,
                cliente_apellido: apellido,
                telefono: telefono,
                direccion: direccion,
                referencia_direccion: referencia || null,
                notas_diagnostico: notas,
                fecha_ingreso: getChileDate(),
                cliente_lat: Number(document.getElementById('express-cliente-lat').value) || 0,
                cliente_lng: Number(document.getElementById('express-cliente-lng').value) || 0
            })
        });

        const data = await response.json();

        if (data.success) {
            const numEXP = 'EXP' + String(data.numero_orden).padStart(6, '0');
            mostrarNotificacion('success', 'OT Express Creada', `Orden ${numEXP} creada y aprobada correctamente`);

            // Cerrar modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalOTExpress'));
            if (modal) modal.hide();

            // Recargar número de orden normal
            cargarProximoNumeroOrden();

            // Si el dashboard express está visible, refrescar datos
            const seccionExpress = document.getElementById('seccion-express');
            if (seccionExpress && seccionExpress.style.display !== 'none') {
                cargarOrdenesExpress();
            }
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo crear la orden');
        }
    } catch (e) {
        mostrarNotificacion('error', 'Error', 'Error de conexion');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-bolt me-1"></i>Crear OT Express';
    }
}

// ============================================
// GUARDAR ORDEN
// ============================================

async function guardarOrden() {
    // Validar formulario
    const form = document.getElementById('form-orden');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Usar items de diagnóstico simplificados (técnico + notas + valor)
    const serviciosSeleccionados = diagnosticosItemsTemporales.map(item => ({
        nombre: item.nombre,
        descripcion: item.descripcion,
        precio_final: item.precio_final,
        tipo_comision: item.tipo_comision,
        tecnico_id: item.tecnico_id,
        tecnico_nombre: item.tecnico_nombre,
        comision_porcentaje: item.comision_porcentaje
    }));

    const ordenData = {
        patente: document.getElementById('patente').value.toUpperCase().replace(/\s+/g, ''),
        marca: document.getElementById('marca').value,
        modelo: document.getElementById('modelo').value,
        anio: parseInt(document.getElementById('anio').value) || null,
        color: document.getElementById('color').value,
        cilindrada: document.getElementById('cilindrada').value,
        combustible: document.getElementById('combustible').value,
        kilometraje: document.getElementById('kilometraje').value,
        
        cliente: document.getElementById('cliente').value,
        cliente_apellido: document.getElementById('cliente-apellido').value,
        rut: document.getElementById('rut').value,
        telefono: document.getElementById('telefono').value,
        direccion: document.getElementById('direccion').value,
        fecha_ingreso: document.getElementById('fecha-ingreso').value,
        hora_ingreso: document.getElementById('hora-ingreso').value,
        recepcionista: document.getElementById('recepcionista').value,
        
        // Servicios seleccionados (JSON array - items de diagnóstico simplificados)
        servicios_seleccionados: JSON.stringify(serviciosSeleccionados),
        
        // Checklist
        nivel_combustible: document.querySelector('input[name="combustible"]:checked')?.value || null,
        
        check_paragolfe_delantero_der: document.getElementById('check-paragolfe-del-der').checked ? 1 : 0,
        check_puerta_delantera_der: document.getElementById('check-puerta-del-der').checked ? 1 : 0,
        check_puerta_trasera_der: document.getElementById('check-puerta-tra-der').checked ? 1 : 0,
        check_paragolfe_trasero_izq: document.getElementById('check-paragolfe-tra-izq').checked ? 1 : 0,
        check_otros_carroceria: document.getElementById('check-otros').value,
        
        // Montos: calcular desde servicios + costos extra si no viene manual
        monto_total: calcularMontoTotalFormCrear() || calcularMontoTotalDesdeServicios(serviciosSeleccionados),
        monto_abono: document.getElementById('tiene-abono').checked ? (parseFloat(document.getElementById('monto-abono').value) || 0) : 0,
        metodo_pago: document.getElementById('tiene-abono').checked ? document.getElementById('metodo-pago').value : null
    };

    // Calcular restante
    ordenData.monto_restante = ordenData.monto_total - ordenData.monto_abono;
    
    try {
        mostrarLoading(true);
        
        const response = await fetch(`${API_BASE}/crear-orden`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(ordenData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarNotificacion('success', 'Orden Creada', `Orden #${data.numero_orden} creada exitosamente`);
            
            // ★ FIX: Asignar ordenActual para que los botones del modal (Ver PDF, Descargar PDF, Compartir) funcionen
            let parsedServicios = [];
            try { parsedServicios = JSON.parse(ordenData.servicios_seleccionados || '[]'); } catch(e) {}
            ordenActual = {
                id: data.id || null,
                numero_orden: data.numero_orden,
                token: data.token,
                patente_placa: ordenData.patente,
                marca: ordenData.marca,
                modelo: ordenData.modelo,
                color: ordenData.color,
                anio: ordenData.anio,
                cilindrada: ordenData.cilindrada,
                combustible: ordenData.combustible,
                kilometraje: ordenData.kilometraje,
                cliente_nombre: ordenData.cliente,
                cliente_apellido: ordenData.cliente_apellido,
                cliente_rut: ordenData.rut,
                cliente_telefono: ordenData.telefono,
                direccion: ordenData.direccion,
                fecha_ingreso: ordenData.fecha_ingreso,
                hora_ingreso: ordenData.hora_ingreso,
                recepcionista: ordenData.recepcionista,
                monto_total: ordenData.monto_total,
                monto_abono: ordenData.monto_abono,
                metodo_pago: ordenData.metodo_pago,
                diagnostico_checks: ordenData.diagnostico_checks,
                diagnostico_observaciones: ordenData.diagnostico_observaciones,
                servicios_seleccionados: parsedServicios,
                estado: 'Enviada',
                check_paragolfe_delantero_der: ordenData.check_paragolfe_delantero_der,
                check_puerta_delantera_der: ordenData.check_puerta_delantera_der,
                check_puerta_trasera_der: ordenData.check_puerta_trasera_der,
                check_paragolfe_trasero_izq: ordenData.check_paragolfe_trasero_izq,
                check_otros_carroceria: ordenData.check_otros_carroceria,
                nivel_combustible: ordenData.nivel_combustible
            };

            // Mostrar link para compartir
            const linkAprobacion = `${window.location.origin}/aprobar?token=${data.token}`;
            const token = data.token;
            const numOrden = String(data.numero_orden).padStart(6, '0');
            
            const modalHtml = `
                <style>
                    @keyframes gp-check-bounce {
                        0% { transform: scale(0); opacity: 0; }
                        50% { transform: scale(1.2); }
                        100% { transform: scale(1); opacity: 1; }
                    }
                    @keyframes gp-slide-up {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes gp-pulse-ring {
                        0% { transform: scale(0.8); opacity: 1; }
                        100% { transform: scale(1.8); opacity: 0; }
                    }
                    @keyframes gp-float {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-6px); }
                    }
                    .gp-modal-crear { text-align: center; font-family: 'Segoe UI', Tahoma, sans-serif; }
                    .gp-icon-wrap { position: relative; display: inline-block; margin-bottom: 16px; }
                    .gp-icon-wrap .gp-ring {
                        position: absolute; top: 50%; left: 50%; width: 100px; height: 100px;
                        border-radius: 50%; border: 4px solid #28a745; margin: -50px 0 0 -50px;
                        animation: gp-pulse-ring 1.5s ease-out forwards;
                    }
                    .gp-icon-wrap i {
                        font-size: 4.5rem; color: #28a745;
                        animation: gp-check-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                        filter: drop-shadow(0 4px 12px rgba(40,167,69,0.4));
                    }
                    .gp-orden-title {
                        font-size: 1.6rem; font-weight: 800; color: #121212;
                        margin: 0 0 4px 0;
                        animation: gp-slide-up 0.5s 0.3s both;
                    }
                    .gp-orden-num {
                        font-size: 2.2rem; font-weight: 900; color: #a80000;
                        letter-spacing: 3px;
                        animation: gp-slide-up 0.5s 0.45s both;
                    }
                    .gp-orden-sub {
                        font-size: 0.85rem; color: #888; margin-top: 4px;
                        animation: gp-slide-up 0.5s 0.55s both;
                    }
                    .gp-divider {
                        height: 3px; border-radius: 3px; margin: 20px 0;
                        background: linear-gradient(90deg, #a80000 0%, #ff6b00 50%, #a80000 100%);
                        animation: gp-slide-up 0.5s 0.6s both;
                    }
                    .gp-actions-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 10px;
                        animation: gp-slide-up 0.5s 0.7s both;
                    }
                    @media (max-width: 480px) {
                        .gp-actions-grid { grid-template-columns: 1fr; }
                    }
                    .gp-action-btn {
                        display: flex; align-items: center; justify-content: center; gap: 10px;
                        padding: 14px 10px; border-radius: 14px; font-weight: 800;
                        font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em;
                        border: 2px solid transparent; cursor: pointer;
                        text-decoration: none; color: #fff;
                        transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                        box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                        position: relative; overflow: hidden;
                    }
                    .gp-action-btn::before {
                        content: ''; position: absolute; top: 50%; left: 50%;
                        width: 0; height: 0; border-radius: 50%;
                        background: rgba(255,255,255,0.2);
                        transition: width 0.4s, height 0.4s, top 0.4s, left 0.4s;
                    }
                    .gp-action-btn:hover::before {
                        width: 200px; height: 200px; top: calc(50% - 100px); left: calc(50% - 100px);
                    }
                    .gp-action-btn:hover {
                        transform: translateY(-3px) scale(1.03);
                        box-shadow: 0 8px 25px rgba(0,0,0,0.25);
                    }
                    .gp-action-btn:active { transform: translateY(0) scale(0.97); }
                    .gp-action-btn i { font-size: 1.3rem; }
                    .gp-btn-whatsapp { background: linear-gradient(135deg, #25D366, #128C7E); border-color: #128C7E; }
                    .gp-btn-whatsapp:hover { border-color: #075E54; }
                    .gp-btn-copiar-token { background: linear-gradient(135deg, #a80000, #800000); border-color: #800000; }
                    .gp-btn-copiar-token:hover { border-color: #600000; }
                    .gp-btn-copiar-link { background: linear-gradient(135deg, #0d6efd, #0b5ed7); border-color: #0b5ed7; }
                    .gp-btn-copiar-link:hover { border-color: #0a58ca; }
                    .gp-btn-pdf { background: linear-gradient(135deg, #ff6b00, #cc5500); border-color: #cc5500; }
                    .gp-btn-pdf:hover { border-color: #aa4400; }
                    .gp-btn-ver-online { background: linear-gradient(135deg, #6f42c1, #5a32a3); border-color: #5a32a3; }
                    .gp-btn-ver-online:hover { border-color: #4a2580; }
                    .gp-btn-compartir { background: linear-gradient(135deg, #121212, #333); border-color: #333; }
                    .gp-btn-compartir:hover { border-color: #555; }
                    .gp-token-copied {
                        position: fixed; top: 20px; right: 20px; z-index: 9999;
                        background: #28a745; color: #fff; padding: 12px 20px;
                        border-radius: 12px; font-weight: 700; font-size: 0.9rem;
                        box-shadow: 0 8px 25px rgba(40,167,69,0.4);
                        animation: gp-slide-up 0.3s ease-out;
                        display: none;
                    }
                    .gp-token-copied.show { display: flex; align-items: center; gap: 8px; }
                </style>
                <div class="gp-modal-crear">
                    <div class="gp-icon-wrap">
                        <div class="gp-ring"></div>
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h3 class="gp-orden-title">¡Orden Creada Exitosamente!</h3>
                    <div class="gp-orden-num">OT #${numOrden}</div>
                    <div class="gp-orden-sub"><i class="fas fa-car me-1"></i>${ordenData.patente} &bull; ${ordenData.cliente}</div>
                    <div class="gp-divider"></div>
                    <div class="gp-actions-grid">
                        <button class="gp-action-btn gp-btn-whatsapp" onclick="window.open('https://wa.me/${ordenData.telefono.replace(/\D/g, '')}?text=${encodeURIComponent('Hola, tiene una orden de trabajo de Global Pro Automotriz. Para verla y aprobarla, ingrese a: ' + linkAprobacion)}', '_blank')">
                            <i class="fab fa-whatsapp"></i> WhatsApp
                        </button>
                        <button class="gp-action-btn gp-btn-copiar-link" onclick="navigator.clipboard.writeText('${linkAprobacion}'); mostrarToastGP('Link copiado al portapapeles')">
                            <i class="fas fa-link"></i> Copiar Link
                        </button>
                    </div>
                </div>
                <div class="gp-token-copied" id="gp-toast-copied"><i class="fas fa-check-circle"></i> <span></span></div>
            `;
            
            document.getElementById('modal-contenido').innerHTML = modalHtml;
            document.getElementById('modal-numero-orden').textContent = String(data.numero_orden).padStart(6, '0');
            
            const modal = new bootstrap.Modal(document.getElementById('modalVerOrden'));
            modal.show();
            
            // Limpiar formulario
            form.reset();
            cargarProximoNumeroOrden();
            
            // Limpiar items de diagnóstico y costos extra temporales
            diagnosticosItemsTemporales = [];
            costosExtraTemporales = [];
            renderizarItemsDiagnostico();
            renderizarCostosExtraForm();
            
            // Establecer fecha y hora actual
            const ahora = new Date();
            document.getElementById('fecha-ingreso').value = getChileDate();
            document.getElementById('hora-ingreso').value = ahora.toTimeString().slice(0, 5);
            
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al crear la orden');
        }
    } catch (error) {
        console.error('Error al guardar orden:', error);
        mostrarNotificacion('error', 'Error', 'Error al conectar con el servidor');
    } finally {
        mostrarLoading(false);
    }
}

// ============================================
// BUSCAR ÓRDENES
// ============================================

async function buscarOrdenes() {
    let patente = document.getElementById('buscador-patente').value.toUpperCase().replace(/\s+/g, '');

    if (!patente) {
        mostrarNotificacion('warning', 'Advertencia', 'Ingrese una patente para buscar');
        return;
    }
    
    try {
        mostrarLoading(true);
        
        const response = await fetch(`${API_BASE}/buscar-ordenes?patente=${encodeURIComponent(patente)}`);
        const data = await response.json();
        
        if (data.ordenes && data.ordenes.length > 0) {
            ordenesFiltradas = data.ordenes;
            mostrarResultados(data.ordenes);
        } else {
            document.getElementById('resultados-busqueda').innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-search fa-3x mb-3 text-muted"></i>
                    <p class="text-muted">No se encontraron órdenes para la patente: ${patente}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error al buscar órdenes:', error);
        mostrarNotificacion('error', 'Error', 'Error al buscar órdenes');
    } finally {
        mostrarLoading(false);
    }
}

function mostrarResultados(ordenes) {
    let html = '';

    if (!ordenes || ordenes.length === 0) {
        document.getElementById('resultados-busqueda').innerHTML = '<div class="text-center py-5"><i class="fas fa-folder-open fa-3x mb-3 text-muted"></i><p class="text-muted">No se encontraron órdenes</p></div>';
        return;
    }

    html += `<div class="table-responsive"><table class="table table-hover table-striped mb-0" style="font-size:0.78rem;table-layout:fixed;min-width:940px;">
        <thead class="table-dark">
            <tr>
                <th style="width:30px;text-align:center;" title="Cierre rápido"><i class="fas fa-check-double"></i></th>
                <th style="width:110px;">#OT</th>
                <th style="width:80px;">Patente</th>
                <th style="width:75px;">Marca</th>
                <th style="width:75px;">Modelo</th>
                <th style="width:65px;">Color</th>
                <th style="width:80px;">Nombre</th>
                <th style="width:80px;">Estado</th>
                <th style="width:80px;">Técnico</th>
                <th style="width:80px;" class="text-end">Total</th>
                <th style="width:80px;" class="text-end">Comisión</th>
                <th style="width:200px;" class="text-center">Acciones</th>
            </tr>
        </thead>
        <tbody>`;

    ordenes.forEach(orden => {
        const estadoClass = obtenerClaseEstado(orden.estado);
        const estadoIcon = obtenerIconoEstado(orden.estado);
        const numeroFormateado = String(orden.numero_orden).padStart(6, '0');
        const montoFinal = Number(orden.monto_final || orden.monto_total || 0);
        const fecha = orden.fecha_creacion || orden.fecha_ingreso || 'N/A';
        const esCerrada = orden.estado_trabajo === 'Cerrada';
        const esCancelada = orden.estado === 'Cancelada';
        const esAprobadaCerrada = orden.estado === 'Aprobada' && esCerrada;
        const esExpress = Number(orden.es_express || 0) === 1;
        const expressBadge = esExpress ? ' <span style="color:#ff6b00;font-size:0.8em;" title="Orden Express">⚡</span>' : '';
        const esWeb = orden.origen === 'web';
        const webBadge = esWeb ? ' <span style="background:#0d6efd;color:#fff;padding:1px 6px;border-radius:4px;font-size:0.65rem;font-weight:700;">WEB</span>' : '';
        const gananciaTecnico = Number(orden.ganancia_tecnico || 0);
        const comisionPct = Number(orden.comision_aplicada || 0);

        // Checkbox solo visible si NO está ya cerrada+aprobada y NO cancelada
        const puedeCerrar = !esAprobadaCerrada && !esCancelada;

        html += `<tr style="vertical-align:middle;${esExpress ? ' border-left: 3px solid #ff6b00;' : ''}${esAprobadaCerrada ? ' background:#f0fff4;' : ''}">
            <td class="text-center">
                ${puedeCerrar ? `<input type="checkbox" class="orden-check-cierre form-check-input" data-orden-id="${orden.id}" data-numero="${numeroFormateado}" data-monto-total="${montoFinal}" title="Marcar para cierre rápido" style="width:1.2em;height:1.2em;cursor:pointer;accent-color:#198754;">` : `<i class="fas fa-check-circle text-success" title="Ya cerrada y aprobada"></i>`}
            </td>
            <td class="fw-bold" style="white-space:nowrap;"><a href="#" onclick="event.stopPropagation(); verOTenLinea(${orden.id}); return false;" style="color:#0d6efd;text-decoration:none;font-weight:700;" title="Ver orden en línea">${numeroFormateado}</a>${expressBadge}${webBadge}</td>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${orden.patente_placa || ''}"><strong>${orden.patente_placa || ''}</strong></td>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${orden.marca || ''}">${orden.marca || ''}</td>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${orden.modelo || ''}">${orden.modelo || ''}</td>
            <td>${orden.color ? `<span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:${orden.color.startsWith('#') ? orden.color : orden.color};vertical-align:middle;margin-right:4px;border:1px solid #ccc;"></span>${orden.color}` : ''}</td>
            <td>${orden.cliente_nombre || ''}</td>
            <td>
                <span class="badge ${estadoClass}" style="font-size:0.65rem;">${estadoIcon} ${orden.estado || ''}</span>
                ${esCerrada ? '<span class="badge bg-secondary ms-1" style="font-size:0.55rem;">CERRADA</span>' : ''}
            </td>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${orden.tecnico_nombre || '-'}"><small>${orden.tecnico_nombre || '-'}</small></td>
            <td class="text-end fw-bold" style="color:var(--gp-red);white-space:nowrap;">$${montoFinal.toLocaleString('es-CL', {maximumFractionDigits: 0})}</td>
            <td class="text-end" style="white-space:nowrap;"><small class="text-muted" style="font-size:0.6rem;">${comisionPct}%</small> <span class="fw-bold" style="color:#0d6efd;">$${gananciaTecnico.toLocaleString('es-CL', {maximumFractionDigits: 0})}</span></td>
            <td class="text-center">
                <div class="btn-group btn-group-sm">
                    ${esCerrada ? `<button class="btn btn-outline-success" onclick="event.stopPropagation(); abrirOrdenDesdeLista(${orden.id}, ${orden.numero_orden})" title="Abrir Orden"><i class="fas fa-lock-open"></i></button>` : `<button class="btn btn-outline-danger" onclick="event.stopPropagation(); cerrarOrdenDesdeLista(${orden.id}, ${orden.numero_orden})" title="Cerrar Orden"><i class="fas fa-lock"></i></button>`}
                    <button class="btn btn-outline-warning" onclick="event.stopPropagation(); editarOrden(${orden.id})" title="Editar OT" style="color: #ff6b00; border-color: #ff6b00;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-primary" onclick="event.stopPropagation(); verOrden(${orden.id})" title="Ver OT">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${!esCerrada && !esCancelada ? `
                    <button class="btn btn-warning text-dark" onclick="event.stopPropagation(); abrirModalCostos(${orden.id}, ${orden.numero_orden}, '${orden.patente_placa || ''}', '${(orden.cliente_nombre || '').replace(/'/g, "\\'")}');" title="Agregar Costo">
                        <i class="fas fa-plus me-1"></i>Add
                    </button>` : ''}
                    <button class="btn btn-outline-danger" onclick="event.stopPropagation(); eliminarOrdenDesdeLista(${orden.id}, ${orden.numero_orden})" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    });

    html += '</tbody></table></div>';

    // Botón de Cerrar TODAS las órdenes (doble confirmación)
    const ordenesParaCerrar = ordenes.filter(o => !(o.estado === 'Aprobada' && o.estado_trabajo === 'Cerrada') && o.estado !== 'Cancelada');
    html += `<div class="d-flex justify-content-between align-items-center mt-3 mb-2">
        <div class="text-muted" style="font-size:0.82rem;"><i class="fas fa-info-circle me-1"></i>${ordenesParaCerrar.length} orden(es) pendientes de cierre | ${ordenes.filter(o => o.estado === 'Aprobada' && o.estado_trabajo === 'Cerrada').length} ya cerradas</div>
        <div class="d-flex gap-2">
            <button class="btn btn-warning btn-sm" onclick="fixSaldosCerradas()" title="Arreglar órdenes cerradas con saldo restante incorrecto o negativo"><i class="fas fa-wrench me-1"></i>Arreglar Saldos</button>
            ${ordenesParaCerrar.length > 0 ? `<button class="btn btn-danger" onclick="cerrarTodasLasOrdenes()" style="font-weight:700;"><i class="fas fa-check-double me-2"></i>CERRAR TODAS (${ordenesParaCerrar.length})</button>` : ''}
        </div>
    </div>`;

    // Barra de acciones masivas para cierre rápido
    html += `<div id="barra-cierre-rapido" class="d-none mt-3 p-3 rounded" style="background:linear-gradient(135deg,#f0fff4,#e8f5e9);border:2px solid #198754;">
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div class="d-flex align-items-center gap-2">
                <i class="fas fa-check-double text-success fa-lg"></i>
                <strong><span id="count-cierre-rapido">0</span> orden(es) seleccionada(s)</strong>
                <span class="text-muted" style="font-size:0.82rem;">| Cierre: Estado→Aprobada + Trabajo→Cerrada + Abono Total + Pago→Efectivo</span>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-success" onclick="ejecutarCierreRapidoMasivo()"><i class="fas fa-check-double me-1"></i>Cerrar y Aprobar</button>
                <button class="btn btn-outline-secondary" onclick="cancelarCierreRapido()"><i class="fas fa-times me-1"></i>Cancelar</button>
            </div>
        </div>
    </div>`;

    document.getElementById('resultados-busqueda').innerHTML = html;

    // Agregar event listeners a los checkboxes de cierre rápido
    document.querySelectorAll('.orden-check-cierre').forEach(cb => {
        cb.addEventListener('change', actualizarBarraCierreRapido);
    });
}

function eliminarOrdenDesdeLista(ordenId, numeroOrden) {
    const numero = String(numeroOrden).padStart(6, '0');
    if (!confirm(`¿Eliminar la orden #${numero}?`)) return;
    if (!confirm(`¡ATENCIÓN! Se eliminará permanentemente la orden #${numero}.\n\n¿Confirma?`)) return;

    mostrarLoading(true);
    fetch(`${API_BASE}/admin/eliminar-orden`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orden_id: ordenId })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            mostrarNotificacion('success', 'Eliminada', `Orden #${numero} eliminada`);
            cargarTodasLasOrdenes();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo eliminar');
        }
    })
    .catch(() => mostrarNotificacion('error', 'Error', 'Error de conexión'))
    .finally(() => mostrarLoading(false));
}

// Funcion inline - boton ADD amarillo en lista llama abrirModalCostos directamente con datos de la fila

// ============================================
// ABRIR / CERRAR ORDEN DESDE LISTA (botones verde/rojo)
// ============================================
// Botón verde (Abrir): estado_trabajo → "Pendiente Visita", estado → "Aprobada"
// Botón rojo (Cerrar): estado → "Aprobada", estado_trabajo → "Cerrada", abono = total

async function abrirOrdenDesdeLista(ordenId, numeroOrden) {
    if (!confirm(`¿Abrir la orden #${String(numeroOrden).padStart(6,'0')}?\n\nLa orden pasará a:\n• Estado → Aprobada\n• Trabajo → Pendiente Visita`)) return;
    try {
        mostrarLoading(true);
        const resp = await fetch(API_BASE + '/editar-orden', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ orden_id: ordenId, estado: 'Aprobada', estado_trabajo: 'Pendiente Visita' })
        });
        const data = await resp.json();
        if (data.success) {
            mostrarNotificacion('success', 'Orden Abierta', `#${String(numeroOrden).padStart(6,'0')} reabierta correctamente`);
            const patente = document.getElementById('buscador-patente') ? document.getElementById('buscador-patente').value.trim() : '';
            if (patente) { buscarOrdenes(); } else { cargarTodasLasOrdenes(); }
            // Si el dashboard express está visible, refrescar
            const seccionExpress = document.getElementById('seccion-express');
            if (seccionExpress && seccionExpress.style.display !== 'none') { cargarOrdenesExpress(); }
        } else { mostrarNotificacion('error', 'Error', data.error || 'No se pudo abrir'); }
    } catch(e) { mostrarNotificacion('error', 'Error', 'Error de conexión'); }
    finally { mostrarLoading(false); }
}

async function cerrarOrdenDesdeLista(ordenId, numeroOrden) {
    if (!confirm(`¿Cerrar la orden #${String(numeroOrden).padStart(6,'0')}?\n\nLa orden pasará a:\n• Estado → Aprobada\n• Trabajo → Cerrada\n• Abono = Total de la factura (pago completo)\n• Restante → $0 (SIN DEUDA)\n• Pagado → Sí\n• Método → Efectivo\n\n⚠️ El técnico, patente y datos NO se modifican.`)) return;
    try {
        mostrarLoading(true);
        // Primero obtener el monto_total de la orden para forzar abono completo
        const verResp = await fetch(API_BASE + '/ver-orden?id=' + ordenId);
        const verData = await verResp.json();
        const montoTotal = Number(verData.orden?.monto_total || 0);

        const resp = await fetch(API_BASE + '/editar-orden', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ orden_id: ordenId, estado: 'Aprobada', estado_trabajo: 'Cerrada', monto_abono: montoTotal, metodo_pago: 'Efectivo' })
        });
        const data = await resp.json();
        if (data.success) {
            mostrarNotificacion('success', 'Orden Cerrada', `#${String(numeroOrden).padStart(6,'0')} cerrada — saldo $0, SIN DEUDA`);
            const patente = document.getElementById('buscador-patente') ? document.getElementById('buscador-patente').value.trim() : '';
            if (patente) { buscarOrdenes(); } else { cargarTodasLasOrdenes(); }
            const seccionExpress = document.getElementById('seccion-express');
            if (seccionExpress && seccionExpress.style.display !== 'none') { cargarOrdenesExpress(); }
        } else { mostrarNotificacion('error', 'Error', data.error || 'No se pudo cerrar'); }
    } catch(e) { mostrarNotificacion('error', 'Error', 'Error de conexión'); }
    finally { mostrarLoading(false); }
}

// ============================================
// CIERRE RÁPIDO - LA JUGADA MAESTRA
// ============================================
// Al marcar el checkbox y confirmar:
// 1. estado_trabajo → "Cerrada"
// 2. estado → "Aprobada"
// 3. monto_abono → monto_total (abono total = cancelado)
// 4. monto_restante → 0
// 5. metodo_pago → "Efectivo"
// Esto hace que la orden aparezca como fully paid en liquidar técnico y flujo de caja

function actualizarBarraCierreRapido() {
    const checks = document.querySelectorAll('.orden-check-cierre:checked');
    const barra = document.getElementById('barra-cierre-rapido');
    const countEl = document.getElementById('count-cierre-rapido');
    if (!barra || !countEl) return;
    countEl.textContent = checks.length;
    if (checks.length > 0) {
        barra.classList.remove('d-none');
    } else {
        barra.classList.add('d-none');
    }
}

function cancelarCierreRapido() {
    document.querySelectorAll('.orden-check-cierre').forEach(cb => cb.checked = false);
    actualizarBarraCierreRapido();
}

async function ejecutarCierreRapidoMasivo() {
    const checks = document.querySelectorAll('.orden-check-cierre:checked');
    if (checks.length === 0) {
        mostrarNotificacion('warning', 'Sin selección', 'Seleccione al menos una orden');
        return;
    }

    const cantidad = checks.length;
    const ordenesNombres = Array.from(checks).map(cb => `#${cb.dataset.numero}`).join(', ');

    if (!confirm(`¿Cerrar y aprobar ${cantidad} orden(es)?\n\n${ordenesNombres}\n\nSe aplicará:\n• Estado → Aprobada\n• Trabajo → Cerrada\n• Abono = Total (pago completo)\n• Método → Efectivo`)) return;

    mostrarLoading(true);
    let exitosas = 0;
    let fallidas = 0;

    for (const cb of checks) {
        const ordenId = parseInt(cb.dataset.ordenId);
        const montoTotal = parseFloat(cb.dataset.montoTotal) || 0;

        try {
            const resp = await fetch(`${API_BASE}/editar-orden`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orden_id: ordenId,
                    estado: 'Aprobada',
                    estado_trabajo: 'Cerrada',
                    monto_abono: montoTotal,
                    metodo_pago: 'Efectivo'
                })
            });
            const data = await resp.json();
            if (data.success) {
                exitosas++;
            } else {
                fallidas++;
                console.error(`Error cierre rápido orden ${cb.dataset.numero}:`, data.error);
            }
        } catch (e) {
            fallidas++;
            console.error(`Error cierre rápido orden ${cb.dataset.numero}:`, e);
        }
    }

    mostrarLoading(false);

    if (exitosas > 0) {
        mostrarNotificacion('success', 'Cierre Rápido', `${exitosas} orden(es) cerradas y aprobadas exitosamente`);
    }
    if (fallidas > 0) {
        mostrarNotificacion('warning', 'Advertencia', `${fallidas} orden(es) no pudieron cerrarse`);
    }

    // Recargar la lista de órdenes
    const patente = document.getElementById('buscador-patente')?.value?.trim();
    if (patente) {
        buscarOrdenes();
    } else {
        cargarTodasLasOrdenes();
    }
}

// Arreglar saldos de órdenes cerradas - FORZAR todas sin deuda
async function fixSaldosCerradas() {
    if (!confirm('¿Forzar saldos de TODAS las órdenes cerradas?\n\nEsto aplicará a TODAS las órdenes con estado "Cerrada":\n• Saldo restante → 0\n• Abono → Total de la factura\n• Pagado → 1\n\nNinguna orden cerrada quedará con deuda.')) return;

    mostrarLoading(true);
    try {
        const response = await fetch(`${API_BASE}/admin/fix-saldos`, { method: 'POST' });
        const data = await response.json();
        mostrarLoading(false);

        if (data.success) {
            let msg = `✅ Saldos forzados correctamente:\n`;
            msg += `• Saldos corregidos (restante→0, abono→total): ${data.saldos_corregidos}\n`;
            msg += `• Flags pagado corregidos: ${data.pagado_corregidos}\n`;
            msg += `\nTotal registros modificados: ${data.total_modificados}\n`;
            msg += `\nResumen de órdenes cerradas:\n`;
            msg += `• Total cerradas: ${data.total_cerradas}\n`;
            msg += `• Cerradas OK (sin deuda): ${data.cerradas_ok}\n`;
            msg += `• Cerradas con problema: ${data.cerradas_con_problema}`;
            alert(msg);
            cargarTodasLasOrdenes();
        } else {
            mostrarNotificacion('error', 'Error', data.error);
        }
    } catch (error) {
        mostrarLoading(false);
        mostrarNotificacion('error', 'Error', error.message);
    }
}

// Cerrar TODAS las órdenes con doble confirmación
async function cerrarTodasLasOrdenes() {
    // Primera confirmación
    if (!confirm('⚠️ ¿ESTÁS SEGURO de que deseas cerrar TODAS las órdenes pendientes?\n\nEsto cambiará todas las órdenes que NO estén cerradas+aprobadas a:\n• Estado → Aprobada\n• Trabajo → Cerrada\n• Abono = Total (pago completo)\n• Método → Efectivo\n\nEsta acción NO se puede deshacer fácilmente.')) return;

    // Segunda confirmación
    if (!confirm('🔴 CONFIRMACIÓN FINAL 🔴\n\n¿REALMENTE deseas proceder con el cierre masivo de TODAS las órdenes?\n\nEscribe OK mentalmente y presiona Aceptar para continuar.')) return;

    mostrarLoading(true);

    // Obtener todas las órdenes actuales
    let ordenes = [];
    try {
        const resp = await fetch(`${API_BASE}/admin/todas-ordenes?limite=500`);
        const data = await resp.json();
        if (data.success) ordenes = data.ordenes || [];
    } catch(e) {
        mostrarLoading(false);
        mostrarNotificacion('error', 'Error', 'No se pudieron cargar las órdenes');
        return;
    }

    // Filtrar las que necesitan cierre
    const pendientes = ordenes.filter(o => !(o.estado === 'Aprobada' && o.estado_trabajo === 'Cerrada') && o.estado !== 'Cancelada');

    if (pendientes.length === 0) {
        mostrarLoading(false);
        mostrarNotificacion('info', 'Sin órdenes', 'No hay órdenes pendientes para cerrar');
        return;
    }

    let exitosas = 0;
    let fallidas = 0;

    for (const orden of pendientes) {
        const montoTotal = Number(orden.monto_final || orden.monto_total || 0);
        try {
            const resp = await fetch(`${API_BASE}/editar-orden`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orden_id: orden.id,
                    estado: 'Aprobada',
                    estado_trabajo: 'Cerrada',
                    monto_abono: montoTotal,
                    metodo_pago: 'Efectivo'
                })
            });
            const data = await resp.json();
            if (data.success) {
                exitosas++;
            } else {
                fallidas++;
            }
        } catch (e) {
            fallidas++;
        }
    }

    mostrarLoading(false);

    if (exitosas > 0) {
        mostrarNotificacion('success', 'Cierre Masivo Completo', `${exitosas} orden(es) cerradas y aprobadas exitosamente`);
    }
    if (fallidas > 0) {
        mostrarNotificacion('warning', 'Advertencia', `${fallidas} orden(es) no pudieron cerrarse`);
    }

    // Recargar la lista
    const patente = document.getElementById('buscador-patente')?.value?.trim();
    if (patente) {
        buscarOrdenes();
    } else {
        cargarTodasLasOrdenes();
    }
}

// Variables de filtros activos
let filtroExpressActivo = false;
let filtroEstadoActivo = 'todas';
let tecnicosParaFiltro = [];

function filtrarOrdenes(estado) {
    // Actualizar botones de filtro
    document.querySelectorAll('.filtro-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    filtroEstadoActivo = estado;
    aplicarFiltros();
}

function toggleFiltroExpress() {
    filtroExpressActivo = !filtroExpressActivo;
    const btn = document.getElementById('btn-filtro-express');
    if (filtroExpressActivo) {
        btn.classList.remove('btn-outline-dark');
        btn.classList.add('btn-warning', 'text-dark', 'active');
    } else {
        btn.classList.remove('btn-warning', 'text-dark', 'active');
        btn.classList.add('btn-outline-dark');
    }
    aplicarFiltros();
}

function aplicarFiltros() {
    let filtradas = [...ordenesFiltradas];

    // Filtro por estado
    if (filtroEstadoActivo !== 'todas') {
        filtradas = filtradas.filter(o => o.estado === filtroEstadoActivo);
    }

    // Filtro express
    if (filtroExpressActivo) {
        filtradas = filtradas.filter(o => Number(o.es_express || 0) === 1);
    }

    // Filtro por técnico
    const tecnicoId = document.getElementById('filtro-tecnico')?.value;
    if (tecnicoId) {
        filtradas = filtradas.filter(o => String(o.tecnico_asignado_id) === String(tecnicoId));
    }

    mostrarResultados(filtradas);
}

// ============================================
// VER ORDEN
// ============================================

async function verOrden(ordenId) {
    try {
        mostrarLoading(true);
        
        const response = await fetch(`${API_BASE}/ver-orden?id=${ordenId}`);
        const data = await response.json();
        
        if (data.orden) {
            ordenActual = data.orden;
            // Cargar fotos del técnico (sin bloquear si falla)
            try {
                const fResp = await fetch(API_BASE + '/tecnico/fotos?orden_id=' + ordenId);
                const fData = await fResp.json();
                if (fData.success) ordenActual._fotos = fData.fotos;
            } catch(ef) { ordenActual._fotos = []; }
            mostrarOrdenEnModal(data.orden);
        }
    } catch (error) {
        console.error('Error al ver orden:', error);
        mostrarNotificacion('error', 'Error', 'Error al cargar la orden');
    } finally {
        mostrarLoading(false);
    }
}

function mostrarOrdenEnModal(orden) {
    const numeroFormateado = String(orden.numero_orden).padStart(6, '0');
    const estadoClass = obtenerClaseEstado(orden.estado);
    
    // Construir HTML de trabajos con precios del catálogo
    let trabajosHtml = '';
    let serviciosSeleccionados = orden.servicios_seleccionados || [];
    let checksList = [];

    // Prioridad: servicios_seleccionados del catálogo (con precios)
    if (serviciosSeleccionados.length > 0) {
        trabajosHtml = '<div class="table-responsive"><table class="table table-sm table-bordered mb-0" style="font-size:0.75rem;table-layout:fixed;"><thead class="table-light"><tr><th style="width:35%;">Servicio</th><th style="width:18%;">Categoría</th><th style="width:8%;" class="text-center">Tipo</th><th style="width:16%;" class="text-center">Técnico</th><th style="width:23%;" class="text-end">Precio</th></tr></thead><tbody>';
        let subtotalServ = 0;
        serviciosSeleccionados.forEach(s => {
            const precio = Number(s.precio_final || s.precio_sugerido || 0);
            subtotalServ += precio;
            const tipoLabel = s.tipo_comision === 'mano_obra'
                ? '<span class="badge bg-warning text-dark" style="font-size:0.55rem;">MO</span>'
                : '<span class="badge bg-secondary" style="font-size:0.55rem;">Rep</span>';
            const editado = s.editado ? ' <i class="fas fa-pen text-warning" style="font-size:0.55rem;"></i>' : '';
            const tecnicoLabel = s.tecnico_nombre ? `<span class="badge bg-info text-dark" style="font-size:0.55rem;">${s.tecnico_nombre}</span>` : '-';
            trabajosHtml += `<tr><td class="py-1 px-1" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${s.nombre}${s.descripcion ? ' - ' + s.descripcion : ''}">${s.nombre}${editado}${s.descripcion ? ' <small class="text-muted">' + s.descripcion + '</small>' : ''}</td><td class="py-1 px-1"><small>${s.categoria || ''}</small></td><td class="py-1 px-1 text-center">${tipoLabel}</td><td class="py-1 px-1 text-center" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tecnicoLabel}</td><td class="text-end fw-bold py-1 px-1" style="white-space:nowrap;">$${precio.toLocaleString('es-CL', {maximumFractionDigits: 0})}</td></tr>`;
            checksList.push(s.nombre);
        });
        trabajosHtml += `<tr class="table-warning"><td colspan="4" class="fw-bold py-1">Subtotal Servicios:</td><td class="text-end fw-bold py-1" style="white-space:nowrap;">$${subtotalServ.toLocaleString('es-CL', {maximumFractionDigits: 0})}</td></tr>`;
        trabajosHtml += '</tbody></table></div>';
    } else {
        // Fallback: diagnostico_checks sin precios
        if (orden.diagnostico_checks) {
            try {
                checksList = typeof orden.diagnostico_checks === 'string' ? JSON.parse(orden.diagnostico_checks) : orden.diagnostico_checks;
            } catch(e) { checksList = []; }
        }
        if (checksList.length === 0) {
            if (orden.trabajo_frenos) checksList.push('Frenos');
            if (orden.trabajo_luces) checksList.push('Luces');
            if (orden.trabajo_tren_delantero) checksList.push('Tren Delantero');
            if (orden.trabajo_correas) checksList.push('Correas');
            if (orden.trabajo_componentes) checksList.push('Componentes');
        }
        if (checksList.length > 0) {
            trabajosHtml = '<div class="row g-2">';
            checksList.forEach(c => {
                trabajosHtml += `<div class="col-md-4 col-6"><span class="badge bg-danger me-1"><i class="fas fa-check"></i></span>${c}</div>`;
            });
            trabajosHtml += '</div>';
        } else {
            trabajosHtml = '<p class="text-muted">No hay trabajos seleccionados</p>';
        }
    }
    
    // Observaciones
    const observaciones = orden.diagnostico_observaciones || orden.notas || '';
    
    // Costos adicionales en la orden
    const tieneCostos = Number(orden.total_costos_adicionales || 0) > 0;
    const montoFinal = Number(orden.monto_final || orden.monto_total || 0);
    
    // Costos adicionales detallados
    let costosDetalleHtml = '';
    if (orden.costos_adicionales && orden.costos_adicionales.length > 0) {
        costosDetalleHtml = '<div class="mt-2"><small class="text-muted fw-bold">Desglose de gastos adicionales:</small><ul class="list-unstyled mb-0 mt-1">';
        orden.costos_adicionales.forEach(c => {
            const catLabel = c.categoria === 'Repuestos/Materiales' ? '<span class="badge bg-secondary" style="font-size:0.65rem;">Repuesto</span>' : '<span class="badge bg-warning text-dark" style="font-size:0.65rem;">Mano de Obra</span>';
            costosDetalleHtml += `<li class="py-1 border-bottom d-flex justify-content-between align-items-start">${catLabel} <span class="ms-1 text-truncate" style="max-width:50%;">${c.concepto || 'Gasto adicional'}</span> <span class="fw-bold text-danger" style="white-space:nowrap;flex-shrink:0;">$${Number(c.monto || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span></li>`;
        });
        costosDetalleHtml += '</ul></div>';
    }
    
    // Construir HTML de checklist
    let checklistHtml = `
        <p><strong>Nivel de Combustible:</strong> ${orden.nivel_combustible || 'No registrado'}</p>
        <p><strong>Estado de Carrocería:</strong></p>
        <ul>
            ${orden.check_paragolfe_delantero_der ? '<li>✓ Parachoques delantero derecho</li>' : ''}
            ${orden.check_puerta_delantera_der ? '<li>✓ Puerta delantera derecha</li>' : ''}
            ${orden.check_puerta_trasera_der ? '<li>✓ Puerta trasera derecha</li>' : ''}
            ${orden.check_paragolfe_trasero_izq ? '<li>✓ Parachoques trasero izquierdo</li>' : ''}
            ${orden.check_otros_carroceria ? `<li>${orden.check_otros_carroceria}</li>` : ''}
        </ul>
    `;
    
    // Firma
    let firmaHtml = '';
    if (orden.firma_imagen) {
        firmaHtml = `
            <div class="text-center mt-4">
                <h6><i class="fas fa-signature me-2"></i>Firma del Cliente</h6>
                <img src="${orden.firma_imagen}" alt="Firma del cliente" style="max-width: 300px; border: 1px solid #ddd; border-radius: 5px;">
                <p class="small text-muted mt-2">Fecha de aprobación: ${orden.fecha_aprobacion || 'N/A'}</p>
            </div>
        `;
    } else {
        firmaHtml = `
            <div class="alert alert-warning mt-4">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Esta orden aún no ha sido firmada por el cliente.
            </div>
        `;
    }
    
    const html = `
        <div class="row">
            <div class="col-md-6">
                <h6 class="fw-bold mb-2"><i class="fas fa-building me-2"></i>INFORMACIÓN DEL TALLER</h6>
                <p class="mb-1"><strong>Empresa:</strong> Global Pro Automotriz</p>
                <p class="mb-1"><strong>Dirección:</strong> Padre Alberto Hurtado 3596, Pedro Aguirre Cerda</p>
                <p class="mb-1"><strong>Contactos:</strong> +56 9 3902 6185</p>
                <p class="mb-1"><strong>RRSS:</strong> @globalproautomotriz</p>
                
                <hr class="my-2">
                
                <h6 class="fw-bold mb-2"><i class="fas fa-user me-2"></i>DATOS DEL CLIENTE</h6>
                <p class="mb-1"><strong>Nombre:</strong> ${orden.cliente_nombre || 'N/A'}</p>
                <p class="mb-1"><strong>Apellido:</strong> ${orden.cliente_apellido || 'N/A'}</p>
                <p class="mb-1"><strong>R.U.T.:</strong> ${orden.cliente_rut || 'N/A'}</p>
                <p class="mb-1"><strong>Teléfono:</strong> ${orden.cliente_telefono || 'N/A'}</p>
                <p class="mb-1"><strong>Dirección:</strong> ${orden.direccion || 'N/A'}${orden.referencia_direccion ? ' — Ref: ' + orden.referencia_direccion : ''}</p>
                <p class="mb-1"><strong>Fecha Ingreso:</strong> ${orden.fecha_ingreso || 'N/A'} ${orden.hora_ingreso || ''}</p>
                <p class="mb-1"><strong>Recepcionista:</strong> ${orden.recepcionista || 'N/A'}</p>
            </div>
            
            <div class="col-md-6">
                <h6 class="fw-bold mb-2"><i class="fas fa-car me-2"></i>DATOS DEL VEHÍCULO</h6>
                <p class="mb-1"><strong>Patente:</strong> <span style="font-size: 1.1rem; font-weight: bold; color: var(--gp-red);">${orden.patente_placa}</span></p>
                <p class="mb-1"><strong>Marca/Modelo:</strong> ${orden.marca || 'N/A'} ${orden.modelo || ''} (${orden.anio || 'N/A'})</p>
                <p class="mb-1"><strong>Color:</strong> ${orden.color ? `<span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:${orden.color.startsWith('#') ? orden.color : orden.color};vertical-align:middle;margin-right:4px;border:1px solid #ccc;"></span>${orden.color}` : 'N/A'}</p>
                <p class="mb-1"><strong>Cilindrada:</strong> ${orden.cilindrada || 'N/A'}</p>
                <p class="mb-1"><strong>Combustible:</strong> ${orden.combustible || 'N/A'}</p>
                <p class="mb-1"><strong>Kilometraje:</strong> ${orden.kilometraje || 'N/A'}</p>
                
                <hr class="my-2">
                
                <h6 class="fw-bold mb-2"><i class="fas fa-info-circle me-2"></i>ESTADO DE LA ORDEN</h6>
                <p class="mb-1"><span class="badge ${estadoClass} fs-6">${orden.estado}</span></p>
            </div>
        </div>
        
        <hr class="my-2">
        
        <div class="row">
            <div class="col-12">
                <h6 class="fw-bold mb-2"><i class="fas fa-tools me-2"></i>DIAGNÓSTICO Y TRABAJOS</h6>
                ${trabajosHtml}
                ${observaciones ? `<div class="mt-2 p-2 rounded" style="background:#fffdf5; border-left:3px solid #ffc800;"><strong style="color:#ffc800;"><i class="fas fa-clipboard-list me-1"></i>Requerimientos</strong><p class="mb-0 mt-1 text-muted" style="font-size:0.82rem;">${observaciones}</p></div>` : ''}
            </div>
        </div>
        
        <div class="row">
            <div class="col-12">
                <h6 class="fw-bold mb-2"><i class="fas fa-clipboard-check me-2"></i>CHECKLIST DEL VEHÍCULO</h6>
                ${checklistHtml}
            </div>
        </div>
        
        <hr class="my-2">
        
        <div class="row">
            <div class="col-12">
                <h6 class="fw-bold mb-2"><i class="fas fa-dollar-sign me-2"></i>VALORES</h6>
                <div class="row g-2 text-center">
                    <div class="${tieneCostos ? 'col' : 'col'}" style="${tieneCostos ? 'flex:0 0 20%;max-width:20%;' : 'flex:0 0 25%;max-width:25%;'}">
                        <div class="p-2 bg-light rounded">
                            <small class="text-muted" style="font-size:0.7rem;">${tieneCostos ? 'Total Original' : 'Total'}</small>
                            <div class="fw-bold" style="font-size:0.95rem;word-break:break-word;">$${Number(orden.monto_total || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}</div>
                        </div>
                    </div>
                    ${tieneCostos ? `
                    <div class="col" style="flex:0 0 20%;max-width:20%;">
                        <div class="p-2 rounded" style="background: #fff3cd;">
                            <small class="text-muted" style="font-size:0.7rem;">Costos Extra</small>
                            <div class="fw-bold text-danger" style="font-size:0.95rem;word-break:break-word;">+$${Number(orden.total_costos_adicionales || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}</div>
                        </div>
                    </div>
                    <div class="col" style="flex:0 0 20%;max-width:20%;">
                        <div class="p-2 rounded" style="background: #f8d7da;">
                            <small class="text-muted" style="font-size:0.7rem;">TOTAL FINAL</small>
                            <div class="fw-bold text-danger" style="font-size:0.95rem;word-break:break-word;">$${montoFinal.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</div>
                        </div>
                    </div>` : ''}
                    <div class="col" style="flex:0 0 ${tieneCostos ? '20' : '25'}%;max-width:${tieneCostos ? '20' : '25'}%;">
                        <div class="p-2 bg-light rounded">
                            <small class="text-muted" style="font-size:0.7rem;">Abono</small>
                            <div class="fw-bold" style="font-size:0.95rem;word-break:break-word;">$${Number(orden.monto_abono || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}</div>
                        </div>
                    </div>
                    <div class="col" style="flex:0 0 ${tieneCostos ? '20' : '25'}%;max-width:${tieneCostos ? '20' : '25'}%;">
                        <div class="p-2 bg-light rounded">
                            <small class="text-muted" style="font-size:0.7rem;">Restante</small>
                            <div class="fw-bold" style="font-size:0.95rem;word-break:break-word;">$${(montoFinal - Number(orden.monto_abono || 0)).toLocaleString('es-CL', { maximumFractionDigits: 0 })}</div>
                        </div>
                    </div>
                </div>
                ${orden.metodo_pago ? `<p class="text-center mt-2 mb-0"><strong>Método de Pago:</strong> ${orden.metodo_pago}</p>` : ''}
                ${costosDetalleHtml}

                <div class="mt-2 alert ${Number(orden.distancia_km || 0) > 0 ? 'alert-info' : 'alert-secondary'} py-2 px-3 mb-0">
                    <h6 class="fw-bold mb-1" style="font-size:0.85rem;color:${Number(orden.cargo_domicilio || 0) > 0 ? '#0066cc' : '#6c757d'};"><i class="fas fa-truck me-2"></i>DOMICILIO${Number(orden.distancia_km || 0) === 0 ? ' (No calculado)' : ''}</h6>
                    <div class="row text-center">
                        <div class="col-6">
                            <small class="text-muted" style="font-size:0.7rem;">Distancia recorrida</small>
                            <div class="fw-bold">${Number(orden.distancia_km || 0) > 0 ? Number(orden.distancia_km).toFixed(1) + ' km' : 'N/A'}</div>
                        </div>
                        <div class="col-6">
                            <small class="text-muted" style="font-size:0.7rem;">Cargo por domicilio</small>
                            <div class="fw-bold ${Number(orden.cargo_domicilio || 0) > 0 ? 'text-danger' : (Number(orden.distancia_km || 0) > 0 ? 'text-success' : 'text-muted')}">${Number(orden.distancia_km || 0) > 0 ? (Number(orden.cargo_domicilio || 0) > 0 ? '$' + Number(orden.cargo_domicilio).toLocaleString('es-CL') : 'Gratis') : 'No calculado'}</div>
                        </div>
                    </div>
                    ${Number(orden.distancia_km || 0) > 0 ? '<small class="text-muted" style="font-size:0.7rem;"><em>NOTA: Este valor NO esta incluido en el total de la factura. El pago se realiza directamente al tecnico.</em></small>' : ''}
                </div>
            </div>
        </div>
        
        ${firmaHtml}
        <div id="fotos-ot-admin-container"></div>
        <hr>
        
        <div class="alert alert-info">
            <small>
                <strong>Validez y Responsabilidad:</strong><br>
                • El cliente autoriza la intervención del vehículo<br>
                • Se autorizan pruebas de carretera necesarias<br>
                • La empresa no se hace responsable por objetos no declarados
            </small>
        </div>
    `;
    
    document.getElementById('modal-contenido').innerHTML = html;
    document.getElementById('modal-numero-orden').textContent = numeroFormateado;
    
    const modal = new bootstrap.Modal(document.getElementById('modalVerOrden'));
    modal.show();

    // Cargar fotos del técnico (DOM injection separado)
    var fotosData = ordenActual._fotos || [];
    if (fotosData.length > 0) {
        var fContainer = document.getElementById('fotos-ot-admin-container');
        if (fContainer) {
            var fHtml = '<div class="mt-3 mb-3"><h6 class="fw-bold"><i class="fas fa-images me-2"></i>FOTOS DEL TECNICO (' + fotosData.length + ')</h6><div class="row g-2">';
            var iconos = { antes: 'fa-camera-retro', despues: 'fa-check-circle', evidencia: 'fa-search' };
            var labels = { antes: 'Antes', despues: 'Despues', evidencia: 'Evidencia' };
            var colores = { antes: 'info', despues: 'success', evidencia: 'warning' };
            for (var i = 0; i < fotosData.length; i++) {
                var f = fotosData[i];
                var ico = iconos[f.tipo_foto] || 'fa-image';
                var lbl = labels[f.tipo_foto] || f.tipo_foto;
                var clr = colores[f.tipo_foto] || 'secondary';
                var desc = f.descripcion ? '<br><small class="text-muted" style="font-size:0.7rem;">' + f.descripcion + '</small>' : '';
                fHtml += '<div class="col-6 col-md-4 col-lg-3">'
                    + '<div class="card" style="cursor:pointer;border:1px solid #dee2e6;" data-foto-idx="' + i + '">'
                    + '<img src="' + f.url_imagen + '" style="width:100%;height:120px;object-fit:cover;border-radius:4px 4px 0 0;">'
                    + '<div class="card-body p-1"><small><span class="badge bg-' + clr + '" style="font-size:0.6rem;"><i class="fas ' + ico + ' me-1"></i>' + lbl + '</span></small>' + desc + '</div>'
                    + '</div></div>';
            }
            fHtml += '</div></div>';
            fContainer.innerHTML = fHtml;
            // Asignar click events
            var cards = fContainer.querySelectorAll('[data-foto-idx]');
            for (var j = 0; j < cards.length; j++) {
                (function(idx) {
                    cards[idx].addEventListener('click', function() { verFotoCompleta(fotosData[idx].url_imagen); });
                })(j);
            }
        }
    }
}

function verFotoCompleta(src) {
    var ov = document.getElementById('foto-fullscreen-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'foto-fullscreen-overlay';
        ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:99999;display:none;align-items:center;justify-content:center;cursor:zoom-out;';
        var img = document.createElement('img');
        img.id = 'foto-fullscreen-img';
        img.style.cssText = 'max-width:95%;max-height:95%;object-fit:contain;border-radius:8px;';
        ov.appendChild(img);
        ov.addEventListener('click', function() { ov.style.display = 'none'; });
        document.body.appendChild(ov);
    }
    document.getElementById('foto-fullscreen-img').src = src;
    ov.style.display = 'flex';
}

// ============================================
// GENERAR PDF
// ============================================

async function generarPDFDesdeModal() {
    if (!ordenActual) {
        mostrarNotificacion('error', 'Error', 'No hay orden seleccionada');
        return;
    }

    generarPDF(ordenActual);
}

function verPDFEnLinea() {
    if (!ordenActual || !ordenActual.token) {
        mostrarNotificacion('error', 'Error', 'No hay orden seleccionada o no tiene token');
        return;
    }

    const link = `${window.location.origin}/ver-ot?token=${ordenActual.token}`;
    window.open(link, '_blank');
}

async function generarPDF(orden) {
    const { jsPDF } = window.jspdf;
    // Usar portrait (vertical)
    const doc = new jsPDF('p', 'mm', 'a4');

    const numeroFormateado = String(orden.numero_orden).padStart(6, '0');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const leftMargin = 10;
    let yPos = 15;

    // ===== MARCA DE AGUA (corto.jpg) =====
    try {
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        logoImg.src = '/corto.jpg';
        // Esperar a que cargue (con timeout)
        await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(), 2000);
            logoImg.onload = () => { clearTimeout(timeout); resolve(); };
            logoImg.onerror = () => { clearTimeout(timeout); resolve(); };
        });
        if (logoImg.complete && logoImg.naturalWidth > 0) {
            // Marca de agua centrada, semitransparente
            doc.setGState(new doc.GState({ opacity: 0.08 }));
            const logoW = 80;
            const logoH = (logoImg.naturalHeight / logoImg.naturalWidth) * logoW;
            const logoX = (pageWidth - logoW) / 2;
            const logoY = (pageHeight - logoH) / 2;
            doc.addImage(logoImg, 'JPEG', logoX, logoY, logoW, logoH);
            doc.setGState(new doc.GState({ opacity: 1 }));
        }
    } catch (e) {
        // Si no hay imagen, continuar sin marca de agua
    }

    // ===== LOGO PEQUEÑO en esquina superior izquierda =====
    try {
        const smallLogo = new Image();
        smallLogo.crossOrigin = 'anonymous';
        smallLogo.src = '/corto.jpg';
        await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(), 2000);
            smallLogo.onload = () => { clearTimeout(timeout); resolve(); };
            smallLogo.onerror = () => { clearTimeout(timeout); resolve(); };
        });
        if (smallLogo.complete && smallLogo.naturalWidth > 0) {
            doc.addImage(smallLogo, 'JPEG', leftMargin, 5, 15, 10);
        }
    } catch (e) {}

    // ===== BANNER en la parte superior =====
    try {
        const bannerImg = new Image();
        bannerImg.crossOrigin = 'anonymous';
        bannerImg.src = '/banner.jpeg';
        await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(), 2000);
            bannerImg.onload = () => { clearTimeout(timeout); resolve(); };
            bannerImg.onerror = () => { clearTimeout(timeout); resolve(); };
        });
        if (bannerImg.complete && bannerImg.naturalWidth > 0) {
            const bannerW = pageWidth - (leftMargin * 2);
            const bannerH = (bannerImg.naturalHeight / bannerImg.naturalWidth) * bannerW;
            const maxBannerH = 30;
            const finalBannerH = Math.min(bannerH, maxBannerH);
            const finalBannerW = (bannerImg.naturalWidth / bannerImg.naturalHeight) * finalBannerH;
            const bannerX = (pageWidth - finalBannerW) / 2;
            doc.addImage(bannerImg, 'JPEG', bannerX, yPos, finalBannerW, finalBannerH);
            yPos += finalBannerH + 3;
        }
    } catch (e) {}

    // Número de orden pequeño en esquina superior derecha
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`OT #${numeroFormateado}`, pageWidth - 15, 10, { align: 'right' });

    // Título
    doc.setFontSize(16);
    doc.setTextColor(168, 0, 0);
    doc.text('ORDEN DE TRABAJO', pageWidth / 2, yPos, { align: 'center' });
    yPos += 8;

    doc.setFontSize(10);
    doc.text('GLOBAL PRO AUTOMOTRIZ', pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;

    // Información del Taller
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('1. INFORMACIÓN DEL TALLER', leftMargin, yPos);
    yPos += 6;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.text('Empresa: Global Pro Automotriz', leftMargin, yPos); yPos += 4;
    doc.text('Dirección: Padre Alberto Hurtado 3596, Pedro Aguirre Cerda', leftMargin, yPos); yPos += 4;
    doc.text('Contactos: +56 9 3902 6185', leftMargin, yPos); yPos += 4;
    doc.text('RRSS: @globalproautomotriz', leftMargin, yPos); yPos += 10;

    // Datos del Cliente
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('2. DATOS DEL CLIENTE', leftMargin, yPos);
    yPos += 6;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.text(`Cliente: ${orden.cliente_nombre || 'N/A'}`, leftMargin, yPos); yPos += 4;
    doc.text(`R.U.T.: ${orden.cliente_rut || 'N/A'}`, leftMargin, yPos); yPos += 4;
    doc.text(`Teléfono: ${orden.cliente_telefono || 'N/A'}`, leftMargin, yPos); yPos += 4;
    doc.text(`Dirección: ${orden.direccion || 'N/A'}`, leftMargin, yPos); yPos += 4;
    doc.text(`Fecha Ingreso: ${orden.fecha_ingreso || 'N/A'} ${orden.hora_ingreso || ''}`, leftMargin, yPos); yPos += 4;
    doc.text(`Recepcionista: ${orden.recepcionista || 'N/A'}`, leftMargin, yPos); yPos += 10;

    // Datos del Vehículo
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('3. DATOS DEL VEHÍCULO', leftMargin, yPos);
    yPos += 6;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.text(`Patente: ${orden.patente_placa}`, leftMargin, yPos); yPos += 4;
    doc.text(`Marca/Modelo: ${orden.marca || 'N/A'} ${orden.modelo || ''} (${orden.anio || 'N/A'})`, leftMargin, yPos); yPos += 4;
    doc.text(`Color: ${orden.color || 'N/A'}`, leftMargin, yPos); yPos += 4;
    doc.text(`Cilindrada: ${orden.cilindrada || 'N/A'}`, leftMargin, yPos); yPos += 4;
    doc.text(`Combustible: ${orden.combustible || 'N/A'}`, leftMargin, yPos); yPos += 4;
    doc.text(`Kilometraje: ${orden.kilometraje || 'N/A'}`, leftMargin, yPos); yPos += 10;

    // Trabajos con precios del catálogo (nuevo formato)
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('4. DIAGNÓSTICO Y TRABAJOS', leftMargin, yPos);
    yPos += 6;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);

    let checksListPDF = [];
    let serviciosPDF = orden.servicios_seleccionados || [];

    if (serviciosPDF.length > 0) {
        // Tabla de servicios con precios
        let subtotalPDF = 0;
        doc.setFontSize(7);
        serviciosPDF.forEach(s => {
            const precio = Number(s.precio_final || s.precio_sugerido || 0);
            subtotalPDF += precio;
            const tipo = s.tipo_comision === 'mano_obra' ? '[MO]' : '[Rep]';
            const editMark = s.editado ? '*' : '';
            const tecLabel = s.tecnico_nombre ? ` [${s.tecnico_nombre}]` : '';
            if (yPos > 265) { doc.addPage(); yPos = 20; }
            doc.text(`  [x] ${s.nombre}${editMark}${tecLabel}`, leftMargin, yPos);
            doc.text(`${tipo} $${precio.toLocaleString('es-CL', {maximumFractionDigits: 0})}`, leftMargin + 120, yPos);
            yPos += 4;
            // Mostrar descripción si existe
            if (s.descripcion) {
                if (yPos > 265) { doc.addPage(); yPos = 20; }
                doc.setFontSize(6);
                doc.setTextColor(100, 100, 100);
                const descLines = doc.splitTextToSize(`     > ${s.descripcion}`, pageWidth - leftMargin * 2 - 30);
                descLines.forEach(line => {
                    doc.text(line, leftMargin, yPos);
                    yPos += 3;
                });
                doc.setFontSize(7);
                doc.setTextColor(0, 0, 0);
            }
            checksListPDF.push(s.nombre);
        });
        // Subtotal
        if (yPos > 260) { doc.addPage(); yPos = 20; }
        doc.setFont(undefined, 'bold');
        doc.text('  Subtotal Servicios:', leftMargin, yPos);
        doc.text(`$${subtotalPDF.toLocaleString('es-CL', {maximumFractionDigits: 0})}`, leftMargin + 120, yPos);
        yPos += 6;
    } else {
        // Fallback: checks sin precios
        if (orden.diagnostico_checks) {
            try {
                checksListPDF = typeof orden.diagnostico_checks === 'string' ? JSON.parse(orden.diagnostico_checks) : orden.diagnostico_checks;
            } catch(e) {}
        }
        if (checksListPDF.length === 0) {
            if (orden.trabajo_frenos) checksListPDF.push('Frenos');
            if (orden.trabajo_luces) checksListPDF.push('Luces');
            if (orden.trabajo_tren_delantero) checksListPDF.push('Tren Delantero');
            if (orden.trabajo_correas) checksListPDF.push('Correas');
            if (orden.trabajo_componentes) checksListPDF.push('Componentes');
        }

        if (checksListPDF.length === 0) {
            doc.text('  Sin trabajos seleccionados', leftMargin, yPos); yPos += 6;
        } else {
            let checkStr = checksListPDF.join(', ');
            const lines = doc.splitTextToSize(checkStr, pageWidth - leftMargin * 2 - 10);
            lines.forEach(line => {
                doc.text('  ' + line, leftMargin, yPos);
                yPos += 4;
            });
        }
    }

    // Observaciones
    const obsPDF = orden.diagnostico_observaciones || '';
    if (obsPDF) {
        yPos += 3;
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.text('  OBSERVACIONES:', leftMargin, yPos); yPos += 5;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(7);
        const obsLines = doc.splitTextToSize(obsPDF, pageWidth - leftMargin * 2 - 10);
        obsLines.forEach(line => {
            if (yPos > 260) { doc.addPage(); yPos = 20; }
            doc.text('  ' + line, leftMargin, yPos);
            yPos += 4;
        });
    }
    yPos += 8;

    // Checklist
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('5. CHECKLIST DEL VEHÍCULO', leftMargin, yPos);
    yPos += 6;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.text(`Nivel de Combustible: ${orden.nivel_combustible || 'No registrado'}`, leftMargin, yPos); yPos += 4;
    doc.text('Estado de Carrocería:', leftMargin, yPos); yPos += 4;

    let checklistItems = [];
    if (orden.check_paragolfe_delantero_der) checklistItems.push('Parachoques delantero derecho');
    if (orden.check_puerta_delantera_der) checklistItems.push('Puerta delantera derecha');
    if (orden.check_puerta_trasera_der) checklistItems.push('Puerta trasera derecha');
    if (orden.check_paragolfe_trasero_izq) checklistItems.push('Parachoques trasero izquierdo');
    if (orden.check_otros_carroceria) checklistItems.push(orden.check_otros_carroceria);

    if (checklistItems.length === 0) {
        doc.text('  Sin observaciones', leftMargin, yPos); yPos += 4;
    } else {
        checklistItems.forEach(item => {
            doc.text(`  ✓ ${item}`, leftMargin, yPos); yPos += 4;
        });
    }
    yPos += 8;

    // Gastos Adicionales
    const costosExtras = orden.desglose_costos ? Number(orden.desglose_costos.total || 0) : Number(orden.total_costos_adicionales || 0);
    const cargoDomicilio = orden.cargo_domicilio ? Number(orden.cargo_domicilio) : (orden.desglose_costos ? Number(orden.desglose_costos.domicilio || 0) : 0);
    const domicilioModo = orden.domicilio_modo_cobro || 'pago_directo_tecnico';

    if (costosExtras > 0 || cargoDomicilio > 0) {
        // Cargar costos adicionales detallados si están disponibles
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.text('6. GASTOS ADICIONALES', leftMargin, yPos);
        yPos += 6;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(7);

        if (orden.costos_adicionales && orden.costos_adicionales.length > 0) {
            orden.costos_adicionales.forEach(c => {
                if (yPos > 260) { doc.addPage(); yPos = 20; }
                const cat = c.categoria || 'N/A';
                doc.text(`  - ${c.concepto || 'Gasto adicional'} (${cat}): $${Number(c.monto || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin, yPos);
                yPos += 5;
            });
        } else {
            const manoObra = orden.desglose_costos ? Number(orden.desglose_costos.mano_de_obra || 0) : 0;
            const repuestos = orden.desglose_costos ? Number(orden.desglose_costos.repuestos_materiales || 0) : 0;
            if (manoObra > 0) { doc.text(`  - Mano de Obra: $${manoObra.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin, yPos); yPos += 5; }
            if (repuestos > 0) { doc.text(`  - Repuestos/Materiales: $${repuestos.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin, yPos); yPos += 5; }
        }
        if (costosExtras > 0) {
            doc.text(`  Subtotal extras: $${costosExtras.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin, yPos);
            yPos += 8;
        }
    }

    // Domicilio (SIEMPRE visible, incluso si es $0 o no calculado)
    var distanciaKm = orden.distancia_km ? Number(orden.distancia_km) : 0;
    if (yPos > 255) { doc.addPage(); yPos = 20; }
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    const secDomNum = costosExtras > 0 ? '7. DOMICILIO' : '6. DOMICILIO';
    doc.text(secDomNum, leftMargin, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    if (distanciaKm > 0) {
        doc.text(`  - Distancia recorrida: ${distanciaKm} km`, leftMargin, yPos); yPos += 5;
        doc.text(`  - Cargo por domicilio: ${cargoDomicilio > 0 ? '$' + cargoDomicilio.toLocaleString('es-CL', { maximumFractionDigits: 0 }) : 'Gratis'}`, leftMargin, yPos); yPos += 5;
    } else {
        doc.text(`  - Domicilio: No calculado`, leftMargin, yPos); yPos += 5;
    }
    if (domicilioModo === 'pago_directo_tecnico') {
        doc.setFont(undefined, 'bold');
        doc.text(`  * Pago directo al tecnico (no incluido en el total de la factura)`, leftMargin, yPos); yPos += 8;
        doc.setFont(undefined, 'normal');
    } else {
        yPos += 3;
    }

    // Valores
    const montoFinalPDF = Number(orden.monto_final || orden.monto_total || 0);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    const secValores = costosExtras > 0 ? '8. VALORES' : '7. VALORES';
    doc.text(secValores, leftMargin, yPos);
    yPos += 6;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.text(`Total: $${montoFinalPDF.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin, yPos); yPos += 4;
    if (costosExtras > 0) {
        doc.text(`(Base: $${Number(orden.monto_total || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })} + Extras: $${costosExtras.toLocaleString('es-CL', { maximumFractionDigits: 0 })})`, leftMargin, yPos); yPos += 4;
    }
    doc.text(`Abono Recibido: $${Number(orden.monto_abono || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin, yPos); yPos += 4;
    doc.text(`Restante: $${(montoFinalPDF - Number(orden.monto_abono || 0)).toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, leftMargin, yPos); yPos += 4;
    if (orden.metodo_pago) {
        doc.text(`Método de Pago: ${orden.metodo_pago}`, leftMargin, yPos); yPos += 4;
    }
    yPos += 8;

    // Estado y Firma
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    const secEstado = costosExtras > 0 ? '8. ESTADO Y FIRMA' : '7. ESTADO Y FIRMA';
    doc.text(secEstado, leftMargin, yPos);
    yPos += 6;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.text(`Estado: ${orden.estado}`, leftMargin, yPos); yPos += 4;
    if (orden.fecha_aprobacion) {
        doc.text(`Fecha de Aprobación: ${orden.fecha_aprobacion}`, leftMargin, yPos); yPos += 4;
    }

    // Agregar imagen de firma si existe
    if (orden.firma_imagen) {
        try {
            doc.text('Firma del Cliente:', leftMargin, yPos); yPos += 4;
            doc.addImage(orden.firma_imagen, 'PNG', leftMargin, yPos, 40, 25);
            yPos += 28;
            doc.text(`Firma: ${orden.cliente_nombre || 'N/A'} (${orden.cliente_rut || 'N/A'})`, leftMargin, yPos); yPos += 4;
        } catch (e) {
            console.error('Error al agregar firma:', e);
        }
    }

    // Validez
    yPos += 6;
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    const secValidez = costosExtras > 0 ? '9. VALIDEZ Y RESPONSABILIDAD' : '8. VALIDEZ Y RESPONSABILIDAD';
    doc.text(secValidez, leftMargin, yPos);
    yPos += 6;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(6);
    doc.text('• El cliente autoriza la intervención del vehículo', leftMargin, yPos); yPos += 4;
    doc.text('• Se autorizan pruebas de carretera necesarias', leftMargin, yPos); yPos += 4;
    doc.text('• La empresa no se hace responsable por objetos no declarados', leftMargin, yPos); yPos += 4;

    // Footer
    doc.setFontSize(6);
    doc.setTextColor(128, 128, 128);
    doc.text(`Generado: ${new Date().toLocaleString('es-CL')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

    // Guardar
    doc.save(`OT-${numeroFormateado}-${orden.patente_placa}.pdf`);

    mostrarNotificacion('success', 'PDF Generado', 'El PDF se ha descargado exitosamente');
}

// ============================================
// COMPARTIR LINK
// ============================================

function compartirLink() {
    if (!ordenActual || !ordenActual.token) {
        mostrarNotificacion('error', 'Error', 'No hay orden seleccionada');
        return;
    }
    
    const link = `${window.location.origin}/aprobar?token=${ordenActual.token}`;
    
    if (navigator.share) {
        navigator.share({
            title: `Orden de Trabajo #${String(ordenActual.numero_orden).padStart(6, '0')}`,
            text: `Tiene una orden de trabajo de Global Pro Automotriz`,
            url: link
        });
    } else {
        copiarLink(link);
    }
}

// Toast temporal para el modal de creación de OT
function mostrarToastGP(msg) {
    const toast = document.getElementById('gp-toast-copied');
    if (!toast) return;
    toast.querySelector('span').textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
}

function copiarLink(link) {
    navigator.clipboard.writeText(link).then(() => {
        mostrarNotificacion('success', 'Link Copiado', 'El link ha sido copiado al portapapeles');
    }).catch(() => {
        // Fallback para navegadores antiguos
        const input = document.createElement('input');
        input.value = link;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        mostrarNotificacion('success', 'Link Copiado', 'El link ha sido copiado al portapapeles');
    });
}

// ============================================
// UTILIDADES
// ============================================

function obtenerClaseEstado(estado) {
    switch (estado) {
        case 'Enviada': return 'estado-enviada';
        case 'Aprobada': return 'estado-aprobada';
        case 'Cancelada': return 'estado-cancelada';
        default: return 'bg-secondary';
    }
}

function obtenerIconoEstado(estado) {
    switch (estado) {
        case 'Enviada': return '🟠';
        case 'Aprobada': return '🟢';
        case 'Cancelada': return '🔴';
        default: return '⚪';
    }
}

function mostrarLoading(mostrar) {
    const loading = document.getElementById('loading');
    if (!loading) return;
    if (mostrar) {
        loading.classList.add('show');
    } else {
        loading.classList.remove('show');
    }
}

function mostrarNotificacion(tipo, titulo, mensaje) {
    const toast = document.getElementById('toast');
    const toastHeader = document.getElementById('toast-header');
    const toastTitle = document.getElementById('toast-title');
    const toastBody = document.getElementById('toast-body');
    
    if (!toast || !toastTitle || !toastBody || !toastHeader) {
        console.warn('Notificación:', tipo, titulo, mensaje);
        return;
    }
    
    toastTitle.textContent = titulo;
    toastBody.textContent = mensaje;
    
    // Configurar colores según tipo
    toastHeader.className = 'toast-header';
    switch (tipo) {
        case 'success':
            toastHeader.classList.add('bg-success', 'text-white');
            break;
        case 'error':
            toastHeader.classList.add('bg-danger', 'text-white');
            break;
        case 'warning':
            toastHeader.classList.add('bg-warning');
            break;
        default:
            toastHeader.classList.add('bg-primary', 'text-white');
    }
    
    try {
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
    } catch(e) {
        console.warn('Toast error:', e);
    }
}

// ============================================
// EXPRESS DASHBOARD
// ============================================

let expressOrdenes = [];

async function cargarOrdenesExpress() {
    try {
        mostrarLoading(true);
        const estado = document.getElementById('express-filtro-estado')?.value || '';
        const tecnicoId = document.getElementById('express-filtro-tecnico')?.value || '';
        const periodo = document.getElementById('express-filtro-periodo')?.value || '';
        const valor = document.getElementById('express-filtro-valor')?.value || '';

        let url = `${API_BASE}/admin/ordenes-express?`;
        if (estado) url += `estado=${encodeURIComponent(estado)}&`;
        if (tecnicoId) url += `tecnico_id=${encodeURIComponent(tecnicoId)}&`;
        if (periodo) url += `periodo=${encodeURIComponent(periodo)}&`;
        if (valor) url += `valor=${encodeURIComponent(valor)}&`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            expressOrdenes = data.ordenes || [];
            renderizarKPIsExpress(data.metricas);
            renderizarProgresoExpress(data.metricas);
            renderizarFinancieroExpress(data.metricas);
            renderizarListaExpress(data.ordenes || []);
            actualizarSelectTecnicosExpress(data.tecnicos || []);
        } else {
            document.getElementById('express-lista').innerHTML = `
                <div class="text-center text-danger py-5">
                    <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
                    <p>Error al cargar órdenes express: ${data.error || 'Desconocido'}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error al cargar órdenes express:', error);
        document.getElementById('express-lista').innerHTML = `
            <div class="text-center text-danger py-5">
                <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
                <p>Error de conexión al cargar órdenes express</p>
            </div>
        `;
    } finally {
        mostrarLoading(false);
    }
}

function renderizarKPIsExpress(m) {
    if (!m) return;
    document.getElementById('express-kpi-total').textContent = m.total_express || 0;
    document.getElementById('express-kpi-pendientes').textContent = (m.pendientes || 0) + (m.en_sitio || 0) + (m.en_progreso || 0) + (m.pendiente_piezas || 0);
    document.getElementById('express-kpi-cerradas').textContent = (m.cerradas || 0) + (m.completadas || 0);
    document.getElementById('express-kpi-sin-asignar').textContent = m.sin_asignar || 0;
    var webEl = document.getElementById('express-kpi-desde-web');
    if (webEl) webEl.textContent = m.desde_web || 0;
}

function renderizarProgresoExpress(m) {
    if (!m) return;
    const total = m.total_express || 0;
    if (total === 0) {
        document.getElementById('express-barra-progreso').style.width = '0%';
        document.getElementById('express-barra-progreso').textContent = '0%';
        document.getElementById('express-progreso-texto').textContent = 'Sin datos';
        document.getElementById('express-barra-pend').textContent = '0';
        document.getElementById('express-barra-prog').textContent = '0';
        document.getElementById('express-barra-comp').textContent = '0';
        document.getElementById('express-barra-nocomp').textContent = '0';
        return;
    }

    const pendientes = (m.pendientes || 0) + (m.pendiente_piezas || 0);
    const enProgreso = (m.en_sitio || 0) + (m.en_progreso || 0);
    const completadas = (m.cerradas || 0) + (m.completadas || 0);
    const noCompletadas = m.no_completadas || 0;
    const pctCompletado = Math.round((completadas / total) * 100);

    document.getElementById('express-barra-progreso').style.width = pctCompletado + '%';
    document.getElementById('express-barra-progreso').textContent = pctCompletado + '%';
    document.getElementById('express-progreso-texto').textContent = pctCompletado + '% completado';
    document.getElementById('express-barra-pend').textContent = pendientes;
    document.getElementById('express-barra-prog').textContent = enProgreso;
    document.getElementById('express-barra-comp').textContent = completadas;
    document.getElementById('express-barra-nocomp').textContent = noCompletadas;
}

function renderizarFinancieroExpress(m) {
    if (!m) return;
    document.getElementById('express-fin-generado').textContent = '$' + formatMoney(m.total_generado);
    document.getElementById('express-fin-abonos').textContent = '$' + formatMoney(m.total_abonos);
    document.getElementById('express-fin-pendiente').textContent = '$' + formatMoney(m.total_pendiente);
}

function renderizarListaExpress(ordenes) {
    const container = document.getElementById('express-lista');
    document.getElementById('express-count').textContent = ordenes.length;

    if (!ordenes || ordenes.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="fas fa-bolt fa-3x mb-3" style="color: var(--gp-orange);"></i>
                <p>No hay órdenes express con los filtros seleccionados</p>
                <button class="btn btn-sm" style="background:linear-gradient(135deg,#ff6b00,#ff8c33);color:#fff;font-weight:700;border:none;border-radius:8px;" onclick="abrirModalOTExpress()">
                    <i class="fas fa-bolt me-1"></i>Crear OT Express
                </button>
            </div>
        `;
        return;
    }

    let html = '<div class="list-group list-group-flush">';

    ordenes.forEach(orden => {
        const num = String(orden.numero_orden).padStart(6, '0');
        const estadoClass = obtenerClaseEstadoExpress(orden.estado_trabajo);
        const tieneTecnico = !!orden.tecnico_nombre;
        const tieneDomicilio = Number(orden.cargo_domicilio || 0) > 0;
        const esWeb = orden.origen === 'web';
        const esCerrada = orden.estado_trabajo === 'Cerrada';

        html += `
            <div class="list-group-item list-group-item-action px-3 py-3" style="cursor:pointer;border-left:4px solid ${esWeb ? '#0d6efd' : 'var(--gp-orange)'};transition:background 0.2s;" onclick="verOrden(${orden.id})" onmouseover="this.style.background='#fff5eb'" onmouseout="this.style.background=''">
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <div>
                        <a href="#" onclick="event.stopPropagation(); verOTenLinea(${orden.id}); return false;" style="color:var(--gp-orange);text-decoration:none;font-weight:700;font-size:1.1rem;" title="Ver orden en línea"><i class="fas fa-bolt me-1"></i>EXP${num}</a>
                        ${esWeb ? '<span class="badge ms-1" style="background:#0d6efd;color:#fff;font-size:0.6rem;"><i class="fas fa-globe me-1"></i>WEB</span>' : ''}
                        ${tieneDomicilio ? '<span class="badge ms-1" style="background:#d90429;font-size:0.6rem;"><i class="fas fa-truck me-1"></i>$' + Number(orden.cargo_domicilio).toLocaleString('es-CL') + '</span>' : ''}
                        ${!tieneTecnico ? '<span class="badge bg-danger ms-1" style="font-size:0.6rem;"><i class="fas fa-user-slash me-1"></i>Sin asignar</span>' : ''}
                    </div>
                    <div class="d-flex gap-1 align-items-center">
                        <span class="badge ${estadoClass}" style="font-size:0.75rem;border-radius:20px;padding:4px 10px;font-weight:700;">${orden.estado_trabajo || 'N/A'}</span>
                        ${esCerrada ? `<button class="btn btn-outline-success btn-sm py-0 px-2" onclick="event.stopPropagation(); abrirOrdenDesdeLista(${orden.id}, ${orden.numero_orden})" title="Abrir Orden" style="font-size:0.75rem;"><i class="fas fa-lock-open"></i></button>` : `<button class="btn btn-outline-danger btn-sm py-0 px-2" onclick="event.stopPropagation(); cerrarOrdenDesdeLista(${orden.id}, ${orden.numero_orden})" title="Cerrar Orden" style="font-size:0.75rem;"><i class="fas fa-lock"></i></button>`}
                        <button class="btn btn-outline-warning btn-sm py-0 px-2" onclick="event.stopPropagation(); editarOrden(${orden.id})" title="Editar Orden" style="color:#ff6b00;border-color:#ff6b00;font-size:0.75rem;"><i class="fas fa-pen"></i></button>
                    </div>
                </div>
                <div class="row" style="font-size:0.85rem;">
                    <div class="col-md-3 mb-1">
                        <i class="fas fa-car me-1 text-muted"></i><strong>${orden.patente_placa || ''}</strong>
                        <span class="text-muted">${orden.marca || ''} ${orden.modelo || ''}</span>
                        ${orden.color ? `<span class="badge" style="background:${orden.color.startsWith('#') ? orden.color : orden.color};color:#fff;font-size:0.7rem;">${orden.color}</span>` : ''}
                    </div>
                    <div class="col-md-3 mb-1">
                        <i class="fas fa-user me-1 text-muted"></i>${orden.cliente_nombre || 'N/A'}
                    </div>
                    <div class="col-md-3 mb-1">
                        ${tieneTecnico ? '<i class="fas fa-user-cog me-1 text-muted"></i>' + orden.tecnico_nombre : '<i class="fas fa-user-slash me-1 text-danger"></i><span class="text-danger">Sin técnico</span>'}
                    </div>
                    <div class="col-md-3 mb-1 text-end">
                        <span class="fw-bold" style="color:var(--gp-red);">$${formatMoney(orden.monto_total)}</span>
                        ${Number(orden.monto_abono || 0) > 0 ? '<br><small class="text-muted">Abono: $' + formatMoney(orden.monto_abono) + '</small>' : ''}
                    </div>
                </div>
                ${orden.diagnostico_observaciones ? '<div class="mt-1" style="font-size:0.78rem;color:#666;"><i class="fas fa-clipboard me-1"></i>' + (orden.diagnostico_observaciones.length > 80 ? orden.diagnostico_observaciones.substring(0, 80) + '...' : orden.diagnostico_observaciones) + '</div>' : ''}
                <div class="mt-1" style="font-size:0.72rem;color:#999;"><i class="fas fa-clock me-1"></i>${orden.fecha_creacion || orden.fecha_ingreso || 'Sin fecha'}</div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

function obtenerClaseEstadoExpress(estadoTrabajo) {
    switch (estadoTrabajo) {
        case 'Pendiente Visita': return 'bg-warning text-dark';
        case 'En Sitio': return 'bg-info text-dark';
        case 'En Progreso': return 'bg-primary text-white';
        case 'Completada': return 'bg-success text-white';
        case 'Pendiente Piezas': return 'bg-secondary text-white';
        case 'Cerrada': return 'bg-dark text-white';
        case 'No Completada': return 'bg-danger text-white';
        case 'Aprobada': return 'bg-success text-white';
        default: return 'bg-light text-dark';
    }
}

function actualizarSelectTecnicosExpress(tecnicos) {
    const select = document.getElementById('express-filtro-tecnico');
    if (!select) return;
    const valorActual = select.value;
    // Mantener la primera opción
    let html = '<option value="">Todos los técnicos</option>';
    if (tecnicos && tecnicos.length > 0) {
        tecnicos.forEach(t => {
            html += `<option value="${t.id}" ${String(t.id) === valorActual ? 'selected' : ''}>${t.nombre}${t.apellido ? ' ' + t.apellido : ''}</option>`;
        });
    }
    select.innerHTML = html;
}

function actualizarFiltroPeriodoExpress() {
    const periodo = document.getElementById('express-filtro-periodo')?.value;
    const valorInput = document.getElementById('express-filtro-valor');
    const label = document.getElementById('express-filtro-valor-label');

    if (!periodo) {
        if (valorInput) valorInput.type = 'text';
        if (valorInput) valorInput.value = '';
        if (valorInput) valorInput.placeholder = 'Sin filtro';
        if (label) label.textContent = 'Periodo';
        return;
    }

    switch (periodo) {
        case 'dia':
            if (valorInput) valorInput.type = 'date';
            if (label) label.textContent = 'Día';
            break;
        case 'mes':
            if (valorInput) valorInput.type = 'month';
            if (label) label.textContent = 'Mes';
            if (valorInput && !valorInput.value) valorInput.value = getChileMonth();
            break;
        case 'anio':
            if (valorInput) valorInput.type = 'number';
            if (valorInput) valorInput.min = '2020';
            if (valorInput) valorInput.max = '2030';
            if (valorInput) valorInput.placeholder = '2026';
            if (label) label.textContent = 'Año';
            break;
    }
}

// ============================================
// GESTIÓN DE TÉCNICOS
// ============================================

function mostrarSeccion(seccion, evt) {
    // Cerrar sidebar si está abierto
    const sidebarPanel = document.getElementById('sidebarPanel');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebarPanel && sidebarPanel.classList.contains('open')) {
        sidebarPanel.classList.remove('open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('show');
        if (typeof hideSidebarBtn === 'function') hideSidebarBtn();
    }

    // Ocultar todas las secciones (safe null checks para calendario.html standalone)
    const _s = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
    _s('seccion-crear');
    _s('seccion-buscar');
    _s('seccion-express');
    _s('seccion-tecnicos');
    _s('seccion-liquidar');
    _s('seccion-reporte');
    _s('seccion-notificaciones');
    _s('seccion-calendario');

    // Mostrar la sección seleccionada
    const seccionObj = document.getElementById('seccion-' + seccion);
    if (seccionObj) seccionObj.style.display = 'block';

    // Si es la sección de técnicos, cargar datos
    if (seccion === 'tecnicos') {
        cargarTecnicos();
        cargarOrdenesDisponibles();
    }

    // Si es la sección de liquidación, cargar datos y configurar filtro
    if (seccion === 'liquidar') {
        cargarTecnicos();
        actualizarTipoFiltro();
        // Establecer mes actual por defecto en el campo de fecha
        var inputValorLiq = document.getElementById('liquidacion-valor');
        if (inputValorLiq && !inputValorLiq.value) inputValorLiq.value = getChileMonth();
        var elLiqResultados = document.getElementById('liquidacion-resultados');
        if (elLiqResultados) {
            elLiqResultados.innerHTML = `
                <div class="text-center text-muted py-4">
                    Seleccione un técnico y un periodo para mostrar las órdenes atendidas y la comisión.
                </div>
            `;
        }
        var elLiqResumen = document.getElementById('liquidacion-resumen');
        if (elLiqResumen) elLiqResumen.innerHTML = '';

    }

    // Si es la sección de reporte general, setear fecha por defecto
    if (seccion === 'reporte') {
        const mesStr = getChileMonth();
        const inputVal = document.getElementById('reporte-valor');
        if (inputVal) inputVal.value = mesStr;
    }

    // Si es la sección de notificaciones, cargar pendientes
    if (seccion === 'notificaciones') {
        cargarUltraMsgStatus();
        cargarConfigDomicilio();
        cargarNotificaciones();
    }

    // Si es la sección express dashboard, cargar datos y configurar filtro
    if (seccion === 'express') {
        const mesInput = document.getElementById('express-filtro-valor');
        if (mesInput && !mesInput.value) mesInput.value = getChileMonth();
        cargarOrdenesExpress();
    }

    // Si es la sección calendario, inicializar FullCalendar
    if (seccion === 'calendario') {
        inicializarCalendario();
    }
}

async function cargarTecnicos() {
    try {
        const response = await fetch(`${API_BASE}/admin/tecnicos`);
        const data = await response.json();

        if (data.success && data.tecnicos) {
            renderizarListaTecnicos(data.tecnicos);
            actualizarSelectTecnicos(data.tecnicos);
        } else {
            var elLista = document.getElementById('lista-tecnicos');
            if (elLista) elLista.innerHTML = `
                <div class="text-center text-muted py-3">
                    <p>No hay técnicos registrados</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error al cargar técnicos:', error);
        var elLista = document.getElementById('lista-tecnicos');
        if (elLista) elLista.innerHTML = `
            <div class="text-center text-danger py-3">
                <p>Error al cargar técnicos</p>
            </div>
        `;
    }
}

function renderizarListaTecnicos(tecnicos) {
    var elLista = document.getElementById('lista-tecnicos');
    if (!elLista) return;

    if (tecnicos.length === 0) {
        elLista.innerHTML = `
            <div class="text-center text-muted py-3">
                <p>No hay técnicos registrados</p>
            </div>
        `;
        return;
    }

    let html = '<div class="table-responsive"><table class="table table-hover">';
    html += '<thead><tr><th>Nombre</th><th>Apellido</th><th>Teléfono</th><th>Email</th><th>Estado</th><th>Registro</th><th>Acción</th></tr></thead><tbody>';

    tecnicos.forEach(tecnico => {
        const estadoBadge = tecnico.activo
            ? '<span class="badge bg-success">Activo</span>'
            : '<span class="badge bg-secondary">Inactivo</span>';

        const fechaRegistro = tecnico.fecha_registro
            ? new Date(tecnico.fecha_registro).toLocaleDateString('es-CL')
            : 'N/A';

        html += `
            <tr>
                <td>${tecnico.nombre}</td>
                <td>${tecnico.apellido || ''}</td>
                <td>${tecnico.telefono}</td>
                <td>${tecnico.email || 'N/A'}</td>
                <td>${estadoBadge}</td>
                <td>${fechaRegistro}</td>
                <td><button class="btn btn-sm btn-outline-danger" onclick="confirmarEliminarTecnico(${tecnico.id}, '${tecnico.nombre.replace(/'/g, "\\'")}')" title="Eliminar técnico"><i class="fas fa-trash-alt"></i></button></td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    elLista.innerHTML = html;
}

let tecnicoIdAEliminar = null;

function confirmarEliminarTecnico(id, nombre) {
    tecnicoIdAEliminar = id;
    document.getElementById('nombre-tecnico-eliminar').textContent = nombre;
    const modal = new bootstrap.Modal(document.getElementById('modalEliminarTecnico'));
    modal.show();

    document.getElementById('btn-confirmar-eliminar-tecnico').onclick = async function() {
        modal.hide();
        await eliminarTecnico(id);
    };
}

async function eliminarTecnico(id) {
    try {
        const response = await fetch(`${API_BASE}/admin/tecnicos?id=${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion('success', 'Técnico Eliminado', 'Se eliminó correctamente de la base de datos');
            cargarTecnicos();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo eliminar');
        }
    } catch (e) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

function actualizarSelectTecnicos(tecnicos) {
    // Guardar lista global de técnicos para selectores por item
    tecnicosGlobal = tecnicos.filter(t => t.activo);

    const selects = [
        document.getElementById('asignar-tecnico-id'),
        document.getElementById('liquidar-tecnico-id'),
        document.getElementById('reasignar-tecnico-actual'),
        document.getElementById('reasignar-tecnico-nuevo')
    ].filter(Boolean);

    selects.forEach(select => {
        select.innerHTML = '<option value="">Seleccione un técnico...</option>';
        tecnicos.forEach(tecnico => {
            if (tecnico.activo) {
                const option = document.createElement('option');
                option.value = tecnico.id;
                option.textContent = `${tecnico.nombre}${tecnico.apellido ? ' ' + tecnico.apellido : ''} (${tecnico.telefono})`;
                select.appendChild(option);
            }
        });
    });

    // Re-renderizar checkboxes de servicios en Crear Órdenes si ya existen
    if (serviciosCatalogo.length > 0) {
        renderizarServiciosCheckboxes(serviciosCatalogo);
    }

    // Re-renderizar servicios en Editar Órdenes si el panel está visible
    const editServJson = document.getElementById('edit-servicios-json');
    if (editServJson && editServJson.value) {
        try {
            const servicios = JSON.parse(editServJson.value);
            if (Array.isArray(servicios) && servicios.length > 0) {
                renderizarServiciosEditar(servicios);
            }
        } catch(e) {}
    }
}

async function cargarOrdenesDisponibles() {
    try {
        const response = await fetch(`${API_BASE}/admin/ordenes-disponibles`);
        const data = await response.json();

        if (data.success && data.ordenes) {
            renderizarListaOrdenesDisponibles(data.ordenes);
        } else {
            document.getElementById('lista-ordenes-disponibles').innerHTML = `
                <div class="text-center text-muted py-3">
                    <p>No hay órdenes disponibles</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error al cargar órdenes disponibles:', error);
        document.getElementById('lista-ordenes-disponibles').innerHTML = `
            <div class="text-center text-danger py-3">
                <p>Error al cargar órdenes</p>
            </div>
        `;
    }
}

function renderizarListaOrdenesDisponibles(ordenes) {
    if (ordenes.length === 0) {
        document.getElementById('lista-ordenes-disponibles').innerHTML = `
            <div class="text-center text-muted py-3">
                <p>No hay órdenes disponibles</p>
            </div>
        `;
        return;
    }

    let html = '<div class="table-responsive"><table class="table table-hover">';
    html += '<thead><tr><th>N° Orden</th><th>Cliente</th><th>Vehículo</th><th>Fecha</th><th>Acción</th></tr></thead><tbody>';

    ordenes.forEach(orden => {
        const numeroFormateado = String(orden.numero_orden).padStart(6, '0');
        const fecha = new Date(orden.fecha_creacion).toLocaleDateString('es-CL');
        const esExpress = Number(orden.es_express || 0) === 1;
        const expressBadge = esExpress ? ' <span style="color:#ff6b00;font-size:0.8em;" title="Orden Express">⚡</span>' : '';
        const esWeb = orden.origen === 'web';
        const webBadge = esWeb ? ' <span style="background:#0d6efd;color:#fff;padding:1px 6px;border-radius:4px;font-size:0.65rem;font-weight:700;">WEB</span>' : '';
        const vehiculo = (orden.patente_placa ? '<strong>' + orden.patente_placa + '</strong>' : '') + (orden.marca ? ' ' + orden.marca : '') + (orden.modelo ? ' ' + orden.modelo : '');
        html += `<tr>
            <td><strong class="text-primary">${numeroFormateado}${expressBadge}${webBadge}</strong></td>
            <td>${orden.cliente_nombre || 'N/A'}</td>
            <td>${vehiculo || '<span class="text-muted">Sin datos</span>'}</td>
            <td>${fecha}</td>
            <td><button class="btn btn-sm btn-outline-primary" onclick="seleccionarOrden(${orden.id}, '${numeroFormateado}')">Seleccionar</button></td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    document.getElementById('lista-ordenes-disponibles').innerHTML = html;
}

function seleccionarOrden(id, numero) {
    document.getElementById('asignar-orden-id').value = id;
    mostrarNotificacion('info', 'Orden Seleccionada', `Orden ${numero} seleccionada para asignación`);
}

async function registrarTecnico(event) {
    event.preventDefault();

    const tecnicoData = {
        nombre: document.getElementById('tecnico-nombre').value,
        apellido: document.getElementById('tecnico-apellido').value || '',
        telefono: document.getElementById('tecnico-telefono').value,
        email: document.getElementById('tecnico-email').value || null,
        pin: document.getElementById('tecnico-pin').value
    };

    try {
        const response = await fetch(`${API_BASE}/admin/tecnicos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tecnicoData)
        });

        const data = await response.json();

        if (data.success) {
            mostrarNotificacion('success', 'Técnico Registrado', 'El técnico ha sido registrado exitosamente');
            document.getElementById('form-tecnico').reset();
            cargarTecnicos();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al registrar técnico');
        }
    } catch (error) {
        console.error('Error al registrar técnico:', error);
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

async function asignarOrden() {
    const ordenId = document.getElementById('asignar-orden-id').value;
    const tecnicoId = document.getElementById('asignar-tecnico-id').value;

    if (!ordenId || !tecnicoId) {
        mostrarNotificacion('warning', 'Faltan Datos', 'Ingrese el número de orden y seleccione un técnico');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/asignar-orden`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenId,
                tecnico_id: tecnicoId
            })
        });

        const data = await response.json();

        if (data.success) {
            mostrarNotificacion('success', 'Orden Asignada', data.mensaje || 'La orden ha sido asignada exitosamente');
            document.getElementById('asignar-orden-id').value = '';
            document.getElementById('asignar-tecnico-id').value = '';
            cargarOrdenesDisponibles();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al asignar orden');
        }
    } catch (error) {
        console.error('Error al asignar orden:', error);
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

// ============================================
// REASIGNAR OT DE UN TÉCNICO A OTRO
// ============================================

async function cargarOrdenesDeTecnico() {
    const tecnicoId = document.getElementById('reasignar-tecnico-actual').value;
    const selectOrden = document.getElementById('reasignar-orden-id');

    if (!tecnicoId) {
        selectOrden.innerHTML = '<option value="">Primero seleccione técnico...</option>';
        return;
    }

    selectOrden.innerHTML = '<option value="">Cargando...</option>';

    try {
        // Obtener órdenes asignadas a este técnico que NO estén completadas/cerradas
        const response = await fetch(`${API_BASE}/admin/ordenes-asignadas?tecnico_id=${tecnicoId}`);
        const data = await response.json();

        if (data.success && data.ordenes && data.ordenes.length > 0) {
            selectOrden.innerHTML = '<option value="">Seleccione una orden...</option>';
            data.ordenes.forEach(orden => {
                const option = document.createElement('option');
                option.value = orden.id;
                const numOT = String(orden.numero_orden).padStart(6, '0');
                const estado = orden.estado_trabajo || '';
                const express = orden.es_express ? ' ⚡' : '';
                option.textContent = `OT#${numOT} — ${orden.patente_placa} — ${estado}${express}`;
                selectOrden.appendChild(option);
            });
        } else {
            selectOrden.innerHTML = '<option value="">No hay órdenes asignadas</option>';
        }
    } catch (error) {
        console.error('Error cargando órdenes del técnico:', error);
        selectOrden.innerHTML = '<option value="">Error al cargar</option>';
    }
}

async function reasignarOrden() {
    const tecnicoActualId = document.getElementById('reasignar-tecnico-actual').value;
    const ordenId = document.getElementById('reasignar-orden-id').value;
    const nuevoTecnicoId = document.getElementById('reasignar-tecnico-nuevo').value;

    if (!tecnicoActualId || !ordenId || !nuevoTecnicoId) {
        mostrarNotificacion('warning', 'Faltan Datos', 'Seleccione técnico actual, orden y nuevo técnico');
        return;
    }

    if (tecnicoActualId === nuevoTecnicoId) {
        mostrarNotificacion('warning', 'Mismo Técnico', 'El técnico actual y el nuevo son el mismo');
        return;
    }

    // Confirmar reasignación
    if (!confirm('¿Está seguro de reasignar esta OT al nuevo técnico? La orden volverá a estado "Pendiente Visita".')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/asignar-orden`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: ordenId,
                tecnico_id: nuevoTecnicoId
            })
        });

        const data = await response.json();

        if (data.success) {
            mostrarNotificacion('success', 'OT Reasignada', data.mensaje);
            // Limpiar selección
            document.getElementById('reasignar-tecnico-actual').value = '';
            document.getElementById('reasignar-orden-id').innerHTML = '<option value="">Primero seleccione técnico...</option>';
            document.getElementById('reasignar-tecnico-nuevo').value = '';
            // Refrescar listas
            cargarOrdenesDisponibles();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo reasignar');
        }
    } catch (error) {
        console.error('Error al reasignar:', error);
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

function actualizarTipoFiltro() {
    const selectPeriodo = document.getElementById('liquidacion-periodo');
    const input = document.getElementById('liquidacion-valor');
    const label = document.getElementById('liquidacion-valor-label');

    if (!selectPeriodo || !input || !label) return;

    const periodo = selectPeriodo.value;

    if (periodo === 'anio') {
        input.type = 'number';
        input.min = '2000';
        input.max = new Date().getFullYear();
        input.placeholder = '2026';
        label.textContent = 'Año';
    } else if (periodo === 'mes') {
        input.type = 'month';
        input.placeholder = '';
        label.textContent = 'Mes';
    } else {
        input.type = 'date';
        input.placeholder = '';
        label.textContent = 'Día';
    }
    input.value = '';
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
}

// Genera un cuadro visual con el color real (no código hexadecimal)
function colorSwatch(color) {
    if (!color) return '<span class="text-muted">-</span>';
    const bgColor = color;
    return `<span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:${bgColor};vertical-align:middle;border:1px solid #999;box-shadow:0 1px 2px rgba(0,0,0,0.1);"></span>`;
}

// Genera badge HTML para el estado de una OT
function obtenerBadgeEstado(estado, estadoTrabajo) {
    const est = (estado || '').toLowerCase();
    const estTrab = (estadoTrabajo || '').toLowerCase();
    let bg = 'secondary', icon = 'circle', label = estado || 'N/A';

    if (est === 'aprobada' || estTrab === 'aprobada') {
        bg = 'success'; icon = 'check-circle'; label = estadoTrabajo || estado || 'Aprobada';
    } else if (est === 'enviada' || est === 'pendiente') {
        bg = 'warning text-dark'; icon = 'clock'; label = estado || 'Pendiente';
    } else if (est === 'en proceso' || estTrab === 'en proceso' || estTrab === 'en_proceso') {
        bg = 'primary'; icon = 'cog fa-spin'; label = 'En Proceso';
    } else if (est === 'cerrada' || estTrab === 'cerrada') {
        bg = 'info'; icon = 'check-double'; label = 'Cerrada';
    } else if (est === 'cancelada' || estTrab === 'cancelada') {
        bg = 'danger'; icon = 'times-circle'; label = 'Cancelada';
    } else if (estTrab) {
        label = estadoTrabajo;
    }

    return `<span class="badge bg-${bg} fs-6"><i class="fas fa-${icon} me-1"></i>${label}</span>`;
}

async function buscarLiquidacionTecnico() {
    const selectTecnico = document.getElementById('liquidar-tecnico-id');
    const selectPeriodo = document.getElementById('liquidacion-periodo');
    const inputValor = document.getElementById('liquidacion-valor');

    if (!selectTecnico || !selectPeriodo || !inputValor) {
        mostrarNotificacion('error', 'Error', 'No se encontraron los campos del formulario. Recargue la página.');
        return;
    }

    const tecnicoId = selectTecnico.value;
    const periodo = selectPeriodo.value;
    const valor = inputValor.value;

    if (!tecnicoId) {
        mostrarNotificacion('warning', 'Falta Técnico', 'Seleccione un técnico para generar la liquidación');
        return;
    }

    if (!valor) {
        mostrarNotificacion('warning', 'Falta Fecha', 'Seleccione una fecha para filtrar');
        return;
    }

    try {
        mostrarLoading(true);
        const url = `${API_BASE}/admin/liquidar-tecnicos?tecnico_id=${encodeURIComponent(tecnicoId)}&periodo=${encodeURIComponent(periodo)}&valor=${encodeURIComponent(valor)}`;

        const response = await fetch(url);
        if (!response.ok) {
            mostrarNotificacion('error', 'Error API', 'Servidor respondió con error ' + response.status);
            return;
        }
        const data = await response.json();

        if (data.success) {
            _liquidacionTecnicoData = data.tecnico;
            _liquidacionAdelantosData = data.adelantos || [];
            _liquidacionTotalAdelantos = Number(data.totalAdelantosPendientes || 0);
            _liquidacionNetoAPagar = Number(data.netoAPagar || 0);
            // liquidacionOrden eliminada - ya no se usa
            renderizarResumenLiquidacion(data);
            renderizarLiquidacionOrdenes(data.ordenes);
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo cargar la liquidación');
        }
    } catch (error) {
        console.error('Error al buscar liquidación:', error);
        mostrarNotificacion('error', 'Error', 'Error de conexión: ' + (error.message || 'No se pudo consultar la liquidación'));
    } finally {
        mostrarLoading(false);
    }
}

function renderizarResumenLiquidacion(data) {
    const comisionPct = data.tecnico ? data.tecnico.comision_porcentaje || 40 : 40;
    const ordenes = data.ordenes || [];

    // --- Analizar tipos de trabajo recurrentes ---
    const tiposTrabajo = {};
    const categorias = {};
    const clientes = {};
    const patentes = {};
    let totalMO = 0, totalRep = 0, totalExtraMO = 0, totalExtraRep = 0;

    ordenes.forEach(o => {
        // Parsear servicios_seleccionados
        let servicios = [];
        try { servicios = typeof o.servicios_seleccionados === 'string' ? JSON.parse(o.servicios_seleccionados) : (o.servicios_seleccionados || []); } catch(e) { servicios = []; }

        servicios.forEach(s => {
            const nombre = s.nombre || 'Sin nombre';
            const tipo = s.tipo_comision || 'mano_obra';
            const cat = s.categoria || 'General';
            const precio = Number(s.precio_final || s.precio_sugerido || 0);

            if (!tiposTrabajo[nombre]) tiposTrabajo[nombre] = { count: 0, total: 0, tipo };
            tiposTrabajo[nombre].count++;
            tiposTrabajo[nombre].total += precio;

            if (!categorias[cat]) categorias[cat] = { count: 0, total: 0 };
            categorias[cat].count++;
            categorias[cat].total += precio;

            if (tipo === 'mano_obra') totalMO += precio;
            else totalRep += precio;
        });

        // Costos extra
        const extraMO = Number(o.total_costos_mano_obra || 0);
        const extraRM = Number(o.total_costos_repuestos || 0);
        totalExtraMO += extraMO;
        totalExtraRep += extraRM;

        // Contar clientes y patentes (con modelo/marca)
        const cli = o.cliente_nombre || 'N/A';
        const pat = o.patente_placa || 'N/A';
        if (!clientes[cli]) clientes[cli] = { count: 0, marca: '', modelo: '' };
        clientes[cli].count++;
        if (o.marca) clientes[cli].marca = o.marca;
        if (o.modelo) clientes[cli].modelo = o.modelo;
        if (!patentes[pat]) patentes[pat] = { count: 0, marca: '', modelo: '' };
        patentes[pat].count++;
        if (o.marca) patentes[pat].marca = o.marca;
        if (o.modelo) patentes[pat].modelo = o.modelo;
    });

    // Top 5 trabajos recurrentes
    const topTrabajos = Object.entries(tiposTrabajo)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 8);

    // Top categorías
    const topCats = Object.entries(categorias)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 6);

    // Top clientes recurrentes
    const topClientes = Object.entries(clientes)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);

    // Top patentes recurrentes
    const topPatentes = Object.entries(patentes)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);

    // Colores para gráficos
    const colores = ['#a80000','#ff6b00','#28a745','#0d6efd','#ffc107','#6f42c1','#17a2b8','#fd7e14','#e83e8c','#20c997'];
    const coloresPastel = ['#f4c2c2','#ffd699','#b8e6b8','#b8d4f0','#fff3b0','#d4b8e6','#b8e6e6','#ffc2a3'];

    // Calcular valor promedio por OT
    const promedioOT = ordenes.length > 0 ? (data.totalGenerado || 0) / ordenes.length : 0;
    // Ticket promedio MO
    const baseCom = Number(data.baseComisionable || 0);
    const comision = Number(data.totalTecnico || 0);

    const nombreTecnico = _liquidacionTecnicoData ? _liquidacionTecnicoData.nombre : 'Técnico';
    const canvasId = 'chartTiposTrabajo_' + Date.now();

    let html = `
    <style>
        #liquidacion-resumen table td,
        #liquidacion-resumen table th { border: 2px solid #000 !important; }
        #liquidacion-resumen .card { border: 3px solid #000 !important; }
        #liquidacion-resumen .table { border-collapse: collapse; }
        #liquidacion-totales-dinamicos .card { border: 3px solid #000 !important; }
        #liquidacion-resultados table td,
        #liquidacion-resultados table th { border: 2px solid #000 !important; }
        #liquidacion-resultados .table { border-collapse: collapse; }
    </style>

    <!-- KPIs superiores compactos -->
    <div class="row g-2 mb-3">
        <div class="col-6 col-md">
            <div class="card border-0 shadow-sm p-2 text-center" style="border-top: 4px solid #a80000 !important;">
                <div class="text-muted" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Ordenes</div>
                <div class="fw-bold" style="font-size:1.5rem; color:#a80000;">${data.totalOt || 0}</div>
            </div>
        </div>
        <div class="col-6 col-md">
            <div class="card border-0 shadow-sm p-2 text-center" style="border-top: 4px solid #28a745 !important;">
                <div class="text-muted" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Total Cliente</div>
                <div class="fw-bold" style="font-size:1.1rem; color:#28a745;">$${formatMoney(data.totalGenerado)}</div>
            </div>
        </div>
        <div class="col-6 col-md">
            <div class="card border-0 shadow-sm p-2 text-center" style="border-top: 4px solid #ff6b00 !important;">
                <div class="text-muted" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Base Comis.</div>
                <div class="fw-bold" style="font-size:1.1rem; color:#ff6b00;">$${formatMoney(baseCom)}</div>
            </div>
        </div>
        <div class="col-6 col-md">
            <div class="card border-0 shadow-sm p-2 text-center" style="border-top: 4px solid #0d6efd !important;">
                <div class="text-muted" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Comision ${comisionPct}%</div>
                <div class="fw-bold" style="font-size:1.3rem; color:#0d6efd;">$${formatMoney(comision)}</div>
            </div>
        </div>
        <div class="col-6 col-md">
            <div class="card border-0 shadow-sm p-2 text-center" style="border-top: 4px solid #6f42c1 !important;">
                <div class="text-muted" style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em;">Trabajos Distintos</div>
                <div class="fw-bold" style="font-size:1.3rem; color:#6f42c1;">${Object.keys(tiposTrabajo).length}</div>
            </div>
        </div>
    </div>

    <!-- Desglose Express vs Normal -->
    ${data.desgloseTipo ? `
    <div class="row g-2 mb-3">
        <div class="col-6">
            <div class="card border-0 shadow-sm p-2" style="border-left: 4px solid #ff6b00 !important; background: linear-gradient(135deg, #fff8f0, #fff);">
                <div class="d-flex align-items-center">
                    <i class="fas fa-bolt me-2" style="color:#ff6b00; font-size:1.2rem;"></i>
                    <div>
                        <div class="text-muted" style="font-size:0.7rem; text-transform:uppercase;">Express</div>
                        <div class="fw-bold" style="font-size:1rem; color:#ff6b00;">${data.desgloseTipo.express.cantidad} OT &bull; $${formatMoney(data.desgloseTipo.express.total)} &bull; Comisi&oacute;n: $${formatMoney(data.desgloseTipo.express.comision)}</div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-6">
            <div class="card border-0 shadow-sm p-2" style="border-left: 4px solid #0d6efd !important; background: linear-gradient(135deg, #f0f5ff, #fff);">
                <div class="d-flex align-items-center">
                    <i class="fas fa-wrench me-2" style="color:#0d6efd; font-size:1.2rem;"></i>
                    <div>
                        <div class="text-muted" style="font-size:0.7rem; text-transform:uppercase;">Normal</div>
                        <div class="fw-bold" style="font-size:1rem; color:#0d6efd;">${data.desgloseTipo.normal.cantidad} OT &bull; $${formatMoney(data.desgloseTipo.normal.total)} &bull; Comisi&oacute;n: $${formatMoney(data.desgloseTipo.normal.comision)}</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    ` : ''}

    <!-- ========== ADELANTOS Y PRÉSTAMOS (rojo/amarillo, bordes negros gruesos) ========== -->
    <div class="card mb-3" style="border:4px solid #000 !important; border-radius:12px; overflow:hidden;">
        <div class="card-header d-flex justify-content-between align-items-center" style="background:linear-gradient(135deg, #dc3545, #fd7e14); color:#ffc107; font-weight:800; border-bottom:4px solid #000;">
            <h6 class="mb-0" style="color:#ffc107; font-size:1rem; text-shadow:1px 1px 2px rgba(0,0,0,0.5);">
                <i class="fas fa-hand-holding-usd me-2"></i>ADELANTOS Y PRÉSTAMOS
            </h6>
            <button class="btn btn-sm fw-bold" style="background:#ffc107; color:#000; border:2px solid #000; font-weight:800;" onclick="abrirModalAdelanto()">
                <i class="fas fa-plus me-1"></i>Nuevo Adelanto
            </button>
        </div>
        <div class="card-body p-0" style="background:linear-gradient(135deg, #fff5f5, #fff9e6);">
            ${_liquidacionAdelantosData.length === 0 ? `
                <div class="text-center py-4">
                    <i class="fas fa-check-circle" style="font-size:2rem; color:#28a745;"></i>
                    <p class="text-muted mb-0 mt-2 fw-bold">Sin adelantos pendientes</p>
                </div>
            ` : `
                <div class="table-responsive">
                    <table class="table table-sm table-hover mb-0" style="font-size:0.82rem;">
                        <thead>
                            <tr style="background:#dc3545; color:#ffc107; border-bottom:3px solid #000;">
                                <th style="color:#ffc107; border-bottom:3px solid #000;">Fecha</th>
                                <th style="color:#ffc107; border-bottom:3px solid #000;">Concepto</th>
                                <th style="color:#ffc107; border-bottom:3px solid #000;" class="text-end">Monto</th>
                                <th style="color:#ffc107; border-bottom:3px solid #000;" class="text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                        ${_liquidacionAdelantosData.map(a => `
                            <tr style="border-bottom:2px solid #000;">
                                <td class="fw-bold" style="color:#dc3545;">${a.fecha_adelanto || '-'}</td>
                                <td>
                                    <span>${a.concepto || 'Adelanto'}</span>
                                    ${a.notas ? `<br><small class="text-muted" style="font-size:0.75rem;"><i class="fas fa-sticky-note me-1 text-warning"></i>${a.notas}</small>` : ''}
                                </td>
                                <td class="text-end fw-bold" style="color:#dc3545; font-size:0.95rem;">-$${formatMoney(a.monto)}</td>
                                <td class="text-center"><button class="btn btn-sm btn-outline-danger fw-bold" style="border:2px solid #dc3545;" onclick="eliminarAdelanto(${a.id})" title="Eliminar"><i class="fas fa-trash me-1"></i>Eliminar</button></td>
                            </tr>
                        `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="d-flex justify-content-between align-items-center p-3" style="background:linear-gradient(135deg, #dc3545, #fd7e14); border-top:4px solid #000;">
                    <span style="color:#ffc107; font-weight:800; font-size:0.9rem; text-shadow:1px 1px 2px rgba(0,0,0,0.5);">
                        <i class="fas fa-exclamation-triangle me-1"></i>TOTAL ADELANTOS PENDIENTES
                    </span>
                    <span style="color:#ffc107; font-weight:900; font-size:1.4rem; text-shadow:1px 1px 2px rgba(0,0,0,0.5);">
                        -$${formatMoney(_liquidacionTotalAdelantos)}
                    </span>
                </div>
            `}
        </div>
    </div>

    <!-- Fila principal: Gráfico + Top Trabajos -->
    <div class="row g-3 mb-3">
        <!-- Gráfico de tipos de trabajo -->
        <div class="col-md-5">
            <div class="card border-0 shadow-sm h-100">
                <div class="card-header text-white" style="background: linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%); font-size:0.85rem;">
                    <i class="fas fa-chart-pie me-2"></i>Distribución por Tipo de Trabajo
                </div>
                <div class="card-body p-2 text-center">
                    <canvas id="${canvasId}" height="220"></canvas>
                </div>
            </div>
        </div>

        <!-- Top Trabajos Recurrentes -->
        <div class="col-md-4">
            <div class="card border-0 shadow-sm h-100">
                <div class="card-header text-white" style="background: linear-gradient(135deg, #a80000 0%, #ff6b00 100%); font-size:0.85rem;">
                    <i class="fas fa-fire me-2"></i>Trabajos Más Recurrentes
                </div>
                <div class="card-body p-2" style="max-height:260px; overflow-y:auto;">
                    ${topTrabajos.length === 0 ? '<p class="text-muted text-center py-3">Sin datos</p>' : topTrabajos.map((t, i) => `
                    <div class="d-flex align-items-center mb-2" style="cursor:default;">
                        <div class="me-2 d-flex align-items-center justify-content-center rounded-circle text-white" style="min-width:26px; height:26px; font-size:0.7rem; font-weight:800; background:${colores[i % colores.length]};">${t[1].count}x</div>
                        <div class="flex-grow-1">
                            <div class="fw-bold" style="font-size:0.8rem;">${t[0]}</div>
                            <div class="bar-horizontal" style="height:6px; margin:2px 0;">
                                <div class="bar-fill" style="width:${topTrabajos[0][1].count > 0 ? (t[1].count / topTrabajos[0][1].count * 100) : 0}%; min-height:6px; padding:0; background:${colores[i % colores.length]};"></div>
                            </div>
                        </div>
                        <div class="text-end ms-2">
                            <div class="fw-bold" style="font-size:0.78rem; color:#a80000;">$${formatMoney(t[1].total)}</div>
                            <small class="text-muted" style="font-size:0.65rem;">${t[1].tipo === 'mano_obra' ? '🔧 MO' : '🔩 Rep'}</small>
                        </div>
                    </div>`).join('')}
                </div>
            </div>
        </div>

        <!-- Distribución MO vs Rep + Categorías -->
        <div class="col-md-3">
            <div class="card border-0 shadow-sm mb-3">
                <div class="card-header text-white py-2" style="background: linear-gradient(135deg, #28a745, #20c997); font-size:0.8rem;">
                    <i class="fas fa-balance-scale me-1"></i>MO vs Repuestos
                </div>
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between mb-1">
                        <span style="font-size:0.78rem;"><i class="fas fa-wrench me-1" style="color:#ffc107;"></i>Mano de Obra</span>
                        <strong style="font-size:0.85rem; color:#ffc107;">$${formatMoney(totalMO + totalExtraMO)}</strong>
                    </div>
                    <div class="progress mb-3" style="height:10px;">
                        <div class="progress-bar" style="width:${(totalMO + totalExtraMO) > 0 || totalRep > 0 ? ((totalMO + totalExtraMO) / ((totalMO + totalExtraMO) + totalRep + totalExtraRep) * 100) : 50}%; background: linear-gradient(90deg, #ffc107, #ff9800);"></div>
                    </div>
                    <div class="d-flex justify-content-between mb-1">
                        <span style="font-size:0.78rem;"><i class="fas fa-cog me-1" style="color:#6c757d;"></i>Repuestos</span>
                        <strong style="font-size:0.85rem; color:#6c757d;">$${formatMoney(totalRep + totalExtraRep)}</strong>
                    </div>
                    <div class="progress" style="height:10px;">
                        <div class="progress-bar" style="width:${(totalMO + totalExtraMO) > 0 || totalRep > 0 ? ((totalRep + totalExtraRep) / ((totalMO + totalExtraMO) + totalRep + totalExtraRep) * 100) : 50}%; background: linear-gradient(90deg, #6c757d, #495057);"></div>
                    </div>
                </div>
            </div>
            <div class="card border-0 shadow-sm">
                <div class="card-header text-white py-2" style="background: linear-gradient(135deg, #6f42c1, #e83e8c); font-size:0.8rem;">
                    <i class="fas fa-tags me-1"></i>Top Categorías
                </div>
                <div class="card-body p-2" style="max-height:130px; overflow-y:auto;">
                    ${topCats.length === 0 ? '<p class="text-muted text-center" style="font-size:0.8rem;">Sin datos</p>' : topCats.map((c, i) => `
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span style="font-size:0.78rem;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${colores[i % colores.length]}; margin-right:6px;"></span>${c[0]}</span>
                        <span>
                            <span class="badge rounded-pill" style="background:${colores[i % colores.length]}; font-size:0.65rem;">${c[1].count}</span>
                            <strong style="font-size:0.75rem; margin-left:4px;">$${formatMoney(c[1].total)}</strong>
                        </span>
                    </div>`).join('')}
                </div>
            </div>
        </div>
    </div>

    <!-- Fila inferior: Clientes + Patentes + Ticket Info -->
    <div class="row g-3 mb-3">
        <!-- Clientes recurrentes -->
        <div class="col-md-4">
            <div class="card border-0 shadow-sm h-100">
                <div class="card-header text-white py-2" style="background: linear-gradient(135deg, #0d6efd, #17a2b8); font-size:0.8rem;">
                    <i class="fas fa-user-friends me-1"></i>Clientes Recurrentes
                </div>
                <div class="card-body p-2">
                    ${topClientes.length === 0 ? '<p class="text-muted text-center" style="font-size:0.8rem;">Sin datos</p>' : topClientes.map((c, i) => `
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span style="font-size:0.8rem;">
                            <span class="d-inline-flex align-items-center justify-content-center rounded-circle text-white me-1" style="min-width:20px; height:20px; font-size:0.6rem; font-weight:800; background:${colores[i % colores.length]};">${i+1}</span>
                            ${c[0]}
                            ${c[1].marca || c[1].modelo ? `<small class="text-muted ms-1">(${c[1].marca || ''} ${c[1].modelo || ''})</small>` : ''}
                        </span>
                        <span class="badge bg-light text-dark" style="font-size:0.7rem;">${c[1].count} OT${c[1].count > 1 ? 's' : ''}</span>
                    </div>`).join('')}
                </div>
            </div>
        </div>

        <!-- Vehículos recurrentes -->
        <div class="col-md-4">
            <div class="card border-0 shadow-sm h-100">
                <div class="card-header text-white py-2" style="background: linear-gradient(135deg, #fd7e14, #e83e8c); font-size:0.8rem;">
                    <i class="fas fa-car me-1"></i>Vehículos Más Frecuentes
                </div>
                <div class="card-body p-2">
                    ${topPatentes.length === 0 ? '<p class="text-muted text-center" style="font-size:0.8rem;">Sin datos</p>' : topPatentes.map((p, i) => `
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span style="font-size:0.8rem;">
                            <span class="d-inline-flex align-items-center justify-content-center rounded-circle text-white me-1" style="min-width:20px; height:20px; font-size:0.6rem; font-weight:800; background:${colores[(i+3) % colores.length]};">${i+1}</span>
                            <strong>${p[0]}</strong>
                            ${p[1].marca || p[1].modelo ? `<small class="text-muted ms-1">(${p[1].marca || ''} ${p[1].modelo || ''})</small>` : ''}
                        </span>
                        <span class="badge bg-light text-dark" style="font-size:0.7rem;">${p[1].count} OT${p[1].count > 1 ? 's' : ''}</span>
                    </div>`).join('')}
                </div>
            </div>
        </div>

        <!-- Info adicional -->
        <div class="col-md-4">
            <div class="card border-0 shadow-sm h-100">
                <div class="card-header text-white py-2" style="background: linear-gradient(135deg, #343a40, #495057); font-size:0.8rem;">
                    <i class="fas fa-info-circle me-1"></i>Resumen del Periodo
                </div>
                <div class="card-body p-2">
                    <table style="width:100%; font-size:0.8rem;">
                        <tr><td class="text-muted py-1">Técnico</td><td class="text-end fw-bold">${nombreTecnico}</td></tr>
                        <tr><td class="text-muted py-1">Comisión</td><td class="text-end fw-bold">${comisionPct}%</td></tr>
                        <tr><td class="text-muted py-1">Tipos de trabajo</td><td class="text-end fw-bold">${Object.keys(tiposTrabajo).length}</td></tr>
                        <tr><td class="text-muted py-1">Clientes únicos</td><td class="text-end fw-bold">${Object.keys(clientes).length}</td></tr>
                        <tr><td class="text-muted py-1">Vehículos distintos</td><td class="text-end fw-bold">${Object.keys(patentes).length}</td></tr>
                        <tr style="border-top: 2px solid #dee2e6;"><td class="text-muted py-1"><strong>Ticket promedio</strong></td><td class="text-end fw-bold text-success">$${formatMoney(promedioOT)}</td></tr>
                        <tr><td class="text-muted py-1"><strong>Ganancia técnica/OT</strong></td><td class="text-end fw-bold text-primary">$${formatMoney(ordenes.length > 0 ? comision / ordenes.length : 0)}</td></tr>
                    </table>
                </div>
            </div>
        </div>
    </div>`;

    const elResumen = document.getElementById('liquidacion-resumen');
    if (!elResumen) return;
    elResumen.innerHTML = html;

    // Renderizar gráfico Chart.js
    setTimeout(() => {
        // Destruir chart anterior si existe
        if (window._liquidacionChart) { try { window._liquidacionChart.destroy(); } catch(e) {} }
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (topTrabajos.length > 0) {
            window._liquidacionChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: topTrabajos.map(t => t[0]),
                    datasets: [{
                        data: topTrabajos.map(t => t[1].total),
                        backgroundColor: colores.slice(0, topTrabajos.length),
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: true,
                    animation: { duration: 0 },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { font: { size: 10 }, padding: 8, boxWidth: 12 }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(ctx) {
                                    const item = topTrabajos[ctx.dataIndex];
                                    return ` ${item[0]}: ${item[1].count}x = $${formatMoney(item[1].total)}`;
                                }
                            }
                        }
                    },
                    cutout: '55%'
                }
            });
        }
    }, 100);
}

// Variable global para almacenar las órdenes de liquidación actuales
let _liquidacionOrdenesData = [];
let _liquidacionTecnicoData = null;
let _liquidacionAdelantosData = [];
let _liquidacionTotalAdelantos = 0;
let _liquidacionNetoAPagar = 0;
function renderizarLiquidacionOrdenes(ordenes) {
    // Guardar datos globalmente para recálculos
    _liquidacionOrdenesData = ordenes || [];

    const elResultados = document.getElementById('liquidacion-resultados');
    if (!elResultados) return;

    if (!ordenes || ordenes.length === 0) {
        elResultados.innerHTML = `
            <div class="text-center text-muted py-4">
                No hay órdenes para el técnico y el periodo seleccionado.
            </div>
        `;
        var totalesDinamicos = document.getElementById('liquidacion-totales-dinamicos');
        if (totalesDinamicos) totalesDinamicos.innerHTML = '';
        return;
    }

    let html = '<style>#liquidacion-resultados table td, #liquidacion-resultados table th { border: 2px solid #000 !important; } #liquidacion-resultados .table { border-collapse: collapse; }</style>';
    html += '<div class="table-responsive">';
    // Botones de seleccionar todo / deseleccionar todo
    html += `<div class="d-flex justify-content-between align-items-center mb-2">
        <div>
            <button class="btn btn-sm btn-outline-success me-1" onclick="liquidacionSeleccionarTodos(false)">
                <i class="fas fa-check-double me-1"></i>Pendiente Todos
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="liquidacionSeleccionarTodos(true)">
                <i class="fas fa-times-circle me-1"></i>Cancelar Todos
            </button>
        </div>
        <div class="text-muted"><small><i class="fas fa-info-circle me-1"></i>Marca "Cancelado" para excluir del pago al técnico</small></div>
    </div>`;
    html += '<table class="table table-hover align-middle" id="tabla-liquidacion">';
    html += '<thead><tr>' +
        '<th>Orden</th>' +
        '<th>Tipo</th>' +
        '<th>Marca</th>' +
        '<th>Modelo</th>' +
        '<th>Color</th>' +
        '<th>Nombre</th>' +
        '<th>Total OT</th>' +
        '<th>🔧 MO Serv.</th>' +
        '<th>🔩 Rep. Serv.</th>' +
        '<th>🔧 MO Extra</th>' +
        '<th>🔩 Rep. Extra</th>' +
        '<th>Base Comis.</th>' +
        '<th>Comisión</th>' +
        '<th>Cancelar</th>' +
        '<th>Acción</th>' +
        '</tr></thead><tbody>';

    ordenes.forEach((orden, index) => {
        const costosMO = Number(orden.total_costos_mano_obra || 0);
        const costosRM = Number(orden.total_costos_repuestos || 0);
        const moServ = Number(orden.mano_obra_servicios || 0);
        const repServ = Number(orden.repuestos_servicios || 0);
        const baseCom = Number(orden.base_comisionable || 0);
        const ganancia = Number(orden.ganancia_tecnico || 0);
        const esExpress = orden.es_express || orden.tipo_orden === 'Express';
        const tipoBadge = esExpress
            ? '<span class="badge bg-warning text-dark" style="font-size:0.7rem;"><i class="fas fa-bolt me-1"></i>Express</span>'
            : '<span class="badge bg-secondary" style="font-size:0.7rem;">Normal</span>';

        // Estado de cancelación persistido desde la BD
        const yaCancelado = orden.cancelado_liquidacion === true;
        const rowClass = yaCancelado ? 'row-cancelado' : 'row-pendiente';
        const rowStyle = yaCancelado ? 'opacity:0.5;text-decoration:line-through;' : '';
        const checkChecked = yaCancelado ? 'checked' : '';
        const badgeEstado = yaCancelado
            ? '<span class="badge bg-danger">Cancelado</span>'
            : '<span class="badge bg-success">Pendiente</span>';

        html += `<tr id="row-liquidacion-${index}" class="${rowClass}" data-comision="${ganancia}" data-base="${baseCom}" data-total="${orden.monto_total || 0}" data-orden-id="${orden.id}" data-tecnico-id="${_liquidacionTecnicoData ? _liquidacionTecnicoData.id : ''}" style="${rowStyle}">
            <td><a href="#" onclick="verOTenLinea(${orden.id}); return false;" style="color:#0d6efd;text-decoration:none;font-weight:700;" title="Ver orden en línea">#${String(orden.numero_orden || 0).padStart(6, '0')}</a></td>
            <td>${tipoBadge}</td>
            <td>${orden.marca || 'N/A'}</td>
            <td>${orden.modelo || 'N/A'}</td>
            <td>${colorSwatch(orden.color)}</td>
            <td>${orden.cliente_nombre || '-'}</td>
            <td>$${formatMoney(orden.monto_total)}</td>
            <td style="color:#ffc107;">$${formatMoney(moServ)}</td>
            <td class="text-muted">$${formatMoney(repServ)}</td>
            <td style="color:#ffc107;">${costosMO > 0 ? '+$' + formatMoney(costosMO) : '-'}</td>
            <td class="text-muted">${costosRM > 0 ? '+$' + formatMoney(costosRM) : '-'}</td>
            <td><strong class="text-primary">$${formatMoney(baseCom)}</strong></td>
            <td><strong class="text-primary">$${formatMoney(ganancia)}</strong></td>
            <td class="text-center">
                <div class="form-check form-switch d-flex justify-content-center align-items-center">
                    <input class="form-check-input liquidacion-check" type="checkbox" role="switch" 
                        id="check-cancel-${index}" 
                        data-index="${index}" 
                        onchange="liquidacionToggleCheck(this, ${index})"
                        style="width: 3em; height: 1.5em; cursor: pointer;"
                        ${checkChecked}>
                    <label class="form-check-label ms-2" for="check-cancel-${index}" id="label-check-${index}" style="font-size: 0.8rem; white-space: nowrap;">
                        ${badgeEstado}
                    </label>
                </div>
            </td>
            <td>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-outline-primary" onclick="verOTenLinea(${orden.id})" title="Ver OT en linea"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-sm btn-outline-warning" onclick="editarOrden(${orden.id})" title="Editar Orden" style="color:#ff6b00;border-color:#ff6b00;"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="verOTenPDF(${orden.id})" title="Descargar PDF"><i class="fas fa-file-pdf me-1"></i>PDF</button>
                </div>
            </td>
        </tr>`;
    });

    html += '</tbody></table></div>';

    // (Sección Adelantos movida arriba, antes del gráfico circular)

    html += '<div id="liquidacion-totales-dinamicos"></div>';
    elResultados.innerHTML = html;

    // Calcular totales iniciales (respetando estado cancelado persistido)
    recalcularTotalesLiquidacion();
}

// Función para cambiar el estado de un check individual (con persistencia)
async function liquidacionToggleCheck(checkbox, index) {
    const row = document.getElementById(`row-liquidacion-${index}`);
    const label = document.getElementById(`label-check-${index}`);
    if (!row || !label) return;

    const esCancelado = checkbox.checked;

    // Actualizar UI inmediatamente (optimista)
    if (esCancelado) {
        row.classList.remove('row-pendiente');
        row.classList.add('row-cancelado');
        row.style.opacity = '0.5';
        row.style.textDecoration = 'line-through';
        label.innerHTML = '<span class="badge bg-danger">Cancelado</span>';
    } else {
        row.classList.remove('row-cancelado');
        row.classList.add('row-pendiente');
        row.style.opacity = '1';
        row.style.textDecoration = 'none';
        label.innerHTML = '<span class="badge bg-success">Pendiente</span>';
    }
    recalcularTotalesLiquidacion();

    // Persistir en backend
    const ordenId = row.getAttribute('data-orden-id');
    const tecnicoId = row.getAttribute('data-tecnico-id');
    if (ordenId && tecnicoId) {
        try {
            await fetch(`${API_BASE}/admin/liquidacion-canceladas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orden_id: Number(ordenId),
                    tecnico_id: Number(tecnicoId),
                    cancelado: esCancelado
                })
            });
        } catch (e) {
            console.error('Error al persistir cancelación:', e);
        }
    }
}

// Función para seleccionar/deseleccionar todos (con persistencia masiva)
async function liquidacionSeleccionarTodos(cancelar) {
    const checkboxes = document.querySelectorAll('.liquidacion-check');
    const ordenesIds = [];

    // Actualizar UI inmediatamente
    checkboxes.forEach(cb => {
        cb.checked = cancelar;
        const index = cb.getAttribute('data-index');
        const row = document.getElementById(`row-liquidacion-${index}`);
        const label = document.getElementById(`label-check-${index}`);
        if (row && label) {
            if (cancelar) {
                row.classList.remove('row-pendiente');
                row.classList.add('row-cancelado');
                row.style.opacity = '0.5';
                row.style.textDecoration = 'line-through';
                label.innerHTML = '<span class="badge bg-danger">Cancelado</span>';
            } else {
                row.classList.remove('row-cancelado');
                row.classList.add('row-pendiente');
                row.style.opacity = '1';
                row.style.textDecoration = 'none';
                label.innerHTML = '<span class="badge bg-success">Pendiente</span>';
            }
        }
        // Recopilar IDs
        if (row) {
            const oid = row.getAttribute('data-orden-id');
            if (oid) ordenesIds.push(Number(oid));
        }
    });

    recalcularTotalesLiquidacion();

    // Persistir en backend (masivo)
    const tecnicoId = _liquidacionTecnicoData ? _liquidacionTecnicoData.id : null;
    if (tecnicoId && ordenesIds.length > 0) {
        try {
            await fetch(`${API_BASE}/admin/liquidacion-canceladas`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tecnico_id: tecnicoId,
                    ordenes: ordenesIds,
                    cancelado: cancelar
                })
            });
        } catch (e) {
            console.error('Error al persistir cancelación masiva:', e);
        }
    }
}

// Función principal para recalcular totales dinámicos
function recalcularTotalesLiquidacion() {
    const rows = document.querySelectorAll('#tabla-liquidacion tbody tr');
    if (rows.length === 0) return;

    let totalComisionGeneral = 0;     // Todas las comisiones
    let totalComisionPendiente = 0;   // Solo pendientes
    let totalComisionCancelado = 0;   // Solo cancelados
    let totalBaseGeneral = 0;
    let totalBasePendiente = 0;
    let totalBaseCancelado = 0;
    let totalOtGeneral = rows.length;
    let totalOtPendiente = 0;
    let totalOtCancelado = 0;

    rows.forEach(row => {
        const comision = Number(row.getAttribute('data-comision') || 0);
        const base = Number(row.getAttribute('data-base') || 0);
        const isCancelado = row.classList.contains('row-cancelado');

        totalComisionGeneral += comision;
        totalBaseGeneral += base;

        if (isCancelado) {
            totalComisionCancelado += comision;
            totalBaseCancelado += base;
            totalOtCancelado++;
        } else {
            totalComisionPendiente += comision;
            totalBasePendiente += base;
            totalOtPendiente++;
        }
    });

    const contenedor = document.getElementById('liquidacion-totales-dinamicos');
    if (!contenedor) return;

    // NETO A PAGAR = Comisión pendiente - Adelantos pendientes
    const netoAPagar = Math.max(0, totalComisionPendiente - _liquidacionTotalAdelantos);

    contenedor.innerHTML = `
        <div class="card border-primary mt-3">
            <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                <h6 class="mb-0"><i class="fas fa-calculator me-2"></i>Resumen de Liquidación con Control de Pagos</h6>
                <span class="badge bg-light text-dark">${_liquidacionTecnicoData ? _liquidacionTecnicoData.nombre : 'Técnico'}</span>
            </div>
            <div class="card-body">
                <div class="row g-3">
                    <!-- Columna 1: Totales Generales -->
                    <div class="col-md-3">
                        <div class="card bg-light border-secondary">
                            <div class="card-body text-center p-3">
                                <h6 class="text-muted mb-1">Total General</h6>
                                <div class="h5 fw-bold text-secondary">${totalOtGeneral} OTs</div>
                                <div class="text-muted small mb-1">Base Comisionable: <strong>$${formatMoney(totalBaseGeneral)}</strong></div>
                                <div class="text-secondary"><strong>Total Comisión: $${formatMoney(totalComisionGeneral)}</strong></div>
                            </div>
                        </div>
                    </div>
                    <!-- Columna 2: Pendientes de Pago -->
                    <div class="col-md-3">
                        <div class="card border-success">
                            <div class="card-body text-center p-3">
                                <h6 class="text-success mb-1"><i class="fas fa-check-circle me-1"></i>A Pagar (Pendiente)</h6>
                                <div class="h5 fw-bold text-success">${totalOtPendiente} OTs</div>
                                <div class="text-muted small mb-1">Base: <strong>$${formatMoney(totalBasePendiente)}</strong></div>
                                <div class="text-success fw-bold" style="font-size: 1.2rem;">$${formatMoney(totalComisionPendiente)}</div>
                                <small class="text-success">COMISIÓN SIN DESCONTAR</small>
                            </div>
                        </div>
                    </div>
                    <!-- Columna 3: Cancelados + Adelantos -->
                    <div class="col-md-3">
                        <div class="card border-danger">
                            <div class="card-body text-center p-3">
                                <h6 class="text-danger mb-1"><i class="fas fa-minus-circle me-1"></i>Descuentos</h6>
                                <div class="text-muted small mb-1">Cancelado: <strong class="text-danger">$${formatMoney(totalComisionCancelado)}</strong></div>
                                <div class="text-muted small mb-1">Adelantos: <strong class="text-warning">$${formatMoney(_liquidacionTotalAdelantos)}</strong></div>
                                <div class="text-danger fw-bold" style="font-size: 1.2rem;">-$${formatMoney(totalComisionCancelado + _liquidacionTotalAdelantos)}</div>
                                <small class="text-danger">TOTAL DEDUCCIONES</small>
                            </div>
                        </div>
                    </div>
                    <!-- Columna 4: NETO A PAGAR -->
                    <div class="col-md-3">
                        <div class="card ${_liquidacionTotalAdelantos > 0 ? 'border-warning' : 'border-primary'}" style="background: ${_liquidacionTotalAdelantos > 0 ? 'linear-gradient(135deg, #fff3cd 0%, #ffeeba 100%)' : 'linear-gradient(135deg, #e8f4fd 0%, #f0e6ff 100%)'};">
                            <div class="card-body text-center p-3">
                                <h6 class="${_liquidacionTotalAdelantos > 0 ? 'text-warning' : 'text-primary'} mb-1"><i class="fas fa-hand-holding-usd me-1"></i>NETO A PAGAR</h6>
                                <div class="fw-bold text-muted">${totalOtPendiente} de ${totalOtGeneral} OTs</div>
                                <div class="text-muted small mb-1">Comisión: $${formatMoney(totalComisionPendiente)} | Adelantos: <strong class="text-warning">-$${formatMoney(_liquidacionTotalAdelantos)}</strong></div>
                                <div class="${_liquidacionTotalAdelantos > 0 ? 'text-warning' : 'text-primary'} fw-bold" style="font-size: 1.6rem;">$${formatMoney(netoAPagar)}</div>
                                <small class="${_liquidacionTotalAdelantos > 0 ? 'text-warning' : 'text-primary'}">MONTO FINAL A LIQUIDAR</small>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Barra de progreso visual -->
                <div class="mt-3">
                    <div class="d-flex justify-content-between mb-1">
                        <small class="text-success"><i class="fas fa-check-circle me-1"></i>Pendiente: ${totalOtPendiente} OTs ($${formatMoney(totalComisionPendiente)})</small>
                        <small class="text-warning"><i class="fas fa-hand-holding-usd me-1"></i>Adelantos: -$${formatMoney(_liquidacionTotalAdelantos)}</small>
                        <small class="text-danger"><i class="fas fa-ban me-1"></i>Cancelado: ${totalOtCancelado} OTs ($${formatMoney(totalComisionCancelado)})</small>
                    </div>
                    <div class="progress" style="height: 25px;">
                        <div class="progress-bar bg-success" role="progressbar" style="width: ${totalOtGeneral > 0 ? (totalOtPendiente / totalOtGeneral * 100) : 0}%">
                            ${totalOtGeneral > 0 ? Math.round(totalOtPendiente / totalOtGeneral * 100) : 0}%
                        </div>
                        <div class="progress-bar bg-danger" role="progressbar" style="width: ${totalOtGeneral > 0 ? (totalOtCancelado / totalOtGeneral * 100) : 0}%">
                            ${totalOtGeneral > 0 ? Math.round(totalOtCancelado / totalOtGeneral * 100) : 0}%
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// ADELANTOS A TÉCNICOS - Funciones CRUD
// ============================================

function abrirModalAdelanto() {
    if (!_liquidacionTecnicoData || !_liquidacionTecnicoData.id) {
        mostrarNotificacion('warning', 'Sin técnico', 'Primero seleccione un técnico y busque liquidación');
        return;
    }
    document.getElementById('adelanto-tecnico-id').value = _liquidacionTecnicoData.id;
    document.getElementById('adelanto-tecnico-nombre').textContent = _liquidacionTecnicoData.nombre;
    document.getElementById('adelanto-monto').value = '';
    document.getElementById('adelanto-concepto').value = 'Adelanto';
    document.getElementById('adelanto-fecha').value = getChileDate();
    document.getElementById('adelanto-nota').value = '';
    toggleNotaAdelanto();
    new bootstrap.Modal(document.getElementById('modalAdelanto')).show();
}

// Mostrar/ocultar campo de nota según concepto seleccionado
function toggleNotaAdelanto() {
    const concepto = document.getElementById('adelanto-concepto').value;
    const grupoNota = document.getElementById('grupo-nota-adelanto');
    const notaField = document.getElementById('adelanto-nota');
    if (concepto === 'Otro') {
        grupoNota.style.display = 'block';
        notaField.setAttribute('required', 'required');
        notaField.focus();
    } else {
        grupoNota.style.display = 'none';
        notaField.removeAttribute('required');
        notaField.value = '';
    }
}

async function guardarAdelanto() {
    const tecnicoId = document.getElementById('adelanto-tecnico-id').value;
    const monto = parseFloat(document.getElementById('adelanto-monto').value);
    const concepto = document.getElementById('adelanto-concepto').value || 'Adelanto';
    const fecha = document.getElementById('adelanto-fecha').value;
    const nota = document.getElementById('adelanto-nota').value.trim();

    if (!monto || monto <= 0) {
        mostrarNotificacion('warning', 'Monto inválido', 'Ingrese un monto mayor a 0');
        return;
    }
    if (!fecha) {
        mostrarNotificacion('warning', 'Fecha', 'Seleccione una fecha');
        return;
    }
    // Si es "Otro", la nota es obligatoria
    if (concepto === 'Otro' && !nota) {
        mostrarNotificacion('warning', 'Nota requerida', 'Cuando el concepto es "Otro", debe agregar una nota descriptiva');
        return;
    }

    try {
        const resp = await fetch(`${API_BASE}/admin/adelantos-tecnico`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tecnico_id: tecnicoId, monto, concepto, fecha_adelanto: fecha, notas: nota })
        });
        const data = await resp.json();
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('modalAdelanto'))?.hide();
            mostrarNotificacion('success', 'Adelanto registrado', `$${formatMoney(monto)} para ${_liquidacionTecnicoData.nombre}`);
            // Recargar liquidación para reflejar el adelanto
            buscarLiquidacionTecnico();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo registrar');
        }
    } catch (e) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

async function eliminarAdelanto(adelantoId) {
    if (!confirm('¿Eliminar este adelanto?')) return;
    try {
        const resp = await fetch(`${API_BASE}/admin/adelantos-tecnico?id=${adelantoId}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.success) {
            mostrarNotificacion('success', 'Eliminado', 'Adelanto eliminado');
            buscarLiquidacionTecnico();
        } else {
            mostrarNotificacion('error', 'Error', data.error);
        }
    } catch (e) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

// ============================================
// CARGAR TODAS LAS ÓRDENES (ver-todas)
// ============================================

// ============================================
// CARGAR TODAS LAS ÓRDENES (ver-todas)
// ============================================

async function cargarTodasLasOrdenes() {
    try {
        mostrarLoading(true);
        const response = await fetch(`${API_BASE}/admin/todas-ordenes?limite=500`);
        const data = await response.json();
        if (data.ordenes && data.ordenes.length > 0) {
            ordenesFiltradas = data.ordenes;
            mostrarResultados(data.ordenes);
            document.getElementById('contador-ordenes').textContent = `${data.ordenes.length} de ${data.total} órdenes`;

            // Poblar dropdown de técnicos
            if (data.tecnicos && data.tecnicos.length > 0) {
                tecnicosParaFiltro = data.tecnicos;
                const select = document.getElementById('filtro-tecnico');
                if (select) {
                    const currentVal = select.value;
                    select.innerHTML = '<option value="">Todos los técnicos</option>';
                    data.tecnicos.forEach(t => {
                        const opt = document.createElement('option');
                        opt.value = t.id;
                        opt.textContent = t.nombre;
                        select.appendChild(opt);
                    });
                    if (currentVal) select.value = currentVal;
                }
            }
        } else {
            document.getElementById('resultados-busqueda').innerHTML = '<div class="text-center py-5"><i class="fas fa-folder-open fa-3x mb-3 text-muted"></i><p class="text-muted">No hay órdenes registradas</p></div>';
            document.getElementById('contador-ordenes').textContent = '0 órdenes';
        }
    } catch (error) {
        console.error('Error al cargar todas las órdenes:', error);
        mostrarNotificacion('error', 'Error', 'Error al cargar las órdenes');
    } finally {
        mostrarLoading(false);
    }
}

// ============================================

async function verOTenPDF(ordenId) {
    try {
        mostrarLoading(true);
        // Cargar la orden completa
        const response = await fetch(`${API_BASE}/ver-orden?id=${ordenId}`);
        const data = await response.json();
        if (data.orden) {
            // Generar PDF directamente
            await generarPDF(data.orden);
        } else {
            mostrarNotificacion('error', 'Error', 'No se pudo cargar la orden');
        }
    } catch (error) {
        console.error('Error al generar PDF desde liquidación:', error);
        mostrarNotificacion('error', 'Error', 'Error al generar el PDF');
    } finally {
        mostrarLoading(false);
    }
}

async function verOTenLinea(ordenId) {
    try {
        mostrarLoading(true);
        const response = await fetch(`${API_BASE}/ver-orden?id=${ordenId}`);
        const data = await response.json();
        if (data.orden && data.orden.token) {
            const link = `${window.location.origin}/ver-ot?token=${data.orden.token}`;
            window.open(link, '_blank');
        } else {
            mostrarNotificacion('error', 'Error', 'La orden no tiene token de acceso');
        }
    } catch (error) {
        console.error('Error al ver OT en línea:', error);
        mostrarNotificacion('error', 'Error', 'Error al cargar la orden');
    } finally {
        mostrarLoading(false);
    }
}


// eliminarOrden() está definida más abajo (usa ordenActual del modal)

// ============================================
// COSTOS ADICIONALES
// ============================================

function actualizarHintTipoCosto() {
    const tipo = document.getElementById('nuevo-costo-tipo').value;
    const hint = document.getElementById('nuevo-costo-tipo-hint');
    if (tipo === 'Mano de Obra') {
        hint.textContent = 'Afecta comisión 40%';
        hint.style.color = '#ffc107';
    } else {
        hint.textContent = 'NO afecta comisión';
        hint.style.color = '#6c757d';
    }
}

let costosOrdenActual = null;

async function abrirModalCostos(ordenId, numeroOrden, patente, cliente) {
    costosOrdenActual = { id: ordenId, numero: numeroOrden };
    document.getElementById('costos-orden-numero').textContent = String(numeroOrden).padStart(6, '0');
    document.getElementById('costos-patente').textContent = patente;
    document.getElementById('costos-cliente').textContent = cliente;
    document.getElementById('nuevo-costo-concepto').value = '';
    document.getElementById('nuevo-costo-monto').value = '';

    // Cargar costos existentes
    await cargarCostosDeOrden(ordenId);

    const modal = new bootstrap.Modal(document.getElementById('modalCostosAdicionales'));
    modal.show();
}

async function cargarCostosDeOrden(ordenId) {
    try {
        const response = await fetch(`${API_BASE}/admin/costos-adicionales?orden_id=${ordenId}`);
        const data = await response.json();

        if (data.success) {
            renderizarCostosAdicionales(data.costos, data.total, data.desglose);
            // Actualizar desglose por categoría
            if (data.desglose) {
                const totalMO = data.desglose.mano_de_obra || 0;
                const totalRM = data.desglose.repuestos_materiales || 0;
                document.getElementById('costos-total-mano-obra').textContent = '$' + totalMO.toLocaleString('es-CL', { maximumFractionDigits: 0 });
                document.getElementById('costos-total-repuestos').textContent = '$' + totalRM.toLocaleString('es-CL', { maximumFractionDigits: 0 });
                // Mostrar/ocultar desglose según si hay costos
                const desgloseContainer = document.getElementById('costos-desglose-container');
                if (desgloseContainer) {
                    desgloseContainer.style.display = (totalMO > 0 || totalRM > 0) ? 'block' : 'none';
                }
            }
            // También obtener el monto original de la orden
            const ordenResponse = await fetch(`${API_BASE}/ver-orden?id=${ordenId}`);
            const ordenData = await ordenResponse.json();
            if (ordenData.orden) {
                const montoFinal = Number(ordenData.orden.monto_total || 0) + data.total;
                document.getElementById('costos-total-final').textContent = '$' + montoFinal.toLocaleString('es-CL', { maximumFractionDigits: 0 });
            }
        }
    } catch (error) {
        console.error('Error al cargar costos:', error);
    }
}

function renderizarCostosAdicionales(costos, total, desglose) {
    const lista = document.getElementById('costos-lista');

    if (!costos || costos.length === 0) {
        lista.innerHTML = '<div class="gp-empty-costos"><i class="fas fa-receipt"></i>Sin costos adicionales registrados</div>';
        document.getElementById('costos-total-valor').textContent = '$0';
        document.getElementById('costos-total-mano-obra').textContent = '$0';
        document.getElementById('costos-total-repuestos').textContent = '$0';
        const desgloseContainer = document.getElementById('costos-desglose-container');
        if (desgloseContainer) desgloseContainer.style.display = 'none';
        return;
    }

    // Mostrar desglose
    const totalMO = desglose ? (desglose.mano_de_obra || 0) : 0;
    const totalRM = desglose ? (desglose.repuestos_materiales || 0) : 0;
    const desgloseContainer = document.getElementById('costos-desglose-container');
    if (desgloseContainer) desgloseContainer.style.display = 'block';

    // Header de lista
    let html = '<div class="gp-costos-list-title"><span><i class="fas fa-list-ul me-1"></i> Costos Registrados</span><span class="gp-count">' + costos.length + ' items</span></div>';

    costos.forEach(c => {
        const esManoObra = c.categoria === 'Mano de Obra';
        const icon = esManoObra ? '🔧' : '🔩';
        const catLabel = esManoObra ? 'MO' : 'Rep';
        const itemClass = esManoObra ? '' : ' repuesto-item';
        html += `
            <div class="costo-item${itemClass}">
                <div class="costo-info">
                    <strong>${icon} ${c.concepto}</strong>
                    <br><small>${new Date(c.fecha_registro).toLocaleDateString('es-CL')} · <span style="color:${esManoObra ? '#e6a800' : '#888'};font-weight:700;">${catLabel}</span></small>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <div class="costo-valor">$${formatMoney(c.monto)}</div>
                    <button class="gp-btn-del" onclick="eliminarCostoAdicional(${c.id})" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });

    lista.innerHTML = html;
    document.getElementById('costos-total-valor').textContent = '$' + total.toLocaleString('es-CL', { maximumFractionDigits: 0 });
}

async function agregarCostoAdicional() {
    if (!costosOrdenActual) return;

    const categoria = document.getElementById('nuevo-costo-tipo').value;
    const concepto = document.getElementById('nuevo-costo-concepto').value.trim();
    const monto = parseFloat(document.getElementById('nuevo-costo-monto').value);

    if (!concepto) {
        mostrarNotificacion('warning', 'Advertencia', 'Ingrese el concepto del costo');
        return;
    }
    if (!monto || monto <= 0) {
        mostrarNotificacion('warning', 'Advertencia', 'Ingrese un monto válido');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/costos-adicionales`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_id: costosOrdenActual.id,
                concepto: concepto,
                monto: monto,
                categoria: categoria
            })
        });

        const data = await response.json();

        if (data.success) {
            const esManoObra = categoria === 'Mano de Obra';
            const icon = esManoObra ? '🔧' : '🔩';
            mostrarNotificacion('success', 'Costo Agregado', `${icon} $${formatMoney(monto)} - ${concepto}`);
            document.getElementById('nuevo-costo-concepto').value = '';
            document.getElementById('nuevo-costo-monto').value = '';
            await cargarCostosDeOrden(costosOrdenActual.id);
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al agregar costo');
        }
    } catch (error) {
        console.error('Error al agregar costo:', error);
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

async function eliminarCostoAdicional(costoId) {
    if (!costosOrdenActual || !confirm('¿Eliminar este costo adicional?')) return;

    try {
        const response = await fetch(`${API_BASE}/admin/costos-adicionales?id=${costoId}&orden_id=${costosOrdenActual.id}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            mostrarNotificacion('success', 'Costo Eliminado', 'El costo fue eliminado');
            await cargarCostosDeOrden(costosOrdenActual.id);
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al eliminar');
        }
    } catch (error) {
        console.error('Error al eliminar costo:', error);
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

// DASHBOARD NEGOCIO — eliminado (no hay elementos HTML correspondientes, se usa Reporte General)
// Las funciones cargarDashboard, renderizarDashboard, actualizarTipoFiltroDashboard fueron removidas

// ============================================
// FLUJO DE CAJA
// ============================================

function actualizarTipoFiltroFlujo() {
    const periodo = document.getElementById('flujo-periodo').value;
    const input = document.getElementById('flujo-valor');
    const label = document.getElementById('flujo-valor-label');
    if (!input || !label) return;

    // Limpiar valor antes de cambiar tipo para evitar problemas de compatibilidad
    input.value = '';
    if (periodo === 'anio') {
        input.type = 'number'; input.min = '2000'; input.max = new Date().getFullYear();
        input.placeholder = '2026'; label.textContent = 'Año';
    } else if (periodo === 'mes') {
        // Usar type='text' con formato YYYY-MM para máxima compatibilidad
        input.type = 'text'; input.placeholder = 'Ej: 2026-05'; label.textContent = 'Mes';
        input.value = getChileMonth();
    } else {
        input.type = 'date'; input.placeholder = ''; label.textContent = 'Día';
        input.value = getChileDate();
    }
}

async function cargarFlujoCaja() {
    const periodo = document.getElementById('flujo-periodo').value;
    const valor = document.getElementById('flujo-valor').value;

    try {
        mostrarLoading(true);
        const url = new URL(`${API_BASE}/admin/resumen-pagos`, window.location.origin);
        url.searchParams.append('periodo', periodo);
        if (valor) url.searchParams.append('valor', valor);

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.success) {
            renderizarFlujoCaja(data);
        } else {
            mostrarNotificacion('error', 'Error', data.error);
        }
    } catch (error) {
        console.error('Error al cargar flujo:', error);
        mostrarNotificacion('error', 'Error', 'Error al cargar flujo de caja');
    } finally {
        mostrarLoading(false);
    }
}

// Helper: calcular % comisión de una orden usando comision_detalle del flujo de caja
function _calcularComisionOrden(pago) {
    // Buscar en comision_detalle para encontrar el técnico asignado
    const comisionDetalle = window._flujoCajaComisionDetalle || [];
    if (comisionDetalle.length === 0) return 40; // fallback
    // Buscar el técnico que tiene esta orden
    for (const d of comisionDetalle) {
        if (d.ordenes && d.ordenes.some(o => Number(o.id) === Number(pago.id))) {
            return Number(d.comision_porcentaje || 40);
        }
    }
    return 40; // default
}

function renderizarFlujoCaja(data) {
    const balancePositivo = data.balance_neto >= 0;

    // Detalle de Liquidación de Órdenes
    const liqOrd = data.salidas?.liquidacion_ordenes || {};
    const liqOrdTotalComision = Number(liqOrd.total_comision || 0);
    const liqOrdTotalDomicilio = Number(liqOrd.total_domicilio || 0);
    const liqOrdTotalBase = Number(liqOrd.total_base || 0);
    const liqOrdPorTecnico = liqOrd.por_tecnico || [];

    // Desglose de gastos
    const gastosDet = data.gastos_detalle || {};
    const gastosPorCat = gastosDet.por_categoria || [];
    const gastosItems = gastosDet.items || [];

    // Total mano de obra de servicios del catálogo
    const moServicios = Number(data.entradas?.total_mano_obra_servicios || 0);

    // Desglose tipo de orden
    const tipoOrden = data.desglose_tipo_orden || {};
    const expressData = tipoOrden.express || { cantidad: 0, total: 0, abonos: 0 };
    const normalData = tipoOrden.normal || { cantidad: 0, total: 0, abonos: 0 };

    // Tareas comunes
    const tareasComunes = data.tareas_comunes || [];

    // Resumen liquidación
    const resumenLiq = data.resumen_liquidacion || { cantidad_ordenes: 0, total_comision: 0, total_domicilio: 0 };

    // Adelantos a técnicos
    const adelantosDet = data.adelantos_detalle || {};
    const totalAdelantos = Number(data.salidas?.adelantos_tecnicos || adelantosDet.total || 0);
    const adelantosPorTecnico = adelantosDet.por_tecnico || [];
    const adelantosItems = adelantosDet.items || [];

    // Comisiones por técnico
    const comisionDetalle = data.salidas?.comision_detalle || [];
    // Guardar para que _calcularComisionOrden pueda acceder
    window._flujoCajaComisionDetalle = comisionDetalle;

    // Cálculos de validación (incluye adelantos)
    const totalSalidas = data.salidas.comisiones_tecnicos + data.salidas.gastos_operativos + liqOrdTotalComision + liqOrdTotalDomicilio + totalAdelantos;

    // Historial diario mejorado
    let historialHtml = '';
    if (data.historial_diario && data.historial_diario.length > 0) {
        historialHtml = `<div class="table-responsive"><table class="table table-sm table-gp">
            <thead><tr><th>Fecha</th><th>OTs</th><th>Ingresos</th><th>Abonos</th></tr></thead>
            <tbody>${data.historial_diario.map(h => `
                <tr>
                    <td>${h.fecha}</td>
                    <td>${h.ordenes}</td>
                    <td>$${formatMoney(h.ingresos)}</td>
                    <td>$${formatMoney(h.abonos_recibidos)}</td>
                </tr>
            `).join('')}</tbody>
        </table></div>`;
    } else {
        historialHtml = '<p class="text-muted">No hay datos para el periodo seleccionado</p>';
    }

    // --- GRÁFICOS CSS ---
    // Bar chart: Ingresos vs Salidas
    const totalIngresos = Number(data.entradas.total_ingresos_con_extras || 0);
    const maxBar = Math.max(totalIngresos, totalSalidas, 1);
    const ingresoPct = Math.round((totalIngresos / maxBar) * 100);
    const salidaPct = Math.round((totalSalidas / maxBar) * 100);

    // Bar chart: Órdenes Express vs Normal
    const totalOrdCount = Number(expressData.cantidad || 0) + Number(normalData.cantidad || 0);
    const expressPct = totalOrdCount > 0 ? Math.round((expressData.cantidad / totalOrdCount) * 100) : 0;
    const normalPct = totalOrdCount > 0 ? Math.round((normalData.cantidad / totalOrdCount) * 100) : 0;

    // Tareas comunes - bar chart
    const maxTaskCount = tareasComunes.length > 0 ? tareasComunes[0].cantidad : 1;

    const html = `
    <style>
        #flujo-contenido table td,
        #flujo-contenido table th { border: 2px solid #000 !important; }
        #flujo-contenido .card { border: 3px solid #000 !important; }
        #flujo-contenido .gp-tech-card { border: 3px solid #000 !important; }
        #flujo-contenido .gp-type-card { border: 3px solid #000 !important; }
        #flujo-contenido .gp-kpi-xl { border: 3px solid #000 !important; }
        #flujo-contenido .table { border-collapse: collapse; }
        .gp-kpi-xl { border-radius:12px; padding:20px 16px; text-align:center; background:#fff; border:3px solid #000 !important; box-shadow:0 2px 8px rgba(0,0,0,0.06); transition:transform 0.2s; }
        .gp-kpi-xl:hover { transform:translateY(-2px); box-shadow:0 4px 16px rgba(0,0,0,0.1); }
        .gp-kpi-xl .kpi-val { font-size:1.7rem; font-weight:800; line-height:1.2; }
        .gp-kpi-xl .kpi-lbl { font-size:0.78rem; color:#666; margin-top:4px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; }
        .gp-tech-card { border-radius:12px; padding:16px; background:#fff; border:3px solid #000 !important; box-shadow:0 2px 8px rgba(0,0,0,0.06); margin-bottom:12px; transition:transform 0.2s; }
        .gp-tech-card:hover { transform:translateY(-2px); box-shadow:0 4px 16px rgba(0,0,0,0.1); }
        .gp-tech-card .tech-name { font-size:1.05rem; font-weight:700; margin-bottom:8px; }
        .gp-tech-card .tech-row { display:flex; justify-content:space-between; align-items:center; padding:4px 0; }
        .gp-tech-card .tech-label { font-size:0.82rem; color:#666; }
        .gp-tech-card .tech-value { font-size:0.95rem; font-weight:700; }
        .gp-bar { height:28px; border-radius:6px; display:flex; align-items:center; padding:0 10px; font-size:0.75rem; font-weight:700; color:#fff; min-width:40px; transition:width 0.5s ease; }
        .gp-bar-sm { height:20px; border-radius:4px; display:flex; align-items:center; padding:0 8px; font-size:0.68rem; font-weight:600; color:#fff; min-width:30px; transition:width 0.5s ease; }
        .gp-type-card { border-radius:12px; padding:16px; text-align:center; background:#fff; border:3px solid #000 !important; box-shadow:0 2px 8px rgba(0,0,0,0.06); transition:transform 0.2s; }
        .gp-type-card:hover { transform:translateY(-2px); }
        .gp-section-title { font-size:1.05rem; font-weight:800; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
    </style>

    <!-- ========== KPIs PRINCIPALES - 6 tarjetas GRANDES ========== -->
    <div class="row g-3 mb-4">
        <div class="col"><div class="gp-kpi-xl" style="border-left:5px solid #198754;">
            <div class="kpi-val" style="color:#198754;">$${formatMoney(data.entradas.total_entradas || 0)}</div>
            <div class="kpi-lbl">Entradas (Pagos Recibidos)</div>
        </div></div>
        <div class="col"><div class="gp-kpi-xl" style="border-left:5px solid #0d6efd;">
            <div class="kpi-val" style="color:#0d6efd;">$${formatMoney(data.entradas.total_ingresos_con_extras)}</div>
            <div class="kpi-lbl">Total Ingresos</div>
        </div></div>
        <div class="col"><div class="gp-kpi-xl" style="border-left:5px solid #dc3545;">
            <div class="kpi-val" style="color:#dc3545;">$${formatMoney(totalSalidas)}</div>
            <div class="kpi-lbl">Total Salidas</div>
        </div></div>
        <div class="col"><div class="gp-kpi-xl" style="border-left:5px solid ${balancePositivo ? '#198754' : '#dc3545'};">
            <div class="kpi-val" style="color:${balancePositivo ? '#198754' : '#dc3545'};">$${formatMoney(data.balance_neto)}</div>
            <div class="kpi-lbl">BALANCE NETO</div>
        </div></div>
        <div class="col"><div class="gp-kpi-xl" style="border-left:5px solid ${totalAdelantos > 0 ? '#fd7e14' : '#6c757d'};">
            <div class="kpi-val" style="color:${totalAdelantos > 0 ? '#fd7e14' : '#6c757d'};">$${formatMoney(totalAdelantos)}</div>
            <div class="kpi-lbl">Adelantos Técnicos</div>
        </div></div>
        <div class="col"><div class="gp-kpi-xl" style="border-left:5px solid #6f42c1;">
            <div class="kpi-val" style="color:#6f42c1;">$${formatMoney(data.saldo_pendiente_cobrar)}</div>
            <div class="kpi-lbl">Por Cobrar</div>
        </div></div>
    </div>

    <!-- ========== TIPO DE ÓRDENES: Express / Normal / Liquidación ========== -->
    <div class="row g-3 mb-4">
        <div class="col-md-4">
            <div class="gp-type-card" style="border-color:#ff6b00;">
                <div style="font-size:2rem;">⚡</div>
                <div style="font-size:1.8rem;font-weight:800;color:#ff6b00;">${expressData.cantidad}</div>
                <div style="font-weight:700;color:#ff6b00;font-size:0.9rem;">Órdenes EXPRESS</div>
                <div class="mt-2" style="font-size:0.82rem;color:#666;">
                    <div>Total: <strong>$${formatMoney(expressData.total)}</strong></div>
                    <div>Abonos: <strong class="text-success">$${formatMoney(expressData.abonos)}</strong></div>
                </div>
                <div class="mt-2"><div class="gp-bar-sm" style="width:${expressPct}%;background:linear-gradient(90deg,#ff6b00,#ff9500);">${expressPct}%</div></div>
            </div>
        </div>
        <div class="col-md-4">
            <div class="gp-type-card" style="border-color:#0d6efd;">
                <div style="font-size:2rem;">🔧</div>
                <div style="font-size:1.8rem;font-weight:800;color:#0d6efd;">${normalData.cantidad}</div>
                <div style="font-weight:700;color:#0d6efd;font-size:0.9rem;">Órdenes NORMALES</div>
                <div class="mt-2" style="font-size:0.82rem;color:#666;">
                    <div>Total: <strong>$${formatMoney(normalData.total)}</strong></div>
                    <div>Abonos: <strong class="text-success">$${formatMoney(normalData.abonos)}</strong></div>
                </div>
                <div class="mt-2"><div class="gp-bar-sm" style="width:${normalPct}%;background:linear-gradient(90deg,#0d6efd,#4d9fff);">${normalPct}%</div></div>
            </div>
        </div>
        <div class="col-md-4">
            <div class="gp-type-card" style="border-color:#6f42c1;">
                <div style="font-size:2rem;">📋</div>
                <div style="font-size:1.8rem;font-weight:800;color:#6f42c1;">${resumenLiq.cantidad_ordenes}</div>
                <div style="font-weight:700;color:#6f42c1;font-size:0.9rem;">Órdenes LIQUIDADAS</div>
                <div class="mt-2" style="font-size:0.82rem;color:#666;">
                    <div>Comisión: <strong style="color:#6f42c1;">$${formatMoney(resumenLiq.total_comision)}</strong></div>
                    <div>Domicilio: <strong>$${formatMoney(resumenLiq.total_domicilio)}</strong></div>
                </div>
                <div class="mt-2"><div class="gp-bar-sm" style="width:${resumenLiq.cantidad_ordenes > 0 ? Math.round((resumenLiq.cantidad_ordenes / Math.max(totalOrdCount,1)) * 100) : 0}%;background:linear-gradient(90deg,#6f42c1,#9b6fe0);">${resumenLiq.cantidad_ordenes}</div></div>
            </div>
        </div>
    </div>

    <!-- ========== GRÁFICO BARRAS: Ingresos vs Salidas ========== -->
    <div class="card shadow-sm mb-4"><div class="card-body">
        <div class="gp-section-title"><i class="fas fa-chart-bar" style="color:#0d6efd;"></i> Ingresos vs Salidas</div>
        <div class="mb-3">
            <div class="d-flex align-items-center gap-2 mb-2">
                <span style="width:80px;font-size:0.82rem;font-weight:600;">Ingresos</span>
                <div class="gp-bar" style="width:${ingresoPct}%;background:linear-gradient(90deg,#198754,#20c997);">$${formatMoney(totalIngresos)}</div>
            </div>
            <div class="d-flex align-items-center gap-2">
                <span style="width:80px;font-size:0.82rem;font-weight:600;">Salidas</span>
                <div class="gp-bar" style="width:${salidaPct}%;background:linear-gradient(90deg,#dc3545,#e88);">$${formatMoney(totalSalidas)}</div>
            </div>
        </div>
        <div class="d-flex justify-content-between mt-2" style="font-size:0.82rem;color:#666;">
            <span>Abonos: $${formatMoney(data.entradas.total_abonos)}</span>
            <span>Comisiones: $${formatMoney(data.salidas.comisiones_tecnicos)}</span>
            <span>Gastos: $${formatMoney(data.salidas.gastos_operativos)}</span>
            <span>Adelantos: <strong style="color:#fd7e14;">$${formatMoney(totalAdelantos)}</strong></span>
            <span>Liq.Órdenes: $${formatMoney(liqOrdTotalComision + liqOrdTotalDomicilio)}</span>
        </div>
    </div></div>

    <!-- ========== RANKING LINEAL DE TÉCNICOS ========== -->
    <div class="card shadow-sm mb-4"><div class="card-body">
        <div class="gp-section-title"><i class="fas fa-trophy" style="color:#ffc107;"></i> Ranking de Técnicos</div>
        ${comisionDetalle.length === 0 ? '<p class="text-muted">Sin comisiones en el periodo</p>' : `
        <div class="list-group">
            ${comisionDetalle.map((d, idx) => {
                const techOrdenes = d.ordenes || [];
                const totalGenerado = techOrdenes.reduce((s, o) => s + Number(o.total || 0), 0);
                const rankColors = ['#ffc107','#adb5bd','#cd7f32','#6f42c1','#0d6efd','#28a745','#dc3545','#fd7e14'];
                const rankColor = rankColors[idx] || '#6f42c1';
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `<span style="font-weight:800;color:#666;font-size:0.9rem;">${idx + 1}</span>`;
                return `<div class="list-group-item list-group-item-action p-3 mb-2" style="border-radius:10px;border-left:5px solid ${rankColor};">
                    <div class="d-flex align-items-center gap-3 mb-2">
                        <div style="font-size:1.3rem;min-width:32px;text-align:center;">${medal}</div>
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <strong style="font-size:1.05rem;">${d.tecnico}</strong>
                                    <span class="badge bg-warning text-dark ms-2" style="font-size:0.7rem;">${d.comision_porcentaje}%</span>
                                </div>
                                <div class="text-end">
                                    <div style="font-size:1.1rem;font-weight:800;color:#dc3545;">$${formatMoney(d.comision)}</div>
                                    <div class="text-muted" style="font-size:0.7rem;">Comisión</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="row g-2 mb-2" style="font-size:0.78rem;">
                        <div class="col"><span class="text-muted">Órdenes:</span> <strong>${techOrdenes.length}</strong></div>
                        <div class="col"><span class="text-muted">Generado:</span> <strong style="color:#28a745;">$${formatMoney(totalGenerado)}</strong></div>
                        <div class="col"><span class="text-muted">Comisionado:</span> <strong style="color:#dc3545;">$${formatMoney(d.comision)}</strong></div>
                        <div class="col"><span class="text-muted">Base:</span> <strong style="color:#0d6efd;">$${formatMoney(d.base_comisionable)}</strong></div>
                        <div class="col"><span class="text-muted">Adelantos:</span> <strong style="color:#fd7e14;">$${formatMoney(d.adelantos || 0)}</strong></div>
                        <div class="col"><span class="text-muted">Neto:</span> <strong style="color:#198754;">$${formatMoney(d.neto_pagar || d.comision)}</strong></div>
                    </div>
                    ${techOrdenes.length > 0 ? `
                    <div class="table-responsive mt-1" style="max-height:200px;overflow-y:auto;">
                        <table class="table table-sm mb-0" style="font-size:0.72rem;">
                            <thead><tr><th>#OT</th><th>Patente</th><th>Marca</th><th>Modelo</th><th>Color</th><th>Nombre</th><th>Total</th><th>Comisión</th></tr></thead>
                            <tbody>${techOrdenes.map(o => `<tr>
                                <td><a href="#" onclick="verOTenLinea(${o.id}); return false;" style="color:#0d6efd;text-decoration:none;font-weight:700;" title="Ver orden en línea">${String(o.numero_orden || 0).padStart(6, '0')}</a>${o.es_express ? ' ⚡' : ''}</td>
                                <td>${o.patente || '-'}</td>
                                <td>${o.marca || '-'}</td>
                                <td>${o.modelo || '-'}</td>
                                <td>${colorSwatch(o.color)}</td>
                                <td>${o.cliente_nombre || '-'}</td>
                                <td>$${formatMoney(o.total || 0)}</td>
                                <td style="color:#dc3545;font-weight:700;">$${formatMoney(o.comision || 0)}</td>
                            </tr>`).join('')}</tbody>
                        </table>
                    </div>` : ''}
                </div>`;
            }).join('')}
        </div>`}

        ${liqOrdPorTecnico.length > 0 ? `
        <hr class="my-3">
        <div class="gp-section-title"><i class="fas fa-file-invoice-dollar" style="color:#6f42c1;"></i> Liquidación de Órdenes en Conjunto por Técnico</div>
        <div class="row g-3">
            ${liqOrdPorTecnico.map(d => {
                const totalLiqTec = Number(d.total_comision || 0) + Number(d.total_domicilio || 0);
                const liqOrdenes = d.ordenes || [];
                return `<div class="col-md-6 col-lg-4">
                    <div class="gp-tech-card" style="border-left:5px solid #9b6fe0;">
                        <div class="tech-name"><i class="fas fa-file-invoice-dollar me-2" style="color:#9b6fe0;"></i>${d.tecnico_nombre}</div>
                        <div class="tech-row" style="border-bottom:1px solid #f0f0f0;padding-bottom:6px;">
                            <span class="tech-label">Total liquidado</span>
                            <span class="tech-value" style="color:#6f42c1;">$${formatMoney(totalLiqTec)}</span>
                        </div>
                        <div class="tech-row" style="border-bottom:1px solid #f0f0f0;padding-bottom:6px;">
                            <span class="tech-label">Comisión</span>
                            <span class="tech-value" style="color:#dc3545;">$${formatMoney(d.total_comision)}</span>
                        </div>
                        <div class="tech-row" style="border-bottom:1px solid #f0f0f0;padding-bottom:6px;">
                            <span class="tech-label">Domicilios</span>
                            <span class="tech-value" style="color:#17a2b8;">$${formatMoney(d.total_domicilio)}</span>
                        </div>
                        <div class="tech-row" style="border-bottom:1px solid #f0f0f0;padding-bottom:6px;">
                            <span class="tech-label">Base</span>
                            <span class="tech-value" style="color:#0d6efd;">$${formatMoney(d.total_base)}</span>
                        </div>
                        <div class="tech-row">
                            <span class="tech-label">Órdenes</span>
                            <span class="tech-value"><span class="badge bg-secondary">${d.total_ordenes} OT</span></span>
                        </div>
                        ${liqOrdenes.length > 0 ? `
                        <div class="table-responsive mt-2" style="max-height:180px;overflow-y:auto;">
                            <table class="table table-sm mb-0" style="font-size:0.72rem;">
                                <thead><tr><th>#OT</th><th>Placa</th><th>Marca</th><th>Modelo</th><th>Color</th><th>Nombre</th><th>Comisión</th></tr></thead>
                                <tbody>${liqOrdenes.map(lo => `<tr>
                                    <td><a href="#" onclick="verOTenLinea(${lo.orden_id}); return false;" style="color:#0d6efd;text-decoration:none;font-weight:700;" title="Ver orden en línea">${String(lo.numero_orden || 0).padStart(6, '0')}</a>${Number(lo.es_express || 0) === 1 ? ' ⚡' : ''}</td>
                                    <td>${lo.patente_placa || '-'}</td>
                                    <td>${lo.marca || '-'}</td>
                                    <td>${lo.modelo || '-'}</td>
                                    <td>${colorSwatch(lo.color)}</td>
                                    <td>${lo.cliente_nombre || '-'}</td>
                                    <td style="color:#dc3545;font-weight:700;">$${formatMoney(lo.monto_comision || 0)}</td>
                                </tr>`).join('')}</tbody>
                            </table>
                        </div>` : ''}
                    </div>
                </div>`;
            }).join('')}
        </div>` : ''}
    </div></div>

    <!-- ========== TAREAS MÁS COMUNES ========== -->
    ${tareasComunes.length > 0 ? `
    <div class="card shadow-sm mb-4"><div class="card-body">
        <div class="gp-section-title"><i class="fas fa-tasks" style="color:#fd7e14;"></i> Tareas Más Comunes (Top 10)</div>
        <div class="row">
            <div class="col-md-8">
                ${tareasComunes.map(t => {
                    const barPct = Math.max(Math.round((t.cantidad / maxTaskCount) * 100), 5);
                    return `<div class="d-flex align-items-center gap-2 mb-2">
                        <span style="width:140px;font-size:0.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${t.nombre}">${t.nombre}</span>
                        <div class="gp-bar-sm" style="width:${barPct}%;background:linear-gradient(90deg,#fd7e14,#ffc107);">${t.cantidad}</div>
                        <span style="font-size:0.75rem;color:#666;min-width:80px;">$${formatMoney(t.total_generado)}</span>
                    </div>`;
                }).join('')}
            </div>
            <div class="col-md-4">
                <div class="text-center p-3" style="background:#fff8f0;border-radius:12px;">
                    <div style="font-size:2rem;font-weight:800;color:#fd7e14;">${tareasComunes.reduce((s,t) => s + t.cantidad, 0)}</div>
                    <div style="font-size:0.82rem;color:#666;font-weight:600;">Total servicios realizados</div>
                    <div class="mt-2" style="font-size:1.3rem;font-weight:800;color:#198754;">$${formatMoney(tareasComunes.reduce((s,t) => s + t.total_generado, 0))}</div>
                    <div style="font-size:0.82rem;color:#666;font-weight:600;">Generado por top tareas</div>
                </div>
            </div>
        </div>
    </div></div>` : ''}

    <!-- ========== ENTRADAS DETALLADAS ========== -->
    <div class="row g-4 mb-4">
        <div class="col-md-6">
            <div class="card shadow-sm" style="border:2px solid #000;"><div class="card-body">
                <div class="gp-section-title"><i class="fas fa-arrow-down" style="color:#198754;"></i> ENTRADAS DE DINERO</div>
                <div class="mb-2 d-flex justify-content-between" style="font-size:0.85rem;"><span>Pagos Recibidos (tabla Pagos):</span><strong class="text-success">$${formatMoney(data.entradas.total_abonos)}</strong></div>
                <div class="mb-2 d-flex justify-content-between" style="font-size:0.85rem;"><span>Total entradas:</span><strong class="text-success" style="font-size:1rem;">$${formatMoney(data.entradas.total_entradas || 0)}</strong></div>
                <div class="mb-2 d-flex justify-content-between" style="font-size:0.85rem;"><span>Valor total órdenes (OT):</span><strong>$${formatMoney(data.entradas.total_ordenes_valor)}</strong></div>
                <hr class="my-2">
                <div class="mb-2 d-flex justify-content-between" style="font-size:0.85rem;"><span>Mano de obra (catálogo):</span><strong style="color:#ffc107;">$${formatMoney(moServicios)}</strong></div>
                <div class="mb-2 d-flex justify-content-between" style="font-size:0.85rem;"><span>Costos adicionales MO extra:</span><strong style="color:#ffc107;">$${formatMoney(data.entradas.desglose_costos?.mano_de_obra || 0)}</strong></div>
                <div class="mb-2 d-flex justify-content-between" style="font-size:0.85rem;"><span>Costos adicionales Repuestos:</span><strong class="text-muted">$${formatMoney(data.entradas.desglose_costos?.repuestos_materiales || 0)}</strong></div>
                <hr class="my-2">
                <div class="d-flex justify-content-between" style="font-size:0.85rem;"><strong>Total costos adicionales:</strong><strong>$${formatMoney(data.entradas.costos_adicionales)}</strong></div>
                <div class="d-flex justify-content-between mt-1" style="font-size:0.85rem;"><strong>Total ingresos con extras:</strong><strong class="text-success">$${formatMoney(data.entradas.total_ingresos_con_extras)}</strong></div>
                <hr class="my-2">
                <!-- Tabla detallada de abonos -->
                ${(data.abonos_detalle || []).length > 0 ? `
                <div class="table-responsive" style="max-height:250px;overflow-y:auto;">
                    <table class="table table-sm mb-0" style="font-size:0.66rem;">
                        <thead style="position:sticky;top:0;background:#fff;z-index:1;">
                            <tr><th>#OT</th><th>Patente</th><th>Marca</th><th>Modelo</th><th>Color</th><th>Monto</th><th>Método</th></tr>
                        </thead>
                        <tbody>${(data.abonos_detalle || []).map(a => `<tr>
                            <td><a href="#" onclick="verOTenLinea(${a.id}); return false;" style="color:#0d6efd;text-decoration:none;font-weight:700;" title="Ver orden en línea">${String(a.numero_orden || 0).padStart(6, '0')}</a>${Number(a.es_express || 0) === 1 ? ' ⚡' : ''}</td>
                            <td>${a.patente_placa || '-'}</td>
                            <td>${a.marca || '-'}</td>
                            <td>${a.modelo || '-'}</td>
                            <td>${colorSwatch(a.color)}</td>
                            <td><strong style="color:#198754;">$${formatMoney(a.monto_abono || 0)}</strong></td>
                            <td><span class="badge bg-secondary" style="font-size:0.58rem;">${a.metodo_pago || '-'}</span></td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>` : ''}
            </div></div>
        </div>
        <div class="col-md-6">
            <div class="card shadow-sm" style="border:2px solid #000;"><div class="card-body">
                <div class="gp-section-title"><i class="fas fa-arrow-up" style="color:#dc3545;"></i> SALIDAS DE DINERO</div>
                <div class="mb-2 d-flex justify-content-between" style="font-size:0.85rem;"><span>Comisiones automáticas:</span><strong class="text-danger">$${formatMoney(data.salidas.comisiones_tecnicos)}</strong></div>
                ${comisionDetalle.map(d => `
                    <div class="mb-1 ps-3">
                        <div class="d-flex justify-content-between">
                            <small><i class="fas fa-user me-1" style="color:#6f42c1;"></i>${d.tecnico} (${d.comision_porcentaje}%)</small>
                            <small class="text-danger"><strong>$${formatMoney(d.comision)}</strong></small>
                        </div>
                        <div class="d-flex justify-content-between">
                            <small class="text-muted ms-4">Base: $${formatMoney(d.base_comisionable)}</small>
                        </div>
                    </div>
                `).join('')}
                ${liqOrdPorTecnico.length > 0 ? `
                <hr class="my-2">
                <div class="mb-2 d-flex justify-content-between"><span>Liquidación de Órdenes en Conjunto:</span><strong style="color:#6f42c1;">$${formatMoney(liqOrdTotalComision + liqOrdTotalDomicilio)}</strong></div>
                ${liqOrdPorTecnico.map(d => `
                    <div class="mb-1 ps-3">
                        <div class="d-flex justify-content-between">
                            <small><i class="fas fa-file-invoice-dollar me-1" style="color:#6f42c1;"></i>${d.tecnico_nombre}</small>
                            <small style="color:#6f42c1;"><strong>$${formatMoney(Number(d.total_comision || 0))}</strong></small>
                        </div>
                        <div class="d-flex justify-content-between">
                            <small class="text-muted ms-4">Comisión: $${formatMoney(d.total_comision)} | ${d.total_ordenes} OT</small>
                        </div>
                    </div>
                `).join('')}
                ` : ''}
                <hr class="my-2">
                <div class="mb-2 d-flex justify-content-between"><span>Gastos operativos:</span><strong class="text-danger">$${formatMoney(data.salidas.gastos_operativos)}</strong></div>
                ${gastosPorCat.length > 0 ? gastosPorCat.map(c => `
                    <div class="d-flex justify-content-between mb-1 ps-3">
                        <small class="text-muted"><span class="badge bg-light text-dark me-1">${c.categoria}</span> (${c.cantidad})</small>
                        <small class="text-danger">$${formatMoney(c.total)}</small>
                    </div>
                `).join('') : ''}
                <hr class="my-2">
                <div class="d-flex justify-content-between"><strong>TOTAL SALIDAS:</strong><strong class="text-danger" style="font-size:1.1rem;">$${formatMoney(totalSalidas)}</strong></div>
            </div></div>
        </div>
    </div>

    <!-- ========== FÓRMULA BALANCE NETO ========== -->
    <div class="card shadow-sm mb-4"><div class="card-body" style="background:${balancePositivo ? '#f0fff4' : '#fff5f5'};">
        <div class="gp-section-title"><i class="fas fa-calculator" style="color:${balancePositivo ? '#198754' : '#dc3545'};"></i> Fórmula del Balance Neto</div>
        <div class="text-center" style="font-size:0.9rem;">
            <span style="color:#198754;font-weight:700;">Pagos Recibidos ($${formatMoney(data.entradas.total_entradas || 0)})</span>
            <span class="mx-2 font-weight-bold">−</span>
            <span style="color:#dc3545;font-weight:700;">Comis. Auto ($${formatMoney(data.salidas.comisiones_tecnicos)})</span>
            <span class="mx-2 font-weight-bold">−</span>
            <span style="color:#dc3545;font-weight:700;">Gastos ($${formatMoney(data.salidas.gastos_operativos)})</span>
            <span class="mx-2 font-weight-bold">−</span>
            <span style="color:#6f42c1;font-weight:700;">Liq.Órdenes ($${formatMoney(liqOrdTotalComision + liqOrdTotalDomicilio)})</span>
            <span class="mx-2 font-weight-bold">−</span>
            <span style="color:#fd7e14;font-weight:700;">Adelantos ($${formatMoney(totalAdelantos)})</span>
            <span class="mx-2 font-weight-bold">=</span>
            <span style="color:${balancePositivo ? '#198754' : '#dc3545'};font-weight:800;font-size:1.1rem;">$${formatMoney(data.balance_neto)}</span>
        </div>
    </div></div>

    <!-- Método de Pago + Gastos Detalle + Cuentas por Cobrar -->
    <div class="row g-4 mb-4">
        <div class="col-md-6">
            <div class="card shadow-sm" style="border:2px solid #000;"><div class="card-body">
                <div class="gp-section-title"><i class="fas fa-credit-card" style="color:#0d6efd;"></i> Pagos por Método</div>
                ${data.por_metodo_pago.length === 0 ? '<p class="text-muted">Sin datos</p>' : `
                <!-- Resumen rápido por método -->
                <div class="d-flex flex-wrap gap-2 mb-2">
                    ${data.por_metodo_pago.map(m => `
                        <span class="badge bg-secondary" style="font-size:0.72rem;">${m.metodo_pago}: $${formatMoney(m.total_abonos)} (${m.cantidad})</span>
                    `).join('')}
                </div>
                <!-- Tabla detallada de pagos -->
                <div class="table-responsive" style="max-height:280px;overflow-y:auto;">
                    <table class="table table-sm mb-0" style="font-size:0.68rem;">
                        <thead style="position:sticky;top:0;background:#fff;z-index:1;">
                            <tr><th>Método</th><th>#OT</th><th>Patente</th><th>Marca</th><th>Modelo</th><th>Color</th><th>Cant. Pagó</th><th>Comisión</th></tr>
                        </thead>
                        <tbody>${(data.pagos_detalle || []).map(p => {
                            const comisionPct = _calcularComisionOrden(p);
                            const comision = Math.round(Number(p.monto_abono || 0) * comisionPct / 100);
                            return `<tr>
                                <td><span class="badge bg-secondary" style="font-size:0.6rem;">${p.metodo_pago}</span></td>
                                <td><a href="#" onclick="verOTenLinea(${p.id}); return false;" style="color:#0d6efd;text-decoration:none;font-weight:700;" title="Ver orden en línea">${String(p.numero_orden || 0).padStart(6, '0')}</a>${Number(p.es_express || 0) === 1 ? ' ⚡' : ''}</td>
                                <td>${p.patente_placa || '-'}</td>
                                <td>${p.marca || '-'}</td>
                                <td>${p.modelo || '-'}</td>
                                <td>${colorSwatch(p.color)}</td>
                                <td><strong>$${formatMoney(p.monto_abono || 0)}</strong></td>
                                <td style="color:#dc3545;">$${formatMoney(comision)}</td>
                            </tr>`;
                        }).join('')}</tbody>
                    </table>
                </div>`}
            </div></div>
        </div>
        <div class="col-md-6">
            <div class="row g-4">
                <div class="col-12">
                    <div class="card shadow-sm" style="border:2px solid #000;"><div class="card-body">
                        <div class="gp-section-title"><i class="fas fa-receipt" style="color:#dc3545;"></i> Gastos Operativos</div>
                        ${gastosItems.length === 0 ? '<p class="text-muted" style="font-size:0.75rem;">Sin gastos en el periodo</p>' : `
                        <div class="table-responsive" style="max-height:140px;overflow-y:auto;">
                            <table class="table table-sm table-gp mb-0" style="font-size:0.68rem;">
                                <thead><tr><th>Concepto</th><th>Cat.</th><th>Monto</th></tr></thead>
                                <tbody>${gastosItems.map(g => `
                                    <tr>
                                        <td><small>${g.concepto}${g.observaciones ? '<br><span class="text-muted">' + g.observaciones + '</span>' : ''}</small></td>
                                        <td><span class="badge bg-light text-dark" style="font-size:0.6rem;">${g.categoria}</span></td>
                                        <td><strong class="text-danger">$${formatMoney(g.monto)}</strong></td>
                                    </tr>
                                `).join('')}</tbody>
                            </table>
                        </div>`}
                    </div></div>
                </div>
                <div class="col-12">
                    <div class="card shadow-sm" style="border:2px solid #000;"><div class="card-body">
                        <div class="gp-section-title"><i class="fas fa-clock" style="color:#6f42c1;"></i> Cuentas por Cobrar</div>
                        <div class="text-center p-2 bg-light rounded mb-2">
                            <div style="font-size:1.4rem;font-weight:800;color:#dc3545;">$${formatMoney(data.saldo_pendiente_cobrar)}</div>
                            <div class="text-muted" style="font-size:0.75rem;">${data.total_pendientes_cobrar} órdenes con saldo pendiente</div>
                        </div>
                    </div></div>
                </div>
            </div>
        </div>
    </div>

    <!-- ========== ADELANTOS A TÉCNICOS ========== -->
    ${totalAdelantos > 0 ? `
    <div class="card shadow-sm mb-4" style="border:2px solid #fd7e14;border-radius:12px;">
        <div class="card-header text-white" style="background:linear-gradient(135deg,#fd7e14,#ffc107);">
            <i class="fas fa-hand-holding-usd me-2"></i>Adelantos a Técnicos (Préstamos / Adelantos de Pago)
        </div>
        <div class="card-body">
            <div class="row g-2 mb-3">
                <div class="col-md-4"><div class="alert alert-warning py-2 mb-0 text-center"><strong>$${formatMoney(totalAdelantos)}</strong><br><small>Total Adelantos Pendientes</small></div></div>
                <div class="col-md-4"><div class="alert alert-info py-2 mb-0 text-center"><strong>${adelantosItems.length}</strong><br><small>Adelantos Registrados</small></div></div>
                <div class="col-md-4"><div class="alert alert-secondary py-2 mb-0 text-center"><strong>${adelantosPorTecnico.length}</strong><br><small>Técnicos con Adelantos</small></div></div>
            </div>
            ${adelantosPorTecnico.length > 0 ? `
            <h6 style="font-size:0.85rem;font-weight:700;margin-bottom:8px;"><i class="fas fa-user-tie me-1" style="color:#fd7e14;"></i>Desglose por Técnico</h6>
            <div class="table-responsive mb-3"><table class="table table-sm table-hover">
                <thead style="background:#fd7e14;color:#fff;"><tr><th>Técnico</th><th>Cantidad</th><th>Total Adelantos</th></tr></thead>
                <tbody>${adelantosPorTecnico.map(a => `<tr>
                    <td class="fw-bold">${a.tecnico_nombre || 'N/A'}</td>
                    <td>${a.cantidad}</td>
                    <td class="text-warning fw-bold">$${formatMoney(a.total_adelantos)}</td>
                </tr>`).join('')}</tbody>
            </table></div>` : ''}
            ${adelantosItems.length > 0 ? `
            <h6 style="font-size:0.85rem;font-weight:700;margin-bottom:8px;"><i class="fas fa-list me-1" style="color:#fd7e14;"></i>Detalle de Adelantos</h6>
            <div class="table-responsive" style="max-height:300px;overflow-y:auto;"><table class="table table-sm table-hover">
                <thead style="background:#343a40;color:#fff;"><tr><th>Fecha</th><th>Técnico</th><th>Concepto</th><th>Monto</th><th>Registrado por</th></tr></thead>
                <tbody>${adelantosItems.map(a => `<tr>
                    <td>${a.fecha_adelanto || '-'}</td>
                    <td class="fw-bold">${a.tecnico_nombre || 'N/A'}</td>
                    <td>
                        <span>${a.concepto || 'Adelanto'}</span>
                        ${a.notas ? `<br><small class="text-muted" style="font-size:0.7rem;"><i class="fas fa-sticky-note me-1 text-warning"></i>${a.notas}</small>` : ''}
                    </td>
                    <td class="text-warning fw-bold">$${formatMoney(a.monto)}</td>
                    <td>${a.registrado_por || '-'}</td>
                </tr>`).join('')}</tbody>
            </table></div>` : ''}
            <div class="text-center mt-2"><small class="text-muted"><i class="fas fa-info-circle me-1"></i>Los adelantos se descuentan del pago al técnico en la liquidación. Ya están incluidos en el Balance Neto como salida.</small></div>
        </div>
    </div>` : ''}

    <!-- Historial Diario -->
    <div class="card shadow-sm mb-4">
        <div class="card-header"><i class="fas fa-calendar-day me-2"></i>Historial Diario</div>
        <div class="card-body">${historialHtml}</div>
    </div>`;

    document.getElementById('flujo-contenido').innerHTML = html;
}

// ============================================
// GASTOS OPERATIVOS
// ============================================

async function registrarGasto() {
    const concepto = document.getElementById('gasto-concepto').value.trim();
    const categoria = document.getElementById('gasto-categoria').value;
    const monto = parseFloat(document.getElementById('gasto-monto').value);
    const fecha = document.getElementById('gasto-fecha').value;
    const obs = document.getElementById('gasto-obs').value.trim();

    if (!concepto || !monto || !fecha) {
        mostrarNotificacion('warning', 'Advertencia', 'Complete concepto, monto y fecha');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/gastos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ concepto, categoria, monto, fecha_gasto: fecha, observaciones: obs })
        });

        const data = await response.json();
        if (data.success) {
            mostrarNotificacion('success', 'Gasto Registrado', `$${formatMoney(monto)} - ${concepto}`);
            document.getElementById('gasto-concepto').value = '';
            document.getElementById('gasto-monto').value = '';
            document.getElementById('gasto-obs').value = '';
            cargarGastos();
        } else {
            mostrarNotificacion('error', 'Error', data.error);
        }
    } catch (error) {
        console.error('Error al registrar gasto:', error);
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

async function cargarGastos() {
    try {
        const categoria = document.getElementById('filtro-gasto-categoria').value;
        const desde = document.getElementById('filtro-gasto-desde').value;

        let url = `${API_BASE}/admin/gastos?`;
        if (categoria) url += `categoria=${encodeURIComponent(categoria)}&`;
        if (desde) url += `desde=${desde}-01&`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            renderizarGastos(data.gastos, data.resumen_por_categoria, data.total_general);
        }
    } catch (error) {
        console.error('Error al cargar gastos:', error);
    }
}

function renderizarGastos(gastos, resumenCategoria, total) {
    document.getElementById('total-gastos-badge').textContent = '$' + formatMoney(total);

    let html = '';
    if (gastos.length === 0) {
        html = '<div class="text-center text-muted py-4"><p>No hay gastos registrados</p></div>';
    } else {
        html = '<div class="table-responsive"><table class="table table-sm table-gp"><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Monto</th><th></th></tr></thead><tbody>';
        gastos.forEach(g => {
            html += `<tr>
                <td>${g.fecha_gasto}</td>
                <td><strong>${g.concepto}</strong>${g.observaciones ? `<br><small class="text-muted">${g.observaciones}</small>` : ''}</td>
                <td><span class="badge bg-light text-dark">${g.categoria}</span></td>
                <td class="fw-bold text-danger">$${formatMoney(g.monto)}</td>
                <td><button class="btn btn-sm btn-outline-danger" onclick="eliminarGasto(${g.id})"><i class="fas fa-trash"></i></button></td>
            </tr>`;
        });
        html += '</tbody></table></div>';

        // Resumen por categoría
        if (resumenCategoria && resumenCategoria.length > 0) {
            html += '<hr><h6 class="fw-bold"><i class="fas fa-chart-pie me-2"></i>Resumen por Categoría</h6>';
            html += '<div class="row g-2">';
            resumenCategoria.forEach(c => {
                html += `<div class="col-md-4"><div class="d-flex justify-content-between p-2 bg-light rounded">
                    <span>${c.categoria}</span><strong>$${formatMoney(c.total)}</strong>
                </div></div>`;
            });
            html += '</div>';
        }
    }

    document.getElementById('gastos-lista').innerHTML = html;
}

async function eliminarGasto(gastoId) {
    if (!confirm('¿Eliminar este gasto?')) return;
    try {
        const response = await fetch(`${API_BASE}/admin/gastos?id=${gastoId}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion('success', 'Gasto Eliminado', '');
            cargarGastos();
        }
    } catch (error) {
        console.error('Error al eliminar gasto:', error);
    }
}

// ============================================
// CARTERA DE CLIENTES
// ============================================

async function cargarCarteraClientes() {
    const filtro = document.getElementById('clientes-filtro').value;

    try {
        mostrarLoading(true);
        let whereExtra = '';
        if (filtro === 'pendientes') {
            whereExtra = '&estado=Aprobada'; // Solo aprobadas con saldo
        }

        const response = await fetch(`${API_BASE}/admin/todas-ordenes?limite=500${whereExtra}`);
        const data = await response.json();

        if (data.success) {
            renderizarCarteraClientes(data.ordenes, filtro);
        }
    } catch (error) {
        console.error('Error al cargar cartera:', error);
        mostrarNotificacion('error', 'Error', 'Error al cargar cartera de clientes');
    } finally {
        mostrarLoading(false);
    }
}

function renderizarCarteraClientes(ordenes, filtro) {
    // Agrupar por cliente (nombre + apellido)
    const clientesMap = {};

    ordenes.forEach(o => {
        const nombre = o.cliente_nombre || 'Sin nombre';
        const apellido = o.cliente_apellido || '';
        const clave = `${nombre} ${apellido}`.trim();
        if (!clientesMap[clave]) {
            clientesMap[clave] = {
                nombre,
                apellido,
                telefono: o.cliente_telefono || '',
                rut: o.cliente_rut || '',
                total_ordenes: 0,
                total_generado: 0,
                total_abonos: 0,
                total_restante: 0,
                ordenes: [],
                fuentes: new Set() // track data sources: 'admin', 'express', 'chat_ia'
            };
        }
        const cliente = clientesMap[clave];
        cliente.total_ordenes++;
        cliente.total_generado += Number(o.monto_total || 0);
        cliente.total_abonos += Number(o.monto_abono || 0);
        cliente.total_restante += Number(o.monto_restante || 0);
        cliente.ordenes.push(o);
        // Track data source
        if (o.es_express === 1 || o.es_express === '1') cliente.fuentes.add('express');
        if (o.origen === 'chat_ia') cliente.fuentes.add('chat_ia');
        if (!o.es_express && o.origen !== 'chat_ia') cliente.fuentes.add('admin');
    });

    let clientes = Object.values(clientesMap);

    if (filtro === 'pendientes') {
        clientes = clientes.filter(c => c.total_restante > 0);
        clientes.sort((a, b) => b.total_restante - a.total_restante);
    } else if (filtro === 'pagados') {
        clientes = clientes.filter(c => c.total_restante <= 0);
        clientes.sort((a, b) => b.total_generado - a.total_generado);
    } else {
        clientes.sort((a, b) => b.total_generado - a.total_generado);
    }

    const totalPendiente = clientes.reduce((sum, c) => sum + c.total_restante, 0);
    const totalGenerado = clientes.reduce((sum, c) => sum + c.total_generado, 0);

    let html = `
    <div class="row g-3 mb-4">
        <div class="col-md-4"><div class="kpi-card kpi-primary"><div class="kpi-value">${clientes.length}</div><div class="kpi-label">Clientes</div></div></div>
        <div class="col-md-4"><div class="kpi-card kpi-success"><div class="kpi-value">$${formatMoney(totalGenerado)}</div><div class="kpi-label">Total Facturado</div></div></div>
        <div class="col-md-4"><div class="kpi-card kpi-danger"><div class="kpi-value">$${formatMoney(totalPendiente)}</div><div class="kpi-label">Saldo Pendiente</div></div></div>
    </div>
    <div class="table-responsive"><table class="table table-gp">
        <thead><tr><th>Cliente</th><th>Teléfono</th><th>Patentes</th><th>Vehículos</th><th>Colores</th><th>Visitas</th><th>Total Generado</th><th>Abonos</th><th>Saldo Pendiente</th><th>Acciones</th></tr></thead>
        <tbody>`;

    clientes.forEach((c, idx) => {
        // Obtener patentes, marcas, modelos y colores únicos del cliente
        const patentesSet = new Set();
        const marcasSet = new Set();
        const modelosSet = new Set();
        const coloresSet = new Set();
        c.ordenes.forEach(o => {
            if (o.patente_placa) patentesSet.add(o.patente_placa);
            if (o.marca) marcasSet.add(o.marca);
            if (o.modelo) modelosSet.add(o.modelo);
            if (o.color) coloresSet.add(o.color);
        });
        const patentesUnicas = [...patentesSet];
        const marcasUnicas = [...marcasSet];
        const modelosUnicos = [...modelosSet];
        const coloresUnicos = [...coloresSet];
        const patentesData = encodeURIComponent(JSON.stringify(patentesUnicas));
        const nombreCompleto = `${c.nombre}${c.apellido ? ' ' + c.apellido : ''}`;
        const clientId = `cliente-${idx}`;

        // Fuentes badges: mostrar de dónde vienen los datos
        const fuentesArr = [...(c.fuentes || [])];
        const fuentesHtml = fuentesArr.length > 0
            ? fuentesArr.map(f => {
                if (f === 'chat_ia') return '<span class="badge bg-success" style="font-size:0.6rem;" title="Bot IA">🤖 IA</span>';
                if (f === 'express') return '<span class="badge bg-warning text-dark" style="font-size:0.6rem;" title="Orden Express">⚡ Express</span>';
                return '<span class="badge bg-primary" style="font-size:0.6rem;" title="Admin">📋 Admin</span>';
              }).join(' ')
            : '';

        // Color badge: mostrar como badge con color de fondo si existe
        const colorHtml = coloresUnicos.length > 0
            ? coloresUnicos.map(col => {
                // Intentar crear un badge con color de fondo representativo
                const bgColor = col.toLowerCase();
                const isLight = ['blanco','white','amarillo','yellow','plata','silver','gris','gray','beige','crema','arena'].some(l => bgColor.includes(l));
                return `<span class="badge" style="background:${col};color:${isLight ? '#333' : '#fff'};font-size:0.75rem;border:1px solid #ccc;min-width:20px;min-height:16px;display:inline-block;text-align:center;line-height:16px;">&nbsp;</span> <small>${col}</small>`;
              }).join(' ')
            : '<span class="text-muted">-</span>';

        html += `<tr>
            <td><strong>${nombreCompleto}</strong>${c.rut ? `<br><small class="text-muted">${c.rut}</small>` : ''}<br>${fuentesHtml}</td>
            <td>${c.telefono || 'N/A'}</td>
            <td>${patentesUnicas.length > 0 ? patentesUnicas.join(', ') : 'N/A'}</td>
            <td style="font-size:0.78rem">${marcasUnicas.map((m, i) => m + ' ' + (modelosUnicos[i] || '')).filter(Boolean).join(', ') || 'N/A'}</td>
            <td>${colorHtml}</td>
            <td><a href="#" onclick="verInformeCliente(${idx}); return false;" style="text-decoration:none;" title="Ver informe detallado de ${c.total_ordenes} orden(es)"><span class="badge bg-primary" style="cursor:pointer;font-size:0.82rem;">${c.total_ordenes} OT</span></a></td>
            <td>$${formatMoney(c.total_generado)}</td>
            <td>$${formatMoney(c.total_abonos)}</td>
            <td><strong class="${c.total_restante > 0 ? 'text-danger' : 'text-success'}">$${formatMoney(c.total_restante)}</strong></td>
            <td>
                <div class="d-flex gap-1 flex-wrap">
                    <button class="btn btn-sm btn-outline-info" onclick="verInformeCliente(${idx})" title="Ver informe detallado"><i class="fas fa-file-alt me-1"></i>Informe</button>
                    ${patentesUnicas.length > 0 && c.telefono ? `<button class="btn btn-sm btn-outline-success" onclick="registrarRecordatoriosCliente('${nombreCompleto.replace(/'/g, "\\'")}', '${c.telefono}', '${patentesData}')" title="Recordatorio"><i class="fas fa-bell me-1"></i></button>` : ''}
                </div>
            </td>
        </tr>
        <tr id="${clientId}-detalle" style="display:none;">
            <td colspan="10" style="padding:0;">
                <div id="${clientId}-contenido" style="padding:12px;background:#f8f9fa;border-radius:8px;"></div>
            </td>
        </tr>`;
    });

    html += '</tbody></table></div>';

    // Guardar datos de clientes para informe detallado
    window._clientesCartera = clientes;

    document.getElementById('clientes-contenido').innerHTML = html;
}

// ============================================
// INFORME DETALLADO DE CLIENTE
// Muestra todas las visitas, órdenes, pagos,
// abonos y fechas de atención del cliente
// ============================================

function verInformeCliente(idx) {
    const clientes = window._clientesCartera || [];
    if (!clientes[idx]) return;

    const c = clientes[idx];
    const nombreCompleto = `${c.nombre}${c.apellido ? ' ' + c.apellido : ''}`;
    const rowId = `cliente-${idx}-detalle`;
    const contId = `cliente-${idx}-contenido`;
    const row = document.getElementById(rowId);
    const cont = document.getElementById(contId);

    if (!row || !cont) return;

    // Toggle visibility
    if (row.style.display !== 'none') {
        row.style.display = 'none';
        return;
    }

    // Ordenar órdenes por fecha (más reciente primero)
    const ordenesSorted = [...c.ordenes].sort((a, b) => {
        const fa = a.fecha_creacion ? new Date(a.fecha_creacion).getTime() : 0;
        const fb = b.fecha_creacion ? new Date(b.fecha_creacion).getTime() : 0;
        return fb - fa;
    });

    // Vehículos únicos
    const vehiculos = {};
    ordenesSorted.forEach(o => {
        const key = `${o.marca || ''} ${o.modelo || ''} (${o.patente_placa || 'S/P'})`;
        if (!vehiculos[key]) vehiculos[key] = { count: 0, total: 0 };
        vehiculos[key].count++;
        vehiculos[key].total += Number(o.monto_total || 0);
    });

    let html = `
    <div class="row g-3 mb-3">
        <div class="col-md-3">
            <div style="background:linear-gradient(135deg,#6f42c1,#9b6fe0);color:#fff;border-radius:10px;padding:14px;">
                <div style="font-size:0.75rem;opacity:0.8;">Cliente</div>
                <div style="font-size:1.1rem;font-weight:700;">${nombreCompleto}</div>
                ${c.rut ? `<div style="font-size:0.8rem;opacity:0.9;">RUT: ${c.rut}</div>` : ''}
                ${c.telefono ? `<div style="font-size:0.8rem;opacity:0.9;"><i class="fas fa-phone me-1"></i>${c.telefono}</div>` : ''}
            </div>
        </div>
        <div class="col-md-2">
            <div style="background:#fff;border-radius:10px;padding:12px;text-align:center;border:1px solid #e0e0e0;">
                <div style="font-size:1.5rem;font-weight:800;color:#6f42c1;">${c.total_ordenes}</div>
                <div style="font-size:0.72rem;color:#888;">Visitas</div>
            </div>
        </div>
        <div class="col-md-2">
            <div style="background:#fff;border-radius:10px;padding:12px;text-align:center;border:1px solid #e0e0e0;">
                <div style="font-size:1.1rem;font-weight:700;color:#28a745;">$${formatMoney(c.total_generado)}</div>
                <div style="font-size:0.72rem;color:#888;">Total Generado</div>
            </div>
        </div>
        <div class="col-md-2">
            <div style="background:#fff;border-radius:10px;padding:12px;text-align:center;border:1px solid #e0e0e0;">
                <div style="font-size:1.1rem;font-weight:700;color:#0d6efd;">$${formatMoney(c.total_abonos)}</div>
                <div style="font-size:0.72rem;color:#888;">Abonos</div>
            </div>
        </div>
        <div class="col-md-3">
            <div style="background:#fff;border-radius:10px;padding:12px;text-align:center;border:1px solid #e0e0e0;">
                <div style="font-size:1.1rem;font-weight:700;color:${c.total_restante > 0 ? '#dc3545' : '#28a745'};">$${formatMoney(c.total_restante)}</div>
                <div style="font-size:0.72rem;color:#888;">Saldo ${c.total_restante > 0 ? 'Pendiente' : 'Al Día'}</div>
            </div>
        </div>
    </div>`;

    // Vehículos del cliente
    const vehiculosArr = Object.entries(vehiculos);
    if (vehiculosArr.length > 0) {
        html += `<div class="mb-3" style="font-size:0.82rem;"><strong><i class="fas fa-car me-1" style="color:#6f42c1;"></i>Vehículos:</strong> `;
        vehiculosArr.forEach(([key, val], i) => {
            html += `<span class="badge bg-light text-dark border me-1" style="font-size:0.75rem;">${key} — ${val.count} OT ($${formatMoney(val.total)})</span>`;
        });
        html += `</div>`;
    }

    // Tabla de todas las visitas
    html += `
    <div style="font-size:0.82rem;font-weight:700;color:#6f42c1;margin-bottom:6px;"><i class="fas fa-history me-1"></i>Historial de Visitas (${ordenesSorted.length})</div>
    <div class="table-responsive" style="max-height:350px;overflow-y:auto;">
        <table class="table table-sm table-hover mb-0" style="font-size:0.75rem;">
            <thead style="position:sticky;top:0;background:#fff;z-index:1;">
                <tr>
                    <th>#OT</th>
                    <th>Fecha Atención</th>
                    <th>Vehículo</th>
                    <th>Patente</th>
                    <th>Servicios</th>
                    <th>Total</th>
                    <th>Abono</th>
                    <th>Saldo</th>
                    <th>Método Pago</th>
                    <th>Estado</th>
                    <th>Acción</th>
                </tr>
            </thead>
            <tbody>`;

    ordenesSorted.forEach(o => {
        const fecha = o.fecha_creacion ? new Date(o.fecha_creacion).toLocaleDateString('es-CL', { day:'2-digit', month:'short', year:'numeric' }) : 'N/A';
        const hora = o.fecha_creacion ? new Date(o.fecha_creacion).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' }) : '';
        const total = Number(o.monto_total || 0);
        const abono = Number(o.monto_abono || 0);
        const restante = Number(o.monto_restante || 0);

        // Servicios
        let servicios = '';
        try {
            const srvs = typeof o.servicios_seleccionados === 'string' ? JSON.parse(o.servicios_seleccionados) : (o.servicios_seleccionados || []);
            if (Array.isArray(srvs)) {
                servicios = srvs.map(s => s.descripcion || s.nombre || s.name || '').filter(Boolean).slice(0, 3).join(', ');
                if (srvs.length > 3) servicios += ` +${srvs.length - 3}`;
            }
        } catch(e) { servicios = ''; }

        const esExpress = o.es_express || o.tipo_orden === 'Express';
        const esChatIA = o.origen === 'chat_ia';
        let tipoBadge = '';
        if (esChatIA) tipoBadge = ' <span class="badge bg-success" style="font-size:0.6rem;">🤖 Bot IA</span>';
        else if (esExpress) tipoBadge = ' <span class="badge bg-warning text-dark" style="font-size:0.6rem;">Express</span>';

        html += `<tr>
            <td><a href="#" onclick="verOTenLinea(${o.id}); return false;" style="color:#0d6efd;text-decoration:none;font-weight:700;" title="Ver orden en línea">${String(o.numero_orden || 0).padStart(6, '0')}</a>${tipoBadge}</td>
            <td>${fecha}<br><small class="text-muted">${hora}</small></td>
            <td>${o.marca || '-'} ${o.modelo || '-'}</td>
            <td>${o.patente_placa || '-'}</td>
            <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${servicios}">${servicios || '-'}</td>
            <td>$${formatMoney(total)}</td>
            <td style="color:#0d6efd;">$${formatMoney(abono)}</td>
            <td style="color:${restante > 0 ? '#dc3545' : '#28a745'};">$${formatMoney(restante)}</td>
            <td>${o.metodo_pago || '-'}</td>
            <td>${obtenerBadgeEstado(o.estado, o.estado_trabajo)}</td>
            <td>
                <div class="d-flex gap-1 justify-content-center">
                    ${o.estado_trabajo === 'Cerrada' ? `<button class="btn btn-sm btn-outline-success" onclick="abrirOrdenDesdeLista(${o.id}, ${o.numero_orden || 0})" title="Abrir" style="padding:2px 6px;"><i class="fas fa-lock-open"></i></button>` : `<button class="btn btn-sm btn-outline-danger" onclick="cerrarOrdenDesdeLista(${o.id}, ${o.numero_orden || 0})" title="Cerrar" style="padding:2px 6px;"><i class="fas fa-lock"></i></button>`}
                    <button class="btn btn-sm btn-outline-primary" onclick="verOrden(${o.id})" title="Ver OT" style="padding:2px 6px;"><i class="fas fa-eye"></i></button>
                </div>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;

    cont.innerHTML = html;
    row.style.display = '';
}

// ============================================
// RECORDATORIOS DE REVISIÓN - Cartera de Clientes
// Registra TODAS las patentes del cliente en el
// sistema de recordatorios (sgc-recordatorios worker)
// ============================================

const RECORDATORIO_API = 'https://sgc-recordatorios.correo36000.workers.dev';

async function registrarRecordatoriosCliente(nombreCliente, telefono, patentesEncoded) {
    const patentes = JSON.parse(decodeURIComponent(patentesEncoded));
    if (!patentes || patentes.length === 0) {
        mostrarNotificacion('warning', 'Sin patentes', 'No hay patentes para registrar');
        return;
    }

    const telefonoLimpio = telefono.replace(/[^0-9]/g, '');
    if (telefonoLimpio.length < 8) {
        mostrarNotificacion('error', 'Error', 'Teléfono inválido');
        return;
    }

    if (!confirm(`🔔 Registrar ${patentes.length} vehículo(s) de ${nombreCliente} en el sistema de recordatorios de revisión?\n\nPatentes: ${patentes.join(', ')}\nTeléfono: ${telefonoLimpio}`)) {
        return;
    }

    mostrarLoading(true);
    let registrados = 0;
    let yaExistentes = 0;
    let errores = 0;
    let detalles = [];

    // Registrar cada patente una por una
    for (const patente of patentes) {
        try {
            const response = await fetch(`${RECORDATORIO_API}/api/save-lead`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patente: patente.toUpperCase().replace(/\s+/g, ''),
                    telefono: telefonoLimpio
                })
            });
            const data = await response.json();

            if (data.ya_registrado) {
                yaExistentes++;
                detalles.push(`${patente}: ya registrada`);
            } else if (data.success) {
                registrados++;
                detalles.push(`${patente}: registrada`);
            } else {
                errores++;
                detalles.push(`${patente}: ${data.error || 'error'}`);
            }
        } catch (e) {
            errores++;
            detalles.push(`${patente}: error de conexión`);
        }
    }

    mostrarLoading(false);

    // Mostrar resumen
    let resumen = `Cliente: ${nombreCliente}\n`;
    if (registrados > 0) resumen += `✅ Nuevas: ${registrados}\n`;
    if (yaExistentes > 0) resumen += `ℹ️ Ya existían: ${yaExistentes}\n`;
    if (errores > 0) resumen += `❌ Errores: ${errores}\n`;
    resumen += `\n${detalles.join('\n')}`;

    if (errores > 0) {
        mostrarNotificacion('warning', 'Recordatorios parciales', resumen);
    } else {
        mostrarNotificacion('success', 'Recordatorios OK', `${registrados} nueva(s), ${yaExistentes} ya existente(s)`);
    }
}

// ============================================
// INICIALIZACIÓN: Cargar gastos cuando se abre la tab
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Establecer fecha de hoy para gasto
    const hoy = getChileDate();
    const gastoFecha = document.getElementById('gasto-fecha');
    if (gastoFecha) gastoFecha.value = hoy;

    // Listener para tabs de gestión
    const tabGastos = document.querySelector('a[href="#tab-gastos"]');
    if (tabGastos) {
        tabGastos.addEventListener('shown.bs.tab', function() {
            cargarGastos();
        });
    }

    // Auto-migración: crear tablas si no existen
    fetch('/api/admin/migrar').then(r => r.json()).then(data => {
        if (data.success) {
            // Migración aplicada exitosamente
        }
    }).catch(err => {
        // Migración ya aplicada o no disponible
    });
});

// ============================================
// AUTOCOMPLETAR MARCA
// ============================================

async function autocompletarMarca(query) {
    const dropdown = document.getElementById('marca-dropdown');
    if (!query || query.length < 3) {
        dropdown.style.display = 'none';
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/admin/modelos-vehiculo?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        if (data.modelos && data.modelos.length > 0) {
            dropdown.innerHTML = data.modelos.map(m =>
                `<div class="p-2 dropdown-item" style="cursor:pointer;" onmousedown="document.getElementById('marca').value='${m.nombre}';document.getElementById('marca-dropdown').style.display='none';">${m.nombre} <small class="text-muted">(${m.total} órdenes)</small></div>`
            ).join('');
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    } catch (e) {
        console.error('Error al buscar modelos:', e);
        dropdown.style.display = 'none';
    }
}

// ============================================
// AUTOCOMPLETE MODELO DE VEHÍCULO
// ============================================

async function autocompletarModelo(query) {
    const dropdown = document.getElementById('modelo-dropdown');
    if (!query || query.length < 1) {
        dropdown.style.display = 'none';
        return;
    }
    try {
        // Buscar modelos que coincidan con el texto escrito
        const response = await fetch(`${API_BASE}/admin/modelos-vehiculo?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        const modelos = (data.modelos || []).filter(m => m.nombre.toLowerCase().includes(query.toLowerCase()));
        if (modelos.length > 0) {
            dropdown.innerHTML = modelos.map(m =>
                `<div class="p-2 dropdown-item" style="cursor:pointer;" onmousedown="document.getElementById('modelo').value='${m.nombre}';document.getElementById('modelo-dropdown').style.display='none';">${m.nombre} <small class="text-muted">(${m.total || 0} órdenes)</small></div>`
            ).join('');
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    } catch (e) {
        console.error('Error al buscar modelos:', e);
        dropdown.style.display = 'none';
    }
}

async function toggleModeloDropdown() {
    const dropdown = document.getElementById('modelo-dropdown');
    if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
        return;
    }
    // Cargar TODOS los modelos (sin filtro)
    try {
        const response = await fetch(`${API_BASE}/admin/modelos-vehiculo`);
        const data = await response.json();
        const modelos = data.modelos || [];
        if (modelos.length > 0) {
            dropdown.innerHTML = modelos.map(m =>
                `<div class="p-2 dropdown-item" style="cursor:pointer;" onmousedown="document.getElementById('modelo').value='${m.nombre}';document.getElementById('modelo-dropdown').style.display='none';">${m.nombre} <small class="text-muted">(${m.total || 0} órdenes)</small></div>`
            ).join('');
            dropdown.style.display = 'block';
        } else {
            dropdown.innerHTML = '<div class="p-2 text-muted small">No hay modelos. Use <strong>ADD</strong> para crear uno.</div>';
            dropdown.style.display = 'block';
        }
    } catch (e) {
        console.error('Error al cargar modelos:', e);
    }
}

function abrirModalAgregarModelo() {
    // Cerrar dropdown si está abierto
    document.getElementById('modelo-dropdown').style.display = 'none';
    const modal = new bootstrap.Modal(document.getElementById('modalAgregarModelo'));
    modal.show();
    setTimeout(() => document.getElementById('nuevo-modelo-nombre').focus(), 300);
}

// ============================================
// AUTOCOMPLETE MARCA / MODELO - OT EXPRESS
// (Versión dedicada para el modal Express,
//  evita conflictos con los campos de la OT normal)
// ============================================

async function autocompletarMarcaExpress(query) {
    const dropdown = document.getElementById('express-marca-dropdown');
    if (!dropdown) return;
    if (!query || query.length < 2) {
        dropdown.style.display = 'none';
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/admin/modelos-vehiculo?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        if (data.modelos && data.modelos.length > 0) {
            dropdown.innerHTML = data.modelos.map(m =>
                `<div class="p-2 dropdown-item" style="cursor:pointer;" onmousedown="document.getElementById('express-marca').value='${m.nombre}';document.getElementById('express-marca-dropdown').style.display='none';">${m.nombre} <small class="text-muted">(${m.total || 0} OT)</small></div>`
            ).join('');
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    } catch (e) {
        console.error('Error al buscar marcas (express):', e);
        dropdown.style.display = 'none';
    }
}

async function autocompletarModeloExpress(query) {
    const dropdown = document.getElementById('express-modelo-dropdown');
    if (!dropdown) return;
    if (!query || query.length < 1) {
        dropdown.style.display = 'none';
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/admin/modelos-vehiculo?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        const modelos = (data.modelos || []).filter(m => m.nombre.toLowerCase().includes(query.toLowerCase()));
        if (modelos.length > 0) {
            dropdown.innerHTML = modelos.map(m =>
                `<div class="p-2 dropdown-item" style="cursor:pointer;" onmousedown="document.getElementById('express-modelo').value='${m.nombre}';document.getElementById('express-modelo-dropdown').style.display='none';">${m.nombre} <small class="text-muted">(${m.total || 0} OT)</small></div>`
            ).join('');
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    } catch (e) {
        console.error('Error al buscar modelos (express):', e);
        dropdown.style.display = 'none';
    }
}

async function toggleModeloDropdownExpress() {
    const dropdown = document.getElementById('express-modelo-dropdown');
    if (!dropdown) return;
    if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/admin/modelos-vehiculo`);
        const data = await response.json();
        const modelos = data.modelos || [];
        if (modelos.length > 0) {
            dropdown.innerHTML = modelos.map(m =>
                `<div class="p-2 dropdown-item" style="cursor:pointer;" onmousedown="document.getElementById('express-modelo').value='${m.nombre}';document.getElementById('express-modelo-dropdown').style.display='none';">${m.nombre} <small class="text-muted">(${m.total || 0} OT)</small></div>`
            ).join('');
            dropdown.style.display = 'block';
        } else {
            dropdown.innerHTML = '<div class="p-2 text-muted small">No hay modelos registrados.</div>';
            dropdown.style.display = 'block';
        }
    } catch (e) {
        console.error('Error al cargar modelos (express):', e);
    }
}

async function guardarNuevoModelo() {
    const nombre = document.getElementById('nuevo-modelo-nombre').value.trim();
    if (!nombre) {
        mostrarNotificacion('warning', 'Datos', 'Ingrese un nombre para el modelo');
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/admin/modelos-vehiculo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre })
        });
        const data = await response.json();
        if (data.success || data.modelo) {
            mostrarNotificacion('success', 'Modelo Creado', `"${nombre}" agregado a la lista`);
            document.getElementById('modelo').value = nombre;
            document.getElementById('nuevo-modelo-nombre').value = '';
            bootstrap.Modal.getInstance(document.getElementById('modalAgregarModelo')).hide();
        } else {
            mostrarNotificacion('warning', 'Duplicado', data.error || 'El modelo ya existe');
        }
    } catch (error) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

// ============================================
// ELIMINAR ORDEN (desde modal / ordenActual)
// ============================================

async function eliminarOrden() {
    if (!ordenActual) {
        mostrarNotificacion('error', 'Error', 'No hay orden seleccionada');
        return;
    }
    const numero = String(ordenActual.numero_orden).padStart(6, '0');
    if (!confirm(`¿Está seguro de ELIMINAR la orden #${numero}?\n\nEsta acción NO se puede deshacer.`)) return;
    if (!confirm(`¡ATENCIÓN! Se eliminará permanentemente la orden #${numero}.\n\n¿Confirma la eliminación?`)) return;

    try {
        mostrarLoading(true);
        const response = await fetch(`${API_BASE}/admin/eliminar-orden`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orden_id: ordenActual.id })
        });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion('success', 'Orden Eliminada', data.message);
            try { var m = bootstrap.Modal.getInstance(document.getElementById('modalVerOrden')); if(m) m.hide(); } catch(e){}
            try { var m2 = bootstrap.Modal.getInstance(document.getElementById('modalOrdenCompleta')); if(m2) m2.hide(); } catch(e){}
            try { var m3 = bootstrap.Modal.getInstance(document.getElementById('modalEditarOrden')); if(m3) m3.hide(); } catch(e){}
            cargarTodasLasOrdenes(); // Refresh list
            ordenActual = null;
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'Error al eliminar');
        }
    } catch (error) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    } finally {
        mostrarLoading(false);
    }
}

// ============================================
// MODELOS DE VEHÍCULO
// ============================================

async function abrirModalModelos() {
    try {
        const response = await fetch(`${API_BASE}/admin/modelos-vehiculo`);
        const data = await response.json();
        let html = `<h5 class="mb-3"><i class="fas fa-car me-2"></i>Seleccionar Modelo</h5>`;
        html += '<p class="text-muted small mb-3">Haga clic en un modelo para filtrar las órdenes por esa marca/modelo.</p>';

        if (data.modelos && data.modelos.length > 0) {
            html += '<div class="list-group mb-3">';
            data.modelos.forEach(m => {
                html += `<div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" style="cursor:pointer;" onclick="filtrarOrdenesPorModelo('${m.nombre.replace(/'/g, "\\'")}')">
                    <div><i class="fas fa-car me-2 text-primary"></i><strong>${m.nombre}</strong></div>
                    <span class="badge bg-primary">${m.total} OT</span>
                </div>`;
            });
            html += '</div>';
        } else {
            html += '<p class="text-muted">No hay modelos registrados</p>';
        }

        html += '<hr class="my-3"><h6 class="fw-bold">Agregar Nuevo Modelo</h6>';
        html += '<div class="input-group mb-3"><input type="text" class="form-control" id="nuevo-modelo-nombre" placeholder="Nombre del modelo (ej: Corolla, Civic, Ranger)"><button class="btn btn-primary" onclick="agregarModelo()"><i class="fas fa-plus me-1"></i>Agregar</button></div>';

        document.getElementById('modal-contenido').innerHTML = html;
        document.getElementById('modal-numero-orden').textContent = 'MODELOS';
        const modal = new bootstrap.Modal(document.getElementById('modalVerOrden'));
        modal.show();
    } catch (error) {
        mostrarNotificacion('error', 'Error', 'Error al cargar modelos');
    }
}

async function filtrarOrdenesPorModelo(modeloNombre) {
    // Cerrar modal de modelos
    const modalVer = bootstrap.Modal.getInstance(document.getElementById('modalVerOrden'));
    if (modalVer) modalVer.hide();

    // Ir a la sección buscar si no estamos ahí
    document.getElementById('seccion-crear').style.display = 'none';
    document.getElementById('seccion-buscar').style.display = 'block';
    // Mostrar loading
    document.getElementById('resultados-busqueda').innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin fa-3x text-muted"></i><p class="text-muted mt-3">Filtrando órdenes de <strong>' + modeloNombre + '</strong>...</p></div>';

    try {
        mostrarLoading(true);
        const response = await fetch(`${API_BASE}/admin/todas-ordenes?limite=200`);
        const data = await response.json();
        if (data.ordenes) {
            // Filtrar las órdenes por marca o modelo que coincida
            const filtradas = data.ordenes.filter(o =>
                (o.marca && o.marca.toUpperCase() === modeloNombre.toUpperCase()) ||
                (o.modelo && o.modelo.toUpperCase() === modeloNombre.toUpperCase())
            );
            if (filtradas.length > 0) {
                ordenesFiltradas = filtradas;
                mostrarResultados(filtradas);
                mostrarNotificacion('success', 'Modelo: ' + modeloNombre, `${filtradas.length} órdenes encontradas`);
            } else {
                document.getElementById('resultados-busqueda').innerHTML = `
                    <div class="text-center py-5">
                        <i class="fas fa-car fa-3x mb-3 text-muted"></i>
                        <p class="text-muted">No se encontraron órdenes para <strong>${modeloNombre}</strong></p>
                        <button class="btn btn-outline-primary" onclick="cargarTodasLasOrdenes()"><i class="fas fa-list me-2"></i>Ver Todas las Órdenes</button>
                    </div>`;
            }
        }
    } catch (error) {
        mostrarNotificacion('error', 'Error', 'Error al filtrar órdenes');
    } finally {
        mostrarLoading(false);
    }
}

async function agregarModelo() {
    const nombre = document.getElementById('nuevo-modelo-nombre').value.trim();
    if (!nombre) { mostrarNotificacion('warning', 'Datos', 'Ingrese un nombre'); return; }
    try {
        const response = await fetch(`${API_BASE}/admin/modelos-vehiculo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre })
        });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion('success', 'Modelo Agregado', `${nombre} se agregó correctamente`);
            abrirModalModelos();
        } else {
            mostrarNotificacion('error', 'Error', data.error);
        }
    } catch (error) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

// ============================================
// CATÁLOGO DE SERVICIOS - FORMULARIO CREAR OT
// ============================================

function filtrarServiciosFormulario(q) {
    q = q.toLowerCase().trim();
    const items = document.querySelectorAll('#servicios-checks-container .servicio-check-item');
    items.forEach(item => {
        const label = item.querySelector('label');
        if (!label) return;
        const texto = label.textContent.toLowerCase();
        item.style.display = (!q || texto.includes(q)) ? '' : 'none';
    });
    // También filtrar en fallback
    const fallback = document.querySelectorAll('#servicios-checks-fallback .form-check');
    fallback.forEach(item => {
        const texto = item.textContent.toLowerCase();
        item.style.display = (!q || texto.includes(q)) ? '' : 'none';
    });
}

async function cargarServiciosParaFormulario() {
    try {
        // Cargar técnicos primero si no están en memoria
        if (tecnicosGlobal.length === 0) {
            try {
                const tecResp = await fetch(`${API_BASE}/admin/tecnicos`);
                const tecData = await tecResp.json();
                if (tecData.success && tecData.tecnicos) {
                    tecnicosGlobal = tecData.tecnicos.filter(t => t.activo);
                }
            } catch(e) {
                console.error('Error cargando técnicos para formulario:', e);
            }
        }

        const response = await fetch(`${API_BASE}/admin/servicios-catalogo?activos=1`);
        const data = await response.json();
        if (data.success && data.servicios && data.servicios.length > 0) {
            serviciosCatalogo = data.servicios;
            renderizarServiciosCheckboxes(data.servicios);
        } else {
            // Mostrar fallback
            document.getElementById('servicios-checks-container').innerHTML = '<p class="text-muted">No hay servicios en el catálogo. Use los checkboxes tradicionales.</p>';
            document.getElementById('servicios-checks-fallback').style.display = 'block';
        }
    } catch (error) {
        console.error('Error al cargar servicios:', error);
        document.getElementById('servicios-checks-container').innerHTML = '<p class="text-muted">Error al cargar catálogo. Use los checkboxes tradicionales.</p>';
        document.getElementById('servicios-checks-fallback').style.display = 'block';
    }
}

function renderizarServiciosCheckboxes(servicios) {
    const container = document.getElementById('servicios-checks-container');
    if (!container) return;

    // Preservar estados actuales de checkboxes y selectores antes de re-renderizar
    const estadosPrevios = {};
    container.querySelectorAll('input[type="checkbox"][id^="chk-serv-"]').forEach(chk => {
        const servId = chk.getAttribute('data-servicio-id');
        estadosPrevios[servId] = {
            checked: chk.checked,
            tecnico: '',
            descripcion: ''
        };
        const tecSel = document.getElementById(`tec-serv-${servId}`);
        if (tecSel) estadosPrevios[servId].tecnico = tecSel.value;
        const descIn = document.getElementById(`desc-serv-${servId}`);
        if (descIn) estadosPrevios[servId].descripcion = descIn.value;
    });

    // Agrupar por categoría
    const categorias = {};
    servicios.forEach(s => {
        if (!categorias[s.categoria]) categorias[s.categoria] = [];
        categorias[s.categoria].push(s);
    });

    const iconosCat = {
        'Mantenimiento': 'fa-oil-can',
        'Diagnóstico': 'fa-stethoscope',
        'Reparación': 'fa-wrench',
        'Otros': 'fa-ellipsis-h'
    };

    // Aplanar todos los servicios y dividir en 2 mitades iguales
    const allItems = [];
    const sortedCats = Object.keys(categorias).sort();
    sortedCats.forEach(cat => {
        const icono = iconosCat[cat] || 'fa-check';
        categorias[cat].forEach(s => allItems.push({ ...s, icono }));
    });
    const mid = Math.ceil(allItems.length / 2);
    const leftItems = allItems.slice(0, mid);
    const rightItems = allItems.slice(mid);

    let html = '<div class="row">';

    function renderItem(s) {
        const precio = Number(s.precio_sugerido || 0);
        const tipoLabel = s.tipo_comision === 'mano_obra'
            ? '<span class="badge bg-warning text-dark" style="font-size:0.65rem;">MO</span>'
            : '<span class="badge bg-secondary" style="font-size:0.65rem;">Rep</span>';
        const precioDisplay = precio > 0 ? `$${precio.toLocaleString('es-CL', {maximumFractionDigits: 0})}` : '$0';

        // Construir opciones de técnico, preservando selección previa si existe
        const prev = estadosPrevios[s.id];
        let tecOptions = '<option value="">Sin asignar</option>';
        tecnicosGlobal.forEach(t => {
            const selected = (prev && prev.tecnico && String(t.id) === String(prev.tecnico)) ? ' selected' : '';
            tecOptions += `<option value="${t.id}"${selected}>${t.nombre}</option>`;
        });

        const checkedAttr = (prev && prev.checked) ? ' checked' : '';
        const descValue = (prev && prev.descripcion) ? prev.descripcion.replace(/"/g, '&quot;') : '';
        const extraClass = (prev && prev.checked) ? '' : ' d-none';

        return `<div class="servicio-check-item" style="border-bottom:1px solid #e0e0e0;padding:4px 0;">
                    <div class="d-flex align-items-center py-0 px-1">
                        <input class="form-check-input me-1 m-0" type="checkbox" id="chk-serv-${s.id}"
                               data-servicio-id="${s.id}" data-tipo-comision="${s.tipo_comision}"
                               data-precio="${precio}" value="${s.nombre}" onchange="onServicioCheckChange(this)"${checkedAttr}
                               style="width:1.4em;height:1.4em;border:2px solid #000!important;accent-color:#000;flex-shrink:0;">
                        <label class="form-check-label m-0" for="chk-serv-${s.id}" style="cursor:pointer;font-size:1.02rem;">${s.nombre} ${tipoLabel} <span class="fw-bold text-muted ms-1" style="font-size:0.94rem;">${precioDisplay}</span></label>
                    </div>
                    <div class="ms-4 mt-1${extraClass}" id="serv-extra-${s.id}" style="padding-left:1.8em;">
                        <div class="d-flex align-items-center gap-1 flex-wrap">
                            <select class="form-select form-select-sm" id="tec-serv-${s.id}" style="width:auto;min-width:140px;font-size:0.78rem;" title="Técnico para ${s.nombre}">
                                ${tecOptions}
                            </select>
                            <input type="text" class="form-control form-control-sm" id="desc-serv-${s.id}" placeholder="Descripción / detalle" value="${descValue}" style="font-size:0.78rem;max-width:220px;" title="Descripción para ${s.nombre}">
                        </div>
                    </div>
                </div>`;
    }

    html += '<div class="col-md-6">' + leftItems.map(renderItem).join('') + '</div>';
    if (rightItems.length > 0) {
        html += '<div class="col-md-6">' + rightItems.map(renderItem).join('') + '</div>';
    }
    html += '</div>';

    container.innerHTML = html;
}

function onServicioCheckChange(checkbox) {
    // Mostrar/ocultar campos de técnico y descripción según estado del checkbox
    const servId = checkbox.getAttribute('data-servicio-id');
    const extraDiv = document.getElementById(`serv-extra-${servId}`);
    if (extraDiv) {
        extraDiv.classList.toggle('d-none', !checkbox.checked);
    }
    calcularRestante();
}

// ============================================
// CATÁLOGO DE SERVICIOS - MODAL ADMIN
// ============================================

async function abrirModalServiciosCatalogo() {
    document.getElementById('form-nuevo-servicio').style.display = 'none';
    const modal = new bootstrap.Modal(document.getElementById('modalServiciosCatalogo'));
    modal.show();
    await cargarServiciosCatalogo();
}

async function cargarServiciosCatalogo() {
    try {
        const q = document.getElementById('buscador-servicios-cat')?.value || '';
        const cat = document.getElementById('filtro-categoria-servicios')?.value || '';
        let url = `${API_BASE}/admin/servicios-catalogo?activos=0`;
        if (q) url += `&q=${encodeURIComponent(q)}`;
        // Category filter on client side
        const response = await fetch(url);
        const data = await response.json();
        if (data.success) {
            let servicios = data.servicios || [];
            if (cat) servicios = servicios.filter(s => s.categoria === cat);
            renderizarListaServiciosCatalogo(servicios);
            document.getElementById('total-servicios-badge').textContent = servicios.length + ' servicios';
        }
    } catch (error) {
        console.error('Error al cargar catálogo:', error);
    }
}

function renderizarListaServiciosCatalogo(servicios) {
    const lista = document.getElementById('lista-servicios-catalogo');
    if (!servicios || servicios.length === 0) {
        lista.innerHTML = '<div class="text-center text-muted py-4"><p>No hay servicios</p></div>';
        return;
    }

    let html = '<table class="table table-sm table-hover"><thead class="table-light"><tr><th>Servicio</th><th>Precio</th><th>Categoría</th><th>Comisión</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>';
    servicios.forEach(s => {
        const precio = Number(s.precio_sugerido || 0);
        const tipoLabel = s.tipo_comision === 'mano_obra'
            ? '<span class="badge bg-warning text-dark">Mano de Obra</span>'
            : '<span class="badge bg-secondary">Repuestos</span>';
        const estadoBadge = s.activo
            ? '<span class="badge bg-success">Activo</span>'
            : '<span class="badge bg-danger">Inactivo</span>';

        html += `<tr id="row-serv-${s.id}" class="${s.activo ? '' : 'table-secondary opacity-50'}">
            <td class="fw-bold">${s.nombre}</td>
            <td><input type="number" class="form-control form-control-sm" style="width:100px;" value="${precio}" min="0"
                       onchange="actualizarPrecioServicio(${s.id}, this.value)" id="precio-cat-${s.id}" ${!s.activo ? 'disabled' : ''}></td>
            <td><span class="badge bg-light text-dark">${s.categoria}</span></td>
            <td>${tipoLabel}</td>
            <td>${estadoBadge}</td>
            <td>
                ${s.activo ? `
                <button class="btn btn-sm btn-outline-primary me-1" onclick="cambiarTipoComision(${s.id}, '${s.tipo_comision}')" title="Cambiar tipo comisión">
                    <i class="fas fa-exchange-alt"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="desactivarServicio(${s.id})" title="Desactivar">
                    <i class="fas fa-trash"></i>
                </button>
                ` : `
                <button class="btn btn-sm btn-outline-success" onclick="reactivarServicio(${s.id})" title="Reactivar servicio">
                    <i class="fas fa-undo me-1"></i>Reactivar
                </button>
                `}
            </td>
        </tr>`;
    });
    html += '</tbody></table>';
    lista.innerHTML = html;
}

function mostrarFormularioNuevoServicio() {
    const form = document.getElementById('form-nuevo-servicio');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function guardarNuevoServicio() {
    const nombre = document.getElementById('nuevo-serv-nombre').value.trim();
    const precio = parseFloat(document.getElementById('nuevo-serv-precio').value) || 0;
    const categoria = document.getElementById('nuevo-serv-categoria').value;
    const tipoComision = document.getElementById('nuevo-serv-tipo-comision').value;

    if (!nombre) { mostrarNotificacion('warning', 'Datos', 'Ingrese nombre del servicio'); return; }

    try {
        const response = await fetch(`${API_BASE}/admin/servicios-catalogo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, precio_sugerido: precio, categoria, tipo_comision: tipoComision })
        });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion('success', 'Servicio Creado', `"${nombre}" agregado al catálogo`);
            document.getElementById('nuevo-serv-nombre').value = '';
            document.getElementById('nuevo-serv-precio').value = '';
            document.getElementById('form-nuevo-servicio').style.display = 'none';
            await cargarServiciosCatalogo();
            await cargarServiciosParaFormulario(); // Refresh form
        } else {
            mostrarNotificacion('error', 'Error', data.error);
        }
    } catch (error) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

async function actualizarPrecioServicio(id, precio) {
    try {
        const response = await fetch(`${API_BASE}/admin/servicios-catalogo`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, precio_sugerido: parseFloat(precio) || 0 })
        });
        if (response.ok) {
            mostrarNotificacion('success', 'Precio Actualizado', 'El precio se guardó correctamente');
            await cargarServiciosParaFormulario(); // Refresh form checkboxes
        }
    } catch (error) {
        mostrarNotificacion('error', 'Error', 'Error al actualizar');
    }
}

async function cambiarTipoComision(id, tipoActual) {
    const nuevoTipo = tipoActual === 'mano_obra' ? 'repuestos' : 'mano_obra';
    try {
        const response = await fetch(`${API_BASE}/admin/servicios-catalogo`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, tipo_comision: nuevoTipo })
        });
        if (response.ok) {
            mostrarNotificacion('success', 'Tipo Actualizado', `Ahora es: ${nuevoTipo === 'mano_obra' ? 'Mano de Obra' : 'Repuestos'}`);
            await cargarServiciosCatalogo();
            await cargarServiciosParaFormulario();
        }
    } catch (error) {
        mostrarNotificacion('error', 'Error', 'Error al actualizar');
    }
}

async function desactivarServicio(id) {
    if (!confirm('¿Desactivar este servicio?')) return;
    try {
        const response = await fetch(`${API_BASE}/admin/servicios-catalogo?id=${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion('success', 'Servicio Desactivado', 'El servicio fue desactivado');
            await cargarServiciosCatalogo();
            await cargarServiciosParaFormulario();
        }
    } catch (error) {
        mostrarNotificacion('error', 'Error', 'Error al desactivar');
    }
}

async function reactivarServicio(id) {
    if (!confirm('¿Reactivar este servicio?')) return;
    try {
        const response = await fetch(`${API_BASE}/admin/servicios-catalogo`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, activo: true })
        });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion('success', 'Servicio Reactivado', 'El servicio está activo nuevamente');
            await cargarServiciosCatalogo();
            await cargarServiciosParaFormulario();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo reactivar');
        }
    } catch (error) {
        mostrarNotificacion('error', 'Error', 'Error al reactivar');
    }
}

function filtrarServiciosCat(q) {
    cargarServiciosCatalogo();
}

// ============================================
// COMISIÓN POR TÉCNICO - MODAL ADMIN
// ============================================

async function abrirModalComisionTecnicos() {
    const modal = new bootstrap.Modal(document.getElementById('modalComisionTecnicos'));
    modal.show();
    await cargarComisionesTecnicos();
}

async function cargarComisionesTecnicos() {
    try {
        const response = await fetch(`${API_BASE}/admin/tecnicos`);
        const data = await response.json();
        if (!data.success) {
            document.getElementById('lista-comisiones-tecnicos').innerHTML = '<p class="text-danger">Error al cargar</p>';
            return;
        }

        const tecnicos = data.tecnicos || [];
        if (tecnicos.length === 0) {
            document.getElementById('lista-comisiones-tecnicos').innerHTML = '<p class="text-muted">No hay técnicos registrados</p>';
            return;
        }

        let html = '<table class="table table-hover"><thead class="table-warning"><tr><th>Técnico</th><th>Teléfono</th><th>Comisión %</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>';
        tecnicos.forEach(t => {
            const comision = Number(t.comision_porcentaje || 40);
            const estadoBadge = t.activo
                ? '<span class="badge bg-success">Activo</span>'
                : '<span class="badge bg-danger">Inactivo</span>';
            html += `<tr>
                <td class="fw-bold">${t.nombre}</td>
                <td><small>${t.telefono || ''}</small></td>
                <td>
                    <div class="input-group input-group-sm" style="width:120px;">
                        <input type="number" class="form-control text-center fw-bold" id="comision-tec-${t.id}"
                               value="${comision}" min="0" max="100" step="5">
                        <span class="input-group-text">%</span>
                    </div>
                </td>
                <td>${estadoBadge}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="guardarComisionTecnico(${t.id})">
                        <i class="fas fa-save"></i> Guardar
                    </button>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        html += '<div class="alert alert-info mt-3"><small><i class="fas fa-info-circle me-1"></i>La comisión se aplica sobre: <strong>(Precio Base + Costos Mano de Obra)</strong> × este porcentaje. Los costos de Repuestos NO generan comisión.</small></div>';

        document.getElementById('lista-comisiones-tecnicos').innerHTML = html;
    } catch (error) {
        console.error('Error al cargar comisiones:', error);
        document.getElementById('lista-comisiones-tecnicos').innerHTML = '<p class="text-danger">Error de conexión</p>';
    }
}

async function guardarComisionTecnico(tecnicoId) {
    const input = document.getElementById('comision-tec-' + tecnicoId);
    if (!input) return;
    const comision = parseFloat(input.value);
    if (isNaN(comision) || comision < 0 || comision > 100) {
        mostrarNotificacion('warning', 'Valor inválido', 'La comisión debe ser entre 0% y 100%');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/tecnicos`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: tecnicoId, comision_porcentaje: comision })
        });
        const data = await response.json();
        if (data.success) {
            mostrarNotificacion('success', 'Comisión Actualizada', `${data.tecnico?.nombre}: ${comision}%`);
        } else {
            mostrarNotificacion('error', 'Error', data.error);
        }
    } catch (error) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

// ============================================
// COSTOS EXTRA DESDE FORMULARIO CREAR OT (MODAL)
// ============================================

function abrirModalCostoExtraForm() {
    // Limpiar campos del modal
    document.getElementById('costo-extra-concepto').value = '';
    document.getElementById('costo-extra-monto').value = '';
    document.getElementById('costo-extra-categoria').value = 'Mano de Obra';
    const modal = new bootstrap.Modal(document.getElementById('modalCostoExtraForm'));
    modal.show();
    setTimeout(() => document.getElementById('costo-extra-concepto').focus(), 300);
}

function confirmarCostoExtraDesdeModal() {
    const concepto = document.getElementById('costo-extra-concepto').value.trim();
    const monto = parseFloat(document.getElementById('costo-extra-monto').value);
    const categoria = document.getElementById('costo-extra-categoria').value;

    if (!concepto) {
        mostrarNotificacion('warning', 'Datos', 'Ingrese el concepto del costo');
        return;
    }
    if (isNaN(monto) || monto <= 0) {
        mostrarNotificacion('warning', 'Monto inválido', 'Ingrese un monto mayor a 0');
        return;
    }

    costosExtraTemporales.push({
        concepto,
        monto,
        categoria,
        id: Date.now()
    });
    renderizarCostosExtraForm();
    calcularMontoTotalFormCrear();
    bootstrap.Modal.getInstance(document.getElementById('modalCostoExtraForm')).hide();
    mostrarNotificacion('success', 'Costo Agregado', `${concepto}: $${monto.toLocaleString('es-CL')} (${categoria})`);
}

function eliminarCostoExtraTemporal(id) {
    costosExtraTemporales = costosExtraTemporales.filter(c => c.id !== id);
    renderizarCostosExtraForm();
    calcularMontoTotalFormCrear();
}

function renderizarCostosExtraForm() {
    const container = document.getElementById('costos-extra-lista-form');
    if (!container) return;
    if (costosExtraTemporales.length === 0) {
        container.innerHTML = '';
        return;
    }
    let html = '<div class="list-group mt-2">';
    costosExtraTemporales.forEach(c => {
        const catLabel = c.categoria === 'Mano de Obra'
            ? '<span class="badge bg-warning text-dark" style="font-size:0.6rem;">MO</span>'
            : '<span class="badge bg-secondary" style="font-size:0.6rem;">Rep</span>';
        html += `<div class="list-group-item list-group-item-light d-flex justify-content-between align-items-center py-1">
            <div>${catLabel} ${c.concepto}</div>
            <div class="d-flex align-items-center gap-2">
                <strong class="text-danger">$${Number(c.monto).toLocaleString('es-CL')}</strong>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarCostoExtraTemporal(${c.id})"><i class="fas fa-times"></i></button>
            </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

// ============================================
// LIQUIDACIÓN TÉCNICOS - MOSTRAR COMISIÓN
// ============================================

const _origBuscarLiquidacion = buscarLiquidacionTecnico;
if (typeof buscarLiquidacionTecnico === 'function') {
    buscarLiquidacionTecnico = async function() {
        await _origBuscarLiquidacion();
        // Mostrar comisión del técnico seleccionado
        const tecnicoId = document.getElementById('liquidar-tecnico-id')?.value;
        if (!tecnicoId) return;
        try {
            const response = await fetch(`${API_BASE}/admin/tecnicos`);
            const data = await response.json();
            if (data.success) {
                const tecnico = data.tecnicos.find(t => String(t.id) === tecnicoId);
                if (tecnico) {
                    const comision = Number(tecnico.comision_porcentaje || 40);
                    const btn = document.querySelector('#tab-liquidar .btn-primary');
                    if (btn) {
                        btn.innerHTML = `<i class="fas fa-search me-2"></i>Buscar (${comision}%)`;
                    }
                }
            }
        } catch (e) {}
    };
}

// ============================================
// GOOGLE SHEETS EXPORT
// ============================================

function getSheetsConfig() {
    return {
        url: localStorage.getItem('gp_sheets_url') || '',
        hoja: localStorage.getItem('gp_sheets_hoja') || 'Hoja 1'
    };
}

function abrirModalConfigSheets() {
    const config = getSheetsConfig();
    document.getElementById('google-sheets-url').value = config.url;
    document.getElementById('google-sheets-hoja').value = config.hoja;
    const modal = new bootstrap.Modal(document.getElementById('modalConfigSheets'));
    modal.show();
}

function guardarConfigSheets() {
    const url = document.getElementById('google-sheets-url').value.trim();
    const hoja = document.getElementById('google-sheets-hoja').value.trim() || 'Hoja 1';
    localStorage.setItem('gp_sheets_url', url);
    localStorage.setItem('gp_sheets_hoja', hoja);
    bootstrap.Modal.getInstance(document.getElementById('modalConfigSheets')).hide();
    mostrarNotificacion('success', 'Configuración Guardada', url ? 'Google Sheets conectado' : 'URL vacía - los botones no funcionarán');
}

function abrirModalInstruccionesScript() {
    bootstrap.Modal.getInstance(document.getElementById('modalConfigSheets')).hide();
    setTimeout(() => {
        const modal = new bootstrap.Modal(document.getElementById('modalInstruccionesScript'));
        modal.show();
    }, 300);
}

function copiarScript() {
    const code = document.getElementById('codigo-script-apps').textContent;
    navigator.clipboard.writeText(code).then(() => {
        mostrarNotificacion('success', 'Copiado', 'Script copiado al portapapeles');
    });
}

async function enviarASheets(data) {
    const config = getSheetsConfig();
    if (!config.url) {
        mostrarNotificacion('warning', 'No configurado', 'Primero configurá Google Sheets (icono 📂 en el menú)');
        abrirModalConfigSheets();
        return false;
    }
    try {
        mostrarLoading(true);
        const response = await fetch(config.url, {
            method: 'POST',
            mode: 'no-cors', // Google Apps Script CORS
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        // no-cors means we can't read response, so we assume success
        mostrarNotificacion('success', 'Exportado', `${data.rows?.length || 0} filas enviadas a Google Sheets`);
        return true;
    } catch (error) {
        mostrarNotificacion('error', 'Error', 'No se pudo exportar: ' + error.message);
        return false;
    } finally {
        mostrarLoading(false);
    }
}

// --- Exportar Órdenes ---
async function exportarOrdenesASheets() {
    const config = getSheetsConfig();
    const hoja = config.hoja;

    // Cargar todas las órdenes
    mostrarNotificacion('info', 'Exportando', 'Cargando órdenes...');
    try {
        const response = await fetch(`${API_BASE}/admin/todas-ordenes?limite=500`);
        const data = await response.json();
        const ordenes = data.ordenes || [];
        if (ordenes.length === 0) {
            mostrarNotificacion('warning', 'Sin datos', 'No hay órdenes para exportar');
            return;
        }

        const headers = ['N° Orden', 'Estado', 'Patente', 'Marca', 'Modelo', 'Color', 'Cliente', 'Teléfono', 'Fecha', 'Monto Total', 'Abono', 'Restante', 'Técnico', 'Servicios'];
        const rows = ordenes.map(o => {
            let servicios = '';
            try {
                const ss = JSON.parse(o.servicios_seleccionados || '[]');
                servicios = ss.map(s => s.nombre).join(', ');
            } catch(e) {}
            return [
                String(o.numero_orden || '').padStart(6, '0'),
                o.estado || '',
                o.patente_placa || '',
                o.marca || '',
                o.modelo || '',
                o.color || '',
                o.cliente_nombre || '',
                o.telefono || '',
                o.fecha_ingreso || '',
                Number(o.monto_total || 0),
                Number(o.monto_abono || 0),
                Number(o.monto_restante || 0),
                o.tecnico_nombre || '',
                servicios
            ];
        });

        await enviarASheets({ sheetName: hoja, headers, rows });
    } catch (error) {
        mostrarNotificacion('error', 'Error', 'Error al cargar órdenes');
    }
}

// --- Exportar Liquidación ---
async function exportarLiquidacionASheets() {
    const config = getSheetsConfig();
    const hoja = 'Liquidación';

    // Verificar que hay datos de liquidación cargados
    const container = document.getElementById('liquidacion-resultados');
    if (!container || container.querySelector('.text-muted')) {
        mostrarNotificacion('warning', 'Sin datos', 'Primero buscá una liquidación para exportar');
        return;
    }

    // Obtener datos del DOM con estado cancelado/pendiente
    const tabla = document.getElementById('tabla-liquidacion');
    if (!tabla) {
        mostrarNotificacion('warning', 'Sin datos', 'No hay tabla de liquidación');
        return;
    }

    const headers = ['N° Orden', 'Tipo', 'Marca', 'Modelo', 'Color', 'Nombre', 'Total OT', 'MO Serv.', 'Rep. Serv.', 'MO Extra', 'Rep. Extra', 'Base Comis.', 'Comisión', 'Cancelar', 'Acción', 'Estado Pago'];
    const rows = [];
    const filas = tabla.querySelectorAll('tbody tr');
    filas.forEach(fila => {
        const celdas = fila.querySelectorAll('td');
        if (celdas.length >= 4) {
            const celdasArr = Array.from(celdas).map(c => c.textContent.trim());
            const isCancelado = fila.classList.contains('row-cancelado');
            celdasArr.push(isCancelado ? 'CANCELADO' : 'PENDIENTE');
            rows.push(celdasArr);
        }
    });

    if (rows.length === 0) {
        mostrarNotificacion('warning', 'Sin datos', 'No se pudieron extraer datos');
        return;
    }

    await enviarASheets({ sheetName: hoja, headers, rows });
}

// --- Exportar Gastos ---
async function exportarGastosASheets() {
    const config = getSheetsConfig();
    const hoja = 'Gastos';

    mostrarNotificacion('info', 'Exportando', 'Cargando gastos...');
    try {
        const response = await fetch(`${API_BASE}/admin/gastos`);
        const data = await response.json();
        const gastos = data.gastos || [];
        if (gastos.length === 0) {
            mostrarNotificacion('warning', 'Sin datos', 'No hay gastos para exportar');
            return;
        }

        const headers = ['ID', 'Concepto', 'Categoría', 'Monto', 'Fecha', 'Observaciones', 'Registrado por'];
        const rows = gastos.map(g => [
            g.id || '',
            g.concepto || '',
            g.categoria || '',
            Number(g.monto || 0),
            g.fecha_gasto || '',
            g.observaciones || '',
            g.registrado_por || ''
        ]);

        await enviarASheets({ sheetName: hoja, headers, rows });
    } catch (error) {
        mostrarNotificacion('error', 'Error', 'Error al cargar gastos');
    }
}

// exportarDashboardASheets() eliminada - nunca llamada desde HTML

// ============================================
// REPORTE GENERAL (visualización + Google Sheets)
// ============================================

let datosReporteGlobal = null;
var _graficosReporte = [];

function destruirGraficosReporte() {
    for (var i = 0; i < _graficosReporte.length; i++) {
        try { _graficosReporte[i].destroy(); } catch(e) {}
    }
    _graficosReporte = [];
}

function actualizarInputReporte() {
    const periodo = document.getElementById('reporte-periodo').value;
    const label = document.getElementById('reporte-valor-label');
    const input = document.getElementById('reporte-valor');
    // Primero limpiar valor y cambiar tipo para evitar problemas de compatibilidad
    input.value = '';
    switch (periodo) {
        case 'dia':
            label.textContent = 'Fecha';
            input.type = 'date';
            input.placeholder = '';
            input.value = getChileDate();
            break;
        case 'semana':
            label.textContent = 'Semana (YYYY-W)';
            input.type = 'text';
            input.placeholder = 'Ej: 2026-15';
            const now = new Date();
            const oneJan = new Date(now.getFullYear(), 0, 1);
            const week = Math.ceil(((now - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
            input.value = now.getFullYear() + '-' + week;
            break;
        case 'anio':
            label.textContent = 'Año';
            input.type = 'number';
            input.min = '2020';
            input.max = '2030';
            input.placeholder = '';
            input.value = new Date().getFullYear();
            break;
        default:
            label.textContent = 'Mes';
            // Usar type="text" con formato YYYY-MM para máxima compatibilidad
            input.type = 'text';
            input.placeholder = 'Ej: 2026-05';
            input.value = getChileMonth();
    }
}

async function generarReporteGeneral() {
    const periodo = document.getElementById('reporte-periodo').value;
    let valor = document.getElementById('reporte-valor').value.trim();
    // Fallback: si el valor está vacío para mes, usar el mes actual
    if (!valor && periodo === 'mes') {
        valor = getChileMonth();
        document.getElementById('reporte-valor').value = valor;
    }
    if (!valor) { mostrarNotificacion('warning', 'Datos', 'Seleccioná un valor para el periodo'); return; }
    // Validar formato del mes (YYYY-MM)
    if (periodo === 'mes' && !/^\d{4}-\d{2}$/.test(valor)) {
        mostrarNotificacion('warning', 'Formato', 'Usá formato YYYY-MM (ej: 2026-05)');
        return;
    }

    const container = document.getElementById('reporte-contenido');
    container.innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin fa-3x" style="color:#0d6efd;"></i><p class="mt-3">Consultando base de datos...</p></div>';

    try {
        const response = await fetch(`${API_BASE}/admin/exportar-datos?periodo=${periodo}&valor=${encodeURIComponent(valor)}`);
        const data = await response.json();
        if (!data.success) { mostrarNotificacion('error', 'Error', data.error); return; }

        datosReporteGlobal = data;
        document.getElementById('btn-reporte-sheets').disabled = false;
        renderizarReporteGeneral(data);
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Error: ${error.message}</div>`;
    }
}

function renderizarReporteGeneral(data) {
    const r = data.resumen || {};
    let html = '';

    // === KPIs: FLUJO DE CAJA REAL ===
    const totalEntradasKPI = Number(r.total_abonos || 0) + Number(r.total_pagos_registrados || 0);
    html += `<div class="row g-3 mb-4">`;
    html += kpiCard('Órdenes Activas', (r.ordenes_activas || r.total_ordenes), 'fa-clipboard-list', 'primary');
    if (Number(r.canceladas || 0) > 0) {
        html += kpiCard('Canceladas', r.canceladas, 'fa-ban', 'danger');
    }
    html += kpiCard('Entradas', '$' + formatMoney(totalEntradasKPI), 'fa-money-bill-wave', 'success');
    html += kpiCard('Salidas', '$' + formatMoney(r.total_salidas), 'fa-arrow-circle-down', 'danger');
    html += kpiCard('Balance Neto', '$' + formatMoney(r.balance_neto), 'fa-balance-scale', (r.balance_neto >= 0 ? 'success' : 'danger'));
    html += kpiCard('Comisiones Técnicos', '$' + formatMoney(r.comisiones_tecnicos), 'fa-user-tie', 'warning');
    html += kpiCard('Adelantos Técnicos', '$' + formatMoney(r.total_adelantos || 0), 'fa-hand-holding-usd', (Number(r.total_adelantos || 0) > 0 ? 'warning' : 'secondary'));
    html += kpiCard('Gastos Negocio', '$' + formatMoney(r.total_gastos_negocio), 'fa-receipt', 'danger');
    html += kpiCard('Clientes Únicos', r.total_clientes_unicos, 'fa-users', 'info');
    html += `</div>`;

    // === FLUJO DE CAJA (Balance General reorganizado) ===
    html += `<div class="card mb-4" style="border:2px solid #198754;border-radius:12px;overflow:hidden;">`;
    html += `<div class="card-header text-white text-center" style="background:linear-gradient(135deg,#198754,#20c997);font-weight:700;font-size:1.1rem;"><i class="fas fa-cash-register me-2"></i>Flujo de Caja — Balance General</div>`;
    html += `<div class="card-body">`;
    // === ENTRADAS ===
    html += `<div class="row g-2 mb-3">`;
    html += `<div class="col-12"><h6 class="text-success fw-bold mb-2"><i class="fas fa-arrow-up me-1"></i>ENTRADAS (Dinero Recibido)</h6></div>`;
    html += `<div class="col-md-3"><div class="alert alert-success py-2 mb-1 text-center"><strong>$${formatMoney(r.total_pagos_registrados || r.total_abonos)}</strong><br><small>Pagos Recibidos</small></div></div>`;
    html += `<div class="col-md-3"><div class="alert alert-success py-2 mb-1 text-center" style="border:2px solid #198754;"><strong>$${formatMoney(totalEntradasKPI)}</strong><br><small><b>TOTAL ENTRADAS</b></small></div></div>`;
    html += `<div class="col-md-3"><div class="alert alert-info py-2 mb-1 text-center"><strong>$${formatMoney(r.total_monto_ordenes)}</strong><br><small>Valor Total OT (referencia)</small></div></div>`;
    html += `</div>`;
    // === SALIDAS ===
    html += `<div class="row g-2 mb-3">`;
    html += `<div class="col-12"><h6 class="text-danger fw-bold mb-2"><i class="fas fa-arrow-down me-1"></i>SALIDAS (Dinero Pagado)</h6></div>`;
    html += `<div class="col-md-2"><div class="alert alert-danger py-2 mb-1 text-center"><strong>$${formatMoney(r.comisiones_tecnicos)}</strong><br><small>Comisiones Técnicos</small></div></div>`;
    html += `<div class="col-md-2"><div class="alert alert-warning py-2 mb-1 text-center"><strong>$${formatMoney(r.total_adelantos || 0)}</strong><br><small>Adelantos Técnicos</small></div></div>`;
    html += `<div class="col-md-2"><div class="alert alert-danger py-2 mb-1 text-center"><strong>$${formatMoney(r.total_gastos_negocio)}</strong><br><small>Gastos Negocio</small></div></div>`;
    html += `<div class="col-md-2"><div class="alert alert-danger py-2 mb-1 text-center"><strong>$${formatMoney(r.liquidacion_comision || 0)}</strong><br><small>Liq. Comisiones</small></div></div>`;
    html += `<div class="col-md-2"><div class="alert alert-danger py-2 mb-1 text-center"><strong>$${formatMoney(r.liquidacion_domicilio || 0)}</strong><br><small>Liq. Domicilio</small></div></div>`;
    html += `</div>`;
    html += `<div class="row g-2 mb-3"><div class="col-md-3 offset-md-9"><div class="alert alert-danger py-2 mb-1 text-center" style="border:2px solid #dc3545;"><strong>$${formatMoney(r.total_salidas)}</strong><br><small><b>TOTAL SALIDAS</b></small></div></div></div>`;
    // === BALANCE NETO ===
    html += `<div class="row g-2">`;
    html += `<div class="col-12">`;
    const bn = Number(r.balance_neto || 0);
    html += `<div class="alert ${bn >= 0 ? 'alert-success' : 'alert-danger'} py-3 text-center" style="font-size:1.2rem;">`;
    html += `<strong>${bn >= 0 ? '<i class="fas fa-check-circle me-2"></i>' : '<i class="fas fa-exclamation-triangle me-2"></i>'}BALANCE NETO: $${formatMoney(r.balance_neto)}</strong>`;
    html += `<br><small>Pagos Recibidos ($${formatMoney(totalEntradasKPI)}) - Salidas ($${formatMoney(r.total_salidas)})</small>`;
    html += `</div></div></div>`;
    // === Saldo Pendiente por Cobrar ===
    html += `<div class="row g-2 mb-2"><div class="col-md-3"><div class="alert alert-warning py-2 mb-1 text-center"><strong>$${formatMoney(r.total_restantes)}</strong><br><small>Saldo Pendiente por Cobrar</small></div></div>`;
    html += `<div class="col-md-3"><div class="alert alert-danger py-2 mb-1 text-center"><strong>$${formatMoney(r.total_impago)}</strong><br><small>Impagos (saldo no pagado)</small></div></div>`;
    html += `<div class="col-md-3"><div class="alert alert-success py-2 mb-1 text-center"><strong>$${formatMoney(r.total_pagado)}</strong><br><small>OTs Pagadas</small></div></div>`;
    html += `<div class="col-md-3"><div class="alert alert-info py-2 mb-1 text-center"><strong>$${formatMoney(r.promedio_orden)}</strong><br><small>Promedio por OT</small></div></div></div>`;
    // Fórmula
    html += `<div class="text-center"><small class="text-muted">Fórmula: Balance Neto = Pagos Recibidos (tabla Pagos) - Comisiones - Gastos - Liq.Comisión - Liq.Domicilio - Adelantos</small></div>`;
    html += `</div></div>`;

    // === GRAFICOS ===
    html += `<div class="row g-3 mb-4">`;
    html += `<div class="col-md-4"><div class="card h-100"><div class="card-header bg-dark text-white text-center"><i class="fas fa-chart-pie me-2"></i>Estados de OT</div><div class="card-body d-flex align-items-center justify-content-center"><canvas id="chart-estados" style="max-height:250px;"></canvas></div></div></div>`;
    html += `<div class="col-md-4"><div class="card h-100"><div class="card-header text-white text-center" style="background:linear-gradient(135deg,#198754,#20c997);"><i class="fas fa-chart-bar me-2"></i>Flujo de Caja</div><div class="card-body d-flex align-items-center justify-content-center"><canvas id="chart-flujo" style="max-height:250px;"></canvas></div></div></div>`;
    if (data.tecnicos && data.tecnicos.length > 0) {
        html += `<div class="col-md-4"><div class="card h-100"><div class="card-header bg-primary text-white text-center"><i class="fas fa-users me-2"></i>Rendimiento por Técnico</div><div class="card-body d-flex align-items-center justify-content-center"><canvas id="chart-tecnicos" style="max-height:250px;"></canvas></div></div></div>`;
    }
    html += `</div>`;

    // === ESTADO DE ÓRDENES (actualizado con TODOS los estados reales) ===
    html += `<div class="card mb-4"><div class="card-header bg-dark text-white"><i class="fas fa-tasks me-2"></i>Estado de Órdenes</div><div class="card-body">`;
    // Sub-título: Estado de la Orden
    html += `<h6 class="text-muted fw-bold mb-2" style="font-size:0.85rem;"><i class="fas fa-tag me-1"></i>Estado de la Orden</h6>`;
    html += `<div class="row g-2 mb-3">`;
    const estadosOrden = [
        ['Enviadas', r.enviadas, 'warning'],
        ['Aprobadas', r.aprobadas, 'success'],
        ['Pend. Asignación', r.pendientes_asignacion || 0, 'info'],
        ['Canceladas', r.canceladas, 'danger']
    ];
    estadosOrden.forEach(([label, val, color]) => {
        html += `<div class="col-md-3 col-6"><div class="alert alert-${color} py-2 mb-0 text-center"><strong>${val || 0}</strong><br><small>${label}</small></div></div>`;
    });
    html += `</div>`;
    // Sub-título: Estado del Trabajo
    html += `<h6 class="text-muted fw-bold mb-2" style="font-size:0.85rem;"><i class="fas fa-wrench me-1"></i>Estado del Trabajo</h6>`;
    html += `<div class="row g-2">`;
    const estadosTrabajo = [
        ['Pendientes', r.pendientes || 0, 'secondary'],
        ['Pend. Visita', r.pendientes_visita, 'info'],
        ['En Sitio', r.en_sitio, 'primary'],
        ['En Progreso', r.en_progreso, 'warning'],
        ['Pend. Piezas', r.pendientes_piezas || 0, 'secondary'],
        ['Completadas', r.completadas, 'success'],
        ['No Completadas', r.no_completadas || 0, 'danger'],
        ['Cerradas', r.cerradas, 'dark']
    ];
    estadosTrabajo.forEach(([label, val, color]) => {
        html += `<div class="col-md-3 col-6"><div class="alert alert-${color} py-2 mb-0 text-center"><strong>${val || 0}</strong><br><small>${label}</small></div></div>`;
    });
    html += `</div></div></div>`;

    // === RESUMEN DE PAGOS (corregido) ===
    html += `<div class="card mb-4"><div class="card-header bg-success text-white"><i class="fas fa-money-bill-wave me-2"></i>Resumen de Pagos</div><div class="card-body"><div class="row g-2">`;
    html += `<div class="col-md-2"><div class="alert alert-info py-2 mb-0 text-center"><strong>$${formatMoney(r.total_monto_ordenes)}</strong><br><small>Valor Total OT</small></div></div>`;
    html += `<div class="col-md-2"><div class="alert alert-success py-2 mb-0 text-center"><strong>$${formatMoney(r.total_abonos)}</strong><br><small>Abonos en OT</small></div></div>`;
    html += `<div class="col-md-2"><div class="alert alert-success py-2 mb-0 text-center"><strong>$${formatMoney(r.total_pagos_registrados || 0)}</strong><br><small>Pagos Registrados</small></div></div>`;
    html += `<div class="col-md-2"><div class="alert alert-success py-2 mb-0 text-center" style="border:2px solid #198754;"><strong>$${formatMoney(totalEntradas)}</strong><br><small><b>Total Recibido</b></small></div></div>`;
    html += `<div class="col-md-2"><div class="alert alert-warning py-2 mb-0 text-center"><strong>$${formatMoney(r.total_restantes)}</strong><br><small>Saldo Pendiente</small></div></div>`;
    html += `<div class="col-md-2"><div class="alert alert-danger py-2 mb-0 text-center"><strong>$${formatMoney(r.total_impago)}</strong><br><small>Impagos</small></div></div>`;
    html += `</div></div></div>`;

    // === COMISIONES POR TÉCNICO (con marca/modelo + adelantos) ===
    if (r.comision_detalle && r.comision_detalle.length > 0) {
        html += `<div class="card mb-4"><div class="card-header" style="background:linear-gradient(135deg,#6f42c1,#e83e8c);color:white;"><i class="fas fa-user-tie me-2"></i>Comisiones por Técnico</div><div class="card-body"><div class="table-responsive"><table class="table table-sm table-hover"><thead style="background:#6f42c1;color:white;"><tr><th>Técnico</th><th>Comisión %</th><th>Base Comisionable</th><th>Comisión</th><th>Adelantos</th><th>Neto a Pagar</th></tr></thead><tbody>`;
        r.comision_detalle.forEach(cd => {
            html += `<tr><td class="fw-bold">${cd.tecnico}</td><td>${cd.comision_porcentaje}%</td><td>$${formatMoney(cd.base_comisionable)}</td><td class="fw-bold text-danger">$${formatMoney(cd.comision)}</td><td class="text-warning fw-bold">$${formatMoney(cd.adelantos || 0)}</td><td class="fw-bold text-success">$${formatMoney(cd.neto_pagar || cd.comision)}</td></tr>`;
        });
        html += `<tr class="fw-bold table-light"><td>TOTAL</td><td></td><td>$${formatMoney(r.base_comisionable)}</td><td class="text-danger">$${formatMoney(r.comisiones_tecnicos)}</td><td class="text-warning">$${formatMoney(r.total_adelantos || 0)}</td><td class="text-success">$${formatMoney(r.comisiones_tecnicos - (r.total_adelantos || 0))}</td></tr>`;
        html += `</tbody></table></div></div></div>`;
    }

    // === ADELANTOS A TÉCNICOS (detalle) ===
    if (r.total_adelantos && Number(r.total_adelantos) > 0) {
        html += `<div class="card mb-4" style="border:2px solid #fd7e14;"><div class="card-header text-white" style="background:linear-gradient(135deg,#fd7e14,#ffc107);"><i class="fas fa-hand-holding-usd me-2"></i>Adelantos a Técnicos (Detalle)</div><div class="card-body">`;
        // Desglose por técnico
        if (r.adelantos_por_tecnico && r.adelantos_por_tecnico.length > 0) {
            html += `<div class="table-responsive mb-3"><table class="table table-sm table-hover"><thead style="background:#fd7e14;color:#fff;"><tr><th>Técnico</th><th>Cantidad</th><th>Total Adelantos</th></tr></thead><tbody>`;
            r.adelantos_por_tecnico.forEach(a => {
                html += `<tr><td class="fw-bold">${a.tecnico_nombre || 'N/A'}</td><td>${a.cantidad}</td><td class="text-warning fw-bold">$${formatMoney(a.total_adelantos)}</td></tr>`;
            });
            html += `</tbody></table></div>`;
        }
        // Detalle individual
        if (data.adelantos_detalle && data.adelantos_detalle.length > 0) {
            html += `<div class="table-responsive" style="max-height:300px;overflow-y:auto;"><table class="table table-sm table-hover"><thead class="table-dark"><tr><th>Fecha</th><th>Técnico</th><th>Concepto</th><th>Monto</th><th>Registrado por</th></tr></thead><tbody>`;
            data.adelantos_detalle.forEach(a => {
                html += `<tr><td>${a.fecha_adelanto || '-'}</td><td class="fw-bold">${a.tecnico_nombre || 'N/A'}</td><td>${a.concepto || 'Adelanto'}</td><td class="text-warning fw-bold">$${formatMoney(a.monto)}</td><td>${a.registrado_por || '-'}</td></tr>`;
            });
            html += `</tbody></table></div>`;
        }
        html += `<div class="text-center mt-2"><small class="text-muted"><i class="fas fa-info-circle me-1"></i>Los adelantos se descuentan del pago al técnico en la liquidación.</small></div></div></div>`;
    }

    // === GASTOS POR CATEGORÍA ===
    if (r.gastos_por_categoria && r.gastos_por_categoria.length > 0) {
        html += `<div class="card mb-4"><div class="card-header bg-danger text-white"><i class="fas fa-receipt me-2"></i>Gastos del Negocio por Categoría</div><div class="card-body"><div class="table-responsive"><table class="table table-sm table-hover"><thead class="table-danger"><tr><th>Categoría</th><th>Cantidad</th><th>Total</th></tr></thead><tbody>`;
        r.gastos_por_categoria.forEach(g => {
            html += `<tr><td><strong>${g.categoria}</strong></td><td>${g.cantidad}</td><td class="text-danger fw-bold">$${formatMoney(g.total)}</td></tr>`;
        });
        html += `</tbody><tfoot><tr class="fw-bold"><td>TOTAL</td><td></td><td class="text-danger">$${formatMoney(r.total_gastos_negocio)}</td></tr></tfoot></table></div></div></div>`;
    }

    // === COSTOS ADICIONALES DESGLOSE (con marca/modelo) ===
    html += `<div class="card mb-4"><div class="card-header bg-warning text-dark"><i class="fas fa-coins me-2"></i>Costos Adicionales (desglose)</div><div class="card-body"><div class="row g-2">`;
    html += `<div class="col-md-3"><div class="alert alert-warning py-2 mb-0 text-center"><strong>$${formatMoney(r.costos_mano_obra)}</strong><br><small>Mano de Obra</small></div></div>`;
    html += `<div class="col-md-3"><div class="alert alert-secondary py-2 mb-0 text-center"><strong>$${formatMoney(r.costos_repuestos)}</strong><br><small>Repuestos/Materiales</small></div></div>`;
    html += `<div class="col-md-3"><div class="alert alert-info py-2 mb-0 text-center"><strong>${r.total_items_costos || 0}</strong><br><small>Items totales</small></div></div>`;
    html += `<div class="col-md-3"><div class="alert alert-warning py-2 mb-0 text-center" style="border:2px solid #ffc107;"><strong>$${formatMoney(r.total_costos_extra)}</strong><br><small><b>Total Costos Extra</b></small></div></div>`;
    html += `</div></div></div>`;

    // === ÓRDENES DE TRABAJO ===
    if (data.ordenes && data.ordenes.length > 0) {
        html += `<div class="card mb-4"><div class="card-header bg-primary text-white"><i class="fas fa-clipboard-list me-2"></i>Órdenes de Trabajo (${data.ordenes.length})</div><div class="card-body"><div class="table-responsive" style="max-height:500px;overflow-y:auto"><table class="table table-sm table-hover table-bordered"><thead class="table-primary sticky-top"><tr>
            <th>N°</th><th>Patente</th><th>Marca</th><th>Modelo</th><th>Color</th><th>Nombre</th><th>Teléfono</th><th>Estado</th><th>Trabajo</th><th>Técnico</th><th>Monto</th><th>Abono</th><th>Restante</th><th>Costos Extra</th>
        </tr></thead><tbody>`;
        data.ordenes.forEach(o => {
            const estTrabajo = o.estado_trabajo || '';
            const badgeTrabajo = estTrabajo === 'Cerrada' ? 'dark' : estTrabajo === 'Completada' ? 'success' : estTrabajo === 'En Progreso' ? 'primary' : estTrabajo === 'En Sitio' ? 'info' : estTrabajo === 'Pendiente Piezas' ? 'secondary' : estTrabajo === 'No Completada' ? 'danger' : 'warning';
            html += `<tr>
                <td><a href="#" onclick="verOTenLinea(${o.id}); return false;" style="color:#0d6efd;text-decoration:none;font-weight:700;" title="Ver orden en línea">${String(o.numero_orden||'').padStart(6,'0')}</a></td>
                <td>${o.patente_placa||''}</td><td>${o.marca||''}</td><td>${o.modelo||''}</td><td>${colorSwatch(o.color)}</td><td>${o.cliente_nombre||''}</td><td>${o.cliente_telefono||''}</td>
                <td><span class="badge bg-${o.estado==='Aprobada'?'success':o.estado==='Cancelada'?'danger':'warning'}">${o.estado||''}</span></td>
                <td><span class="badge bg-${badgeTrabajo}">${estTrabajo}</span></td>
                <td>${o.tecnico_nombre||'Sin asignar'}</td>
                <td class="fw-bold">$${formatMoney(o.monto_total)}</td><td>$${formatMoney(o.monto_abono)}</td><td class="${Number(o.monto_restante)>0?'text-danger':''}">$${formatMoney(o.monto_restante)}</td>
                <td>$${formatMoney(o.total_costos_extra)}</td>
            </tr>`;
        });
        html += `</tbody></table></div></div></div>`;
    }

    // === TÉCNICOS (con marca/modelo de sus OT) ===
    if (data.tecnicos && data.tecnicos.length > 0) {
        html += `<div class="card mb-4"><div class="card-header" style="background:#343a40;color:white;"><i class="fas fa-wrench me-2"></i>Técnicos</div><div class="card-body"><div class="table-responsive"><table class="table table-sm table-hover"><thead class="table-dark"><tr><th>Técnico</th><th>Teléfono</th><th>Comisión %</th><th>OT Asignadas</th><th>OT Cerradas</th><th>Total Generado</th></tr></thead><tbody>`;
        data.tecnicos.forEach(t => {
            html += `<tr><td class="fw-bold">${t.nombre}</td><td>${t.telefono||''}</td><td>${t.comision_porcentaje||40}%</td><td>${t.total_ordenes}</td><td>${t.total_cerradas}</td><td class="fw-bold">$${formatMoney(t.total_generado)}</td></tr>`;
        });
        html += `</tbody></table></div></div></div>`;
    }

    // === COSTOS ADICIONALES (detalle con marca y modelo) ===
    if (data.costos_adicionales && data.costos_adicionales.length > 0) {
        html += `<div class="card mb-4"><div class="card-header bg-warning text-dark"><i class="fas fa-coins me-2"></i>Costos Adicionales Detalle (${data.costos_adicionales.length})</div><div class="card-body"><div class="table-responsive" style="max-height:400px;overflow-y:auto"><table class="table table-sm table-hover"><thead class="table-warning"><tr><th>OT</th><th>Patente</th><th>Marca</th><th>Modelo</th><th>Color</th><th>Concepto</th><th>Monto</th><th>Categoría</th></tr></thead><tbody>`;
        data.costos_adicionales.forEach(c => {
            html += `<tr><td><a href="#" onclick="verOTenLinea(${c.orden_id || c.id}); return false;" style="color:#0d6efd;text-decoration:none;font-weight:700;" title="Ver orden en línea">${String(c.numero_orden||'').padStart(6,'0')}</a></td><td>${c.patente_placa||''}</td><td>${c.marca||''}</td><td>${c.modelo||''}</td><td>${colorSwatch(c.color)}</td><td>${c.concepto}</td><td class="fw-bold">$${formatMoney(c.monto)}</td><td>${c.categoria}</td></tr>`;
        });
        html += `</tbody></table></div></div></div>`;
    }

    // === GASTOS DEL NEGOCIO (detalle) ===
    if (data.gastos_negocio && data.gastos_negocio.length > 0) {
        html += `<div class="card mb-4"><div class="card-header bg-danger text-white"><i class="fas fa-receipt me-2"></i>Gastos del Negocio Detalle (${data.gastos_negocio.length})</div><div class="card-body"><div class="table-responsive" style="max-height:400px;overflow-y:auto"><table class="table table-sm table-hover"><thead class="table-danger"><tr><th>Concepto</th><th>Categoría</th><th>Monto</th><th>Fecha</th><th>Observaciones</th></tr></thead><tbody>`;
        data.gastos_negocio.forEach(g => {
            html += `<tr><td>${g.concepto}</td><td><span class="badge bg-secondary">${g.categoria}</span></td><td class="fw-bold text-danger">$${formatMoney(g.monto)}</td><td>${g.fecha_gasto||''}</td><td><small>${g.observaciones||''}</small></td></tr>`;
        });
        html += `</tbody></table></div></div></div>`;
    }

    // === PAGOS (con marca y modelo) ===
    if (data.pagos && data.pagos.length > 0) {
        html += `<div class="card mb-4"><div class="card-header bg-success text-white"><i class="fas fa-money-check me-2"></i>Pagos Registrados (${data.pagos.length})</div><div class="card-body"><div class="table-responsive"><table class="table table-sm table-hover"><thead class="table-success"><tr><th>OT</th><th>Patente</th><th>Marca</th><th>Modelo</th><th>Color</th><th>Cliente</th><th>Monto</th><th>Método</th><th>Observaciones</th></tr></thead><tbody>`;
        data.pagos.forEach(p => {
            html += `<tr><td><a href="#" onclick="verOTenLinea(${p.orden_id || p.id}); return false;" style="color:#0d6efd;text-decoration:none;font-weight:700;" title="Ver orden en línea">${String(p.numero_orden||'').padStart(6,'0')}</a></td><td>${p.patente_placa||''}</td><td>${p.marca||''}</td><td>${p.modelo||''}</td><td>${colorSwatch(p.color)}</td><td>${p.cliente_nombre||''}</td><td class="fw-bold">$${formatMoney(p.monto)}</td><td>${p.metodo_pago||''}</td><td><small>${p.observaciones||''}</small></td></tr>`;
        });
        html += `</tbody></table></div></div></div>`;
    }

    // === CLIENTES (sin RUT/Email/Fecha/Trabajo, con Marca/Modelo) ===
    if (data.clientes && data.clientes.length > 0) {
        html += `<div class="card mb-4"><div class="card-header bg-info text-white"><i class="fas fa-users me-2"></i>Clientes del Periodo (${data.clientes.length})</div><div class="card-body"><div class="table-responsive"><table class="table table-sm table-hover"><thead class="table-info"><tr><th>Nombre</th><th>Teléfono</th><th>Patente</th><th>Marca</th><th>Modelo</th><th>Color</th></tr></thead><tbody>`;
        data.clientes.forEach(c => {
            html += `<tr><td class="fw-bold">${c.nombre||''}</td><td>${c.telefono||''}</td><td>${c.patente_placa||''}</td><td>${c.orden_marca||c.marca||''}</td><td>${c.orden_modelo||c.modelo||''}</td><td>${colorSwatch(c.color)}</td></tr>`;
        });
        html += `</tbody></table></div></div></div>`;
    }

    document.getElementById('reporte-contenido').innerHTML = html;

    // === RENDERIZAR GRAFICOS CHART.JS ===
    setTimeout(function() {
        destruirGraficosReporte();

        // 1) Torta de estados de OT (actualizado con todos los estados reales)
        var ctxEstados = document.getElementById('chart-estados');
        if (ctxEstados) {
            var estLabels = ['Enviadas','Aprobadas','Pend.Asign.','Canceladas','Pendientes','Pend.Visita','En Sitio','En Progreso','Pend.Piezas','Completadas','No Compl.','Cerradas'];
            var estValues = [r.enviadas||0, r.aprobadas||0, r.pendientes_asignacion||0, r.canceladas||0, r.pendientes||0, r.pendientes_visita||0, r.en_sitio||0, r.en_progreso||0, r.pendientes_piezas||0, r.completadas||0, r.no_completadas||0, r.cerradas||0];
            var estColors = ['#ffc107','#198754','#17a2b8','#dc3545','#adb5bd','#0dcaf0','#6f42c1','#fd7e14','#6c757d','#20c997','#c82333','#343a40'];
            _graficosReporte.push(new Chart(ctxEstados, {
                type: 'doughnut',
                data: { labels: estLabels, datasets: [{ data: estValues, backgroundColor: estColors, borderWidth: 2, borderColor: '#fff' }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 9 } } } } }
            }));
        }

        // 2) Barras: Flujo de Caja (Entradas vs Salidas — reorganizado)
        var ctxFlujo = document.getElementById('chart-flujo');
        if (ctxFlujo) {
            var abonos = Number(r.total_abonos) || 0;
            var pagosReg = Number(r.total_pagos_registrados) || 0;
            var comisiones = Number(r.comisiones_tecnicos) || 0;
            var gastos = Number(r.total_gastos_negocio) || 0;
            var liqCom = Number(r.liquidacion_comision) || 0;
            var liqDom = Number(r.liquidacion_domicilio) || 0;
            var balanceNeto = Number(r.balance_neto) || 0;
            _graficosReporte.push(new Chart(ctxFlujo, {
                type: 'bar',
                data: {
                    labels: ['Abonos OT', 'Pagos Reg.', 'Comisiones', 'Gastos', 'Liq.Com.', 'Liq.Dom.', 'Balance'],
                    datasets: [{
                        label: 'Monto ($)',
                        data: [abonos, pagosReg, -comisiones, -gastos, -liqCom, -liqDom, balanceNeto],
                        backgroundColor: ['#198754','#20c997','#dc3545','#fd7e14','#6f42c1','#e83e8c', balanceNeto >= 0 ? '#0d6efd' : '#dc3545'],
                        borderRadius: 6
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: function(v) { return '$' + (v/1000).toFixed(0) + 'k'; } } } } }
            }));
        }

        // 3) Barras: rendimiento por técnico
        var ctxTec = document.getElementById('chart-tecnicos');
        if (ctxTec && data.tecnicos && data.tecnicos.length > 0) {
            var tecLabels = data.tecnicos.map(function(t) { return t.nombre || 'N/A'; });
            var tecCerradas = data.tecnicos.map(function(t) { return Number(t.total_cerradas) || 0; });
            var tecGenerado = data.tecnicos.map(function(t) { return Number(t.total_generado) || 0; });
            _graficosReporte.push(new Chart(ctxTec, {
                type: 'bar',
                data: {
                    labels: tecLabels,
                    datasets: [
                        { label: 'OT Cerradas', data: tecCerradas, backgroundColor: '#0d6efd', borderRadius: 4 },
                        { label: 'Generado ($)', data: tecGenerado, backgroundColor: '#198754', borderRadius: 4 }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { beginAtZero: true } } }
            }));
        }
    }, 100);
}

function kpiCard(titulo, valor, icono, color) {
    return `<div class="col-md-3 col-sm-6 col-6">
        <div class="card border-${color} h-100">
            <div class="card-body text-center p-3">
                <i class="fas ${icono} fa-2x text-${color} mb-2"></i>
                <div class="fw-bold fs-5">${valor}</div>
                <small class="text-muted">${titulo}</small>
            </div>
        </div>
    </div>`;
}

async function exportarReporteASheets() {
    if (!datosReporteGlobal) {
        mostrarNotificacion('warning', 'Sin datos', 'Primero generá un reporte');
        return;
    }
    const d = datosReporteGlobal;
    const config = getSheetsConfig();
    const valorNumerico = v => Number(v || 0);

    mostrarNotificacion('info', 'Exportando', 'Enviando datos a Google Sheets...');

    try {
        // 1. Resumen General (Flujo de Caja)
        const r = d.resumen;
        await enviarASheets({ sheetName: 'Resumen', headers: ['Métrica','Valor'],
            rows: [
                ['Periodo', d.periodo], ['Valor', d.valor],
                ['--- ESTADO DE LA ORDEN ---', ''],
                ['Total Órdenes', r.total_ordenes], ['Enviadas', r.enviadas], ['Aprobadas', r.aprobadas], ['Pend. Asignación', r.pendientes_asignacion||0], ['Canceladas', r.canceladas],
                ['--- ESTADO DEL TRABAJO ---', ''],
                ['Pendientes', r.pendientes||0], ['Pendientes Visita', r.pendientes_visita], ['En Sitio', r.en_sitio], ['En Progreso', r.en_progreso],
                ['Pendientes Piezas', r.pendientes_piezas||0], ['Completadas', r.completadas], ['No Completadas', r.no_completadas||0], ['Cerradas', r.cerradas],
                ['--- FLUJO DE CAJA ---', ''],
                ['Total Montos OT (referencia)', valorNumerico(r.total_monto_ordenes)],
                ['Abonos en OT (Entrada)', valorNumerico(r.total_abonos)], ['Pagos Registrados (Entrada)', valorNumerico(r.total_pagos_registrados||0)],
                ['Total Entradas', valorNumerico(Number(r.total_abonos||0) + Number(r.total_pagos_registrados||0))],
                ['Comisiones Técnicos (Salida)', valorNumerico(r.comisiones_tecnicos)], ['Base Comisionable', valorNumerico(r.base_comisionable)],
                ['Total Gastos Negocio (Salida)', valorNumerico(r.total_gastos_negocio)],
                ['Liq. Comisiones (Salida)', valorNumerico(r.liquidacion_comision)], ['Liq. Domicilio (Salida)', valorNumerico(r.liquidacion_domicilio)],
                ['Total Salidas', valorNumerico(r.total_salidas)],
                ['Balance Neto (Flujo de Caja)', valorNumerico(r.balance_neto)],
                ['--- PAGOS Y SALDOS ---', ''],
                ['Total Pagado (OTs pagadas)', valorNumerico(r.total_pagado)], ['Saldo Pendiente por Cobrar', valorNumerico(r.total_restantes)],
                ['Impagos (saldo no pagado)', valorNumerico(r.total_impago)],
                ['Total Costos Extra', valorNumerico(r.total_costos_extra)], ['Costos MO', valorNumerico(r.costos_mano_obra)], ['Costos Repuestos', valorNumerico(r.costos_repuestos)],
                ...(r.gastos_por_categoria||[]).map(g => ['  Gasto ' + g.categoria, valorNumerico(g.total)]),
                ['Promedio por OT', valorNumerico(r.promedio_orden)],
                ['Clientes Únicos', r.total_clientes_unicos], ['Técnicos Activos', r.total_tecnicos_activos], ['Patentes Únicas', r.total_patentes_unicas]
            ]});

        // 2. Órdenes
        if (d.ordenes && d.ordenes.length > 0) {
            await enviarASheets({ sheetName: 'Órdenes', headers: ['N° OT','Patente','Marca','Modelo','Color','Año','Cliente','RUT','Teléfono','Estado','Estado Trabajo','Técnico','Comisión Tec','Fecha','Hora','Recepcionista','Dirección','Monto Total','Abono','Restante','Método Pago','Costos Extra','MO','Rep'],
                rows: d.ordenes.map(o => [String(o.numero_orden||'').padStart(6,'0'), o.patente_placa||'', o.marca||'', o.modelo||'', o.color||'', o.anio||'',
                    o.cliente_nombre||'', o.cliente_rut||'', o.cliente_telefono||'',
                    o.estado||'', o.estado_trabajo||'', o.tecnico_nombre||'', o.tecnico_comision||'',
                    o.fecha_ingreso||'', o.hora_ingreso||'', o.recepcionista||'', o.direccion||'',
                    valorNumerico(o.monto_total), valorNumerico(o.monto_abono), valorNumerico(o.monto_restante), o.metodo_pago||'',
                    valorNumerico(o.total_costos_extra), valorNumerico(o.costos_mo), valorNumerico(o.costos_rep)]) });
        }

        // 3. Técnicos
        if (d.tecnicos && d.tecnicos.length > 0) {
            await enviarASheets({ sheetName: 'Técnicos', headers: ['Nombre','Teléfono','Email','Comisión %','OT Asignadas','OT Cerradas','Total Generado'],
                rows: d.tecnicos.map(t => [t.nombre, t.telefono||'', t.email||'', t.comision_porcentaje||40, t.total_ordenes, t.total_cerradas, valorNumerico(t.total_generado)]) });
        }

        // 4. Costos Adicionales (con marca y modelo)
        if (d.costos_adicionales && d.costos_adicionales.length > 0) {
            await enviarASheets({ sheetName: 'Costos Extra', headers: ['OT','Patente','Marca','Modelo','Color','Concepto','Monto','Categoría','Fecha','Registrado por'],
                rows: d.costos_adicionales.map(c => [String(c.numero_orden||'').padStart(6,'0'), c.patente_placa||'', c.marca||'', c.modelo||'', c.color||'', c.concepto, valorNumerico(c.monto), c.categoria, c.fecha_registro||'', c.registrado_por||'']) });
        }

        // 5. Gastos Negocio
        if (d.gastos_negocio && d.gastos_negocio.length > 0) {
            await enviarASheets({ sheetName: 'Gastos Negocio', headers: ['Concepto','Categoría','Monto','Fecha','Observaciones','Registrado por'],
                rows: d.gastos_negocio.map(g => [g.concepto, g.categoria, valorNumerico(g.monto), g.fecha_gasto||'', g.observaciones||'', g.registrado_por||'']) });
        }

        // 6. Pagos (con marca y modelo)
        if (d.pagos && d.pagos.length > 0) {
            await enviarASheets({ sheetName: 'Pagos', headers: ['OT','Patente','Marca','Modelo','Color','Cliente','Monto','Método','Observaciones'],
                rows: d.pagos.map(p => [String(p.numero_orden||'').padStart(6,'0'), p.patente_placa||'', p.marca||'', p.modelo||'', p.color||'', p.cliente_nombre||'', valorNumerico(p.monto), p.metodo_pago||'', p.observaciones||'']) });
        }

        // 7. Clientes (sin RUT/Email, con Marca/Modelo)
        if (d.clientes && d.clientes.length > 0) {
            await enviarASheets({ sheetName: 'Clientes', headers: ['Nombre','Teléfono','Patente','Marca','Modelo','Color'],
                rows: d.clientes.map(c => [c.nombre||'', c.telefono||'', c.patente_placa||'', c.orden_marca||'', c.orden_modelo||'', c.color||'']) });
        }

        mostrarNotificacion('success', 'Exportado', 'Todas las hojas enviadas a Google Sheets correctamente');
    } catch (error) {
        mostrarNotificacion('error', 'Error al exportar', error.message);
    }
}

// ============================================
// NOTIFICACIONES WHATSAPP
// ============================================

// Cargar estado de UltraMsg al entrar a la seccion
async function cargarUltraMsgStatus() {
    try {
        var resp = await fetch(API_BASE + '/admin/ultramsg');
        var data = await resp.json();
        var badge = document.getElementById('ultramsg-status-badge');
        if (data.success) {
            if (data.configurado) {
                badge.className = 'badge bg-success';
                badge.textContent = 'CONECTADO';
            } else {
                badge.className = 'badge bg-warning text-dark';
                badge.textContent = 'NO CONFIGURADO';
            }
        }
    } catch (e) {
        document.getElementById('ultramsg-status-badge').textContent = 'ERROR';
    }
}

async function guardarUltraMsg() {
    var instanceId = document.getElementById('ultramsg-instance').value.trim();
    var token = document.getElementById('ultramsg-token').value.trim();
    if (!instanceId || !token) {
        mostrarNotificacion('warning', 'Datos faltantes', 'Instance ID y Token son requeridos');
        return;
    }
    try {
        var resp = await fetch(API_BASE + '/admin/ultramsg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instance_id: instanceId, token: token })
        });
        var data = await resp.json();
        if (data.success) {
            mostrarNotificacion('success', 'UltraMsg Configurado', 'Las notificaciones se enviaran automaticamente. ' + data.mensaje);
            cargarUltraMsgStatus();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo guardar');
        }
    } catch (e) {
        mostrarNotificacion('error', 'Error', 'Error de conexion');
    }
}

async function testearUltraMsg() {
    var tel = document.getElementById('ultramsg-test-tel').value.trim().replace(/\D/g, '');
    if (tel.length < 10) {
        mostrarNotificacion('warning', 'Telefono invalido', 'Ingresa un telefono con codigo de pais (ej: 5804167775771)');
        return;
    }
    var resultDiv = document.getElementById('ultramsg-test-result');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin me-2"></i>Enviando mensaje de prueba...</div>';
    try {
        var resp = await fetch(API_BASE + '/admin/ultramsg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'test', telefono_test: tel })
        });
        var data = await resp.json();
        if (data.success && data.resultado) {
            var r = data.resultado;
            if (r.sent === true || r.status === 'success') {
                resultDiv.innerHTML = '<div class="alert alert-success py-2 mb-0"><i class="fas fa-check-circle me-2"></i>Mensaje enviado correctamente! Revisa tu WhatsApp.</div>';
            } else {
                resultDiv.innerHTML = '<div class="alert alert-danger py-2 mb-0"><i class="fas fa-times-circle me-2"></i>No se envio: ' + (r.message || r.error || JSON.stringify(r)) + '</div>';
            }
        } else {
            resultDiv.innerHTML = '<div class="alert alert-danger py-2 mb-0"><i class="fas fa-times-circle me-2"></i>' + (data.error || 'Error desconocido') + '</div>';
        }
    } catch (e) {
        resultDiv.innerHTML = '<div class="alert alert-danger py-2 mb-0"><i class="fas fa-times-circle me-2"></i>Error de conexion</div>';
    }
}

// ============================================
// CONFIGURACION DE DOMICILIO
// ============================================

function toggleDomicilioFields() {
    var habilitado = document.getElementById('domicilio-habilitado').checked;
    document.getElementById('domicilio-fields').style.display = habilitado ? 'block' : 'none';
}

async function cargarConfigDomicilio() {
    try {
        var resp = await fetch(API_BASE + '/admin/config-domicilio');
        var data = await resp.json();
        var badge = document.getElementById('domicilio-status-badge');

        if (data.success) {
            var c = data.config;
            document.getElementById('domicilio-habilitado').checked = c.habilitado;
            document.getElementById('domicilio-taller-lat').value = c.taller_lat || '';
            document.getElementById('domicilio-taller-lng').value = c.taller_lng || '';
            document.getElementById('domicilio-radio-gratis').value = c.radio_gratis_km || 5;
            document.getElementById('domicilio-tarifa-km').value = c.tarifa_por_km || 500;
            document.getElementById('domicilio-cargo-minimo').value = c.cargo_minimo || 1000;
            document.getElementById('domicilio-cobertura-max').value = c.cobertura_maxima_km || 50;

            // Seleccionar radio del modo de cobro
            var radios = document.querySelectorAll('input[name="domicilio-modo-cobro"]');
            radios.forEach(function(r) { r.checked = (r.value === c.modo_cobro); });
            if (!c.modo_cobro) document.getElementById('modo-pago-directo').checked = true;

            toggleDomicilioFields();

            if (c.habilitado && c.taller_lat && c.taller_lng) {
                badge.className = 'badge bg-success';
                badge.textContent = 'ACTIVO';
            } else if (c.habilitado) {
                badge.className = 'badge bg-warning text-dark';
                badge.textContent = 'SIN COORDENADAS';
            } else {
                badge.className = 'badge bg-secondary';
                badge.textContent = 'DESACTIVADO';
            }
        }
    } catch (e) {
        document.getElementById('domicilio-status-badge').textContent = 'ERROR';
    }
}

async function guardarConfigDomicilio() {
    var habilitado = document.getElementById('domicilio-habilitado').checked;
    var tallerLat = parseFloat(document.getElementById('domicilio-taller-lat').value) || 0;
    var tallerLng = parseFloat(document.getElementById('domicilio-taller-lng').value) || 0;

    if (habilitado && (!tallerLat || !tallerLng)) {
        mostrarNotificacion('warning', 'Sin coordenadas', 'Ingresa las coordenadas del taller o usa el boton de deteccion');
        return;
    }

    var modoCobro = 'no_cobrar';
    var radios = document.querySelectorAll('input[name="domicilio-modo-cobro"]');
    radios.forEach(function(r) { if (r.checked) modoCobro = r.value; });

    try {
        var resp = await fetch(API_BASE + '/admin/config-domicilio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                habilitado: habilitado,
                taller_lat: tallerLat,
                taller_lng: tallerLng,
                radio_gratis_km: Number(document.getElementById('domicilio-radio-gratis').value) || 5,
                tarifa_por_km: Number(document.getElementById('domicilio-tarifa-km').value) || 500,
                cargo_minimo: Number(document.getElementById('domicilio-cargo-minimo').value) || 1000,
                cobertura_maxima_km: Number(document.getElementById('domicilio-cobertura-max').value) || 50,
                modo_cobro: modoCobro
            })
        });
        var data = await resp.json();
        if (data.success) {
            mostrarNotificacion('success', 'Domicilio Configurado', data.mensaje);
            cargarConfigDomicilio();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo guardar');
        }
    } catch (e) {
        mostrarNotificacion('error', 'Error', 'Error de conexion');
    }
}

function detectarUbicacionTaller() {
    if (!navigator.geolocation) {
        mostrarNotificacion('error', 'No soportado', 'Tu navegador no soporta geolocalizacion');
        return;
    }
    mostrarNotificacion('info', 'Detectando...', 'Espera mientras detectamos tu ubicacion...');
    navigator.geolocation.getCurrentPosition(
        function(pos) {
            document.getElementById('domicilio-taller-lat').value = pos.coords.latitude.toFixed(6);
            document.getElementById('domicilio-taller-lng').value = pos.coords.longitude.toFixed(6);
            mostrarNotificacion('success', 'Ubicacion detectada', 'Coordenadas del taller cargadas correctamente');
        },
        function(err) {
            mostrarNotificacion('error', 'Error', 'No se pudo detectar tu ubicacion: ' + err.message);
        },
        { enableHighAccuracy: true, timeout: 15000 }
    );
}

async function cargarNotificaciones() {
    try {
        const response = await fetch(API_BASE + '/admin/notificaciones');
        const data = await response.json();
        if (!data.success) { mostrarNotificacion('error', 'Error', data.error); return; }

        var pendientes = data.pendientes || [];
        var enviadas = data.enviadas || [];

        // Actualizar badge en navbar
        var badge = document.getElementById('notif-badge');
        if (badge) {
            if (pendientes.length > 0) {
                badge.style.display = 'flex';
                badge.textContent = pendientes.length > 9 ? '9+' : pendientes.length;
            } else {
                badge.style.display = 'none';
            }
        }

        document.getElementById('count-pendientes').textContent = pendientes.length;
        document.getElementById('count-enviadas').textContent = enviadas.length;

        // Renderizar pendientes
        if (pendientes.length === 0) {
            document.getElementById('notificaciones-pendientes').innerHTML = '<div class="text-center py-3 text-muted"><i class="fas fa-check-circle me-1"></i>No hay notificaciones pendientes</div>';
        } else {
            var htmlP = '';
            pendientes.forEach(function(n) {
                var numOT = String(n.numero_orden || 0).padStart(6, '0');
                var fecha = n.fecha_creacion ? n.fecha_creacion.replace('T', ' ').substring(0, 16) : '';
                var tipoLabel = n.tipo_evento || '';
                var waLink = 'https://wa.me/' + (n.telefono || '') + '?text=' + encodeURIComponent(n.mensaje || '');
                htmlP += '<div class="list-group-item">' +
                    '<div class="d-flex justify-content-between align-items-start">' +
                        '<div class="flex-grow-1">' +
                            '<div class="d-flex gap-2 align-items-center mb-1">' +
                                '<span class="badge bg-danger">' + tipoLabel + '</span>' +
                                '<small class="text-muted">OT #' + numOT + '</small>' +
                                '<small class="text-muted">' + (n.patente_placa || '') + '</small>' +
                            '</div>' +
                            '<p class="mb-1 small">' + (n.mensaje || '').substring(0, 120) + '</p>' +
                            '<small class="text-muted">' + fecha + ' | ' + (n.telefono || '') + '</small>' +
                        '</div>' +
                        '<div class="btn-group btn-group-sm ms-2">' +
                            '<a href="' + waLink + '" target="_blank" class="btn btn-success btn-sm" title="Enviar por WhatsApp"><i class="fab fa-whatsapp"></i></a>' +
                            '<button class="btn btn-outline-secondary btn-sm" onclick="marcarEnviada(' + n.id + ')" title="Marcar como enviada"><i class="fas fa-check"></i></button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            });
            document.getElementById('notificaciones-pendientes').innerHTML = htmlP;
        }

        // Renderizar enviadas
        if (enviadas.length === 0) {
            document.getElementById('notificaciones-enviadas').innerHTML = '<div class="text-center py-3 text-muted"><i class="fas fa-inbox me-1"></i>No hay notificaciones enviadas</div>';
        } else {
            var htmlE = '';
            enviadas.forEach(function(n) {
                var numOT = String(n.numero_orden || 0).padStart(6, '0');
                var fecha = n.fecha_creacion ? n.fecha_creacion.replace('T', ' ').substring(0, 16) : '';
                htmlE += '<div class="list-group-item">' +
                    '<div class="d-flex justify-content-between align-items-start">' +
                        '<div class="flex-grow-1">' +
                            '<div class="d-flex gap-2 align-items-center mb-1">' +
                                '<span class="badge bg-secondary">' + (n.tipo_evento || '') + '</span>' +
                                '<small class="text-muted">OT #' + numOT + '</small>' +
                            '</div>' +
                            '<p class="mb-1 small text-muted">' + (n.mensaje || '').substring(0, 100) + '</p>' +
                            '<small class="text-muted">' + fecha + '</small>' +
                        '</div>' +
                        '<i class="fas fa-check-circle text-success"></i>' +
                    '</div>' +
                '</div>';
            });
            document.getElementById('notificaciones-enviadas').innerHTML = htmlE;
        }
    } catch (error) {
        console.error('Error cargando notificaciones:', error);
        mostrarNotificacion('error', 'Error', 'Error al cargar notificaciones');
    }
}

async function marcarEnviada(id) {
    try {
        await fetch(API_BASE + '/admin/notificaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, accion: 'marcar_enviada' })
        });
        cargarNotificaciones();
    } catch (e) {
        mostrarNotificacion('error', 'Error', 'Error al marcar');
    }
}

async function marcarTodasEnviadas() {
    if (!confirm('Marcar todas las notificaciones pendientes como enviadas?')) return;
    try {
        await fetch(API_BASE + '/admin/notificaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'marcar_todas' })
        });
        mostrarNotificacion('success', 'Listo', 'Todas marcadas como enviadas');
        cargarNotificaciones();
    } catch (e) {
        mostrarNotificacion('error', 'Error', 'Error al marcar');
    }
}

async function enviarTodasPendientes() {
    try {
        var resp = await fetch(API_BASE + '/admin/notificaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'enviar_todas' })
        });
        var data = await resp.json();
        if (!data.success || !data.links || data.links.length === 0) {
            mostrarNotificacion('warning', 'Sin pendientes', 'No hay notificaciones pendientes para enviar');
            return;
        }
        // Abrir primer link y mostrar aviso
        window.open(data.links[0].link, '_blank');
        mostrarNotificacion('info', 'Notificaciones', 'Se abrio la primera. Total pendientes: ' + data.links.length + '. Apretá uno por uno en la lista.');
    } catch (e) {
        mostrarNotificacion('error', 'Error', 'Error al enviar');
    }
}

// ============================================
// EDITAR ORDEN - Funcionalidad completa
// ============================================

async function editarOrden(ordenId) {
    try {
        mostrarLoading(true);
        const response = await fetch(API_BASE + '/ver-orden?id=' + ordenId);
        const data = await response.json();
        if (!data.orden) { mostrarNotificacion('error', 'Error', 'Orden no encontrada'); mostrarLoading(false); return; }
        const o = data.orden;
        document.getElementById('edit-orden-id').value = o.id;
        document.getElementById('edit-cliente-id').value = o.cliente_id || '';
        document.getElementById('edit-vehiculo-id').value = o.vehiculo_id || '';
        document.getElementById('edit-orden-numero').textContent = String(o.numero_orden).padStart(6, '0');
        document.getElementById('edit-cliente').value = o.cliente_nombre || '';
        document.getElementById('edit-cliente-apellido').value = o.cliente_apellido || '';
        document.getElementById('edit-rut').value = o.cliente_rut || '';
        document.getElementById('edit-telefono').value = o.cliente_telefono || '';
        document.getElementById('edit-direccion').value = o.direccion || '';
        document.getElementById('edit-estado').value = o.estado || 'Enviada';
        // Nuevos campos de asignación y estado
        document.getElementById('edit-estado-trabajo').value = o.estado_trabajo || 'Pendiente';
        document.getElementById('edit-fecha-programada').value = o.fecha_programada || '';
        document.getElementById('edit-hora-programada').value = o.hora_programada || '';
        // Cargar técnicos en el select de asignación
        await cargarTecnicosEnEditarOrden(o.tecnico_asignado_id);
        // También llenar selector de técnico para diagnóstico inline
        llenarSelectorTecnicos('edit-diag-nuevo-tecnico');
        document.getElementById('edit-patente').value = o.patente_placa || '';
        document.getElementById('edit-marca').value = o.marca || '';
        document.getElementById('edit-modelo').value = o.modelo || '';
        document.getElementById('edit-color').value = o.color || '';
        if (o.color && o.color.startsWith('#')) document.getElementById('edit-color-picker').value = o.color;
        document.getElementById('edit-anio').value = o.anio || '';
        document.getElementById('edit-cilindrada').value = o.cilindrada || '';
        document.getElementById('edit-combustible').value = o.combustible || '';
        document.getElementById('edit-kilometraje').value = o.kilometraje || '';
        document.getElementById('edit-nivel-combustible').value = o.nivel_combustible || '';
        document.getElementById('edit-fecha-ingreso').value = o.fecha_ingreso || '';
        document.getElementById('edit-hora-ingreso').value = o.hora_ingreso || '';
        document.getElementById('edit-recepcionista').value = o.recepcionista || '';
        const servicios = o.servicios_seleccionados || [];
        var serviciosArray = typeof servicios === 'string' ? JSON.parse(servicios || '[]') : servicios;
        renderizarServiciosEditar(serviciosArray);
        document.getElementById('edit-monto-total').value = Number(o.monto_total || 0);
        document.getElementById('edit-monto-abono').value = Number(o.monto_abono || 0);
        document.getElementById('edit-monto-restante').value = '$' + Number(o.monto_restante || 0).toLocaleString('es-CL', {maximumFractionDigits: 0});
        document.getElementById('edit-metodo-pago').value = o.metodo_pago || '';
        // Cargar costos adicionales
        await cargarCostosAdicionalesEditar(o.id);
        // Calcular total automático (servicios + costos)
        var autoTotalServicios = 0;
        try { var ss = JSON.parse(document.getElementById('edit-servicios-json').value || '[]'); if(Array.isArray(ss)) ss.forEach(function(x){ autoTotalServicios += Number(x.precio_final||x.precio_sugerido||0); }); } catch(e){}
        var autoTotalCostos = 0;
        if (window._editCostosAdicionales) { window._editCostosAdicionales.forEach(function(c){ autoTotalCostos += Number(c.monto||0); }); }
        var autoTotal = autoTotalServicios + autoTotalCostos;
        var dbTotal = Number(o.monto_total || 0);
        // Decidir modo: si hay servicios/costos para calcular → Auto, si no → Manual (preservar BD)
        var toggleAuto = document.getElementById('edit-auto-total');
        if (toggleAuto) {
            if (autoTotal > 0) {
                // Hay servicios/costos: modo Auto (siempre recalcular)
                toggleAuto.checked = true;
            } else if (dbTotal > 0) {
                // No hay servicios pero sí hay total en BD: modo Manual para preservar valor
                toggleAuto.checked = false;
            } else {
                // Sin servicios ni total: Auto por defecto
                toggleAuto.checked = true;
            }
            toggleAutoTotalEditar();
        }
        // Si modo Auto, usar el auto-cálculo; si Manual, usar valor de BD
        if (toggleAuto && toggleAuto.checked && autoTotal > 0) {
            document.getElementById('edit-monto-total').value = autoTotal;
        } else {
            document.getElementById('edit-monto-total').value = dbTotal;
        }
        actualizarResumenValoresEditar();
        document.getElementById('edit-servicios-json').oninput = function() {
            try { renderizarServiciosEditar(JSON.parse(this.value || '[]')); recalcularTotalEditar(); } catch(e){}
        };
        try { var mv = bootstrap.Modal.getInstance(document.getElementById('modalVerOrden')); if(mv) mv.hide(); var mc = bootstrap.Modal.getInstance(document.getElementById('modalOrdenCompleta')); if(mc) mc.hide(); } catch(e){}
        new bootstrap.Modal(document.getElementById('modalEditarOrden')).show();
    } catch (error) { console.error('Error al editar:', error); mostrarNotificacion('error', 'Error', 'Error al cargar la orden'); }
    finally { mostrarLoading(false); }
}

function recalcularTotalEditar() {
    // Si el total es manual, no recalcular automáticamente
    var toggleAuto = document.getElementById('edit-auto-total');
    if (toggleAuto && !toggleAuto.checked) return;

    var totalServicios = 0;
    try {
        var s = JSON.parse(document.getElementById('edit-servicios-json').value || '[]');
        if (Array.isArray(s)) s.forEach(function(x){ totalServicios += Number(x.precio_final || x.precio_sugerido || 0); });
    } catch(e){}

    var totalCostos = 0;
    if (window._editCostosAdicionales) {
        window._editCostosAdicionales.forEach(function(c){ totalCostos += Number(c.monto || 0); });
    }

    var totalCalculado = totalServicios + totalCostos;
    // Solo actualizar si el auto-cálculo tiene valor > 0
    // Si da 0, preservar el valor actual (podría ser un total manual de BD)
    if (totalCalculado > 0) {
        document.getElementById('edit-monto-total').value = totalCalculado;
    }
    recalcularRestanteEditar();
}

function recalcularRestanteEditar() {
    var total = parseFloat(document.getElementById('edit-monto-total').value) || 0;
    var abono = parseFloat(document.getElementById('edit-monto-abono').value) || 0;
    document.getElementById('edit-monto-restante').value = '$' + (total - abono).toLocaleString('es-CL', {maximumFractionDigits: 0});
    actualizarResumenValoresEditar();
}

function actualizarResumenValoresEditar() {
    var servicios = [];
    try { servicios = JSON.parse(document.getElementById('edit-servicios-json').value || '[]'); } catch(e){}
    var totalServicios = 0;
    if (Array.isArray(servicios)) servicios.forEach(function(s){ totalServicios += Number(s.precio_final || s.precio_sugerido || 0); });

    var costosMO = 0, costosRep = 0;
    if (window._editCostosAdicionales) {
        window._editCostosAdicionales.forEach(function(c){
            if (c.categoria === 'Repuestos/Materiales') costosRep += Number(c.monto || 0);
            else costosMO += Number(c.monto || 0);
        });
    }

    var totalCostos = costosMO + costosRep;
    var totalCalculado = totalServicios + totalCostos;
    var total = parseFloat(document.getElementById('edit-monto-total').value) || 0;
    var abono = parseFloat(document.getElementById('edit-monto-abono').value) || 0;
    var restante = total - abono;

    var html = '<div class="row text-center" style="font-size:0.85rem;">';
    html += '<div class="col"><span class="badge bg-primary">Servicios: $' + totalServicios.toLocaleString('es-CL',{maximumFractionDigits:0}) + '</span></div>';
    html += '<div class="col"><span class="badge bg-warning text-dark">M.Obra: $' + costosMO.toLocaleString('es-CL',{maximumFractionDigits:0}) + '</span></div>';
    html += '<div class="col"><span class="badge bg-info text-dark">Repuestos: $' + costosRep.toLocaleString('es-CL',{maximumFractionDigits:0}) + '</span></div>';
    html += '</div>';
    html += '<div class="row text-center mt-1" style="font-size:0.9rem;">';
    html += '<div class="col-6"><strong>Subtotal calculado:</strong> $' + totalCalculado.toLocaleString('es-CL',{maximumFractionDigits:0}) + '</div>';
    html += '<div class="col-6" style="color:var(--gp-red);"><strong>Total OT:</strong> $' + total.toLocaleString('es-CL',{maximumFractionDigits:0}) + '</div>';
    html += '</div>';
    if (total !== totalCalculado) {
        var diff = total - totalCalculado;
        var diffLabel = diff > 0 ? 'Ajuste +' : 'Ajuste ';
        html += '<div class="text-center mt-1"><span class="badge bg-secondary">' + diffLabel + '$' + Math.abs(diff).toLocaleString('es-CL',{maximumFractionDigits:0}) + ' (manual)</span></div>';
    }
    document.getElementById('edit-resumen-valores').innerHTML = html;
}

async function cargarTecnicosEnEditarOrden(tecnicoAsignadoId) {
    const select = document.getElementById('edit-tecnico-asignado');
    if (!select) return;
    select.innerHTML = '<option value="">Sin asignar</option>';
    try {
        const resp = await fetch(`${API_BASE}/admin/tecnicos`);
        const data = await resp.json();
        if (data.success && data.tecnicos) {
            // Poblar tecnicosGlobal si está vacío
            if (tecnicosGlobal.length === 0) {
                tecnicosGlobal = data.tecnicos.filter(t => t.activo);
            }
            // FIX: Incluir también el técnico asignado actual aunque esté inactivo
            // para evitar que se pierda al guardar la edición
            var tecnicoAsignadoActual = data.tecnicos.find(t => t.id == tecnicoAsignadoId);
            data.tecnicos.forEach(t => {
                if (t.activo) {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.textContent = t.nombre + (t.apellido ? ' ' + t.apellido : '');
                    if (t.id == tecnicoAsignadoId) opt.selected = true;
                    select.appendChild(opt);
                }
            });
            // Si el técnico asignado está inactivo, agregarlo igualmente al dropdown
            if (tecnicoAsignadoActual && !tecnicoAsignadoActual.activo) {
                var optInactivo = document.createElement('option');
                optInactivo.value = tecnicoAsignadoActual.id;
                optInactivo.textContent = tecnicoAsignadoActual.nombre + (tecnicoAsignadoActual.apellido ? ' ' + tecnicoAsignadoActual.apellido : '') + ' (inactivo)';
                optInactivo.selected = true;
                select.appendChild(optInactivo);
            }
        }
    } catch(e) {
        console.error('Error cargando técnicos para editar:', e);
    }
}

// ============================================
// COSTOS ADICIONALES EN EDICIÓN
// ============================================

async function cargarCostosAdicionalesEditar(ordenId) {
    try {
        var resp = await fetch(API_BASE + '/admin/costos-adicionales?orden_id=' + ordenId);
        var data = await resp.json();
        window._editCostosAdicionales = data.costos || [];
        renderizarCostosAdicionalesEditar();
    } catch(e) {
        window._editCostosAdicionales = [];
        renderizarCostosAdicionalesEditar();
    }
}

function renderizarCostosAdicionalesEditar() {
    var container = document.getElementById('edit-costos-adicionales-list');
    if (!window._editCostosAdicionales || window._editCostosAdicionales.length === 0) {
        container.innerHTML = '<p class="text-muted mb-0">Sin costos adicionales</p>';
        actualizarResumenValoresEditar();
        return;
    }
    var html = '<table class="table table-sm table-bordered mb-0"><thead class="table-light"><tr><th>Concepto</th><th>Categoría</th><th class="text-end" width="100">Monto</th><th width="80">Acciones</th></tr></thead><tbody>';
    var totalMO = 0, totalRep = 0;
    window._editCostosAdicionales.forEach(function(c, i) {
        var monto = Number(c.monto || 0);
        if (c.categoria === 'Repuestos/Materiales') totalRep += monto; else totalMO += monto;
        var catBadge = c.categoria === 'Repuestos/Materiales' ? '<span class="badge bg-info">Repuestos</span>' : '<span class="badge bg-warning text-dark">M. Obra</span>';
        html += '<tr id="edit-costo-row-' + c.id + '">';
        html += '<td><span id="edit-costo-concepto-display-' + c.id + '">' + (c.concepto||'') + '</span><input type="text" class="form-control form-control-sm d-none" id="edit-costo-concepto-input-' + c.id + '" value="' + (c.concepto||'').replace(/"/g, '&quot;') + '"></td>';
        html += '<td>' + catBadge + '</td>';
        html += '<td class="text-end"><span id="edit-costo-monto-display-' + c.id + '">$' + monto.toLocaleString('es-CL',{maximumFractionDigits:0}) + '</span><input type="number" class="form-control form-control-sm text-end d-none" id="edit-costo-monto-input-' + c.id + '" value="' + monto + '" min="0"></td>';
        html += '<td class="text-center">';
        html += '<button type="button" class="btn btn-outline-primary btn-sm py-0 px-1 me-1" id="edit-costo-edit-btn-' + c.id + '" onclick="editarCostoInline(' + c.id + ')" title="Editar"><i class="fas fa-pen"></i></button>';
        html += '<button type="button" class="btn btn-outline-success btn-sm py-0 px-1 me-1 d-none" id="edit-costo-save-btn-' + c.id + '" onclick="guardarCostoInline(' + c.id + ',' + i + ')" title="Guardar"><i class="fas fa-check"></i></button>';
        html += '<button type="button" class="btn btn-outline-secondary btn-sm py-0 px-1 me-1 d-none" id="edit-costo-cancel-btn-' + c.id + '" onclick="cancelarEdicionCostoInline(' + c.id + ')" title="Cancelar"><i class="fas fa-undo"></i></button>';
        html += '<button type="button" class="btn btn-outline-danger btn-sm py-0 px-1" onclick="eliminarCostoEditar(' + i + ',' + c.id + ')" title="Eliminar"><i class="fas fa-trash"></i></button>';
        html += '</td></tr>';
    });
    html += '<tr class="table-warning"><td colspan="2" class="fw-bold">Total Costos</td><td class="text-end fw-bold">$' + (totalMO+totalRep).toLocaleString('es-CL',{maximumFractionDigits:0}) + '</td><td></td></tr>';
    html += '</tbody></table>';
    container.innerHTML = html;
    actualizarResumenValoresEditar();
}

function editarCostoInline(costoId) {
    // Mostrar inputs, ocultar displays
    var conceptoDisplay = document.getElementById('edit-costo-concepto-display-' + costoId);
    var conceptoInput = document.getElementById('edit-costo-concepto-input-' + costoId);
    var montoDisplay = document.getElementById('edit-costo-monto-display-' + costoId);
    var montoInput = document.getElementById('edit-costo-monto-input-' + costoId);
    var editBtn = document.getElementById('edit-costo-edit-btn-' + costoId);
    var saveBtn = document.getElementById('edit-costo-save-btn-' + costoId);
    var cancelBtn = document.getElementById('edit-costo-cancel-btn-' + costoId);
    if (conceptoDisplay) conceptoDisplay.classList.add('d-none');
    if (conceptoInput) conceptoInput.classList.remove('d-none');
    if (montoDisplay) montoDisplay.classList.add('d-none');
    if (montoInput) montoInput.classList.remove('d-none');
    if (editBtn) editBtn.classList.add('d-none');
    if (saveBtn) saveBtn.classList.remove('d-none');
    if (cancelBtn) cancelBtn.classList.remove('d-none');
}

function cancelarEdicionCostoInline(costoId) {
    // Restaurar displays, ocultar inputs
    var conceptoDisplay = document.getElementById('edit-costo-concepto-display-' + costoId);
    var conceptoInput = document.getElementById('edit-costo-concepto-input-' + costoId);
    var montoDisplay = document.getElementById('edit-costo-monto-display-' + costoId);
    var montoInput = document.getElementById('edit-costo-monto-input-' + costoId);
    var editBtn = document.getElementById('edit-costo-edit-btn-' + costoId);
    var saveBtn = document.getElementById('edit-costo-save-btn-' + costoId);
    var cancelBtn = document.getElementById('edit-costo-cancel-btn-' + costoId);
    if (conceptoDisplay) conceptoDisplay.classList.remove('d-none');
    if (conceptoInput) conceptoInput.classList.add('d-none');
    if (montoDisplay) montoDisplay.classList.remove('d-none');
    if (montoInput) montoInput.classList.add('d-none');
    if (editBtn) editBtn.classList.remove('d-none');
    if (saveBtn) saveBtn.classList.add('d-none');
    if (cancelBtn) cancelBtn.classList.add('d-none');
}

async function guardarCostoInline(costoId, index) {
    var conceptoInput = document.getElementById('edit-costo-concepto-input-' + costoId);
    var montoInput = document.getElementById('edit-costo-monto-input-' + costoId);
    var nuevoConcepto = conceptoInput ? conceptoInput.value.trim() : '';
    var nuevoMonto = montoInput ? parseFloat(montoInput.value) || 0 : 0;
    if (!nuevoConcepto || nuevoMonto <= 0) {
        mostrarNotificacion('warning', 'Atención', 'Concepto y monto son obligatorios');
        return;
    }
    try {
        // Actualizar el costo en la BD usando PUT al API de costos-adicionales
        var resp = await fetch(API_BASE + '/admin/costos-adicionales', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id: costoId, concepto: nuevoConcepto, monto: nuevoMonto })
        });
        var data = await resp.json();
        if (data.success) {
            // Actualizar el array local
            if (window._editCostosAdicionales && window._editCostosAdicionales[index]) {
                window._editCostosAdicionales[index].concepto = nuevoConcepto;
                window._editCostosAdicionales[index].monto = nuevoMonto;
            }
            var ordenId = document.getElementById('edit-orden-id').value;
            await cargarCostosAdicionalesEditar(ordenId);
            recalcularTotalEditar();
            mostrarNotificacion('success', 'Costo Actualizado', nuevoConcepto + ' - $' + nuevoMonto.toLocaleString('es-CL'));
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo actualizar');
        }
    } catch(e) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

async function agregarCostoEditar() {
    var concepto = document.getElementById('edit-costo-concepto').value.trim();
    var monto = parseFloat(document.getElementById('edit-costo-monto').value) || 0;
    var categoria = document.getElementById('edit-costo-categoria').value;
    var ordenId = document.getElementById('edit-orden-id').value;

    if (!concepto || monto <= 0) {
        mostrarNotificacion('warning', 'Atención', 'Ingresá concepto y monto');
        return;
    }

    try {
        var resp = await fetch(API_BASE + '/admin/costos-adicionales', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ orden_id: parseInt(ordenId), concepto: concepto, monto: monto, categoria: categoria })
        });
        var data = await resp.json();
        if (data.success) {
            document.getElementById('edit-costo-concepto').value = '';
            document.getElementById('edit-costo-monto').value = '';
            await cargarCostosAdicionalesEditar(ordenId);
            // Recalcular total automáticamente (servicios + costos)
            recalcularTotalEditar();
            mostrarNotificacion('success', 'Costo Agregado', concepto + ' - $' + monto.toLocaleString('es-CL'));
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo agregar');
        }
    } catch(e) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

async function eliminarCostoEditar(index, costoId) {
    var ordenId = document.getElementById('edit-orden-id').value;
    if (!confirm('¿Eliminar este costo adicional?')) return;
    try {
        var resp = await fetch(API_BASE + '/admin/costos-adicionales?id=' + costoId + '&orden_id=' + ordenId, { method: 'DELETE' });
        var data = await resp.json();
        if (data.success) {
            await cargarCostosAdicionalesEditar(ordenId);
            // Recalcular total automáticamente (servicios + costos)
            recalcularTotalEditar();
            mostrarNotificacion('success', 'Eliminado', 'Costo adicional eliminado');
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo eliminar');
        }
    } catch(e) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}


// ============================================
// SERVICIOS EN EDICIÓN (interfaz visual)
// ============================================

function renderizarServiciosEditar(servicios) {
    var container = document.getElementById('edit-servicios-display');
    // Actualizar badge contador
    var countBadge = document.getElementById('edit-count-servicios');
    if (countBadge) countBadge.textContent = Array.isArray(servicios) ? servicios.length : 0;
    if (!Array.isArray(servicios) || servicios.length === 0) {
        container.innerHTML = '<p class="text-muted mb-0"><i class="fas fa-inbox me-1"></i>Sin servicios agregados. Use el formulario de abajo para agregar.</p>';
        document.getElementById('edit-servicios-json').value = '[]';
        return;
    }

    // Construir opciones de técnico (con nombre completo: nombre + apellido)
    let tecOptionsHtml = '<option value="">Sin asignar</option>';
    tecnicosGlobal.forEach(t => {
        tecOptionsHtml += `<option value="${t.id}">${t.nombre}${t.apellido ? ' ' + t.apellido : ''}</option>`;
    });

    var html = '<table class="table table-sm table-bordered mb-0"><thead class="table-light"><tr><th>Trabajo</th><th>Técnico</th><th>Tipo</th><th class="text-end" width="100">Precio</th><th width="40"></th></tr></thead><tbody>';
    var t = 0;
    servicios.forEach(function(s, i) {
        var precio = Number(s.precio_final || s.precio_sugerido || 0);
        t += precio;
        var tecSelected = s.tecnico_id || '';
        var esMO = s.tipo_comision === 'mano_obra';
        var tipoBadge = esMO ? '<span class="badge bg-warning text-dark" style="font-size:0.7rem;">MO</span>' : '<span class="badge bg-secondary" style="font-size:0.7rem;">Rep</span>';
        html += '<tr>';
        html += '<td>' + (s.nombre || s.descripcion || 'Sin nombre') + '</td>';
        html += '<td><select class="form-select form-select-sm" onchange="cambiarTecnicoServicioEditar(' + i + ', this.value)" style="font-size:0.78rem;min-width:100px;">' +
            tecOptionsHtml.replace(`value="${tecSelected}"`, `value="${tecSelected}" selected`) + '</select></td>';
        html += '<td>' + tipoBadge + '</td>';
        html += '<td class="text-end fw-bold">$' + precio.toLocaleString('es-CL',{maximumFractionDigits:0}) + '</td>';
        html += '<td class="text-center"><button type="button" class="btn btn-outline-danger btn-sm py-0 px-1" onclick="eliminarServicioEditar(' + i + ')" title="Eliminar"><i class="fas fa-trash"></i></button></td>';
        html += '</tr>';
    });
    html += '<tr class="table-warning"><td class="fw-bold" colspan="3">Total Servicios</td><td class="text-end fw-bold">$' + t.toLocaleString('es-CL',{maximumFractionDigits:0}) + '</td><td></td></tr>';
    html += '</tbody></table>';
    container.innerHTML = html;

    document.getElementById('edit-servicios-json').value = JSON.stringify(servicios);
}

function cambiarPrecioServicioEditar(index, nuevoPrecio) {
    try {
        var servicios = JSON.parse(document.getElementById('edit-servicios-json').value || '[]');
        if (Array.isArray(servicios) && servicios[index] !== undefined) {
            servicios[index].precio_final = Number(nuevoPrecio) || 0;
            document.getElementById('edit-servicios-json').value = JSON.stringify(servicios);
            renderizarServiciosEditar(servicios);
            recalcularTotalEditar();
        }
    } catch(e) {}
}

function cambiarTecnicoServicioEditar(index, tecnicoId) {
    try {
        var servicios = JSON.parse(document.getElementById('edit-servicios-json').value || '[]');
        if (Array.isArray(servicios) && servicios[index] !== undefined) {
            if (tecnicoId) {
                servicios[index].tecnico_id = parseInt(tecnicoId);
                // Buscar nombre completo del técnico (nombre + apellido)
                var tec = tecnicosGlobal.find(t => String(t.id) === String(tecnicoId));
                servicios[index].tecnico_nombre = tec ? (tec.nombre + (tec.apellido ? ' ' + tec.apellido : '')) : '';
            } else {
                delete servicios[index].tecnico_id;
                delete servicios[index].tecnico_nombre;
            }
            document.getElementById('edit-servicios-json').value = JSON.stringify(servicios);
            // No re-renderizar para no perder el foco del select
        }
    } catch(e) {}
}

function cambiarDescripcionServicioEditar(index, descripcion) {
    try {
        var servicios = JSON.parse(document.getElementById('edit-servicios-json').value || '[]');
        if (Array.isArray(servicios) && servicios[index] !== undefined) {
            if (descripcion && descripcion.trim()) {
                servicios[index].descripcion = descripcion.trim();
            } else {
                delete servicios[index].descripcion;
            }
            document.getElementById('edit-servicios-json').value = JSON.stringify(servicios);
        }
    } catch(e) {}
}

function eliminarServicioEditar(index) {
    try {
        var servicios = JSON.parse(document.getElementById('edit-servicios-json').value || '[]');
        if (Array.isArray(servicios) && servicios[index] !== undefined) {
            var nombre = servicios[index].nombre || 'este servicio';
            if (!confirm('¿Eliminar "' + nombre + '" de los servicios?')) return;
            servicios.splice(index, 1);
            document.getElementById('edit-servicios-json').value = JSON.stringify(servicios);
            renderizarServiciosEditar(servicios);
            recalcularTotalEditar();
        }
    } catch(e) {}
}

function agregarItemDiagEditar() {
    var tecSel = document.getElementById('edit-diag-nuevo-tecnico');
    var notas = document.getElementById('edit-diag-nuevo-notas').value.trim();
    var valor = parseFloat(document.getElementById('edit-diag-nuevo-valor').value) || 0;
    var tipo = document.getElementById('edit-diag-nuevo-tipo').value;

    if (!tecSel.value) { mostrarNotificacion('warning', 'Advertencia', 'Seleccione un técnico'); return; }
    if (!notas) { mostrarNotificacion('warning', 'Advertencia', 'Escriba una descripción'); return; }
    if (valor <= 0) { mostrarNotificacion('warning', 'Advertencia', 'Ingrese un valor mayor a 0'); return; }

    var tec = tecnicosGlobal.find(t => String(t.id) === tecSel.value);
    try {
        var servicios = JSON.parse(document.getElementById('edit-servicios-json').value || '[]');
        if (!Array.isArray(servicios)) servicios = [];
        servicios.push({
            nombre: notas,
            descripcion: notas,
            precio_final: valor,
            tipo_comision: tipo,
            tecnico_id: parseInt(tecSel.value),
            tecnico_nombre: tec ? (tec.nombre + (tec.apellido ? ' ' + tec.apellido : '')) : '',
            comision_porcentaje: tec ? (tec.comision_porcentaje || 40) : 40
        });
        document.getElementById('edit-servicios-json').value = JSON.stringify(servicios);
        renderizarServiciosEditar(servicios);
        recalcularTotalEditar();
        document.getElementById('edit-diag-nuevo-notas').value = '';
        document.getElementById('edit-diag-nuevo-valor').value = '';
        document.getElementById('edit-diag-nuevo-notas').focus();
    } catch(e) {
        mostrarNotificacion('error', 'Error', 'Error al agregar item');
    }
}

function toggleEdicionManualServicios() {
    var div = document.getElementById('edit-servicios-manual');
    var isHidden = div.style.display === 'none';
    div.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
        document.getElementById('edit-servicios-json-manual').value = document.getElementById('edit-servicios-json').value;
    } else {
        try {
            var parsed = JSON.parse(document.getElementById('edit-servicios-json-manual').value || '[]');
            document.getElementById('edit-servicios-json').value = JSON.stringify(parsed);
            renderizarServiciosEditar(parsed);
            recalcularTotalEditar();
        } catch(e) {
            mostrarNotificacion('error', 'JSON Inválido', 'Revisá el formato del JSON');
        }
    }
}

function toggleAutoTotalEditar() {
    var toggle = document.getElementById('edit-auto-total');
    var campoTotal = document.getElementById('edit-monto-total');
    var label = document.getElementById('edit-auto-total-label');
    var hint = document.getElementById('edit-total-hint');
    if (toggle.checked) {
        // Modo automático: recalcular y marcar como auto
        campoTotal.removeAttribute('data-manual');
        campoTotal.readOnly = true;
        campoTotal.style.backgroundColor = '#e9ecef';
        if (label) label.textContent = 'Auto';
        if (hint) hint.textContent = 'Auto = Servicios + Costos Adicionales';
        recalcularTotalEditar();
    } else {
        // Modo manual: permitir edición libre
        campoTotal.setAttribute('data-manual', 'true');
        campoTotal.readOnly = false;
        campoTotal.style.backgroundColor = '#fff3cd';
        if (label) label.textContent = 'Manual';
        if (hint) hint.textContent = 'Ingresá el total manualmente';
    }
}

async function guardarEdicionOrden() {
    var ordenId = document.getElementById('edit-orden-id').value;
    var patente = document.getElementById('edit-patente').value.toUpperCase().replace(/\s+/g, '');
    var cliente = document.getElementById('edit-cliente').value.trim();
    if (!patente || !cliente) { mostrarNotificacion('warning', 'Advertencia', 'Patente y Nombre son obligatorios'); return; }
    var sj = document.getElementById('edit-servicios-json').value.trim();
    if (sj) { try { JSON.parse(sj); } catch(e) { mostrarNotificacion('error', 'Error JSON', 'JSON de servicios inválido'); return; } }

    // Calcular total de servicios
    var totalServicios = 0;
    try { var ss = JSON.parse(sj || '[]'); if(Array.isArray(ss)) ss.forEach(function(x){ totalServicios += Number(x.precio_final||x.precio_sugerido)||0; }); } catch(e){}

    // Calcular total de costos adicionales
    var totalCostos = 0;
    if (window._editCostosAdicionales) {
        window._editCostosAdicionales.forEach(function(c){ totalCostos += Number(c.monto || 0); });
    }

    // Determinar si el total es automático o manual
    var toggleAuto = document.getElementById('edit-auto-total');
    var esAuto = toggleAuto ? toggleAuto.checked : true;
    var totalCalculado = totalServicios + totalCostos;
    var valorCampoTotal = parseFloat(document.getElementById('edit-monto-total').value) || 0;
    var mt;
    if (esAuto && totalCalculado > 0) {
        // Auto-calcular: servicios + costos adicionales (solo si da > 0)
        mt = totalCalculado;
    } else {
        // Manual o auto-cálculo da 0: usar el valor del campo
        mt = valorCampoTotal;
    }

    var ma = parseFloat(document.getElementById('edit-monto-abono').value) || 0;
    var d = { orden_id: parseInt(ordenId), cliente_id: parseInt(document.getElementById('edit-cliente-id').value)||null, vehiculo_id: parseInt(document.getElementById('edit-vehiculo-id').value)||null,
        cliente: cliente, cliente_apellido: document.getElementById('edit-cliente-apellido').value.trim(), rut: document.getElementById('edit-rut').value.trim(), telefono: document.getElementById('edit-telefono').value.trim(), direccion: document.getElementById('edit-direccion').value.trim(),
        estado: document.getElementById('edit-estado').value,
        estado_trabajo: document.getElementById('edit-estado-trabajo').value,
        tecnico_asignado_id: parseInt(document.getElementById('edit-tecnico-asignado').value) || null,
        fecha_programada: document.getElementById('edit-fecha-programada').value || null,
        hora_programada: document.getElementById('edit-hora-programada').value || null,
        patente: patente, marca: document.getElementById('edit-marca').value.trim(), modelo: document.getElementById('edit-modelo').value.trim(), color: document.getElementById('edit-color').value.trim(),
        anio: parseInt(document.getElementById('edit-anio').value)||null, cilindrada: document.getElementById('edit-cilindrada').value.trim(), combustible: document.getElementById('edit-combustible').value.trim(),
        kilometraje: document.getElementById('edit-kilometraje').value.trim(), nivel_combustible: document.getElementById('edit-nivel-combustible').value,
        fecha_ingreso: document.getElementById('edit-fecha-ingreso').value, hora_ingreso: document.getElementById('edit-hora-ingreso').value, recepcionista: document.getElementById('edit-recepcionista').value.trim(),
        servicios_seleccionados: sj||null,
        monto_total: mt, monto_total_manual: !esAuto, monto_abono: ma, metodo_pago: document.getElementById('edit-metodo-pago').value };
    try { mostrarLoading(true);
        var r = await fetch(API_BASE + '/editar-orden', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(d) });
        var data = await r.json();
        if (data.success) { mostrarNotificacion('success', 'Orden Actualizada', 'Cambios guardados correctamente');
            var me = bootstrap.Modal.getInstance(document.getElementById('modalEditarOrden')); if(me) me.hide();
            // Recargar datos frescos: re-buscar si hay patente, sino cargar todas
            var patenteBusqueda = document.getElementById('buscador-patente') ? document.getElementById('buscador-patente').value.trim() : '';
            if (patenteBusqueda) { buscarOrdenes(); } else { cargarTodasLasOrdenes(); }
        } else { mostrarNotificacion('error', 'Error', data.error || 'No se pudo actualizar'); }
    } catch(e) { mostrarNotificacion('error', 'Error', 'Error de conexión'); }
    finally { mostrarLoading(false); }
}

// ============================================
// CALENDARIO DE AGENDAMIENTO POR TÉCNICO
// FullCalendar v6
// ============================================

let calendarInstance = null;
let calendarioEventos = [];
let _calModalBodyOriginal = null;
let _calModalFooterOriginal = null;
let _calModalHeaderOriginal = null;

async function inicializarCalendario() {
    // Guardar HTML original del modal para restaurarlo después de vista de cita IA
    const modalEl = document.getElementById('modalCalendarioEvento');
    if (modalEl && !_calModalBodyOriginal) {
        const body = modalEl.querySelector('.modal-body');
        const footer = modalEl.querySelector('.modal-footer');
        const header = modalEl.querySelector('.modal-header');
        if (body) _calModalBodyOriginal = body.innerHTML;
        if (footer) _calModalFooterOriginal = footer.innerHTML;
        if (header) _calModalHeaderOriginal = header.innerHTML;
    }

    // Cargar técnicos en los selects
    await cargarTecnicosCalendario();
    // Cargar órdenes disponibles para asociar
    await cargarOrdenesParaAsociar();

    // Si el calendario ya existe, solo refrescar
    if (calendarInstance) {
        calendarInstance.refetchEvents();
        cargarOrdenesBot();
        return;
    }

    const calendarEl = document.getElementById('fullcalendar');
    if (!calendarEl) return;

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        locale: 'es',
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
        },
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día',
            list: 'Lista'
        },
        height: 'auto',
        nowIndicator: true,
        editable: true,         // Permite drag & drop
        droppable: true,
        eventDurationEditable: true,
        slotMinTime: '07:00:00',
        slotMaxTime: '21:00:00',
        firstDay: 1,            // Lunes primero
        // Cargar eventos desde la API
        events: function(info, successCallback, failureCallback) {
            cargarEventosCalendario(info.startStr, info.endStr)
                .then(eventos => successCallback(eventos))
                .catch(err => {
                    console.error('Error cargando eventos:', err);
                    failureCallback(err);
                });
        },
        // Click en evento = editar
        eventClick: function(info) {
            info.jsEvent.preventDefault();
            editarEventoCalendario(info.event);
        },
        // Al mover evento (drag) = actualizar fechas
        eventDrop: function(info) {
            actualizarFechasEvento(info.event);
        },
        // Al resizear evento = actualizar fechas
        eventResize: function(info) {
            actualizarFechasEvento(info.event);
        },
        // Click en día vacío = crear evento rápido
        dateClick: function(info) {
            abrirModalNuevoEvento(info.dateStr);
        },
        // Mostrar papelera al empezar a arrastrar
        eventDragStart: function(info) {
            const trash = document.getElementById('cal-trash-zone');
            if (trash) trash.classList.add('visible');
        },
        // Detectar si se soltó sobre la papelera
        eventDragStop: function(info) {
            const trash = document.getElementById('cal-trash-zone');
            if (trash) trash.classList.remove('visible', 'hover');

            // Verificar si el evento se soltó sobre la papelera
            if (isOverTrash(info.jsEvent.clientX, info.jsEvent.clientY)) {
                eliminarEventoPorDrag(info.event);
            }
        },
        // Tooltip con datos del vehículo al pasar el mouse
        eventDidMount: function(info) {
            const props = info.event.extendedProps;
            const colorVeh = props.colorVehiculo;
            const marca = props.marca;
            const modelo = props.modelo;
            const placa = props.patentePlaca;
            const cliente = props.clienteNombre;
            const tecnico = props.tecnicoNombre;
            const estado = props.estadoTrabajo || props.estado;

            let tooltipHtml = '<div style="font-size:0.82rem; line-height:1.4;">';
            if (info.event.title) tooltipHtml += '<strong>' + info.event.title + '</strong><br>';
            if (marca || modelo) tooltipHtml += '🚗 ' + [marca, modelo].filter(Boolean).join(' ');
            if (colorVeh) {
                const colorHex = colorVeh.startsWith('#') ? colorVeh : '#' + colorVeh;
                tooltipHtml += ' <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:' + colorHex + ';border:1px solid #333;vertical-align:middle;"></span> ' + colorVeh;
            }
            tooltipHtml += '<br>';
            if (placa) tooltipHtml += '🏷️ ' + placa + '<br>';
            if (cliente) tooltipHtml += '👤 ' + cliente + '<br>';
            if (tecnico) tooltipHtml += '🔧 ' + tecnico + '<br>';
            if (estado) tooltipHtml += '📋 ' + estado;
            tooltipHtml += '</div>';

            info.el.setAttribute('title', '');
            info.el.setAttribute('data-bs-toggle', 'tooltip');
            info.el.setAttribute('data-bs-html', 'true');
            info.el.setAttribute('data-bs-placement', 'top');
            info.el.setAttribute('data-bs-original-title', tooltipHtml);
            new bootstrap.Tooltip(info.el, { html: true, placement: 'top' });
        }
    });

    calendarInstance.render();

    // Cargar órdenes del bot IA al inicializar el calendario
    iniciarOrdenesBotAutoRefresh();
}

async function cargarTecnicosCalendario() {
    try {
        const response = await fetch(`${API_BASE}/admin/tecnicos`);
        const data = await response.json();
        if (data.success && data.tecnicos) {
            // Filtro principal
            const selectFiltro = document.getElementById('cal-filtro-tecnico');
            if (selectFiltro) {
                let html = '<option value="">Todos los técnicos</option>';
                data.tecnicos.forEach(t => {
                    html += `<option value="${t.id}">${t.nombre}</option>`;
                });
                selectFiltro.innerHTML = html;
            }
            // Select del modal
            const selectModal = document.getElementById('cal-tecnico');
            if (selectModal) {
                let html = '<option value="">Seleccionar...</option>';
                data.tecnicos.forEach(t => {
                    html += `<option value="${t.id}">${t.nombre}</option>`;
                });
                selectModal.innerHTML = html;
            }
        }
    } catch (e) {
        console.error('Error cargando técnicos para calendario:', e);
    }
}

async function cargarOrdenesParaAsociar() {
    try {
        // Cargar OTs disponibles (aprobadas sin técnico) y OTs Express sin asignar
        const [respDisponibles, respExpress] = await Promise.all([
            fetch(`${API_BASE}/admin/ordenes-disponibles`),
            fetch(`${API_BASE}/admin/ordenes-express`)
        ]);
        const dataDisponibles = await respDisponibles.json();
        const dataExpress = await respExpress.json();

        const select = document.getElementById('cal-orden-id');
        if (!select) return;

        let html = '<option value="">Sin orden asociada</option>';

        // OTs firmadas/aprobadas sin técnico asignado
        if (dataDisponibles.success && dataDisponibles.ordenes?.length > 0) {
            html += '<optgroup label="OT Aprobadas (sin técnico)">';
            dataDisponibles.ordenes.forEach(o => {
                const num = String(o.numero_orden).padStart(6, '0');
                html += `<option value="${o.id}">OT#${num} - ${o.patente_placa || ''} ${o.cliente_nombre || ''}</option>`;
            });
            html += '</optgroup>';
        }

        // OTs Express SOLO las que NO tienen técnico asignado
        const expressSinAsignar = (dataExpress.ordenes || []).filter(o =>
            !o.tecnico_asignado_id || o.tecnico_asignado_id === '' || o.tecnico_asignado_id === null
        );
        if (dataExpress.success && expressSinAsignar.length > 0) {
            html += '<optgroup label="OT Express (sin técnico)">';
            expressSinAsignar.forEach(o => {
                const num = String(o.numero_orden).padStart(6, '0');
                html += `<option value="${o.id}">EXP${num} - ${o.patente_placa || ''} ${o.cliente_nombre || ''}</option>`;
            });
            html += '</optgroup>';
        }

        select.innerHTML = html;
    } catch (e) {
        console.error('Error cargando órdenes para asociar:', e);
    }
}

async function cargarEventosCalendario(startStr, endStr) {
    try {
        const tecnicoId = document.getElementById('cal-filtro-tecnico')?.value || '';
        const tipo = document.getElementById('cal-filtro-tipo')?.value || '';

        let url = `${API_BASE}/admin/calendario?inicio=${startStr.split('T')[0]}&fin=${endStr.split('T')[0]}&ordenes=1`;
        if (tecnicoId) url += `&tecnico_id=${tecnicoId}`;
        if (tipo) url += `&tipo=${tipo}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data.success) return [];

        const eventos = [];

        // 1. Eventos de AgendaTecnicos (mostrar TODOS los estados)
        (data.eventos || []).forEach(ev => {
            // Construir título descriptivo con datos del vehículo
            let tituloEvento = ev.titulo || '';
            const marcaModelo = [ev.marca, ev.modelo].filter(Boolean).join(' ');
            if (marcaModelo) tituloEvento += ' | ' + marcaModelo;
            if (ev.patente_placa) tituloEvento += ' ' + ev.patente_placa;
            if (ev.cliente_nombre) tituloEvento += ' - ' + ev.cliente_nombre;
            if (ev.tecnico_nombre) tituloEvento += ' (' + ev.tecnico_nombre + ')';

            eventos.push({
                id: 'agenda-' + ev.id,
                title: tituloEvento,
                start: ev.fecha_inicio,
                end: ev.fecha_fin,
                color: ev.color || '#0d6efd',
                extendedProps: {
                    tipo: 'agenda',
                    agendaId: ev.id,
                    tecnicoId: ev.tecnico_id,
                    tecnicoNombre: ev.tecnico_nombre,
                    ordenId: ev.orden_id,
                    tipoServicio: ev.tipo_servicio,
                    observaciones: ev.observaciones,
                    estado: ev.estado,
                    numeroOrden: ev.numero_orden,
                    marca: ev.marca || '',
                    modelo: ev.modelo || '',
                    colorVehiculo: ev.color_vehiculo || '',
                    clienteNombre: ev.cliente_nombre || '',
                    patentePlaca: ev.patente_placa || ''
                }
            });
        });

        // 2. OTs con fecha_programada que NO tienen evento en AgendaTecnicos
        // Se pueden mover arrastrando (actualiza fecha_programada directamente)
        const agendaOrdenIds = new Set((data.eventos || []).filter(e => e.orden_id).map(e => e.orden_id));
        (data.ordenes_programadas || []).forEach(o => {
            // Si ya tiene evento en agenda, no duplicar
            if (agendaOrdenIds.has(o.id)) return;

            const fecha = o.fecha_programada;
            const hora = o.hora_programada || '09:00';
            const esExpress = o.es_express === 1;
            const inicio = fecha + 'T' + hora;
            // Duración por defecto 2 horas
            const finDate = new Date(inicio);
            finDate.setHours(finDate.getHours() + 2);
            const fin = finDate.toISOString();

            // Construir título descriptivo con datos del vehículo
            let tituloOT = (esExpress ? '⚡ ' : '🔧 ') + 'OT#' + String(o.numero_orden).padStart(6, '0');
            const marcaModelo = [o.marca, o.modelo].filter(Boolean).join(' ');
            if (marcaModelo) tituloOT += ' ' + marcaModelo;
            if (o.patente_placa) tituloOT += ' ' + o.patente_placa;
            if (o.cliente_nombre) tituloOT += ' - ' + o.cliente_nombre;
            if (o.tecnico_nombre) tituloOT += ' (' + o.tecnico_nombre + ')';

            eventos.push({
                id: 'orden-' + o.id,
                title: tituloOT,
                start: inicio,
                end: fin,
                color: esExpress ? '#a80000' : '#0d6efd',
                borderColor: esExpress ? '#ff6b00' : '#0d6efd',
                extendedProps: {
                    tipo: 'orden',
                    ordenId: o.id,
                    tecnicoId: o.tecnico_asignado_id,
                    tecnicoNombre: o.tecnico_nombre,
                    esExpress: esExpress,
                    clienteNombre: o.cliente_nombre,
                    direccion: o.direccion,
                    estadoTrabajo: o.estado_trabajo,
                    marca: o.marca || '',
                    modelo: o.modelo || '',
                    colorVehiculo: o.color_vehiculo || '',
                    patentePlaca: o.patente_placa || ''
                }
            });
        });

        // 3. Citas agendadas via Chat IA (Worker sgc-citas)
        try {
            const citasResp = await fetch('https://sgc-citas.correo36000.workers.dev/api/citas/rango?inicio=' + startStr.split('T')[0] + '&fin=' + endStr.split('T')[0]);
            const citasData = await citasResp.json();
            if (citasData.success && citasData.citas) {
                citasData.citas.forEach(c => {
                    const hora = c.hora_cita || '09:00';
                    const inicio = c.fecha_cita + 'T' + hora;
                    const durMin = c.duracion_minutos || 60;
                    const finDate = new Date(inicio);
                    finDate.setMinutes(finDate.getMinutes() + durMin);
                    const fin = finDate.toISOString();

                    const esChat = (c.canal === 'chat');
                    const tipoAtencion = c.tipo_atencion || 'taller';
                    const atencionLabel = tipoAtencion === 'domicilio' ? '🏠 Domicilio' : '🔧 Taller';
                    const titulo = (esChat ? '📅 ' : '📋 ') + atencionLabel + ': ' + c.servicio;
                    const cliente = c.nombre_cliente || '';
                    const patente = c.patente || '';
                    const eventColor = tipoAtencion === 'domicilio' ? '#2563eb' : '#16a34a';

                    eventos.push({
                        id: 'cita-' + c.id,
                        title: titulo + (patente ? ' | ' + patente : '') + (cliente ? ' - ' + cliente : ''),
                        start: inicio,
                        end: fin,
                        color: eventColor,
                        borderColor: tipoAtencion === 'domicilio' ? '#1d4ed8' : '#15803d',
                        editable: false,
                        durationEditable: false,
                        extendedProps: {
                            tipo: 'cita_ia',
                            citaId: c.id,
                            patentePlaca: patente || '',
                            clienteNombre: cliente || '',
                            telefono: c.telefono || '',
                            servicio: c.servicio || '',
                            observaciones: c.observaciones || '',
                            estado: c.estado || 'Pendiente',
                            canal: c.canal || 'chat',
                            tipoAtencion: tipoAtencion,
                            direccion: c.direccion || '',
                            referenciaDireccion: c.referencia_direccion || '',
                            marca: c.marca || '',
                            modelo: c.modelo || '',
                            colorVehiculo: c.color || '',
                            fechaCreacion: c.created_at ? formatearFechaCita(c.created_at) : '',
                            fechaCita: c.fecha_cita || '',
                            horaCita: c.hora_cita || '',
                            estadoAprobacion: c.estado_aprobacion || 'pendiente',
                            anioVehiculo: c.anio || ''
                        }
                    });
                });
            }
        } catch (e) {
            console.error('Error cargando citas IA:', e);
        }

        calendarioEventos = eventos;
        return eventos;
    } catch (e) {
        console.error('Error cargando eventos del calendario:', e);
        return [];
    }
}

function recargarCalendario() {
    if (calendarInstance) {
        calendarInstance.refetchEvents();
    }
}

// ============================================
// MODAL: Nuevo Evento
// ============================================
function abrirModalNuevoEvento(fechaStr) {
    // Limpiar campos
    document.getElementById('cal-evento-id').value = '';
    document.getElementById('cal-titulo').value = '';
    document.getElementById('cal-tecnico').value = '';
    document.getElementById('cal-tipo-servicio').value = 'taller';
    document.getElementById('cal-observaciones').value = '';
    document.getElementById('cal-orden-id').value = '';
    document.getElementById('cal-btn-eliminar').style.display = 'none';
    document.getElementById('cal-btn-ver-ot').style.display = 'none';
    document.getElementById('modal-cal-titulo').textContent = 'Nuevo Evento';

    // Si viene fecha del click en calendario, setearla
    if (fechaStr) {
        let inicio, fin;
        if (fechaStr.includes('T')) {
            inicio = fechaStr.substring(0, 16);
            const d = new Date(fechaStr);
            d.setHours(d.getHours() + 1);
            fin = d.toISOString().substring(0, 16);
        } else {
            inicio = fechaStr + 'T09:00';
            fin = fechaStr + 'T11:00';
        }
        document.getElementById('cal-fecha-inicio').value = inicio;
        document.getElementById('cal-fecha-fin').value = fin;
    } else {
        // Default: hoy
        const hoy = getChileDate();
        document.getElementById('cal-fecha-inicio').value = hoy + 'T09:00';
        document.getElementById('cal-fecha-fin').value = hoy + 'T11:00';
    }

    const modal = new bootstrap.Modal(document.getElementById('modalCalendarioEvento'));
    modal.show();
}

// ============================================
// RESTAURAR modal del calendario (después de vista de Cita IA)
// ============================================
function restaurarModalCalendario() {
    const modalEl = document.getElementById('modalCalendarioEvento');
    if (!modalEl) return;
    const body = modalEl.querySelector('.modal-body');
    const footer = modalEl.querySelector('.modal-footer');
    const header = modalEl.querySelector('.modal-header');
    if (body && _calModalBodyOriginal) body.innerHTML = _calModalBodyOriginal;
    if (footer && _calModalFooterOriginal) footer.innerHTML = _calModalFooterOriginal;
    if (header && _calModalHeaderOriginal) header.innerHTML = _calModalHeaderOriginal;
    // Actualizar técnicos en el select (pues el HTML restaurado tiene el select vacío)
    cargarTecnicosCalendario();
}

// ============================================
// MODAL: Editar Evento
// ============================================
function editarEventoCalendario(event) {
    const props = event.extendedProps;

    // Si es una Cita IA (solo lectura) — mostrar modal informativo
    if (props.tipo === 'cita_ia') {
        const modalBody = document.getElementById('modalCalendarioEvento').querySelector('.modal-body');
        const modalFooter = document.getElementById('modalCalendarioEvento').querySelector('.modal-footer');
        if (modalBody) {
            modalBody.innerHTML = `
                <div style="padding:10px 0;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                        <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#16a34a,#22c55e);display:flex;align-items:center;justify-content:center;">
                            <i class="fas fa-calendar-check" style="color:#fff;font-size:1.2rem;"></i>
                        </div>
                        <div>
                            <h5 style="margin:0;font-weight:700;color:#16a34a;">Cita Agendada via Chat IA</h5>
                            <small style="color:#888;">ID: ${props.citaId} | Canal: ${props.canal}</small>
                        </div>
                    </div>
                    <div style="background:#f8f9fa;border-radius:10px;padding:16px;">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.88rem;">
                            <div><strong>📍 Atención:</strong><br>${props.tipoAtencion === 'domicilio' ? '🏠 A Domicilio' : '🔧 En Taller'}</div>
                            <div><strong>🚗 Patente:</strong><br>${props.patentePlaca || 'N/A'}</div>
                            <div><strong>👤 Cliente:</strong><br>${props.clienteNombre || 'N/A'}</div>
                            <div><strong>📞 Teléfono:</strong><br>${props.telefono || 'N/A'}</div>
                            <div><strong>🔧 Servicio:</strong><br>${props.servicio || 'N/A'}</div>
                            <div><strong>📅 Fecha Cita:</strong><br>${event.start ? event.start.toLocaleDateString('es-CL') : 'N/A'}</div>
                            <div><strong>⏰ Hora:</strong><br>${event.start ? event.start.toLocaleTimeString('es-CL', {hour:'2-digit',minute:'2-digit'}) : 'N/A'}</div>
                            ${props.fechaCreacion ? '<div><strong>🕐 Generada:</strong><br>' + props.fechaCreacion + '</div>' : ''}
                            ${props.marca ? '<div><strong>🏷️ Marca/Modelo:</strong><br>' + props.marca + ' ' + (props.modelo || '') + '</div>' : ''}
                            ${props.colorVehiculo ? '<div><strong>🎨 Color:</strong><br>' + props.colorVehiculo + '</div>' : ''}
                        </div>
                        ${props.tipoAtencion === 'domicilio' && props.direccion ? '<div style="margin-top:12px;padding-top:12px;border-top:1px solid #dee2e6;"><strong>📍 Dirección:</strong><br>' + props.direccion + (props.referenciaDireccion ? ' | Ref: ' + props.referenciaDireccion : '') + '</div>' : ''}
                        ${props.observaciones ? '<div style="margin-top:12px;padding-top:12px;border-top:1px solid #dee2e6;"><strong>📝 Requerimientos:</strong><br>' + props.observaciones + '</div>' : ''}
                    </div>
                    <div style="margin-top:12px;padding:10px;background:#e8f5e9;border-radius:8px;font-size:0.82rem;color:#15803d;">
                        <i class="fas fa-info-circle"></i> Esta cita fue agendada automaticamente via el Chat IA de mecanico247.com. La orden correspondiente fue enviada a Globalprov2 como orden express.
                    </div>
                </div>
            `;
        }
        if (modalFooter) {
            modalFooter.innerHTML = `
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
            `;
        }
        document.getElementById('modal-cal-titulo').textContent = '📅 Detalle de Cita IA';
        const modal = new bootstrap.Modal(document.getElementById('modalCalendarioEvento'));
        modal.show();
        // Restaurar el modal cuando se cierre
        document.getElementById('modalCalendarioEvento').addEventListener('hidden.bs.modal', function handler() {
            restaurarModalCalendario();
            document.getElementById('modalCalendarioEvento').removeEventListener('hidden.bs.modal', handler);
        });
        return;
    }

    if (props.tipo === 'orden') {
        // Si es una OT programada sin evento de agenda, abrir la OT
        if (props.ordenId) {
            verOrden(props.ordenId);
        } else {
            mostrarNotificacion('error', 'Error', 'Esta orden no tiene un ID válido');
        }
        return;
    }

    // Si es un evento de agenda SIN OT, abrir modal para editar/eliminar
    // Si es un evento de agenda CON OT, abrir modal con opción de ver OT y eliminar evento

    // Es un evento de agenda - abrir modal de edición
    document.getElementById('cal-evento-id').value = props.agendaId;
    document.getElementById('cal-titulo').value = event.title.replace(/ - .+$/, ''); // Quitar nombre técnico
    document.getElementById('cal-tecnico').value = props.tecnicoId || '';
    document.getElementById('cal-tipo-servicio').value = props.tipoServicio || 'taller';
    document.getElementById('cal-observaciones').value = props.observaciones || '';
    document.getElementById('cal-orden-id').value = props.ordenId || '';
    document.getElementById('cal-btn-eliminar').style.display = 'inline-block';
    // Mostrar botón Ver OT si tiene orden asociada
    document.getElementById('cal-btn-ver-ot').style.display = props.ordenId ? 'inline-block' : 'none';
    document.getElementById('modal-cal-titulo').textContent = 'Editar Evento';

    // Fechas
    const inicio = event.start ? event.start.toISOString().substring(0, 16) : '';
    const fin = event.end ? event.end.toISOString().substring(0, 16) : '';
    document.getElementById('cal-fecha-inicio').value = inicio;
    document.getElementById('cal-fecha-fin').value = fin;

    const modal = new bootstrap.Modal(document.getElementById('modalCalendarioEvento'));
    modal.show();
}

// ============================================
// GUARDAR Evento (crear o actualizar)
// ============================================
async function guardarEventoCalendario() {
    const eventoId = document.getElementById('cal-evento-id').value;
    const titulo = document.getElementById('cal-titulo').value.trim();
    const tecnicoId = document.getElementById('cal-tecnico').value;
    const tipoServicio = document.getElementById('cal-tipo-servicio').value;
    const fechaInicio = document.getElementById('cal-fecha-inicio').value;
    const fechaFin = document.getElementById('cal-fecha-fin').value;
    const observaciones = document.getElementById('cal-observaciones').value.trim();
    const ordenId = document.getElementById('cal-orden-id').value;

    if (!titulo) { mostrarNotificacion('error', 'Error', 'Ingresa un título'); return; }
    if (!tecnicoId) { mostrarNotificacion('error', 'Error', 'Selecciona un técnico'); return; }
    if (!fechaInicio) { mostrarNotificacion('error', 'Error', 'Selecciona fecha de inicio'); return; }
    if (!fechaFin) { mostrarNotificacion('error', 'Error', 'Selecciona fecha de fin'); return; }

    const btn = document.getElementById('cal-btn-guardar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Guardando...';

    try {
        const isEdit = !!eventoId;
        const method = isEdit ? 'PUT' : 'POST';
        const body = {
            titulo,
            tecnico_id: parseInt(tecnicoId),
            tipo_servicio: tipoServicio,
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
            observaciones: observaciones,
            orden_id: ordenId ? parseInt(ordenId) : null
        };

        if (isEdit) {
            body.id = parseInt(eventoId);
        }

        const response = await fetch(`${API_BASE}/admin/calendario`, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.success) {
            mostrarNotificacion('success', isEdit ? 'Evento Actualizado' : 'Evento Creado', isEdit ? 'El evento fue actualizado' : 'Nuevo evento agregado a la agenda');
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalCalendarioEvento'));
            if (modal) modal.hide();
            recargarCalendario();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo guardar');
        }
    } catch (e) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save me-1"></i>Guardar';
    }
}

// ============================================
// ELIMINAR Evento
// ============================================
async function eliminarEventoCalendario() {
    const eventoId = document.getElementById('cal-evento-id').value;
    if (!eventoId) return;

    if (!confirm('¿Eliminar este evento de la agenda? La OT asociada quedará libre para reasignar (se quitará el técnico y se reseteará el estado).')) return;

    try {
        const response = await fetch(`${API_BASE}/admin/calendario?id=${eventoId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            mostrarNotificacion('success', 'Eliminado', 'Evento eliminado. La OT asociada quedó libre para reasignar.');
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalCalendarioEvento'));
            if (modal) modal.hide();
            recargarCalendario();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo eliminar');
        }
    } catch (e) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

// ============================================
// VER OT desde modal de calendario
// ============================================
function verOrdenDesdeCalendario() {
    const ordenId = document.getElementById('cal-orden-id').value;
    if (!ordenId) {
        mostrarNotificacion('warning', 'Sin OT', 'Este evento no tiene orden asociada');
        return;
    }
    // Cerrar modal del calendario
    const modal = bootstrap.Modal.getInstance(document.getElementById('modalCalendarioEvento'));
    if (modal) modal.hide();
    // Abrir la OT
    verOrden(ordenId);
}

// ============================================
// DRAG & DROP: Actualizar fechas
// ============================================
async function actualizarFechasEvento(event) {
    const props = event.extendedProps;

    const inicio = event.start ? event.start.toISOString().substring(0, 19) : '';
    const fin = event.end ? event.end.toISOString().substring(0, 19) : '';

    try {
        if (props.tipo === 'orden') {
            // OT programada sin agenda - actualizar fecha_programada directamente
            const resp = await fetch(`${API_BASE}/admin/calendario`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo: 'orden',
                    orden_id: props.ordenId,
                    fecha_inicio: inicio,
                    fecha_fin: fin
                })
            });
            const data = await resp.json();
            if (data.success) {
                mostrarNotificacion('success', 'Actualizado', 'Fecha de OT actualizada correctamente');
            } else {
                mostrarNotificacion('error', 'Error', data.error || 'No se pudo mover');
                event.revert();
            }
        } else {
            // Evento de agenda - actualizar en AgendaTecnicos
            const resp = await fetch(`${API_BASE}/admin/calendario`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: props.agendaId,
                    fecha_inicio: inicio,
                    fecha_fin: fin
                })
            });
            const data = await resp.json();
            if (data.success) {
                mostrarNotificacion('success', 'Actualizado', 'Evento movido correctamente');
            } else {
                mostrarNotificacion('error', 'Error', data.error || 'No se pudo mover');
                event.revert();
            }
        }
    } catch (e) {
        mostrarNotificacion('error', 'Error', 'Error al mover el evento');
        event.revert();
    }
}

// ============================================
// PAPELERA: Detectar si el mouse está sobre la papelera
// ============================================
function isOverTrash(x, y) {
    const trash = document.getElementById('cal-trash-zone');
    if (!trash) return false;
    const rect = trash.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

// ============================================
// PAPELERA: Eliminar evento arrastrándolo a la papelera
// ============================================
async function eliminarEventoPorDrag(event) {
    const props = event.extendedProps;
    const titulo = event.title || 'este evento';

    if (props.tipo === 'orden') {
        // OT programada sin agenda - liberar la OT (des-asignar técnico + resetear estado)
        if (!confirm(`¿Quitar asignación de "${titulo}"? La OT quedará libre para reasignar.`)) {
            event.revert();
            return;
        }
        try {
            const response = await fetch(`${API_BASE}/admin/liberar-orden`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orden_id: props.ordenId })
            });
            const data = await response.json();
            if (data.success) {
                event.remove();
                mostrarNotificacion('success', 'OT Liberada', `"${titulo}" quedó libre para reasignar`);
                recargarCalendario();
            } else {
                mostrarNotificacion('error', 'Error', data.error || 'No se pudo liberar');
                event.revert();
            }
        } catch (e) {
            mostrarNotificacion('error', 'Error', 'Error al liberar la OT');
            event.revert();
        }
        return;
    }

    // Evento de agenda - eliminar normalmente
    if (!confirm(`¿Eliminar "${titulo}" de la agenda? La OT asociada quedará libre para reasignar.`)) {
        event.revert();
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/calendario?id=${props.agendaId}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (data.success) {
            // Remover el evento visualmente del calendario
            event.remove();
            mostrarNotificacion('success', 'Eliminado', `"${titulo}" eliminado. La OT quedó libre para reasignar.`);
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo eliminar');
            event.revert();
        }
    } catch (e) {
        mostrarNotificacion('error', 'Error', 'Error de conexión al eliminar');
        event.revert();
    }
}

// ═══════════════════════════════════════════════════════════════
// ÓRDENES DEL BOT IA — Aprobar / Rechazar
// ═══════════════════════════════════════════════════════════════
const CITAS_API = 'https://sgc-citas.correo36000.workers.dev/api/citas-admin';
let ordenesBotAutoRefresh = null;
let _ultimoPendientesCount = -1;
let _ultimoPendientesIds = [];
let _notificacionPendientePedida = false;

// ═══════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS — Nuevas citas del Bot IA
// ═══════════════════════════════════════════════════════════════

function solicitarPermisoNotificaciones() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied' || _notificacionPendientePedida) return;
    _notificacionPendientePedida = true;
    Notification.requestPermission().then(function(perm) {
        console.log('Permiso notificaciones:', perm);
    });
}

function enviarPushNuevaCita(cita) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const tipo = cita.tipo_atencion === 'domicilio' ? '🏠 Domicilio' : '🔧 Taller';
    const cliente = cita.nombre_cliente || 'Cliente';
    const servicio = cita.servicio || 'Servicio';
    const fecha = (cita.fecha_cita || '') + ' ' + (cita.hora_cita || '');

    var notif = new Notification('🤖 Nueva Cita del Bot IA', {
        body: cliente + ' — ' + servicio + '\n' + tipo + ' | ' + fecha,
        icon: 'https://sgc-citas.correo36000.workers.dev/favicon.ico',
        badge: 'https://sgc-citas.correo36000.workers.dev/favicon.ico',
        tag: 'cita-bot-' + cita.id,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200]
    });

    notif.onclick = function() {
        window.focus();
        // Scroll al panel de órdenes bot
        var card = document.getElementById('card-ordenes-bot');
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Asegurar que el panel esté expandido
            var body = document.getElementById('ordenes-bot-body');
            if (body) body.style.display = '';
            var chevron = document.getElementById('ordenes-bot-chevron');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        }
        // El panel siempre muestra pendientes, solo refrescar
        cargarOrdenesBot();
        notif.close();
    };
}

function reproducirSonidoAlerta() {
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
        // Segundo tono
        setTimeout(function() {
            var osc2 = ctx.createOscillator();
            var gain2 = ctx.createGain();
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.frequency.value = 1100;
            osc2.type = 'sine';
            gain2.gain.setValueAtTime(0.3, ctx.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
            osc2.start(ctx.currentTime);
            osc2.stop(ctx.currentTime + 0.8);
        }, 700);
    } catch(e) {
        // AudioContext no soportado, ignorar
    }
}

function detectarNuevasCitas(stats, citas) {
    var pendientesAhora = stats.pendientes || 0;
    var idsAhora = (citas || []).filter(function(c) { return (c.estado_aprobacion || 'pendiente') === 'pendiente'; }).map(function(c) { return c.id; });

    // Primera carga: solo guardar referencia, no notificar
    if (_ultimoPendientesCount === -1) {
        _ultimoPendientesCount = pendientesAhora;
        _ultimoPendientesIds = idsAhora;
        return;
    }

    // Detectar si hay nuevas citas pendientes
    var nuevosIds = idsAhora.filter(function(id) { return _ultimoPendientesIds.indexOf(id) === -1; });

    if (nuevosIds.length > 0) {
        // Hay al menos una cita nueva
        var citasNuevas = (citas || []).filter(function(c) { return nuevosIds.indexOf(c.id) !== -1; });
        citasNuevas.forEach(function(c) {
            enviarPushNuevaCita(c);
        });
        // Sonido (una sola vez por batch)
        reproducirSonidoAlerta();
        // Animación flash en el badge
        var badge = document.getElementById('ordenes-bot-pendientes-badge');
        if (badge) {
            badge.style.animation = 'none';
            badge.offsetHeight; // reflow
            badge.style.animation = 'gp-pulse-badge 0.6s ease 3';
        }
    }

    _ultimoPendientesCount = pendientesAhora;
    _ultimoPendientesIds = idsAhora;
}

function toggleOrdenesBot() {
    const body = document.getElementById('ordenes-bot-body');
    const chevron = document.getElementById('ordenes-bot-chevron');
    if (body.style.display === 'none') {
        body.style.display = '';
        chevron.style.transform = 'rotate(0deg)';
    } else {
        body.style.display = 'none';
        chevron.style.transform = 'rotate(-90deg)';
    }
}

async function cargarOrdenesBot() {
    try {
        // Cargar TODAS para stats y detección de nuevas, pero SOLO pendientes para mostrar arriba
        const [resAll, resPend] = await Promise.all([
            fetch(CITAS_API),
            fetch(CITAS_API + '?estado=pendiente')
        ]);
        const dataAll = await resAll.json();
        const dataPend = await resPend.json();
        if (!dataAll.success) return;

        renderOrdenesBotStats(dataAll.stats);
        renderOrdenesBotList(dataPend.citas || []);

        // Detectar nuevas citas pendientes para notificación push
        detectarNuevasCitas(dataAll.stats, dataAll.citas || []);
    } catch (err) {
        console.error('Error cargando órdenes bot:', err);
        document.getElementById('ordenes-bot-list').innerHTML = '<div class="text-center text-muted p-3">Error de conexión</div>';
    }
}

function renderOrdenesBotStats(stats) {
    const badge = document.getElementById('ordenes-bot-pendientes-badge');
    badge.textContent = stats.pendientes + ' pendientes';
    badge.className = stats.pendientes > 0 ? 'badge bg-warning text-dark ms-2' : 'badge bg-success ms-2';

    document.getElementById('ordenes-bot-stats').innerHTML =
        '<div class="btn-group btn-group-sm">' +
        '<button class="btn btn-outline-success" disabled>' + stats.aprobadas + ' ✅</button>' +
        '<button class="btn btn-outline-warning" disabled>' + stats.pendientes + ' ⏳</button>' +
        '<button class="btn btn-outline-danger" disabled>' + stats.rechazadas + ' ❌</button>' +
        '</div>';
}

function renderOrdenesBotList(citas) {
    const container = document.getElementById('ordenes-bot-list');
    if (!citas.length) {
        container.innerHTML = '<div class="text-center text-muted py-4"><i class="fas fa-check-circle fa-2x mb-2 text-success"></i><br><small>No hay citas pendientes de revisión.</small><br><small class="text-muted">Las citas aprobadas aparecen en la lista debajo del calendario.</small></div>';
        return;
    }

    let html = '';
    citas.forEach(function(c) {
        const estado = c.estado_aprobacion || 'pendiente';
        const tipo = c.tipo_atencion || 'taller';
        const tipoLabel = tipo === 'domicilio' ? '<span class="badge bg-primary">Domicilio</span>' : '<span class="badge bg-success">Taller</span>';
        const estadoLabel = estado === 'pendiente' ? '<span class="badge bg-warning text-dark">Pendiente</span>' :
                           estado === 'aprobada' ? '<span class="badge bg-success">Aprobada</span>' :
                           '<span class="badge bg-danger">Rechazada</span>';
        const vehiculo = [c.marca, c.modelo, c.anio, c.color ? '(' + c.color + ')' : ''].filter(Boolean).join(' ');
        const ordenNum = c.numero_orden_sgc ? 'EXP' + String(c.numero_orden_sgc).padStart(6, '0') : '—';
        const borderColor = estado === 'pendiente' ? '#f59e0b' : estado === 'aprobada' ? '#16a34a' : '#dc2626';

        html += '<div class="card mb-2" style="border-left:4px solid ' + borderColor + ';font-size:0.85rem">';
        html += '<div class="card-body p-2">';
        html += '<div class="d-flex justify-content-between align-items-start mb-1">';
        html += '<div><span class="text-muted">#' + c.id + '</span> ' + tipoLabel + ' ' + estadoLabel + '</div>';
        html += '<small class="text-muted">' + (c.fecha_cita || '') + ' ' + (c.hora_cita || '') + '</small>';
        html += '</div>';

        html += '<div class="row g-1 mb-2" style="font-size:0.82rem">';
        html += '<div class="col-6"><strong>Cliente:</strong> ' + (c.nombre_cliente || '—') + '</div>';
        html += '<div class="col-6"><strong>Tel:</strong> ' + (c.telefono || '—') + '</div>';
        html += '<div class="col-6"><strong>Patente:</strong> ' + (c.patente || '—') + '</div>';
        html += '<div class="col-6"><strong>Vehículo:</strong> ' + (vehiculo || '—') + '</div>';
        html += '<div class="col-6"><strong>Servicio:</strong> ' + (c.servicio || '—') + '</div>';
        html += '<div class="col-6"><strong>Orden:</strong> ' + ordenNum + '</div>';
        if (c.created_at) {
            html += '<div class="col-12"><strong>📅 Generada:</strong> ' + formatearFechaCita(c.created_at) + '</div>';
        }
        if (c.direccion) {
            html += '<div class="col-12"><strong>Dir:</strong> ' + c.direccion + '</div>';
        }
        if (c.observaciones) {
            html += '<div class="col-12 text-muted"><small>Obs: ' + c.observaciones + '</small></div>';
        }
        html += '</div>';

        if (c.motivo_rechazo) {
            html += '<div class="alert alert-danger py-1 px-2 mb-2" style="font-size:0.78rem">Motivo: ' + c.motivo_rechazo + '</div>';
        }

        html += '<div class="d-flex gap-2 justify-content-end">';
        if (estado === 'pendiente') {
            html += '<button class="btn btn-success btn-sm" onclick="aprobarCitaBot(' + c.id + ')"><i class="fas fa-check me-1"></i>Aprobar</button>';
            html += '<button class="btn btn-danger btn-sm" onclick="abrirModalRechazarCitaBot(' + c.id + ')"><i class="fas fa-times me-1"></i>Rechazar</button>';
        } else if (estado === 'aprobada') {
            html += '<button class="btn btn-sm btn-outline-success" disabled><i class="fas fa-check me-1"></i>Aprobada</button>';
        } else {
            html += '<button class="btn btn-sm btn-outline-danger" disabled><i class="fas fa-times me-1"></i>Rechazada</button>';
        }
        html += '</div>';

        html += '</div></div>';
    });

    container.innerHTML = html;
}

async function aprobarCitaBot(id) {
    if (!confirm('¿Aprueba esta cita? Se notificará al cliente por WhatsApp.')) return;
    try {
        const res = await fetch(CITAS_API + '/' + id + '/aprobar', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            mostrarNotificacion('success', 'Cita Aprobada', 'La cita fue aprobada y se envió WhatsApp al cliente.');
            cargarOrdenesBot();
            cargarCitasAceptadas();
            if (calendarInstance) calendarInstance.refetchEvents();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo aprobar');
        }
    } catch (err) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

function abrirModalRechazarCitaBot(id) {
    document.getElementById('rechazar-cita-id').value = id;
    document.getElementById('rechazar-cita-motivo').value = '';
    const modal = new bootstrap.Modal(document.getElementById('modalRechazarCitaBot'));
    modal.show();
}

async function confirmarRechazarCitaBot() {
    const id = document.getElementById('rechazar-cita-id').value;
    const motivo = document.getElementById('rechazar-cita-motivo').value.trim();

    const modal = bootstrap.Modal.getInstance(document.getElementById('modalRechazarCitaBot'));
    if (modal) modal.hide();

    try {
        const res = await fetch(CITAS_API + '/' + id + '/rechazar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo: motivo })
        });
        const data = await res.json();
        if (data.success) {
            mostrarNotificacion('warning', 'Cita Rechazada', 'La cita fue rechazada y se envió WhatsApp al cliente con el número +56939026185.');
            cargarOrdenesBot();
            cargarCitasAceptadas();
            if (calendarInstance) calendarInstance.refetchEvents();
        } else {
            mostrarNotificacion('error', 'Error', data.error || 'No se pudo rechazar');
        }
    } catch (err) {
        mostrarNotificacion('error', 'Error', 'Error de conexión');
    }
}

// Auto-cargar órdenes bot cuando se abre calendario
function iniciarOrdenesBotAutoRefresh() {
    solicitarPermisoNotificaciones();
    cargarOrdenesBot();
    cargarCitasAceptadas();
    if (ordenesBotAutoRefresh) clearInterval(ordenesBotAutoRefresh);
    ordenesBotAutoRefresh = setInterval(function() {
        cargarOrdenesBot();
        cargarCitasAceptadas();
    }, 30000); // 30s para notificaciones más rápidas
}

function detenerOrdenesBotAutoRefresh() {
    if (ordenesBotAutoRefresh) { clearInterval(ordenesBotAutoRefresh); ordenesBotAutoRefresh = null; }
}

// ═══════════════════════════════════════════════════════════════
// UTILIDADES DE FECHA para Citas del Bot IA
// ═══════════════════════════════════════════════════════════════

function formatearFechaCita(fechaISO) {
    if (!fechaISO) return 'N/A';
    try {
        // Viene como "2026-06-18 22:30:45" o ISO string
        const d = new Date(fechaISO.replace(' ', 'T'));
        if (isNaN(d.getTime())) return fechaISO;
        return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
               d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + ' hrs';
    } catch(e) {
        return fechaISO;
    }
}

// ═══════════════════════════════════════════════════════════════
// LISTA DE CITAS ACEPTADAS debajo del calendario
// ═══════════════════════════════════════════════════════════════

let _citasAceptadasCache = [];

function toggleCitasAceptadas() {
    const body = document.getElementById('citas-aceptadas-body');
    const chevron = document.getElementById('citas-aceptadas-chevron');
    if (body.style.display === 'none') {
        body.style.display = '';
        chevron.style.transform = 'rotate(0deg)';
    } else {
        body.style.display = 'none';
        chevron.style.transform = 'rotate(-90deg)';
    }
}

async function cargarCitasAceptadas() {
    try {
        const res = await fetch(CITAS_API + '?estado=aprobada&limit=100');
        const data = await res.json();
        if (!data.success || !data.citas || data.citas.length === 0) {
            document.getElementById('card-citas-aceptadas').style.display = 'none';
            return;
        }

        _citasAceptadasCache = data.citas;
        document.getElementById('card-citas-aceptadas').style.display = '';
        document.getElementById('citas-aceptadas-count').textContent = data.citas.length + ' aceptadas';

        let html = '<div class="table-responsive"><table class="table table-sm table-hover mb-0" style="font-size:0.82rem;">';
        html += '<thead style="position:sticky;top:0;background:#fff;z-index:1;"><tr>';
        html += '<th>#</th><th>Generada</th><th>Fecha Cita</th><th>Hora</th><th>Cliente</th><th>Teléfono</th><th>Patente</th><th>Vehículo</th><th>Servicio</th><th>Tipo</th><th>Orden</th><th></th>';
        html += '</tr></thead><tbody>';

        data.citas.forEach(function(c) {
            const tipo = c.tipo_atencion || 'taller';
            const tipoLabel = tipo === 'domicilio' ? '<span class="badge bg-primary">Domicilio</span>' : '<span class="badge bg-success">Taller</span>';
            const vehiculo = [c.marca, c.modelo, c.anio ? String(c.anio) : null, c.color ? '(' + c.color + ')' : ''].filter(Boolean).join(' ');
            const ordenNum = c.numero_orden_sgc ? 'EXP' + String(c.numero_orden_sgc).padStart(6, '0') : '—';
            const tieneOrden = !!c.numero_orden_sgc;

            // Si tiene orden, toda la fila es clickeable; si no, mostrar botón para reintentar
            const rowClass = tieneOrden ? 'style="cursor:pointer"' : 'class="table-warning"';
            const rowClick = tieneOrden ? 'onclick="verOrdenPorNumero(' + c.numero_orden_sgc + ')"' : '';

            html += '<tr ' + rowClass + ' ' + rowClick + '>';
            html += '<td class="text-muted">' + c.id + '</td>';
            html += '<td><small>' + formatearFechaCita(c.created_at) + '</small></td>';
            html += '<td>' + (c.fecha_cita || '—') + '</td>';
            html += '<td>' + (c.hora_cita || '—') + '</td>';
            html += '<td>' + (c.nombre_cliente || '—') + '</td>';
            html += '<td>' + (c.telefono || '—') + '</td>';
            html += '<td><strong>' + (c.patente || '—') + '</strong></td>';
            html += '<td><small>' + (vehiculo || '—') + '</small></td>';
            html += '<td>' + (c.servicio || '—') + '</td>';
            html += '<td>' + tipoLabel + '</td>';
            html += '<td>' + (tieneOrden ? '<strong>' + ordenNum + '</strong>' : '<span class="text-danger">Sin OT</span>') + '</td>';
            html += '<td>' + (tieneOrden ? '<i class="fas fa-external-link-alt text-success"></i>' : '<button class="btn btn-warning btn-sm py-0 px-1" onclick="event.stopPropagation(); reintentarCrearOT(' + c.id + ')" title="Crear Orden de Trabajo"><i class="fas fa-sync-alt"></i></button>') + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        html += '<div class="text-muted small mt-2 mb-1"><i class="fas fa-mouse-pointer me-1"></i>Haz clic en una fila para ver/editar la orden de trabajo asociada.</div>';
        document.getElementById('citas-aceptadas-list').innerHTML = html;
    } catch(err) {
        console.error('Error cargando citas aceptadas:', err);
    }
}

function verOrdenPorNumero(numeroOrden) {
    // Si estamos en la página del calendario (no hay modal de ver orden), abrir en index.html
    var modalVerOrden = document.getElementById('modalVerOrden');
    if (!modalVerOrden) {
        window.open('/index.html?ver_orden=' + numeroOrden, '_blank');
        return;
    }
    // Buscar la orden por número en la lista de órdenes disponibles
    fetch(API_BASE + '/buscar-ordenes?numero=' + numeroOrden)
        .then(r => r.json())
        .then(data => {
            if (data.success && data.ordenes && data.ordenes.length > 0) {
                verOrden(data.ordenes[0].id);
            } else {
                mostrarNotificacion('warning', 'No encontrada', 'Orden ' + numeroOrden + ' no encontrada');
            }
        })
        .catch(() => mostrarNotificacion('error', 'Error', 'Error al buscar la orden'));
}

async function reintentarCrearOT(citaId) {
    if (!confirm('¿Crear la Orden de Trabajo para esta cita aprobada? Se llamará al endpoint de aprobación.')) return;
    try {
        const res = await fetch(CITAS_API + '/' + citaId + '/aprobar', { method: 'POST' });
        const data = await res.json();
        if (data.success && data.orden_creada) {
            mostrarNotificacion('success', 'OT Creada', 'Se asignó la orden de trabajo a esta cita.');
            cargarCitasAceptadas();
        } else {
            mostrarNotificacion('warning', 'Sin cambios', data.mensaje || 'No se pudo crear la orden');
        }
    } catch (err) {
        mostrarNotificacion('error', 'Error', 'Error de conexión al reintentar');
    }
}
