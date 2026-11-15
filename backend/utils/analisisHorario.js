/**
 * Volatilidad por hora del día (datos públicos, no requiere claves).
 *
 * Uso (desde backend/):
 *   node utils/analisisHorario.js [SIMBOLO] [DIAS] [ZONA] [OBJETIVO_%] [HORAS_VENTANA]
 * Ejemplo:
 *   node utils/analisisHorario.js BTCUSDT 28 America/Santiago 0.24 8
 */
const BASE_URL = 'https://api.bitget.com/api/v2/mix/market/candles';

const [, , SYMBOL = 'BTCUSDT', DIAS = '28', ZONA = 'America/Santiago', OBJ = '0.24', VENT = '8'] = process.argv;

const dias = Math.min(Number(DIAS), 30);   // velas de 5m: la API solo guarda ~1 mes
const objetivo = Number(OBJ);              // movimiento de precio buscado, en %
const horasVentana = Number(VENT);
const MS_VELA = 5 * 60 * 1000;
const LIMITE = 1000;                       // máximo de velas por petición
const VENTANA_MS = LIMITE * MS_VELA;

const redondear = (ms) => Math.floor(ms / MS_VELA) * MS_VELA;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const prom = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const percentil = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const hh = (h) => String(h).padStart(2, '0') + ':00';

async function pedir(startTime, endTime) {
  const qs = new URLSearchParams({
    symbol: SYMBOL,
    productType: 'USDT-FUTURES',
    granularity: '5m',
    startTime: String(startTime),
    endTime: String(endTime),
    limit: String(LIMITE)
  });
  const res = await fetch(`${BASE_URL}?${qs}`);
  const json = await res.json();
  if (json.code !== '00000') throw new Error(`${json.code}: ${json.msg}`);
  return json.data;
}

async function main() {
  const fin = redondear(Date.now());
  let cursor = redondear(fin - dias * 24 * 3600 * 1000);
  const velas = new Map();

  while (cursor < fin) {
    const datos = await pedir(cursor, Math.min(cursor + VENTANA_MS, fin));
    for (const v of datos) velas.set(Number(v[0]), v);
    cursor += VENTANA_MS;
    await dormir(150);
  }
  console.log(`Velas descargadas: ${velas.size} (${SYMBOL}, 5m, ${dias} días, zona ${ZONA})\n`);

  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hourCycle: 'h23' });
  const porHora = Array.from({ length: 24 }, () => ({ rangos: [], vol: 0 }));

  for (const [ts, v] of velas) {
    const apertura = Number(v[1]);
    const alto = Number(v[2]);
    const bajo = Number(v[3]);
    const volQuote = Number(v[6]);
    if (!apertura) continue;
    const h = Number(fmt.format(new Date(ts)));
    porHora[h].rangos.push(((alto - bajo) / apertura) * 100);
    porHora[h].vol += volQuote;
  }

  const filas = porHora.map((d, h) => ({
    hora: h,
    rangoProm: prom(d.rangos),
    rangoP95: percentil(d.rangos, 0.95),
    rangoMax: Math.max(0, ...d.rangos),
    pctObjetivo: (d.rangos.filter((r) => r >= objetivo).length / (d.rangos.length || 1)) * 100,
    volProm: d.vol / (d.rangos.length || 1)
  }));

  console.table(filas.map((f) => ({
    hora: hh(f.hora),
    'rango prom %': f.rangoProm.toFixed(3),
    'rango P95 %': f.rangoP95.toFixed(3),
    'rango max %': f.rangoMax.toFixed(2),
    [`velas >= ${objetivo}%`]: f.pctObjetivo.toFixed(1) + '%',
    'vol prom USDT': Math.round(f.volProm)
  })));

  const ventanas = [];
  for (let inicio = 0; inicio < 24; inicio++) {
    const horas = Array.from({ length: horasVentana }, (_, i) => filas[(inicio + i) % 24]);
    ventanas.push({
      desde: hh(inicio),
      hasta: hh((inicio + horasVentana) % 24),
      rangoProm: prom(horas.map((f) => f.rangoProm)),
      rangoP95: prom(horas.map((f) => f.rangoP95)),
      pctObjetivo: prom(horas.map((f) => f.pctObjetivo))
    });
  }
  ventanas.sort((a, b) => a.rangoP95 - b.rangoP95);

  console.log(`\nVentanas de ${horasVentana} h con menor rango P95:`);
  console.table(ventanas.slice(0, 3).map((w) => ({
    desde: w.desde,
    hasta: w.hasta,
    'rango prom %': w.rangoProm.toFixed(3),
    'rango P95 %': w.rangoP95.toFixed(3),
    [`velas >= ${objetivo}%`]: w.pctObjetivo.toFixed(1) + '%'
  })));
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});