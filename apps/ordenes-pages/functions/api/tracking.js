// ============================================
// API: TRACKING PÚBLICO (ver ubicación del técnico)
// GET /api/tracking?token=XXX
// El cliente consulta la ubicación en tiempo real del técnico
// ============================================

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Token requerido'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Buscar la orden por token
    const orden = await env.DB.prepare(
      `SELECT id, numero_orden, patente_placa, estado_trabajo, tecnico_asignado_id,
              tecnico_lat, tecnico_lng,
              COALESCE(cliente_nombre, '') as cliente_nombre,
              COALESCE(direccion, '') as direccion
       FROM OrdenesTrabajo WHERE token = ?`
    ).bind(token).first();

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Solo mostrar tracking si la orden está en estados donde el técnico debería estar en movimiento
    const estadosConTracking = ['Pendiente Visita', 'En Sitio', 'En Progreso'];
    if (!estadosConTracking.includes(orden.estado_trabajo)) {
      return new Response(JSON.stringify({
        success: true,
        activo: false,
        estado: orden.estado_trabajo,
        orden: {
          numero_orden: orden.numero_orden,
          patente: orden.patente_placa,
          cliente: orden.cliente_nombre,
          direccion: orden.direccion
        },
        mensaje: 'El técnico aún no ha iniciado el viaje'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener datos del técnico
    let tecnico = { nombre: 'Técnico' };
    if (orden.tecnico_asignado_id) {
      try {
        const t = await env.DB.prepare(
          'SELECT nombre, telefono FROM Tecnicos WHERE id = ?'
        ).bind(orden.tecnico_asignado_id).first();
        if (t) tecnico = t;
      } catch(e) {}
    }

    // Obtener última ubicación conocida
    let ubicacion = null;
    
    // Primero intentar desde la columna rápida de la orden
    if (orden.tecnico_lat && orden.tecnico_lng && orden.tecnico_lat !== 0) {
      ubicacion = {
        latitud: orden.tecnico_lat,
        longitud: orden.tecnico_lng,
        velocidad: 0,
        fecha: null
      };
    }

    // Luego intentar desde la tabla de tracking (más preciso)
    try {
      const ultimoPunto = await env.DB.prepare(
        'SELECT latitud, longitud, velocidad, fecha_registro FROM TrackingTecnico WHERE orden_id = ? ORDER BY id DESC LIMIT 1'
      ).bind(orden.id).first();

      if (ultimoPunto) {
        ubicacion = {
          latitud: ultimoPunto.latitud,
          longitud: ultimoPunto.longitud,
          velocidad: ultimoPunto.velocidad || 0,
          fecha: ultimoPunto.fecha_registro
        };
      }
    } catch(e) {
      // Tabla no existe aún, usar la ubicación de la orden
    }

    // Obtener ruta (últimos 50 puntos para dibujar el recorrido)
    let ruta = [];
    try {
      const puntos = await env.DB.prepare(
        'SELECT latitud, longitud, fecha_registro FROM TrackingTecnico WHERE orden_id = ? ORDER BY id DESC LIMIT 50'
      ).bind(orden.id).all();

      if (puntos.results && puntos.results.length > 0) {
        // Invertir para orden cronológico (del más viejo al más nuevo)
        ruta = puntos.results.reverse().map(function(p) {
          return { lat: p.latitud, lng: p.longitud, fecha: p.fecha_registro };
        });
      }
    } catch(e) {}

    return new Response(JSON.stringify({
      success: true,
      activo: true,
      estado: orden.estado_trabajo,
      orden: {
        numero_orden: orden.numero_orden,
        patente: orden.patente_placa,
        cliente: orden.cliente_nombre,
        direccion: orden.direccion
      },
      tecnico: {
        nombre: tecnico.nombre
      },
      ubicacion: ubicacion,
      ruta: ruta
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('Error en tracking público:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
