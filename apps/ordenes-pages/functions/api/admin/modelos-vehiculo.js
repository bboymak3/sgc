// ============================================
// API: GESTIÓN DE MODELOS DE VEHÍCULO (ADMIN)
// Auto-crea tabla si no existe + seed inicial
// Global Pro Automotriz
// ============================================

async function asegurarTabla(env) {
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ModelosVehiculo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();
  } catch (e) {
    console.error('Error al asegurar tabla ModelosVehiculo:', e);
  }
}

async function asegurarColumnas(env) {
  try {
    const cols = await env.DB.prepare("PRAGMA table_info(OrdenesTrabajo)").all();
    const names = (cols.results || []).map(c => c.name);
    if (!names.includes('diagnostico_checks')) {
      await env.DB.prepare("ALTER TABLE OrdenesTrabajo ADD COLUMN diagnostico_checks TEXT").run();
    }
    if (!names.includes('diagnostico_observaciones')) {
      await env.DB.prepare("ALTER TABLE OrdenesTrabajo ADD COLUMN diagnostico_observaciones TEXT").run();
    }
  } catch (e) {
    console.log('asegurarColumnas:', e.message);
  }
}

async function seedModelos(env) {
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) as c FROM ModelosVehiculo').first();
    if (row && row.c > 0) return;
    const marcas = ['Toyota', 'Nissan', 'Honda', 'Hyundai', 'Kia', 'Chevrolet', 'Ford', 'Mazda', 'Volkswagen', 'BMW', 'Mercedes-Benz', 'Peugeot', 'Renault', 'Suzuki', 'Mitsubishi', 'Subaru', 'Jeep', 'Chery', 'Great Wall', 'BYD'];
    for (const m of marcas) {
      await env.DB.prepare('INSERT OR IGNORE INTO ModelosVehiculo (nombre) VALUES (?)').bind(m).run();
    }
  } catch (e) {
    console.error('Error al sembrar modelos:', e);
  }
}

async function init(env) {
  await asegurarTabla(env);
  await asegurarColumnas(env);
  await seedModelos(env);
}

// GET: Obtener modelos (opcionalmente buscar con ?q=)
export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await init(env);

    const url = new URL(request.url);
    const q = url.searchParams.get('q');

    let modelos;
    if (q) {
      const searchTerm = `%${q}%`;
      const { results } = await env.DB.prepare(`
        SELECT m.*, (
          SELECT COUNT(*) FROM OrdenesTrabajo ot 
          WHERE UPPER(ot.marca) = UPPER(m.nombre) OR UPPER(ot.modelo) = UPPER(m.nombre)
        ) as total
        FROM ModelosVehiculo m
        WHERE m.nombre LIKE ?
        GROUP BY m.id
        ORDER BY m.nombre ASC
      `).bind(searchTerm).all();
      modelos = results;
    } else {
      const { results } = await env.DB.prepare(`
        SELECT m.*, (
          SELECT COUNT(*) FROM OrdenesTrabajo ot 
          WHERE UPPER(ot.marca) = UPPER(m.nombre) OR UPPER(ot.modelo) = UPPER(m.nombre)
        ) as total
        FROM ModelosVehiculo m
        GROUP BY m.id
        ORDER BY total DESC, m.nombre ASC
      `).all();
      modelos = results;
    }

    return new Response(JSON.stringify({
      success: true,
      modelos: modelos || []
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener modelos de vehículo:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// POST: Crear nuevo modelo de vehículo
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await init(env);

    const data = await request.json();

    if (!data.nombre || !data.nombre.trim()) {
      return new Response(JSON.stringify({
        success: false,
        error: 'El nombre del modelo es obligatorio'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const nombre = data.nombre.trim();

    // Verificar si ya existe
    const existente = await env.DB.prepare(
      'SELECT id, nombre FROM ModelosVehiculo WHERE LOWER(nombre) = LOWER(?)'
    ).bind(nombre).first();

    if (existente) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Modelo ya existe',
        modelo: { id: existente.id, nombre: existente.nombre }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Insertar nuevo modelo
    const result = await env.DB.prepare(
      'INSERT INTO ModelosVehiculo (nombre) VALUES (?)'
    ).bind(nombre).run();

    const nuevoId = result.meta.last_row_id;

    return new Response(JSON.stringify({
      success: true,
      modelo: { id: nuevoId, nombre }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Capturar error de constraint UNIQUE por si se slips por el check previo
    if (error.message && (error.message.includes('UNIQUE') || error.message.includes('unique'))) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Modelo ya existe',
        modelo: { id: null, nombre: data.nombre }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.error('Error al crear modelo de vehículo:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
