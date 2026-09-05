// ============================================
// API: OBTENER ÓRDENES DEL TÉCNICO
// SGC
// ============================================

import { asegurarColumnasFaltantes, getFechaColumn } from '../../lib/db-helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);
    const fechaInfo = await getFechaColumn(env);

    const url = new URL(request.url);
    const tecnicoId = url.searchParams.get('tecnico_id');

    if (!tecnicoId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Falta ID del técnico'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Columnas de domicilio dinámicas (solo si existen en la tabla)
    let domicilioCols = '';
    if (fechaInfo.tiene_distancia_km) domicilioCols += ', o.distancia_km';
    if (fechaInfo.tiene_cargo_domicilio) domicilioCols += ', o.cargo_domicilio';
    if (fechaInfo.tiene_domicilio_modo_cobro) domicilioCols += ', o.domicilio_modo_cobro';

    // Buscar órdenes asignadas a este técnico (como tecnico_asignado o con ítems en servicios_seleccionados)
    const ordenes = await env.DB.prepare(`
      SELECT
        o.id, o.numero_orden, o.patente_placa, COALESCE(NULLIF(o.marca,''), v.marca) as marca, COALESCE(NULLIF(o.modelo,''), v.modelo) as modelo, COALESCE(NULLIF(o.color,''), v.color) as color, o.anio,
        o.direccion, o.referencia_direccion, o.estado_trabajo,
        c.nombre as cliente_nombre, c.telefono as cliente_telefono,
        o.trabajo_frenos, o.detalle_frenos,
        o.trabajo_luces, o.detalle_luces,
        o.trabajo_tren_delantero, o.detalle_tren_delantero,
        o.trabajo_correas, o.detalle_correas,
        o.trabajo_componentes, o.detalle_componentes,
        o.firma_imagen, o.fecha_aprobacion,
        o.diagnostico_observaciones, o.notas,
        o.tecnico_asignado_id, o.servicios_seleccionados
        ${domicilioCols}
      FROM OrdenesTrabajo o
      LEFT JOIN Clientes c ON o.cliente_id = c.id
      LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
      WHERE (o.tecnico_asignado_id = ? OR (o.servicios_seleccionados IS NOT NULL AND o.servicios_seleccionados != ''))
      ORDER BY o.fecha_ingreso DESC
    `).bind(tecnicoId).all();

    // Filtrar: mantener solo órdenes donde el técnico tiene ítems asignados o es el tecnico_asignado
    const tecId = String(tecnicoId);
    const ordenesFiltradas = (ordenes.results || []).filter(orden => {
      // Si es el tecnico_asignado, siempre visible
      if (String(orden.tecnico_asignado_id) === tecId) {
        orden.es_tecnico_principal = true;
        return true;
      }
      // Si no es el tecnico_asignado, verificar si tiene ítems asignados en servicios_seleccionados
      orden.es_tecnico_principal = false;
      if (orden.servicios_seleccionados) {
        try {
          const servicios = JSON.parse(orden.servicios_seleccionados);
          if (Array.isArray(servicios)) {
            return servicios.some(item => String(item.tecnico_id) === tecId);
          }
        } catch (e) { /* ignore parse errors */ }
      }
      return false;
    });

    return new Response(JSON.stringify({
      success: true,
      ordenes: ordenesFiltradas
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener órdenes del técnico:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
