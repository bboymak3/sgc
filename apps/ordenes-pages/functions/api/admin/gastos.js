// ============================================
// API: GASTOS DEL NEGOCIO (CRUD)
// Auto-crea tabla si no existe
// Global Pro Automotriz
// ============================================

async function asegurarTabla(env) {
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS GastosNegocio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concepto TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'Otros',
      monto REAL NOT NULL,
      fecha_gasto DATE NOT NULL,
      observaciones TEXT,
      registrado_por TEXT,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON GastosNegocio(categoria)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON GastosNegocio(fecha_gasto)`).run();
  } catch (e) {
    console.error('Error al asegurar tabla GastosNegocio:', e);
  }
}

// GET: Obtener gastos con filtros
export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarTabla(env);

    const url = new URL(request.url);
    const categoria = url.searchParams.get('categoria');
    const desde = url.searchParams.get('desde');
    const hasta = url.searchParams.get('hasta');

    let whereClauses = [];
    let params = [];

    if (categoria) {
      whereClauses.push('categoria = ?');
      params.push(categoria);
    }

    if (desde) {
      whereClauses.push('fecha_gasto >= ?');
      params.push(desde);
    }

    if (hasta) {
      whereClauses.push('fecha_gasto <= ?');
      params.push(hasta);
    }

    const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const { results } = await env.DB.prepare(`
      SELECT * FROM GastosNegocio
      ${whereSQL}
      ORDER BY fecha_gasto DESC, fecha_registro DESC
    `).bind(...params).all();

    // Resumen por categoría
    const { results: resumen } = await env.DB.prepare(`
      SELECT
        categoria,
        COUNT(*) as cantidad,
        COALESCE(SUM(monto), 0) as total
      FROM GastosNegocio
      ${whereSQL}
      GROUP BY categoria
      ORDER BY total DESC
    `).bind(...params).all();

    const totalGeneral = results.reduce((sum, g) => sum + Number(g.monto || 0), 0);

    return new Response(JSON.stringify({
      success: true,
      gastos: results,
      resumen_por_categoria: resumen,
      total_general: totalGeneral
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener gastos:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// POST: Registrar gasto
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await asegurarTabla(env);

    const data = await request.json();

    if (!data.concepto || !data.monto || !data.fecha_gasto) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos: concepto, monto y fecha_gasto son obligatorios'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const categoriasValidas = ['Repuestos', 'Herramientas', 'Servicios', 'Alquiler', 'Combustible', 'Nómina', 'Otros'];
    const categoria = categoriasValidas.includes(data.categoria) ? data.categoria : 'Otros';

    const result = await env.DB.prepare(`
      INSERT INTO GastosNegocio (concepto, categoria, monto, fecha_gasto, observaciones, registrado_por)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      data.concepto,
      categoria,
      data.monto,
      data.fecha_gasto,
      data.observaciones || null,
      data.registrado_por || 'Admin'
    ).run();

    const nuevoGastoId = result.meta.last_row_id;

    const gasto = await env.DB.prepare(
      'SELECT * FROM GastosNegocio WHERE id = ?'
    ).bind(nuevoGastoId).first();

    return new Response(JSON.stringify({
      success: true,
      gasto
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al registrar gasto:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// DELETE: Eliminar gasto
export async function onRequestDelete(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const gastoId = url.searchParams.get('id');

    if (!gastoId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Se requiere el ID del gasto'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    await env.DB.prepare('DELETE FROM GastosNegocio WHERE id = ?').bind(gastoId).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Gasto eliminado correctamente'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al eliminar gasto:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
