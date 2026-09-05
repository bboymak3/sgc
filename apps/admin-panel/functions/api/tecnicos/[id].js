// ============================================
// SGC ADMIN - Técnico individual
// PUT    /api/tecnicos/[id]   - Actualizar
// DELETE /api/tecnicos/[id]   - Soft-delete (activo=0)
// ============================================

export async function onRequestPut(context) {
  const { request, env, params } = context;
  try {
    const data = await request.json();
    const campos = [];
    const valores = [];

    const allowed = [
      'nombre', 'apellido', 'telefono', 'email',
      'especialidad', 'zona_cobertura',
      'comision_porcentaje', 'activo'
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        campos.push(`${key} = ?`);
        valores.push(data[key]);
      }
    }

    if (campos.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Nada que actualizar' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    valores.push(params.id);

    await env.ORDENES_DB.prepare(
      `UPDATE Tecnicos SET ${campos.join(', ')} WHERE id = ?`
    ).bind(...valores).run();

    const actualizado = await env.ORDENES_DB.prepare('SELECT * FROM Tecnicos WHERE id = ?').bind(params.id).first();

    return new Response(JSON.stringify({ success: true, tecnico: actualizado }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  try {
    // Soft delete
    await env.ORDENES_DB.prepare('UPDATE Tecnicos SET activo = 0 WHERE id = ?').bind(params.id).run();
    return new Response(JSON.stringify({ success: true, mensaje: 'Técnico desactivado' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
