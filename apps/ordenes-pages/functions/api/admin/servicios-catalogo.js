// ============================================
// API: CATÁLOGO DE SERVICIOS (ADMIN)
// CRUD completo con precios sugeridos y categorías
// Global Pro Automotriz
// ============================================

const CATEGORIAS_VALIDAS = ['Mantenimiento', 'Diagnóstico', 'Reparación', 'Otros'];
const TIPOS_COMISION = ['mano_obra', 'repuestos'];

async function asegurarTabla(env) {
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ServiciosCatalogo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      precio_sugerido REAL NOT NULL DEFAULT 0,
      categoria TEXT NOT NULL DEFAULT 'Mantenimiento',
      tipo_comision TEXT NOT NULL DEFAULT 'mano_obra',
      activo INTEGER DEFAULT 1,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_servicios_cat_categoria ON ServiciosCatalogo(categoria)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_servicios_cat_activo ON ServiciosCatalogo(activo)`).run();
  } catch (e) {
    console.error('Error al asegurar tabla ServiciosCatalogo:', e);
  }
}

async function seedServicios(env) {
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) as c FROM ServiciosCatalogo').first();
    if (row && row.c > 0) return;

    const servicios = [
      ['Frenos', 0, 'Diagnóstico', 'mano_obra'],
      ['Luces', 0, 'Diagnóstico', 'mano_obra'],
      ['Tren Delantero', 0, 'Diagnóstico', 'mano_obra'],
      ['Correas', 0, 'Reparación', 'mano_obra'],
      ['Componentes', 0, 'Reparación', 'mano_obra'],
      ['Motores', 0, 'Reparación', 'mano_obra'],
      ['Culatas', 0, 'Reparación', 'mano_obra'],
      ['Embragues', 0, 'Reparación', 'mano_obra'],
      ['Suspensión', 0, 'Reparación', 'mano_obra'],
      ['Escáner', 0, 'Diagnóstico', 'mano_obra'],
      ['Limpieza del Cuerpo de Aceleración', 0, 'Mantenimiento', 'mano_obra'],
      ['Sistema de A/A', 0, 'Reparación', 'mano_obra'],
      ['Electricidad', 0, 'Diagnóstico', 'mano_obra'],
      ['Sistema de Seguridad', 0, 'Diagnóstico', 'mano_obra'],
      ['Cambio de Aceite', 0, 'Mantenimiento', 'mano_obra'],
      ['Cambio de Bujías', 0, 'Mantenimiento', 'mano_obra'],
      ['Cambio de Balastra', 0, 'Reparación', 'repuestos'],
      ['Cambio de Pastillas', 0, 'Reparación', 'mano_obra'],
      ['Cambio de Bomba de Gasolina', 0, 'Reparación', 'repuestos'],
      ['Cambio de Aceite de Caja', 0, 'Mantenimiento', 'mano_obra'],
      ['Alineación y Balanceo', 0, 'Mantenimiento', 'mano_obra'],
      ['Revisión General', 0, 'Diagnóstico', 'mano_obra'],
      ['Cambio de Filtros', 0, 'Mantenimiento', 'repuestos'],
      ['Cambio de Amortiguadores', 0, 'Reparación', 'repuestos'],
      ['Cambio de Batería', 0, 'Reparación', 'repuestos'],
    ];

    for (const [nombre, precio, categoria, tipo_comision] of servicios) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO ServiciosCatalogo (nombre, precio_sugerido, categoria, tipo_comision) VALUES (?, ?, ?, ?)'
      ).bind(nombre, precio, categoria, tipo_comision).run();
    }
  } catch (e) {
    console.error('Error al sembrar servicios:', e);
  }
}

async function init(env) {
  await asegurarTabla(env);
  await seedServicios(env);
}

// GET: Listar servicios (con búsqueda opcional)
export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await init(env);

    const url = new URL(request.url);
    const q = url.searchParams.get('q');
    const soloActivos = url.searchParams.get('activos') !== '0'; // default: true
    const id = url.searchParams.get('id');

    // Si piden un servicio específico
    if (id) {
      const servicio = await env.DB.prepare(
        'SELECT * FROM ServiciosCatalogo WHERE id = ?'
      ).bind(id).first();
      return new Response(JSON.stringify({
        success: true,
        servicio: servicio || null
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    let whereSQL = soloActivos ? 'WHERE activo = 1' : '';
    let params = [];

    if (q) {
      whereSQL = (whereSQL ? whereSQL + ' AND' : 'WHERE') + ' nombre LIKE ?';
      params.push(`%${q}%`);
    }

    const { results } = await env.DB.prepare(`
      SELECT * FROM ServiciosCatalogo
      ${whereSQL}
      ORDER BY categoria ASC, nombre ASC
    `).bind(...params).all();

    // Resumen por categoría
    const { results: resumen } = await env.DB.prepare(`
      SELECT categoria, COUNT(*) as cantidad, tipo_comision
      FROM ServiciosCatalogo WHERE activo = 1
      GROUP BY categoria
      ORDER BY categoria ASC
    `).all();

    return new Response(JSON.stringify({
      success: true,
      servicios: results || [],
      total: (results || []).length,
      categorias: resumen || []
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error al obtener servicios catálogo:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { headers: { 'Content-Type': 'application/json' }, status: 500 });
  }
}

// POST: Crear nuevo servicio
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await init(env);

    const data = await request.json();

    if (!data.nombre || !data.nombre.trim()) {
      return new Response(JSON.stringify({
        success: false,
        error: 'El nombre del servicio es obligatorio'
      }), { headers: { 'Content-Type': 'application/json' }, status: 400 });
    }

    const nombre = data.nombre.trim();
    const precio = parseFloat(data.precio_sugerido) || 0;
    const categoria = CATEGORIAS_VALIDAS.includes(data.categoria) ? data.categoria : 'Mantenimiento';
    const tipoComision = TIPOS_COMISION.includes(data.tipo_comision) ? data.tipo_comision : 'mano_obra';

    // Verificar si ya existe
    const existente = await env.DB.prepare(
      'SELECT id, nombre FROM ServiciosCatalogo WHERE LOWER(nombre) = LOWER(?)'
    ).bind(nombre).first();

    if (existente) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Servicio ya existe',
        servicio: existente
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const result = await env.DB.prepare(`
      INSERT INTO ServiciosCatalogo (nombre, precio_sugerido, categoria, tipo_comision)
      VALUES (?, ?, ?, ?)
    `).bind(nombre, precio, categoria, tipoComision).run();

    const nuevoId = result.meta.last_row_id;
    const servicio = await env.DB.prepare('SELECT * FROM ServiciosCatalogo WHERE id = ?').bind(nuevoId).first();

    return new Response(JSON.stringify({
      success: true,
      servicio
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    if (error.message && error.message.includes('UNIQUE')) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Servicio ya existe'
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    console.error('Error al crear servicio:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { headers: { 'Content-Type': 'application/json' }, status: 500 });
  }
}

// PUT: Actualizar servicio
export async function onRequestPut(context) {
  const { request, env } = context;

  try {
    await init(env);

    const data = await request.json();

    if (!data.id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Se requiere ID del servicio'
      }), { headers: { 'Content-Type': 'application/json' }, status: 400 });
    }

    // Verificar que existe
    const existente = await env.DB.prepare('SELECT id FROM ServiciosCatalogo WHERE id = ?').bind(data.id).first();
    if (!existente) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Servicio no encontrado'
      }), { headers: { 'Content-Type': 'application/json' }, status: 404 });
    }

    const campos = [];
    const valores = [];

    if (data.nombre !== undefined) {
      campos.push('nombre = ?');
      valores.push(data.nombre.trim());
    }
    if (data.precio_sugerido !== undefined) {
      campos.push('precio_sugerido = ?');
      valores.push(parseFloat(data.precio_sugerido) || 0);
    }
    if (data.categoria !== undefined && CATEGORIAS_VALIDAS.includes(data.categoria)) {
      campos.push('categoria = ?');
      valores.push(data.categoria);
    }
    if (data.tipo_comision !== undefined && TIPOS_COMISION.includes(data.tipo_comision)) {
      campos.push('tipo_comision = ?');
      valores.push(data.tipo_comision);
    }
    if (data.activo !== undefined) {
      campos.push('activo = ?');
      valores.push(data.activo ? 1 : 0);
    }

    if (campos.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No hay campos para actualizar'
      }), { headers: { 'Content-Type': 'application/json' }, status: 400 });
    }

    valores.push(data.id);
    await env.DB.prepare(`
      UPDATE ServiciosCatalogo SET ${campos.join(', ')} WHERE id = ?
    `).bind(...valores).run();

    const servicio = await env.DB.prepare('SELECT * FROM ServiciosCatalogo WHERE id = ?').bind(data.id).first();

    return new Response(JSON.stringify({
      success: true,
      servicio
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error al actualizar servicio:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { headers: { 'Content-Type': 'application/json' }, status: 500 });
  }
}

// DELETE: Desactivar servicio (soft delete)
export async function onRequestDelete(context) {
  const { request, env } = context;

  try {
    await init(env);

    const url = new URL(request.url);
    const servicioId = url.searchParams.get('id');

    if (!servicioId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Se requiere el ID del servicio'
      }), { headers: { 'Content-Type': 'application/json' }, status: 400 });
    }

    await env.DB.prepare('UPDATE ServiciosCatalogo SET activo = 0 WHERE id = ?').bind(servicioId).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Servicio desactivado correctamente'
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error al eliminar servicio:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { headers: { 'Content-Type': 'application/json' }, status: 500 });
  }
}
