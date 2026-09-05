// ============================================
// API: BUSCAR VEHÍCULO POR PATENTE
// SGC
// ============================================

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const patente = url.searchParams.get('patente');

    if (!patente) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Falta el parámetro patente'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Limpiar espacios de la patente
    const patenteLimpia = patente.replace(/\s+/g, '').toUpperCase();

    // Buscar vehículo
    const vehiculo = await env.DB.prepare(`
      SELECT v.*, c.nombre as cliente_nombre, c.rut as cliente_rut, c.telefono as cliente_telefono
      FROM Vehiculos v
      LEFT JOIN Clientes c ON v.cliente_id = c.id
      WHERE v.patente_placa = ?
    `).bind(patenteLimpia).first();

    if (vehiculo) {
      return new Response(JSON.stringify({
        success: true,
        vehiculo: {
          patente: vehiculo.patente_placa,
          marca: vehiculo.marca,
          modelo: vehiculo.modelo,
          color: vehiculo.color,
          anio: vehiculo.anio,
          cilindrada: vehiculo.cilindrada,
          combustible: vehiculo.combustible,
          kilometraje: vehiculo.kilometraje
        },
        cliente: vehiculo.cliente_nombre ? {
          nombre: vehiculo.cliente_nombre,
          rut: vehiculo.cliente_rut,
          telefono: vehiculo.cliente_telefono
        } : null
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: 'Vehículo no encontrado'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error al buscar vehículo:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
