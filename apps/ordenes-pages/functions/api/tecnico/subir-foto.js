// ============================================
// API: SUBIR FOTO DE TRABAJO → Cloudflare R2 via S3 API
// SGC
// Recibe base64 comprimido del cliente
// Sube a R2 via S3 API (firma V4 nativa) y guarda URL en D1
// ============================================

import { s3PutObject, r2Configurado } from '../../lib/s3-client.js';
import { asegurarColumnasFaltantes } from '../../lib/db-helpers.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    await asegurarColumnasFaltantes(env);

    const data = await request.json();

    if (!data.orden_id || !data.tecnico_id || !data.tipo_foto || !data.imagen) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan datos: orden_id, tecnico_id, tipo_foto e imagen'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Asegurar que las columnas r2_key y tamano_bytes existen en FotosTrabajo
    try { await env.DB.prepare('ALTER TABLE FotosTrabajo ADD COLUMN r2_key TEXT NOT NULL DEFAULT ""').run(); } catch (e) {}
    try { await env.DB.prepare('ALTER TABLE FotosTrabajo ADD COLUMN tamano_bytes INTEGER DEFAULT 0').run(); } catch (e) {}

    // Verificar que la orden está asignada a este técnico
    const orden = await env.DB.prepare(
      "SELECT id FROM OrdenesTrabajo WHERE id = ? AND tecnico_asignado_id = ?"
    ).bind(data.orden_id, data.tecnico_id).first();

    if (!orden) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Orden no encontrada o no asignada a este técnico'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Convertir base64 a ArrayBuffer
    const base64Data = data.imagen.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Generar key única para R2: ordenes/123/antes-1700000000.jpg
    const timestamp = Date.now();
    const r2Key = `ordenes/${data.orden_id}/${data.tipo_foto}-${timestamp}.jpg`;

    let subidoAR2 = false;
    let errorR2 = null;

    // Intentar subir a R2 via S3 API
    if (r2Configurado(env)) {
      try {
        const s3Response = await s3PutObject(env, r2Key, imageBuffer, 'image/jpeg');

        if (s3Response.ok) {
          subidoAR2 = true;
        } else {
          const errorText = await s3Response.text();
          errorR2 = `HTTP ${s3Response.status}: ${errorText.substring(0, 200)}`;
        }
      } catch (s3Error) {
        errorR2 = s3Error.message;
      }
    } else {
      errorR2 = 'Variables R2 no configuradas (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT)';
    }

    // URL de la imagen
    const urlImagen = subidoAR2
      ? `/api/imagen?key=${encodeURIComponent(r2Key)}`
      : data.imagen; // fallback: base64 completo

    // Guardar en D1
    await env.DB.prepare(`
      INSERT INTO FotosTrabajo (orden_id, tecnico_id, tipo_foto, r2_key, url_imagen, tamano_bytes, descripcion)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.orden_id,
      data.tecnico_id,
      data.tipo_foto,
      subidoAR2 ? r2Key : '',
      urlImagen,
      imageBuffer.length,
      data.descripcion || null
    ).run();

    const respuesta = {
      success: true,
      mensaje: subidoAR2 ? 'Foto guardada en R2 correctamente' : 'Foto guardada en D1 (R2 falló)',
      url: urlImagen,
      tamano: imageBuffer.length,
      almacenamiento: subidoAR2 ? 'R2' : 'D1'
    };

    // Incluir detalle del error R2 para diagnosticar
    if (!subidoAR2 && errorR2) {
      respuesta.error_r2 = errorR2;
    }

    return new Response(JSON.stringify(respuesta), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al subir foto:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
