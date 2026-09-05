// ============================================
// HELPER: REGISTRAR NOTIFICACIONES WHATSAPP
// Global Pro Automotriz
// - Guarda en BD (NotificacionesWhatsApp)
// - Si UltraMsg está configurado, envía automáticamente
// ============================================

// Obtener credenciales UltraMsg desde BD
// FIX: Busca primero en ConfigKV (donde el admin panel guarda las credenciales)
// Si no encuentra, busca en Configuracion como respaldo
async function getUltraMsgConfig(env) {
  var instanceId = '';
  var token = '';

  try {
    // 1. Intentar ConfigKV primero (donde realmente se guardan las credenciales)
    try {
      var row = await env.DB.prepare(
        "SELECT valor FROM ConfigKV WHERE clave = 'ultramsg_instance'"
      ).first();
      if (row) instanceId = row.valor;
    } catch (e) {}

    try {
      var row = await env.DB.prepare(
        "SELECT valor FROM ConfigKV WHERE clave = 'ultramsg_token'"
      ).first();
      if (row) token = row.valor;
    } catch (e) {}

    // 2. Si no encontro en ConfigKV, buscar en Configuracion como respaldo
    if (!instanceId) {
      try {
        var row = await env.DB.prepare(
          "SELECT valor FROM Configuracion WHERE clave = 'ultramsg_instance'"
        ).first();
        if (row) instanceId = row.valor;
      } catch (e) {}
    }

    if (!token) {
      try {
        var row = await env.DB.prepare(
          "SELECT valor FROM Configuracion WHERE clave = 'ultramsg_token'"
        ).first();
        if (row) token = row.valor;
      } catch (e) {}
    }

    return { instanceId: instanceId, token: token };
  } catch (e) {
    return { instanceId: '', token: '' };
  }
}

// Enviar mensaje via UltraMsg API
async function enviarUltraMsg(instanceId, token, telefono, mensaje) {
  try {
    // UltraMsg necesita el telefono con formato internacional: 569XXXXXXXX (sin +)
    var tel = String(telefono).replace(/[^0-9]/g, '');
    // Quitar 0 inicial de numeros internacionales (ej: 0584167775771 -> 584167775771)
    if (tel.length > 12 && tel.startsWith('0')) {
      tel = tel.substring(1);
    }

    var url = 'https://api.ultramsg.com/' + instanceId + '/messages/chat';
    var body = 'token=' + encodeURIComponent(token) +
      '&to=' + encodeURIComponent(tel) +
      '&body=' + encodeURIComponent(mensaje);

    var response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    });

    var data = await response.json();
    return data;
  } catch (e) {
    console.log('Error enviando UltraMsg:', e.message);
    return { sent: false, error: e.message };
  }
}

// Función principal: registrar + enviar automático
export async function registrarNotificacion(env, ordenId, telefono, tipoEvento, datosOrden) {
  try {
    // Limpiar teléfono: quitar todo lo que no sea digitos (excepto + al inicio)
    var tel = String(telefono || '').trim();
    tel = tel.replace(/[\s\-\(\)\.]/g, ''); // quitar espacios, guiones, parentesis, puntos
    if (tel.startsWith('+')) {
      tel = tel.substring(1); // quitar + y dejar solo digitos
    }

    // ---- CHILE: normalizar formato chileno ----
    var esChile = false;
    if (tel.startsWith('569') && tel.length === 12) {
      esChile = true;
    } else if (tel.startsWith('56') && !tel.startsWith('569')) {
      var sinPrefijo = tel.substring(2);
      if (sinPrefijo.startsWith('569')) {
        tel = sinPrefijo;
        esChile = true;
      } else if (sinPrefijo.startsWith('9')) {
        tel = '56' + sinPrefijo.substring(0, 9);
        esChile = true;
      }
    } else if (tel.startsWith('9')) {
      tel = '56' + tel.substring(0, 9);
      esChile = true;
    }

    if (esChile && tel.length !== 12) return;
    if (!esChile && tel.length < 10) return;

    var numOT = String(datosOrden.numero_orden || 0).padStart(6, '0');
    var patente = datosOrden.patente_placa || '';
    var cliente = datosOrden.cliente_nombre || 'Cliente';
    var mensaje = '';

    switch (tipoEvento) {
      case 'orden_creada':
        var linkFirma = datosOrden.link_aprobacion ? '\n' + datosOrden.link_aprobacion : '';
        mensaje = 'Hola ' + cliente + ', su orden #' + numOT + ' ha sido creada para el vehiculo ' + patente + '. Puede revisarla y aprobarla desde este enlace:' + linkFirma + '\n\nGlobal Pro Automotriz.';
        break;
      case 'orden_express_creada':
        mensaje = 'Hola ' + cliente + ', su orden express #' + numOT + ' ha sido creada para el vehiculo ' + patente + '. Un tecnico sera asignado para atender su solicitud de urgencia.\n\nGlobal Pro Automotriz.';
        break;
      case 'orden_asignada':
        mensaje = 'Hola ' + cliente + ', su orden #' + numOT + ' (' + patente + ') ha sido asignada a un tecnico. Estamos coordinando la visita. Global Pro Automotriz.';
        break;
      case 'tecnico_en_sitio':
        mensaje = 'Hola ' + cliente + ', el tecnico de Global Pro ha llegado al sitio para trabajar en su vehiculo ' + patente + ' (OT #' + numOT + ').';
        break;
      case 'en_progreso':
        mensaje = 'Hola ' + cliente + ', los trabajos en su vehiculo ' + patente + ' (OT #' + numOT + ') estan en progreso. Le avisaremos cuando esten listos.';
        break;
      case 'completada':
        mensaje = 'Hola ' + cliente + ', los trabajos en su vehiculo ' + patente + ' (OT #' + numOT + ') han sido completados. pronto recibira el link para revision y firma. Global Pro Automotriz.';
        break;
      case 'cerrada':
        mensaje = 'Hola ' + cliente + ', su orden #' + numOT + ' ha sido cerrada. Gracias por confiar en Global Pro Automotriz!';
        break;
      default:
        mensaje = 'Hola ' + cliente + ', actualizacion de su orden #' + numOT + ' (' + patente + '). Global Pro Automotriz.';
    }

    // 1. Guardar en BD siempre
    var resultado = await env.DB.prepare(
      'INSERT INTO NotificacionesWhatsApp (orden_id, telefono, mensaje, tipo_evento) VALUES (?, ?, ?, ?)'
    ).bind(ordenId, tel, mensaje, tipoEvento).run();

    var notifId = resultado.meta.last_row_id;

    // 2. Si UltraMsg está configurado, enviar automáticamente
    var config = await getUltraMsgConfig(env);
    if (config.instanceId && config.token) {
      var resultadoEnvio = await enviarUltraMsg(config.instanceId, config.token, tel, mensaje);

      if (resultadoEnvio.sent === true || resultadoEnvio.status === 'success') {
        // Marcar como enviada
        await env.DB.prepare(
          'UPDATE NotificacionesWhatsApp SET enviada = 1 WHERE id = ?'
        ).bind(notifId).run();
      } else {
        // Marcar error para saber que falló
        var errorMsg = resultadoEnvio.error || resultadoEnvio.message || 'Error desconocido';
        await env.DB.prepare(
          'UPDATE NotificacionesWhatsApp SET enviada = 0 WHERE id = ?'
        ).bind(notifId).run();
        console.log('UltraMsg no envió:', errorMsg);
      }
    }
    // Si no hay UltraMsg configurado, queda como pendiente (se envía manual desde panel admin)

  } catch (e) {
    console.log('Error registrando notificacion:', e.message);
  }
}

// Exportar para uso desde admin (test de conexión)
export { enviarUltraMsg, getUltraMsgConfig };
