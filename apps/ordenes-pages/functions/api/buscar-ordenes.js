// ============================================
// API: BUSCAR ÓRDENES POR PATENTE O NÚMERO
// Con desglose de costos por categoría
// SGC
// ============================================

import { asegurarColumnasFaltantes } from '../lib/db-helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const url = new URL(request.url);
    const patente = url.searchParams.get('patente');
    const numero = url.searchParams.get('numero');

    if (!patente && !numero) {
      return new Response(JSON.stringify({ success: false, error: 'Patente o numero no proporcionado' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    let query;
    let bindParam;

    if (numero) {
      query = `
        SELECT
          o.*,
          COALESCE(NULLIF(o.color,''), v.color) as color,
          c.nombre as cliente_nombre, c.rut as cliente_rut, c.telefono as cliente_telefono,
          COALESCE(ca.total_mano_obra, 0) as total_costos_mano_obra,
          COALESCE(ca.total_repuestos, 0) as total_costos_repuestos,
          COALESCE(ca.total_general, 0) as total_costos_adicionales
        FROM OrdenesTrabajo o
        LEFT JOIN Clientes c ON o.cliente_id = c.id
        LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
        LEFT JOIN (
          SELECT orden_id,
            COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
            COALESCE(SUM(CASE WHEN categoria = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
            COALESCE(SUM(monto), 0) as total_general
          FROM CostosAdicionales GROUP BY orden_id
        ) ca ON ca.orden_id = o.id
        WHERE o.numero_orden = ?
        ORDER BY o.fecha_ingreso DESC
        LIMIT 5
      `;
      bindParam = numero;
    } else {
      query = `
        SELECT
          o.*,
          COALESCE(NULLIF(o.color,''), v.color) as color,
          c.nombre as cliente_nombre, c.rut as cliente_rut, c.telefono as cliente_telefono,
          COALESCE(ca.total_mano_obra, 0) as total_costos_mano_obra,
          COALESCE(ca.total_repuestos, 0) as total_costos_repuestos,
          COALESCE(ca.total_general, 0) as total_costos_adicionales
        FROM OrdenesTrabajo o
        LEFT JOIN Clientes c ON o.cliente_id = c.id
        LEFT JOIN Vehiculos v ON o.vehiculo_id = v.id
        LEFT JOIN (
          SELECT orden_id,
            COALESCE(SUM(CASE WHEN COALESCE(categoria,'Mano de Obra') = 'Mano de Obra' THEN monto ELSE 0 END), 0) as total_mano_obra,
            COALESCE(SUM(CASE WHEN categoria = 'Repuestos/Materiales' THEN monto ELSE 0 END), 0) as total_repuestos,
            COALESCE(SUM(monto), 0) as total_general
          FROM CostosAdicionales GROUP BY orden_id
        ) ca ON ca.orden_id = o.id
        WHERE UPPER(o.patente_placa) = UPPER(?)
        ORDER BY o.fecha_ingreso DESC
        LIMIT 20
      `;
      bindParam = patente;
    }

    const { results } = await env.DB.prepare(query).bind(bindParam).all();

    // Calcular monto_final y desglose para cada orden
    const ordenesConFinal = (results || []).map(o => ({
      ...o,
      desglose_costos: {
        mano_de_obra: Number(o.total_costos_mano_obra || 0),
        repuestos_materiales: Number(o.total_costos_repuestos || 0),
        total: Number(o.total_costos_adicionales || 0)
      },
      monto_final: Number(o.monto_total || 0) + Number(o.total_costos_adicionales || 0)
    }));

    return new Response(JSON.stringify({
      success: true,
      ordenes: ordenesConFinal
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al buscar órdenes:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
