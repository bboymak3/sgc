// ============================================
// API: ADELANTOS A TÉCNICOS
// CRUD para registrar préstamos/adelantos que
// se descuentan de la liquidación del técnico
// SGC
// ============================================

import { asegurarColumnasFaltantes } from '../../lib/db-helpers.js';

async function asegurarTabla(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS AdelantosTecnico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tecnico_id INTEGER NOT NULL,
    monto REAL NOT NULL,
    concepto TEXT NOT NULL DEFAULT 'Adelanto',
    fecha_adelanto TEXT NOT NULL,
    registrado_por TEXT DEFAULT 'admin',
    estado TEXT NOT NULL DEFAULT 'pendiente',
    liquidacion_id INTEGER,
    fecha_registro TEXT DEFAULT (datetime('now', '-3 hours')),
    notas TEXT DEFAULT '',
    FOREIGN KEY (tecnico_id) REFERENCES Tecnicos(id)
  )`).run();
  try {
    await env.DB.prepare('ALTER TABLE AdelantosTecnico ADD COLUMN notas TEXT DEFAULT ""').run();
  } catch (e) {}
  try {
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_adelantos_tecnico ON AdelantosTecnico(tecnico_id)').run();
  } catch (e) {}
  try {
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_adelantos_estado ON AdelantosTecnico(estado)').run();
  } catch (e) {}
}

// ==========================================
// GET - Listar adelantos
// ?tecnico_id=X & estado=pendiente & periodo=mes & valor=2025-03
// ==========================================
export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);
    await asegurarTabla(env);

    const url = new URL(request.url);
    const tecnicoId = url.searchParams.get('tecnico_id');
    const estado = url.searchParams.get('estado');
    const periodo = url.searchParams.get('periodo');
    const valor = url.searchParams.get('valor');

    let conds = [];
    let params = [];

    if (tecnicoId) {
      conds.push('a.tecnico_id = ?');
      params.push(tecnicoId);
    }
    if (estado) {
      conds.push('a.estado = ?');
      params.push(estado);
    }
    if (periodo && valor) {
      if (periodo === 'dia') {
        conds.push("date(a.fecha_adelanto) = ?");
        params.push(valor);
      } else if (periodo === 'mes') {
        conds.push("strftime('%Y-%m', a.fecha_adelanto) = ?");
        params.push(valor);
      } else if (periodo === 'anio') {
        conds.push("strftime('%Y', a.fecha_adelanto) = ?");
        params.push(valor);
      }
    }

    const where = conds.length > 0 ? 'WHERE ' + conds.join(' AND ') : '';

    const { results } = await env.DB.prepare(`
      SELECT a.*, t.nombre as tecnico_nombre
      FROM AdelantosTecnico a
      LEFT JOIN Tecnicos t ON a.tecnico_id = t.id
      ${where}
      ORDER BY a.fecha_adelanto DESC, a.id DESC
    `).bind(...params).all();

    // Calcular total pendiente si hay filtro de técnico
    let totalPendiente = 0;
    let totalDescontado = 0;
    if (tecnicoId) {
      const resumen = await env.DB.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN estado = 'pendiente' THEN monto ELSE 0 END), 0) as total_pendiente,
          COALESCE(SUM(CASE WHEN estado = 'descontado' THEN monto ELSE 0 END), 0) as total_descontado
        FROM AdelantosTecnico
        WHERE tecnico_id = ?
      `).bind(tecnicoId).first();
      totalPendiente = Number(resumen?.total_pendiente || 0);
      totalDescontado = Number(resumen?.total_descontado || 0);
    }

    return new Response(JSON.stringify({
      success: true,
      adelantos: results || [],
      total_pendiente: totalPendiente,
      total_descontado: totalDescontado
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error al listar adelantos:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}

// ==========================================
// POST - Registrar nuevo adelanto
// Body: { tecnico_id, monto, concepto, fecha_adelanto }
// ==========================================
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);
    await asegurarTabla(env);

    const data = await request.json();

    if (!data.tecnico_id || !data.monto || Number(data.monto) <= 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Falta tecnico_id o monto inválido'
      }), { headers: { 'Content-Type': 'application/json' }, status: 400 });
    }

    const fecha = data.fecha_adelanto || new Date(Date.now() - 3 * 3600000).toISOString().split('T')[0];

    const result = await env.DB.prepare(`
      INSERT INTO AdelantosTecnico (tecnico_id, monto, concepto, fecha_adelanto, registrado_por, estado, notas)
      VALUES (?, ?, ?, ?, ?, 'pendiente', ?)
    `).bind(
      data.tecnico_id,
      Number(data.monto),
      data.concepto || 'Adelanto',
      fecha,
      data.registrado_por || 'admin',
      data.notas || ''
    ).run();

    return new Response(JSON.stringify({
      success: true,
      id: result.meta?.last_row_id,
      mensaje: 'Adelanto registrado correctamente'
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error al registrar adelanto:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}

// ==========================================
// PUT - Marcar adelanto como descontado (al liquidar)
// Body: { id, estado, liquidacion_id }
// ==========================================
export async function onRequestPut(context) {
  const { request, env } = context;

  try {
    await asegurarTabla(env);

    const data = await request.json();

    if (!data.id) {
      return new Response(JSON.stringify({ success: false, error: 'Falta id del adelanto' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    const nuevoEstado = data.estado || 'descontado';
    const liquidacionId = data.liquidacion_id || null;

    await env.DB.prepare(`
      UPDATE AdelantosTecnico
      SET estado = ?, liquidacion_id = ?
      WHERE id = ?
    `).bind(nuevoEstado, liquidacionId, data.id).run();

    return new Response(JSON.stringify({
      success: true,
      mensaje: 'Adelanto actualizado'
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error al actualizar adelanto:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}

// ==========================================
// DELETE - Eliminar adelanto
// ?id=X
// ==========================================
export async function onRequestDelete(context) {
  const { request, env } = context;

  try {
    await asegurarTabla(env);

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return new Response(JSON.stringify({ success: false, error: 'Falta id' }), {
        headers: { 'Content-Type': 'application/json' }, status: 400
      });
    }

    await env.DB.prepare('DELETE FROM AdelantosTecnico WHERE id = ?').bind(id).run();

    return new Response(JSON.stringify({
      success: true,
      mensaje: 'Adelanto eliminado'
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error al eliminar adelanto:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
