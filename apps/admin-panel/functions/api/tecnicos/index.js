// ============================================
// SGC ADMIN - Técnicos CRUD
// GET    /api/tecnicos        - Listar
// POST   /api/tecnicos        - Crear
// PUT    /api/tecnicos/[id]   - Actualizar
// DELETE /api/tecnicos/[id]   - Eliminar (soft delete: activo=0)
// ============================================

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  try {
    const soloActivos = url.searchParams.get('activos') !== '0';

    const result = await env.ORDENES_DB.prepare(
      `SELECT id, nombre, apellido, telefono, email, especialidad,
              zona_cobertura, comision_porcentaje, activo, fecha_registro
       FROM Tecnicos
       ${soloActivos ? 'WHERE activo = 1' : ''}
       ORDER BY nombre ASC`
    ).all();

    // Para cada técnico, contar OTs asignadas
    const tecnicos = [];
    for (const t of (result.results || [])) {
      const otCount = await env.ORDENES_DB.prepare(
        'SELECT COUNT(*) as total FROM OrdenesTrabajo WHERE tecnico_asignado_id = ? AND estado_trabajo IN (\'Pendiente\', \'En Proceso\')'
      ).bind(t.id).first();
      tecnicos.push({ ...t, ot_activas: otCount?.total || 0 });
    }

    return new Response(JSON.stringify({
      success: true,
      tecnicos,
      total: tecnicos.length
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const b = await request.json();

    if (!b.nombre) {
      return new Response(JSON.stringify({ success: false, error: 'Nombre es obligatorio' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await env.ORDENES_DB.prepare(
      `INSERT INTO Tecnicos (
        nombre, apellido, telefono, email, especialidad, zona_cobertura,
        activo, comision_porcentaje, fecha_registro
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, datetime('now', '-3 hours'))`
    ).bind(
      b.nombre,
      b.apellido || '',
      b.telefono || null,
      b.email || null,
      b.especialidad || null,
      b.zona_cobertura || null,
      b.comision_porcentaje || 40
    ).run();

    const nuevoId = result.meta?.last_row_id;
    const nuevo = await env.ORDENES_DB.prepare('SELECT * FROM Tecnicos WHERE id = ?').bind(nuevoId).first();

    return new Response(JSON.stringify({
      success: true,
      tecnico: nuevo
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
