// ============================================
// API: CAMBIAR ESTADO DE ORDEN DE TRABAJO
// Global Pro Automotriz
// ============================================

import { registrarNotificacion } from '../../lib/notificaciones.js';
import { calcularDomicilio } from '../../lib/calculo-distancia.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    if (!data.orden_id || !data.tecnico_id || !data.nuevo_estado) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos: orden_id, tecnico_id y nuevo_estado'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Verificar que la orden está asignada a este técnico
    const orden = await env.DB.prepare(
      "SELECT id, estado_trabajo FROM OrdenesTrabajo WHERE id = ? AND tecnico_asignado_id = ?"
    ).bind(data.orden_id, data.tecnico_id).first();

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada o no asignada a este técnico'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Actualizar estado
    await env.DB.prepare(`
      UPDATE OrdenesTrabajo
      SET estado_trabajo = ?
      WHERE id = ?
    `).bind(data.nuevo_estado, data.orden_id).run();

    // Registrar en seguimiento
    await env.DB.prepare(`
      INSERT INTO SeguimientoTrabajo (
        orden_id, tecnico_id, estado_anterior, estado_nuevo,
        latitud, longitud, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.orden_id,
      data.tecnico_id,
      orden.estado_trabajo,
      data.nuevo_estado,
      data.latitud || null,
      data.longitud || null,
      data.observaciones || null
    ).run();

    // Registrar notificación WhatsApp para estados clave
    try {
      // Solo notificar cuando el tecnico llega al sitio
      var estadosNotificar = {
        'En Sitio': 'tecnico_en_sitio'
      };
      var tipoEvento = estadosNotificar[data.nuevo_estado];
      if (tipoEvento) {
        var ordenInfo = await env.DB.prepare(
          'SELECT o.numero_orden, o.patente_placa, COALESCE(o.cliente_telefono, c.telefono) as cliente_telefono, COALESCE(o.cliente_nombre, c.nombre) as cliente_nombre FROM OrdenesTrabajo o LEFT JOIN Clientes c ON o.cliente_id = c.id WHERE o.id = ?'
        ).bind(data.orden_id).first();
        if (ordenInfo && ordenInfo.cliente_telefono) {
          await registrarNotificacion(env, data.orden_id, ordenInfo.cliente_telefono, tipoEvento, ordenInfo);
        }
      }
    } catch (ne) { console.log('Notificación no registrada:', ne.message); }

    // Calcular distancia y cargo por domicilio cuando el tecnico llega al sitio
    var domicilioResult = null;
    if (data.nuevo_estado === 'En Sitio' && data.latitud && data.longitud) {
      try {
        // Asegurar columnas en la orden
        try { await env.DB.exec('ALTER TABLE OrdenesTrabajo ADD COLUMN distancia_km REAL DEFAULT 0'); } catch(e) {}
        try { await env.DB.exec('ALTER TABLE OrdenesTrabajo ADD COLUMN cargo_domicilio REAL DEFAULT 0'); } catch(e) {}
        try { await env.DB.exec('ALTER TABLE OrdenesTrabajo ADD COLUMN domicilio_modo_cobro TEXT DEFAULT \'no_cobrar\''); } catch(e) {}

        domicilioResult = await calcularDomicilio(env, Number(data.latitud), Number(data.longitud));

        if (domicilioResult.calculado) {
          await env.DB.prepare(
            'UPDATE OrdenesTrabajo SET distancia_km = ?, cargo_domicilio = ?, domicilio_modo_cobro = ? WHERE id = ?'
          ).bind(
            domicilioResult.distancia_km,
            domicilioResult.cargo,
            domicilioResult.modo_cobro,
            data.orden_id
          ).run();

          // NOTA: El domicilio NO se agrega a CostosAdicionales porque el pago
          // es directamente entre el cliente y el tecnico (100% para el tecnico).
          // Solo se guarda en la orden (distancia_km, cargo_domicilio) para
          // mostrarlo informativo en PDF y vista de orden, SIN afectar el total.
        }
      } catch (de) { console.log('Error calculando domicilio:', de.message); }
    }

    return new Response(JSON.stringify({
      success: true,
      mensaje: 'Estado actualizado correctamente',
      domicilio: domicilioResult
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al cambiar estado:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
