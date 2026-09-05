// ============================================
// API: OBTENER PRÓXIMO NÚMERO DE ORDEN
// Global Pro Automotriz
// ============================================

export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    const config = await env.DB.prepare(
      "SELECT ultimo_numero_orden FROM Configuracion WHERE id = 1"
    ).first();
    
    const ultimoNumero = config?.ultimo_numero_orden || 57;
    const proximoNumero = ultimoNumero + 1;
    
    return new Response(JSON.stringify({
      success: true,
      numero: proximoNumero
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error al obtener próximo número de orden:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
