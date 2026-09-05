// ============================================
// API: CERRAR ORDEN (TÉCNICO)
// SGC
// ============================================

import { chileNow } from '../../lib/db-helpers.js';


export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();
    if (!data.orden_id || !data.tecnico_id) {
      return new Response(JSON.stringify({ success: false, error: 'Faltan datos: orden_id y tecnico_id' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const orden = await env.DB.prepare(
      'SELECT id, estado, estado_trabajo, firma_imagen, token, tecnico_asignado_id, notas, monto_total, monto_abono, monto_restante FROM OrdenesTrabajo WHERE id = ? AND tecnico_asignado_id = ?'
    ).bind(data.orden_id, data.tecnico_id).first();

    if (!orden) {
      return new Response(JSON.stringify({ success: false, error: 'Orden no encontrada o no asignada a este técnico' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    if (!orden.firma_imagen) {
      return new Response(JSON.stringify({ success: false, error: 'No se puede cerrar la orden: cliente no ha firmado aún' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    if (orden.estado_trabajo === 'Cerrada') {
      return new Response(JSON.stringify({ success: false, error: 'La orden ya está cerrada' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    if (orden.estado !== 'Aprobada' && orden.estado_trabajo !== 'Aprobada') {
      return new Response(JSON.stringify({ success: false, error: 'No se puede cerrar la orden porque no está aprobada' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const notasCierre = (data.notas_cierre || '').trim();
    if (!notasCierre) {
      return new Response(JSON.stringify({ success: false, error: 'Las notas de cierre son obligatorias' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    if (data.pago_completado === undefined || data.pago_completado === null) {
      return new Response(JSON.stringify({ success: false, error: 'Debe indicar si el cliente pagó o no' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const pagoCompletado = !!data.pago_completado;
    let metodoPago = data.metodo_pago ? data.metodo_pago.trim() : null;

    if (pagoCompletado) {
      if (!metodoPago) {
        return new Response(JSON.stringify({ success: false, error: 'Debe seleccionar el método de pago' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }
    } else {
      if (!metodoPago) {
        return new Response(JSON.stringify({ success: false, error: 'Debe seleccionar el motivo del pago pendiente' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }
      metodoPago = `Pago pendiente: ${metodoPago}`;
    }

    const notasActualizadas = ((orden.notas || '').trim() ? `${orden.notas.trim()}\nCierre: ${notasCierre}` : `Cierre: ${notasCierre}`);

    // Toda orden cerrada queda SIN DEUDA: restante=0, abono=total
    const montoTotal = Number(orden.monto_total || 0);
    const nuevoMontoRestante = 0;
    const nuevoMontoAbono = montoTotal;

    await env.DB.prepare(
      `UPDATE OrdenesTrabajo SET estado = ?, estado_trabajo = ?, fecha_completado = ${chileNow()}, notas = ?, pagado = ?, metodo_pago = ?, monto_restante = ?, monto_abono = ? WHERE id = ?`
    ).bind('Aprobada', 'Cerrada', notasActualizadas, pagoCompletado ? 1 : 0, metodoPago, nuevoMontoRestante, nuevoMontoAbono, data.orden_id).run();

    await env.DB.prepare(`
      INSERT INTO SeguimientoTrabajo (orden_id, tecnico_id, estado_anterior, estado_nuevo, observaciones)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.orden_id,
      data.tecnico_id,
      orden.estado_trabajo,
      'Cerrada',
      notasCierre ? `Cierre: ${notasCierre}` : 'Cierre sin notas'
    ).run();

    return new Response(JSON.stringify({
      success: true,
      mensaje: 'Orden cerrada correctamente',
      orden_id: data.orden_id,
      notas: notasActualizadas
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al cerrar orden:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
