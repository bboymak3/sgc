// ============================================
// API: GESTIÓN DE TÉCNICOS (ADMIN)
// Con comisión individual configurable por técnico
// Global Pro Automotriz
// ============================================

async function asegurarColumnaComision(env) {
  try {
    const columns = await env.DB.prepare("PRAGMA table_info(Tecnicos)").all();
    const hasComision = columns.results?.some(c => c.name === 'comision_porcentaje');
    if (!hasComision) {
      await env.DB.prepare("ALTER TABLE Tecnicos ADD COLUMN comision_porcentaje REAL NOT NULL DEFAULT 40").run();
    }
  } catch (e) {
    console.log('asegurarColumnaComision:', e.message);
  }
}

async function asegurarColumnaApellido(env) {
  try {
    const columns = await env.DB.prepare("PRAGMA table_info(Tecnicos)").all();
    const hasApellido = columns.results?.some(c => c.name === 'apellido');
    if (!hasApellido) {
      await env.DB.prepare("ALTER TABLE Tecnicos ADD COLUMN apellido TEXT DEFAULT ''").run();
    }
  } catch (e) {
    console.log('asegurarColumnaApellido:', e.message);
  }
}

// GET: Obtener todos los técnicos (con comisión)
export async function onRequestGet(context) {
  const { env } = context;

  try {
    await asegurarColumnaComision(env);
    await asegurarColumnaApellido(env);

    const tecnicos = await env.DB.prepare(`
      SELECT id, nombre, apellido, telefono, email, pin, activo, fecha_registro, comision_porcentaje
      FROM Tecnicos
      ORDER BY nombre ASC
    `).all();

    return new Response(JSON.stringify({
      success: true,
      tecnicos: tecnicos.results || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener técnicos:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// POST: Crear nuevo técnico
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await asegurarColumnaComision(env);
    await asegurarColumnaApellido(env);

    const data = await request.json();

    if (!data.nombre || !data.telefono || !data.pin) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos: nombre, teléfono y PIN'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Validar comisión (0-100)
    const comision = parseFloat(data.comision_porcentaje);
    const comisionFinal = (!isNaN(comision) && comision >= 0 && comision <= 100) ? comision : 40;

    // Verificar que el teléfono no esté duplicado
    const existe = await env.DB.prepare(
      "SELECT id FROM Tecnicos WHERE telefono = ?"
    ).bind(data.telefono).first();

    if (existe) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Ya existe un técnico con ese teléfono'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Verificar columna de acceso
    const tableInfo = await env.DB.prepare("PRAGMA table_info(Tecnicos)").all();
    const columnNames = (tableInfo.results || []).map(col => col.name);
    const accessColumn = columnNames.includes('codigo_acceso') ? 'codigo_acceso' : columnNames.includes('pin') ? 'pin' : null;

    if (!accessColumn) {
      throw new Error('Tabla Tecnicos no tiene columna de acceso (codigo_acceso/pin)');
    }

    // Crear técnico con comisión y apellido
    await env.DB.prepare(`
      INSERT INTO Tecnicos (nombre, apellido, telefono, email, ${accessColumn}, activo, comision_porcentaje)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).bind(
      data.nombre,
      data.apellido || '',
      data.telefono,
      data.email || null,
      data.pin,
      comisionFinal
    ).run();

    return new Response(JSON.stringify({
      success: true,
      mensaje: 'Técnico registrado correctamente',
      comision_porcentaje: comisionFinal
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al crear técnico:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// PUT: Actualizar técnico (incluyendo comisión)
export async function onRequestPut(context) {
  const { request, env } = context;

  try {
    await asegurarColumnaComision(env);
    await asegurarColumnaApellido(env);

    const data = await request.json();

    if (!data.id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Se requiere ID del técnico'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const campos = [];
    const valores = [];

    if (data.nombre !== undefined) {
      campos.push('nombre = ?');
      valores.push(data.nombre.trim());
    }
    if (data.apellido !== undefined) {
      campos.push('apellido = ?');
      valores.push(data.apellido.trim());
    }
    if (data.telefono !== undefined) {
      campos.push('telefono = ?');
      valores.push(data.telefono);
    }
    if (data.email !== undefined) {
      campos.push('email = ?');
      valores.push(data.email || null);
    }
    if (data.pin !== undefined) {
      campos.push('pin = ?');
      valores.push(data.pin);
    }
    if (data.activo !== undefined) {
      campos.push('activo = ?');
      valores.push(data.activo ? 1 : 0);
    }
    if (data.comision_porcentaje !== undefined) {
      const comision = parseFloat(data.comision_porcentaje);
      if (!isNaN(comision) && comision >= 0 && comision <= 100) {
        campos.push('comision_porcentaje = ?');
        valores.push(comision);
      }
    }

    if (campos.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No hay campos para actualizar'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    valores.push(data.id);
    await env.DB.prepare(`
      UPDATE Tecnicos SET ${campos.join(', ')} WHERE id = ?
    `).bind(...valores).run();

    const tecnico = await env.DB.prepare(
      'SELECT id, nombre, apellido, telefono, email, activo, comision_porcentaje FROM Tecnicos WHERE id = ?'
    ).bind(data.id).first();

    return new Response(JSON.stringify({
      success: true,
      tecnico
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al actualizar técnico:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// DELETE: Eliminar técnico definitivamente
export async function onRequestDelete(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const tecnicoId = url.searchParams.get('id');

    if (!tecnicoId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Se requiere el ID del técnico'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    await env.DB.prepare('DELETE FROM Tecnicos WHERE id = ?').bind(tecnicoId).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Técnico eliminado correctamente'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al eliminar técnico:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
