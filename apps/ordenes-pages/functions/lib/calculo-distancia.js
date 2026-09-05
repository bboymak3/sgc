// ============================================
// LIB: CALCULO DE DISTANCIA Y CARGO POR DOMICILIO
// Global Pro Automotriz
// - Usa OSRM (gratis, sin API key) para distancia real por carretera
// - Fallback a Haversine (linea recta * 1.3) si OSRM falla
// ============================================

// Calcular distancia via OSRM (gratis, sin API key, sin tarjeta)
async function obtenerDistanciaOSRM(origenLat, origenLng, destinoLat, destinoLng) {
  try {
    var url = 'https://router.project-osrm.org/route/v1/driving/' +
      origenLng + ',' + origenLat + ';' +
      destinoLng + ',' + destinoLat +
      '?overview=false';

    var response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) return null;

    var data = await response.json();

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      // OSRM devuelve distancia en metros
      var distanciaMetros = data.routes[0].distance;
      return distanciaMetros / 1000; // convertir a km
    }

    return null;
  } catch (e) {
    console.log('OSRM no disponible, usando Haversine:', e.message);
    return null;
  }
}

// Fallback: Haversine (linea recta) con factor de correccion ~1.3
function distanciaHaversine(lat1, lon1, lat2, lon2) {
  var R = 6371; // Radio de la Tierra en km
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Obtener configuracion de domicilio desde ConfigKV
async function getConfigDomicilio(env) {
  var config = {
    habilitado: false,
    taller_lat: 0,
    taller_lng: 0,
    radio_gratis_km: 5,
    tarifa_por_km: 500,
    cargo_minimo: 1000,
    modo_cobro: 'pago_directo_tecnico', // pago_directo_tecnico | no_cobrar | sumar_factura
    cobertura_maxima_km: 50
  };

  var keys = [
    'domicilio_habilitado', 'domicilio_taller_lat', 'domicilio_taller_lng',
    'domicilio_radio_gratis_km', 'domicilio_tarifa_por_km', 'domicilio_cargo_minimo',
    'domicilio_modo_cobro', 'domicilio_cobertura_maxima_km'
  ];

  for (var i = 0; i < keys.length; i++) {
    try {
      var row = await env.DB.prepare(
        "SELECT valor FROM ConfigKV WHERE clave = ?"
      ).bind(keys[i]).first();
      if (row && row.valor !== null && row.valor !== '') {
        var val = row.valor;
        if (val === 'true' || val === 'false') {
          config[keys[i].replace('domicilio_', '')] = val === 'true';
        } else if (!isNaN(Number(val))) {
          config[keys[i].replace('domicilio_', '')] = Number(val);
        } else {
          config[keys[i].replace('domicilio_', '')] = val;
        }
      }
    } catch (e) {}
  }

  return config;
}

// Calcular cargo por domicilio
function calcularCargoDomicilio(distanciaKm, config) {
  if (!config.habilitado || !config.taller_lat || !config.taller_lng) {
    return { distancia_km: 0, cargo: 0, km_cobrables: 0, mensaje: 'Domicilio no configurado' };
  }

  if (distanciaKm <= 0) {
    return { distancia_km: 0, cargo: 0, km_cobrables: 0, mensaje: 'Sin distancia' };
  }

  var kmCobrables = Math.max(0, distanciaKm - config.radio_gratis_km);

  if (kmCobrables <= 0) {
    return {
      distancia_km: Math.round(distanciaKm * 10) / 10,
      cargo: 0,
      km_cobrables: 0,
      mensaje: 'Dentro del radio gratis (' + config.radio_gratis_km + ' km)'
    };
  }

  var cargo = Math.round(kmCobrables * config.tarifa_por_km);

  // Aplicar cargo minimo
  if (cargo < config.cargo_minimo) {
    cargo = config.cargo_minimo;
  }

  return {
    distancia_km: Math.round(distanciaKm * 10) / 10,
    cargo: cargo,
    km_cobrables: Math.round(kmCobrables * 10) / 10,
    radio_gratis: config.radio_gratis_km,
    tarifa_por_km: config.tarifa_por_km,
    mensaje: kmCobrables.toFixed(1) + ' km x $' + config.tarifa_por_km + '/km'
  };
}

// Funcion principal: calcular distancia + cargo
async function calcularDomicilio(env, destinoLat, destinoLng) {
  var config = await getConfigDomicilio(env);

  if (!config.habilitado) {
    return {
      calculado: false,
      distancia_km: 0,
      cargo: 0,
      modo_cobro: 'no_cobrar',
      mensaje: 'Domicilio no habilitado'
    };
  }

  if (!config.taller_lat || !config.taller_lng) {
    return {
      calculado: false,
      distancia_km: 0,
      cargo: 0,
      modo_cobro: config.modo_cobro,
      mensaje: 'Coordenadas del taller no configuradas'
    };
  }

  // Validar que coordenadas del taller sean validas (lat: -90 a 90, lng: -180 a 180)
  if (Math.abs(config.taller_lat) > 90 || Math.abs(config.taller_lng) > 180) {
    return {
      calculado: false,
      distancia_km: 0,
      cargo: 0,
      modo_cobro: config.modo_cobro,
      mensaje: 'Coordenadas del taller invalidas. Reconfigura la ubicacion.'
    };
  }

  // Validar que coordenadas del destino (tecnico) sean validas
  if (!destinoLat || !destinoLng || Math.abs(destinoLat) > 90 || Math.abs(destinoLng) > 180) {
    return {
      calculado: false,
      distancia_km: 0,
      cargo: 0,
      modo_cobro: config.modo_cobro,
      mensaje: 'Coordenadas GPS del tecnico invalidas.'
    };
  }

  // Intentar OSRM primero (distancia real por carretera)
  var distanciaKm = await obtenerDistanciaOSRM(
    config.taller_lat, config.taller_lng,
    destinoLat, destinoLng
  );

  // Fallback a Haversine si OSRM falla
  if (distanciaKm === null || distanciaKm === 0) {
    distanciaKm = distanciaHaversine(
      config.taller_lat, config.taller_lng,
      destinoLat, destinoLng
    );
    distanciaKm = distanciaKm * 1.3; // factor correccion carretera
    distanciaKm = Math.round(distanciaKm * 10) / 10;
  }

  var cargo = calcularCargoDomicilio(distanciaKm, config);

  return {
    calculado: true,
    distancia_km: cargo.distancia_km,
    cargo: cargo.cargo,
    km_cobrables: cargo.km_cobrables,
    modo_cobro: config.modo_cobro,
    mensaje: cargo.mensaje,
    radio_gratis: config.radio_gratis_km,
    tarifa_por_km: config.tarifa_por_km
  };
}

export { calcularDomicilio, getConfigDomicilio, calcularCargoDomicilio, obtenerDistanciaOSRM };
