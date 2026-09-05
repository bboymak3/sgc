// ============================================
// API: TEST R2 CONNECTION
// Prueba la conexión a R2 via S3 API
// GET /api/admin/test-r2
// ============================================

import { s3PutObject, s3GetObject, r2Configurado } from '../../lib/s3-client.js';

export async function onRequestGet(context) {
  const { env } = context;

  const resultado = {
    configurado: r2Configurado(env),
    variables: {
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID ? '✅ Configurada' : '❌ Falta',
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY ? '✅ Configurada' : '❌ Falta',
      R2_ENDPOINT: env.R2_ENDPOINT || '❌ Falta',
      R2_BUCKET_NAME: env.R2_BUCKET_NAME || 'my-emdash-media (default)',
    },
    pruebas: {}
  };

  if (!r2Configurado(env)) {
    resultado.error = 'Faltan variables de entorno R2';
    return new Response(JSON.stringify(resultado, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Prueba 1: Subir un archivo de prueba
  const testKey = 'test/conexion-test.txt';
  const testData = new TextEncoder().encode(`Test R2 - ${new Date().toISOString()}`);

  try {
    const putResponse = await s3PutObject(env, testKey, testData, 'text/plain');

    resultado.pruebas.upload = {
      status: putResponse.status,
      statusText: putResponse.statusText,
      ok: putResponse.ok,
    };

    if (!putResponse.ok) {
      const errorBody = await putResponse.text();
      resultado.pruebas.upload.error = errorBody.substring(0, 500);
    } else {
      // Prueba 2: Leer el archivo de prueba
      try {
        const getResponse = await s3GetObject(env, testKey);
        resultado.pruebas.download = {
          status: getResponse.status,
          ok: getResponse.ok,
        };
        if (getResponse.ok) {
          const content = await getResponse.text();
          resultado.pruebas.download.contenido = content;
        } else {
          const errorBody = await getResponse.text();
          resultado.pruebas.download.error = errorBody.substring(0, 500);
        }
      } catch (getError) {
        resultado.pruebas.download = { error: getError.message };
      }
    }
  } catch (putError) {
    resultado.pruebas.upload = { error: putError.message };
  }

  return new Response(JSON.stringify(resultado, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
