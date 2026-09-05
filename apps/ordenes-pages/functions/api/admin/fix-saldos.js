// ============================================
// API: FIX SALDOS - Forzar TODAS las órdenes cerradas sin deuda
// SGC
// Cualquier orden cerrada (estado_trabajo = 'Cerrada') DEBE tener:
//   monto_restante = 0, monto_abono = monto_total, pagado = 1
// ============================================

export async function onRequestPost(context) {
  const { env } = context;

  try {
    // 1. FORZAR: Toda orden cerrada → monto_restante=0, monto_abono=monto_total
    // Sin condiciones: si está cerrada, no debe nada
    const fixSaldos = await env.DB.prepare(`
      UPDATE OrdenesTrabajo
      SET monto_restante = 0, monto_abono = monto_total
      WHERE estado_trabajo = 'Cerrada'
        AND (monto_restante != 0 OR monto_abono != monto_total)
    `).run();

    // 2. FORZAR: Toda orden cerrada → pagado = 1
    const fixPagado = await env.DB.prepare(`
      UPDATE OrdenesTrabajo
      SET pagado = 1
      WHERE estado_trabajo = 'Cerrada'
        AND (pagado = 0 OR pagado IS NULL)
    `).run();

    // 3. Contar resumen: cuántas cerradas hay y cuántas quedaron bien
    const resumen = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_cerradas,
        SUM(CASE WHEN monto_restante = 0 AND monto_abono = monto_total AND pagado = 1 THEN 1 ELSE 0 END) as cerradas_ok,
        SUM(CASE WHEN monto_restante != 0 OR monto_abono != monto_total OR COALESCE(pagado,0) != 1 THEN 1 ELSE 0 END) as cerradas_con_problema
      FROM OrdenesTrabajo
      WHERE estado_trabajo = 'Cerrada'
    `).first();

    const saldosFixed = fixSaldos.meta?.changes || 0;
    const pagadoFixed = fixPagado.meta?.changes || 0;

    return new Response(JSON.stringify({
      success: true,
      saldos_corregidos: saldosFixed,
      pagado_corregidos: pagadoFixed,
      total_modificados: saldosFixed + pagadoFixed,
      total_cerradas: Number(resumen?.total_cerradas || 0),
      cerradas_ok: Number(resumen?.cerradas_ok || 0),
      cerradas_con_problema: Number(resumen?.cerradas_con_problema || 0)
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al fix saldos:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
