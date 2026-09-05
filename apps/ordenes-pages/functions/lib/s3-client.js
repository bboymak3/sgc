// ============================================
// S3 Client para Cloudflare R2
// Firma AWS Signature V4 usando Web Crypto API
// SIN dependencias externas (funciona en Pages)
// ============================================

const encoder = new TextEncoder();

async function hmac(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

async function sha256Hex(data) {
  const hash = await crypto.subtle.digest('SHA-256', typeof data === 'string' ? encoder.encode(data) : data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getAmzDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function getDateStamp(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Realiza una petición firmada a R2 via S3 API
 * @param {object} options
 * @param {string} options.endpoint - R2 S3 endpoint (sin bucket)
 * @param {string} options.bucket - Nombre del bucket
 * @param {string} options.key - Key del objeto (ruta)
 * @param {string} options.method - GET, PUT, DELETE
 * @param {string} options.accessKeyId - Access Key ID
 * @param {string} options.secretAccessKey - Secret Access Key
 * @param {Uint8Array|string} options.body - Cuerpo de la petición
 * @param {object} options.headers - Headers adicionales
 * @returns {Response}
 */
export async function s3Request({ endpoint, bucket, key, method, accessKeyId, secretAccessKey, body, headers = {} }) {
  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = getAmzDate(now);
  const dateStamp = getDateStamp(now);

  // Host sin protocolo
  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.hostname;

  // Canonical URI
  const canonicalUri = `/${bucket}/${key}`;

  // Headers canónicos (ordenados alfabéticamente)
  const requestHeaders = {
    host,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    'x-amz-date': amzDate,
    ...headers,
  };

  // Agregar content-type si hay body
  if (body && !requestHeaders['content-type']) {
    requestHeaders['content-type'] = 'application/octet-stream';
  }

  // Ordenar headers
  const sortedHeaderKeys = Object.keys(requestHeaders).map(k => k.toLowerCase()).sort();
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${requestHeaders[k.toLowerCase()] || requestHeaders[k]}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  // Payload hash (UNSIGNED-PAYLOAD para simplificar)
  const payloadHash = 'UNSIGNED-PAYLOAD';

  // Query string vacío
  const canonicalQueryString = '';

  // Canonical Request
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // String to Sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  // Signing Key
  const kDate = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');

  // Signature
  const signature = Array.from(new Uint8Array(await hmac(kSigning, stringToSign)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // Authorization header
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // Construir headers finales
  const finalHeaders = {
    ...requestHeaders,
    Authorization: authorization,
  };

  // Hacer la petición
  const url = `${endpoint}${canonicalUri}`;
  const fetchOptions = {
    method,
    headers: finalHeaders,
  };
  if (body && method !== 'GET' && method !== 'HEAD') {
    fetchOptions.body = body;
  }

  return await fetch(url, fetchOptions);
}

/**
 * Subir un objeto a R2
 */
export async function s3PutObject(env, key, data, contentType = 'image/jpeg') {
  return await s3Request({
    endpoint: env.R2_ENDPOINT,
    bucket: env.R2_BUCKET_NAME || 'my-emdash-media',
    key,
    method: 'PUT',
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    body: data,
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000',
    },
  });
}

/**
 * Leer un objeto de R2
 */
export async function s3GetObject(env, key) {
  return await s3Request({
    endpoint: env.R2_ENDPOINT,
    bucket: env.R2_BUCKET_NAME || 'my-emdash-media',
    key,
    method: 'GET',
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });
}

/**
 * Verificar si las credenciales R2 están configuradas
 */
export function r2Configurado(env) {
  return !!(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT);
}
