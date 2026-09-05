// ============================================
// API: CANCELACIÓN DE ÓRDENES EN LIQUIDACIÓN
// Persiste qué órdenes están canceladas para
// un técnico específico (no se descuentan de su pago)
// Global Pro Automotriz
// ============================================

async function asegurarTabla(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS LiquidacionCanceladas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orden_id INTEGER NOT NULL,
    tecnico_id INTEGER NOT NULL,
    cancelado INTEGER NOT NULL DEFAULT 1,
    fecha_cancelacion TEXT DEFAULT (datetime('now', '-3 hours')),
    motivo TEXT DEFAULT '',
    UNIQUE(orden_id, tecnico_id),
    FOREIGN KEY (orden_id) REFERENCES OrdenesTrabajo(id),
    FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
  )`).run();
  try {
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_liq_cancel_orden ON LiquidacionCanceladas(orden_id)').run();
  } catch (e) {}
  try {
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_liq_cancel_tecnico ON LiquidacionCanceladas(tecnico_id)').run();
  } catch (e) {}
  try {
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_liq_cancel_unico ON LiquidacionCanceladas(orden_id, tecnico_id)').run();
  } catch (e) {}
}

// ==========================================
// GET - Obtener órdenes canceladas para un técnico
// ?tecnico_id=X
// Retorna: { success, canceladas: [orden_id, ...] }
// ==========================================
export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarTabla(env);

    const url = new URL(request.url);
    const tecnicoId = url.searchParams.get('tecnico_id');

    if (!tecnicoId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Se requiere tecnico_id'
      }), { headers: { 'Content-Type': 'application/json' }, status: 400 });
    }

    // Obtener IDs de órdenes canceladas para este técnico
    const { results } = await env.DB.prepare(`
      SELECT orden_id, fecha_cancelacion, motivo
      FROM LiquidacionCanceladas
      WHERE tecnico_id = ? AND cancelado = 1
      ORDER BY fecha_cancelacion DESC
    `).bind(tecnicoId).all();

    const canceladas = (results || []).map(r => r.orden_id);

    return new Response(JSON.stringify({
      success: true,
      canceladas: canceladas,
      detalle: results || []
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error al obtener canceladas:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}

// ==========================================
// POST - Marcar/desmarcar orden como cancelada
// Body: { orden_id, tecnico_id, cancelado: true/false, motivo? }
// Usa INSERT OR REPLACE para upsert
// ==========================================
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await asegurarTabla(env);

    const data = await request.json();

    if (!data.orden_id || !data.tecnico_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Falta orden_id o tecnico_id'
      }), { headers: { 'Content-Type': 'application/json' }, status: 400 });
    }

    const ordenId = Number(data.orden_id);
    const tecnicoId = Number(data.tecnico_id);
    const cancelado = data.cancelado === true || data.cancelado === 1 ? 1 : 0;
    const motivo = data.motivo || '';

    if (cancelado === 1) {
      // INSERT OR REPLACE: si ya existe el par (orden_id, tecnico_id), lo actualiza
      await env.DB.prepare(`
        INSERT OR REPLACE INTO LiquidacionCanceladas (orden_id, tecnico_id, cancelado, fecha_cancelacion, motivo)
        VALUES (?, ?, 1, datetime('now', '-3 hours'), ?)
      `).bind(ordenId, tecnicoId, motivo).run();
    } else {
      // Desmarcar: eliminar el registro de cancelación
      await env.DB.prepare(`
        DELETE FROM LiquidacionCanceladas
        WHERE orden_id = ? AND tecnico_id = ?
      `).bind(ordenId, tecnicoId).run();
    }

    return new Response(JSON.stringify({
      success: true,
      orden_id: ordenId,
      tecnico_id: tecnicoId,
      cancelado: cancelado,
      mensaje: cancelado ? 'Orden cancelada en liquidación' : 'Orden restaurada en liquidación'
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error al guardar cancelación:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}

// ==========================================
// PUT - Cancelar/restaurar múltiples órdenes a la vez
// Body: { tecnico_id, ordenes: [orden_id, ...], cancelado: true/false }
// ==========================================
export async function onRequestPut(context) {
  const { request, env } = context;

  try {
    await asegurarTabla(env);

    const data = await request.json();

    if (!data.tecnico_id || !Array.isArray(data.ordenes) || data.ordenes.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Falta tecnico_id o lista de órdenes'
      }), { headers: { 'Content-Type': 'application/json' }, status: 400 });
    }

    const tecnicoId = Number(data.tecnico_id);
    const cancelado = data.cancelado === true || data.cancelado === 1;
    let procesadas = 0;

    for (const oid of data.ordenes) {
      const ordenId = Number(oid);
      if (isNaN(ordenId) || ordenId <= 0) continue;

      if (cancelado) {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO LiquidacionCanceladas (orden_id, tecnico_id, cancelado, fecha_cancelacion, motivo)
          VALUES (?, ?, 1, datetime('now', '-3 hours'), 'Cancelación masiva')
        `).bind(ordenId, tecnicoId).run();
      } else {
        await env.DB.prepare(`
          DELETE FROM LiquidacionCanceladas
          WHERE orden_id = ? AND tecnico_id = ?
        `).bind(ordenId, tecnicoId).run();
      }
      procesadas++;
    }

    return new Response(JSON.stringify({
      success: true,
      procesadas: procesadas,
      cancelado: cancelado,
      mensaje: cancelado
        ? `${procesadas} órdenes canceladas en liquidación`
        : `${procesadas} órdenes restauradas en liquidación`
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error al actualizar cancelaciones masivas:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
