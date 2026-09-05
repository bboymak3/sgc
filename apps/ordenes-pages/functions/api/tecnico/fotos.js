// ============================================
// API: OBTENER FOTOS DE UNA ORDEN
// Global Pro Automotriz
// GET: ?orden_id=X
// Devuelve URLs que apuntan a /api/imagen?key=...
// ============================================

import { asegurarColumnasFaltantes } from '../../lib/db-helpers.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    // Asegurar columnas nuevas de R2
    try { await env.DB.prepare('ALTER TABLE FotosTrabajo ADD COLUMN r2_key TEXT NOT NULL DEFAULT ""').run(); } catch (e) {}
    try { await env.DB.prepare('ALTER TABLE FotosTrabajo ADD COLUMN tamano_bytes INTEGER DEFAULT 0').run(); } catch (e) {}

    const url = new URL(request.url);
    const ordenId = url.searchParams.get('orden_id');

    if (!ordenId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Falta ID de la orden'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Obtener fotos de la orden
    // Si r2_key existe, usar /api/imagen?key=r2_key como URL
    // Si no (fotos antiguas), usar url_imagen que tiene el base64
    const fotos = await env.DB.prepare(`
      SELECT id, tipo_foto, r2_key, url_imagen, descripcion, tamano_bytes, fecha_subida
      FROM FotosTrabajo
      WHERE orden_id = ?
      ORDER BY fecha_subida ASC
    `).bind(ordenId).all();

    // Transformar URLs: si tiene r2_key, usar el endpoint de imagen
    const fotosTransformadas = (fotos.results || []).map(f => {
      if (f.r2_key) {
        // Foto en R2: servir via endpoint
        return {
          ...f,
          url_imagen: `/api/imagen?key=${encodeURIComponent(f.r2_key)}`
        };
      }
      // Foto antigua (base64): usar tal cual
      return f;
    });

    return new Response(JSON.stringify({
      success: true,
      fotos: fotosTransformadas
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al obtener fotos:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
