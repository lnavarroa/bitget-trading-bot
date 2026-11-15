// % de movimiento de precio necesario para ganar `netoPct` (% neto sobre margen)
// feeMaker en fracción (0.0002 = 0.02%)
function movimientoRequerido({ netoPct, apalancamiento, feeMaker }) {
  return netoPct / apalancamiento + 2 * feeMaker * 100;
}

// Niveles de entrada alrededor del precio: el spread total es `movimientoPct`
function calcularNiveles(precio, movimientoPct) {
  const mitad = movimientoPct / 100 / 2;
  return { inferior: precio * (1 - mitad), superior: precio * (1 + mitad) };
}

function paso(pricePlace, priceEndStep) {
  return Number(priceEndStep) * Math.pow(10, -Number(pricePlace));
}

// El long va abajo (redondea hacia abajo) y el short arriba (hacia arriba): nunca acortan el spread
function redondearAbajo(precio, pricePlace, priceEndStep) {
  const p = paso(pricePlace, priceEndStep);
  return Number((Math.floor(precio / p + 1e-9) * p).toFixed(pricePlace));
}
function redondearArriba(precio, pricePlace, priceEndStep) {
  const p = paso(pricePlace, priceEndStep);
  return Number((Math.ceil(precio / p - 1e-9) * p).toFixed(pricePlace));
}

// Cantidad en moneda base para un nominal en USDT, respetando el múltiplo y el mínimo del contrato
function calcularCantidad({ nominalUSDT, precio, volumePlace, sizeMultiplier, minTradeNum }) {
  const mult = Number(sizeMultiplier);
  const bruta = nominalUSDT / precio;
  const cantidad = Number((Math.floor(bruta / mult + 1e-9) * mult).toFixed(volumePlace));
  return { cantidad, cumpleMinimo: cantidad >= Number(minTradeNum) };
}

// Tasa de acierto mínima para no perder, con salida de TP maker y salida de SL taker
function tasaAciertoMinima({ netoPct, slPrecioPct, apalancamiento, feeMaker, feeTaker }) {
  const perdida = slPrecioPct * apalancamiento + (feeMaker + feeTaker) * 100 * apalancamiento;
  return perdida / (netoPct + perdida);
}

module.exports = {
  paso,
  movimientoRequerido,
  calcularNiveles,
  redondearAbajo,
  redondearArriba,
  calcularCantidad,
  tasaAciertoMinima
};