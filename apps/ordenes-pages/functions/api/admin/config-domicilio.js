// ============================================
// API: CONFIGURACION DE DOMICILIO (CARGO POR RECORRIDO)
// Global Pro Automotriz
// GET  -> obtener config actual
// POST -> guardar configuracion
// ============================================

import { obtenerDistanciaOSRM, calcularCargoDomicilio } from '../../lib/calculo-distancia.js';
import { chileNow } from '../../lib/db-helpers.js';

// Asegurar que ConfigKV existe (igual que ultramsg.js)
async function asegurarConfigKV(env) {
  try {
    await env.DB.prepare("PRAGMA table_info(Configuracion)").all();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ConfigKV (
      clave TEXT PRIMARY KEY,
      valor TEXT,
      fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();
  } catch (e) {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ConfigKV (
      clave TEXT PRIMARY KEY,
      valor TEXT,
      fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();
  }
}

async function getConfigValue(env, clave) {
  try {
    var row = await env.DB.prepare("SELECT valor FROM ConfigKV WHERE clave = ?").bind(clave).first();
    if (row) return row.valor;
  } catch (e) {}
  return '';
}

async function setConfigValue(env, clave, valor) {
  try {
    await env.DB.prepare(
      `INSERT INTO ConfigKV (clave, valor, fecha_actualizacion) VALUES (?, ?, ${chileNow()}) ON CONFLICT(clave) DO UPDATE SET valor = ?, fecha_actualizacion = ${chileNow()}`
    ).bind(clave, valor, valor).run();
    return true;
  } catch (e) {
    return false;
  }
}

export async function onRequestGet(context) {
  var { env } = context;
  try {
    await asegurarConfigKV(env);

    var hVal = await getConfigValue(env, 'domicilio_habilitado');
    var latVal = await getConfigValue(env, 'domicilio_taller_lat');
    var lngVal = await getConfigValue(env, 'domicilio_taller_lng');
    var radioVal = await getConfigValue(env, 'domicilio_radio_gratis_km');
    var tarifaVal = await getConfigValue(env, 'domicilio_tarifa_por_km');
    var minimoVal = await getConfigValue(env, 'domicilio_cargo_minimo');
    var modoVal = await getConfigValue(env, 'domicilio_modo_cobro');
    var coberturaVal = await getConfigValue(env, 'domicilio_cobertura_maxima_km');

    var config = {
      habilitado: hVal === 'true',
      taller_lat: Number(latVal) || 0,
      taller_lng: Number(lngVal) || 0,
      radio_gratis_km: Number(radioVal) || 5,
      tarifa_por_km: Number(tarifaVal) || 500,
      cargo_minimo: Number(minimoVal) || 1000,
      modo_cobro: modoVal || 'pago_directo_tecnico',
      cobertura_maxima_km: Number(coberturaVal) || 50
    };

    return new Response(JSON.stringify({
      success: true,
      config: config
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}

export async function onRequestPost(context) {
  var { request, env } = context;
  try {
    await asegurarConfigKV(env);
    var data = await request.json();

    // Accion: probar distancia (test)
    if (data.accion === 'test_distancia') {
      var lat = Number(data.lat_tecnico);
      var lng = Number(data.lng_tecnico);
      var tallerLat = Number(await getConfigValue(env, 'domicilio_taller_lat')) || 0;
      var tallerLng = Number(await getConfigValue(env, 'domicilio_taller_lng')) || 0;

      if (!tallerLat || !tallerLng) {
        return new Response(JSON.stringify({
          success: false, error: 'Primero configura las coordenadas del taller'
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      var distanciaKm = await obtenerDistanciaOSRM(tallerLat, tallerLng, lat, lng);
      if (distanciaKm === null) {
        // Fallback Haversine
        var R = 6371;
        var dLat = (lat - tallerLat) * Math.PI / 180;
        var dLon = (lng - tallerLng) * Math.PI / 180;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(tallerLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        distanciaKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distanciaKm = Math.round(distanciaKm * 1.3 * 10) / 10;
      }

      var radioGratis = Number(await getConfigValue(env, 'domicilio_radio_gratis_km')) || 5;
      var tarifa = Number(await getConfigValue(env, 'domicilio_tarifa_por_km')) || 500;
      var cargoMinimo = Number(await getConfigValue(env, 'domicilio_cargo_minimo')) || 1000;
      var kmCobrables = Math.max(0, distanciaKm - radioGratis);
      var cargo = kmCobrables > 0 ? Math.max(cargoMinimo, Math.round(kmCobrables * tarifa)) : 0;

      return new Response(JSON.stringify({
        success: true,
        distancia_km: Math.round(distanciaKm * 10) / 10,
        km_cobrables: Math.round(kmCobrables * 10) / 10,
        cargo: cargo,
        metodo: distanciaKm > 0 ? 'OSRM (carretera real)' : 'Calculado'
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Accion: guardar configuracion
    var habilitado = data.habilitado === true || data.habilitado === 'true';
    await setConfigValue(env, 'domicilio_habilitado', habilitado ? 'true' : 'false');
    await setConfigValue(env, 'domicilio_taller_lat', String(data.taller_lat || 0));
    await setConfigValue(env, 'domicilio_taller_lng', String(data.taller_lng || 0));
    await setConfigValue(env, 'domicilio_radio_gratis_km', String(data.radio_gratis_km || 5));
    await setConfigValue(env, 'domicilio_tarifa_por_km', String(data.tarifa_por_km || 500));
    await setConfigValue(env, 'domicilio_cargo_minimo', String(data.cargo_minimo || 1000));
    await setConfigValue(env, 'domicilio_modo_cobro', String(data.modo_cobro || 'pago_directo_tecnico'));
    await setConfigValue(env, 'domicilio_cobertura_maxima_km', String(data.cobertura_maxima_km || 50));

    return new Response(JSON.stringify({
      success: true,
      mensaje: 'Configuracion de domicilio guardada correctamente'
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    });
  }
}
