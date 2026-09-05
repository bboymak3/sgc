// ============================================
// API: SERVIR IMAGEN DESDE R2 via S3 API
// Global Pro Automotriz
// GET: ?key=ordenes/123/antes-1700000000.jpg
// Lee del bucket R2 via S3 API (firma V4 nativa)
// ============================================

import { s3GetObject, r2Configurado } from '../lib/s3-client.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');

    if (!key) {
      return new Response('Falta parámetro key', { status: 400 });
    }

    // Verificar que R2 está configurado
    if (!r2Configurado(env)) {
      return new Response('R2 no configurado (faltan variables R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT)', { status: 500 });
    }

    // Leer objeto de R2 via S3 API
    const s3Response = await s3GetObject(env, key);

    if (!s3Response.ok) {
      if (s3Response.status === 404 || s3Response.status === 403) {
        return new Response('Imagen no encontrada', { status: 404 });
      }
      console.error(`Error S3: ${s3Response.status} ${s3Response.statusText}`);
      return new Response('Error al leer imagen de R2', { status: 500 });
    }

    // Devolver la imagen con headers de caché
    const headers = new Headers();
    headers.set('Content-Type', s3Response.headers.get('Content-Type') || 'image/jpeg');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    const contentLength = s3Response.headers.get('Content-Length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(s3Response.body, { headers });

  } catch (error) {
    console.error('Error al servir imagen:', error);
    return new Response('Error interno', { status: 500 });
  }
}
