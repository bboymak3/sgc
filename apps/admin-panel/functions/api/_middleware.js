// ============================================
// SGC ADMIN - Auth middleware
// Valida JWT en Authorization header o cookie
// ============================================

const JWT_SECRET = "sgc-secret-key-change-in-production";

// SHA-256 hasheado en Web Crypto API
export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verifica token JWT simple (header.payload.signature con HMAC-SHA256)
export async function verifyToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const data = headerB64 + '.' + payloadB64;
    const expectedSig = await sha256Hmac(data, JWT_SECRET);
    if (expectedSig !== signatureB64) return null;
    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp && Date.now() > payload.exp * 1000) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

export async function sha256Hmac(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createToken(payload, expiresInHours = 24) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInHours * 3600 };
  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payloadB64 = btoa(JSON.stringify(fullPayload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const data = headerB64 + '.' + payloadB64;
  const sig = await sha256Hmac(data, JWT_SECRET);
  return data + '.' + sig;
}

// Middleware para todas las rutas /api/admin/*
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Rutas públicas: login y health
  if (url.pathname === '/api/auth/login' || url.pathname === '/api/health') {
    return context.next();
  }

  // Extraer token del header Authorization o cookie
  let token = null;
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    const cookie = request.headers.get('Cookie') || '';
    const match = cookie.match(/sgc_token=([^;]+)/);
    if (match) token = match[1];
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Inyectar usuario en el contexto para handlers siguientes
  context.data.user = payload;
  return context.next();
}
