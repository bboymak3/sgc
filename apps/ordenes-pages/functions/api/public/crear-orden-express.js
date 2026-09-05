const ALLOWED_ORIGINS = [
  'https://mecanico247.com',
  'https://www.mecanico247.com',
  'https://sgc-ordenes.pages.dev',
  'https://sgc-ordenes.pages.dev',
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: getCorsHeaders(context.request) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = getCorsHeaders(request);
  try {
    const data = await request.json();
    if (!data.patente || !data.cliente || !data.telefono) {
      return new Response(JSON.stringify({ success: false, error: 'Faltan datos obligatorios' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const patente = data.patente.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 8);
    const telefono = data.telefono.replace(/[^\d+]/g, '').trim();

    // Separar nombre y apellido si vienen juntos (ej: "Juan Perez" → nombre="Juan", apellido="Perez")
    let nombre = (data.cliente || '').trim().substring(0, 100);
    let apellido = '';
    if (data.cliente_apellido) {
      apellido = (data.cliente_apellido || '').trim().substring(0, 100);
    } else {
      // Intentar separar: última palabra = apellido
      const partes = nombre.split(/\s+/);
      if (partes.length > 1) {
        apellido = partes.pop();
        nombre = partes.join(' ');
      }
    }

    const configResult = await env.DB.prepare("SELECT ultimo_numero_orden FROM Configuracion WHERE id = 1").first();
    const nuevoNumero = (configResult?.ultimo_numero_orden || 57) + 1;
    const token = crypto.randomUUID();

    // Asegurar columnas necesarias
    const colAlters = [
      'ALTER TABLE OrdenesTrabajo ADD COLUMN es_express INTEGER DEFAULT 0',
      'ALTER TABLE OrdenesTrabajo ADD COLUMN origen TEXT DEFAULT "admin"',
      'ALTER TABLE OrdenesTrabajo ADD COLUMN color TEXT DEFAULT NULL',
      'ALTER TABLE OrdenesTrabajo ADD COLUMN anio INTEGER DEFAULT NULL',
      'ALTER TABLE OrdenesTrabajo ADD COLUMN cliente_apellido TEXT DEFAULT NULL',
      'ALTER TABLE OrdenesTrabajo ADD COLUMN diagnostico_observaciones TEXT',
      'ALTER TABLE OrdenesTrabajo ADD COLUMN fecha_creacion TEXT',
      'ALTER TABLE OrdenesTrabajo ADD COLUMN referencia_direccion TEXT',
      'ALTER TABLE OrdenesTrabajo ADD COLUMN cliente_lat REAL DEFAULT 0',
      'ALTER TABLE OrdenesTrabajo ADD COLUMN cliente_lng REAL DEFAULT 0',
      'ALTER TABLE OrdenesTrabajo ADD COLUMN tipo_atencion TEXT DEFAULT "taller"',
      'ALTER TABLE Clientes ADD COLUMN apellido TEXT DEFAULT NULL',
      'ALTER TABLE Vehiculos ADD COLUMN color TEXT DEFAULT NULL',
      'ALTER TABLE Vehiculos ADD COLUMN anio INTEGER DEFAULT NULL',
    ];
    for (const c of colAlters) { try { await env.DB.exec(c); } catch (e) {} }

    // Crear o buscar cliente (buscar por nombre + teléfono)
    let cliente = await env.DB.prepare("SELECT id FROM Clientes WHERE nombre = ? AND telefono = ?").bind(nombre, telefono).first();
    let clienteId;
    if (cliente) {
      clienteId = cliente.id;
      // Actualizar apellido si no lo tiene
      if (apellido) {
        try { await env.DB.prepare("UPDATE Clientes SET apellido = ? WHERE id = ? AND (apellido IS NULL OR apellido = '')").bind(apellido, clienteId).run(); } catch(e) {}
      }
    } else {
      const r = await env.DB.prepare("INSERT INTO Clientes (nombre, apellido, telefono) VALUES (?, ?, ?)").bind(nombre, apellido || null, telefono).run();
      clienteId = r.meta.last_row_id;
    }

    // Crear o buscar vehículo
    let vehiculo = await env.DB.prepare("SELECT id FROM Vehiculos WHERE patente_placa = ?").bind(patente).first();
    let vehiculoId;
    const marca = (data.marca || '').trim().substring(0, 50) || null;
    const modelo = (data.modelo || '').trim().substring(0, 50) || null;
    const color = (data.color || '').trim().substring(0, 50) || null;
    const anio = data.anio ? parseInt(data.anio) : null;
    if (vehiculo) {
      vehiculoId = vehiculo.id;
      // Actualizar datos del vehículo si no los tiene
      if (marca || modelo || color || anio) {
        try {
          await env.DB.prepare("UPDATE Vehiculos SET marca = COALESCE(NULLIF(?, ''), marca), modelo = COALESCE(NULLIF(?, ''), modelo), color = COALESCE(NULLIF(?, ''), color), anio = COALESCE(?, anio) WHERE id = ?").bind(marca, modelo, color, anio, vehiculoId).run();
        } catch(e) {}
      }
    } else {
      const r = await env.DB.prepare("INSERT INTO Vehiculos (cliente_id, patente_placa, marca, modelo, color, anio) VALUES (?, ?, ?, ?, ?, ?)").bind(clienteId, patente, marca, modelo, color, anio).run();
      vehiculoId = r.meta.last_row_id;
    }

    const esc = (v) => (!v ? 'NULL' : "'" + String(v).replace(/'/g, "''").replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + "'");
    const dir = (data.direccion || '').trim().substring(0, 200);
    const ref = (data.referencia_direccion || '').trim().substring(0, 200);
    const obs = (data.notas_diagnostico || '').trim().substring(0, 2000);
    const fecha = data.fecha_ingreso || new Date(Date.now() - 3*3600000).toISOString().split('T')[0];
    const cLat = Number(data.cliente_lat) || 0;
    const cLng = Number(data.cliente_lng) || 0;
    const tipoAtencion = (data.tipo_atencion || 'taller').trim().substring(0, 20);
    const origenVal = (data.origen || 'web').trim().substring(0, 30);

    await env.DB.exec(
      "INSERT INTO OrdenesTrabajo (numero_orden,token,cliente_id,vehiculo_id,patente_placa,marca,modelo,color,anio," +
      "fecha_ingreso,direccion,diagnostico_observaciones,estado,fecha_creacion,es_express,referencia_direccion," +
      "origen,cliente_lat,cliente_lng,tipo_atencion,cliente_nombre,cliente_apellido,cliente_telefono) VALUES (" +
      nuevoNumero + ",'" + token + "'," + clienteId + "," + vehiculoId + ",'" + patente + "'," +
      esc(marca) + "," + esc(modelo) + "," + esc(color) + "," + (anio || 'NULL') + "," +
      esc(fecha) + "," + esc(dir) + "," + esc(obs) + ",'Aprobada',datetime('now','localtime'),1," +
      esc(ref) + "," + esc(origenVal) + "," + cLat + "," + cLng + "," + esc(tipoAtencion) + "," +
      esc(nombre) + "," + esc(apellido) + "," + esc(telefono) + ")"
    );
    await env.DB.prepare("UPDATE Configuracion SET ultimo_numero_orden = ? WHERE id = 1").bind(nuevoNumero).run();
    try { const { registrarNotificacion } = await import('../../lib/notificaciones.js'); await registrarNotificacion(env, 0, telefono, 'orden_express_creada', { numero_orden: nuevoNumero, patente_placa: patente, cliente_nombre: nombre }); } catch (ne) {}
    return new Response(JSON.stringify({ success: true, numero_orden: nuevoNumero, token, express: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error crear orden express:', error);
    return new Response(JSON.stringify({ success: false, error: 'Error interno' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
}
