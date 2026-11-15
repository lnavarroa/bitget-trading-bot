const fs = require('fs');
const path = require('path');

const id = process.argv[2];
const zona = process.argv[3] || 'America/Santiago';
const modo = process.argv[4]; // 'sim' | 'real' (opcional)

if (!id || (modo && !['sim', 'real'].includes(modo))) {
  console.log('Uso: node utils/analizarSim.js <botId|todos> [zona] [sim|real]');
  process.exit(1);
}

const leer = (ruta) =>
  fs.existsSync(ruta)
    ? fs.readFileSync(ruta, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];

const dirTrades = path.join(__dirname, '../logs/futures/trades');
const dirEventos = path.join(__dirname, '../logs/futures/sim');

// 'todos' junta todos los bots que tengan archivo de operaciones
const ids = id === 'todos'
  ? (fs.existsSync(dirTrades) ? fs.readdirSync(dirTrades) : [])
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => f.replace(/^bot_|\.jsonl$/g, ''))
  : [id];

const trades = ids
  .flatMap((i) => leer(path.join(dirTrades, `bot_${i}.jsonl`)))
  .filter((t) => !modo || (t.modo || 'sim') === modo);
const eventos = ids.flatMap((i) => leer(path.join(dirEventos, `bot_${i}_eventos.jsonl`)));

if (!trades.length) {
  console.log('Aún no hay operaciones cerradas para ese bot.');
}

const cuenta = (prefijo) => eventos.filter((e) => e.mensaje?.startsWith(prefijo)).length;
const ciclos = cuenta('CICLO');
const llenadas = cuenta('ENTRADA');
console.log('\nEVENTOS', {
  ciclos,
  entradasLlenadas: llenadas,
  llenadoPct: ciclos ? Number(((llenadas / ciclos) * 100).toFixed(1)) : null,
  recentrados: cuenta('recentrando'),
  fueraDeVentana: cuenta('fuera de ventana'),
  errores: eventos.filter((e) => e.tipo === 'error').length
});

const gan = trades.filter((t) => t.netoUSDT > 0).length;
const neto = trades.reduce((s, t) => s + t.netoUSDT, 0);
console.log('\nTOTAL', {
  operaciones: trades.length,
  aciertoPct: trades.length ? Number(((gan / trades.length) * 100).toFixed(1)) : null,
  netoUSDT: Number(neto.toFixed(4)),
  porOperacionUSDT: trades.length ? Number((neto / trades.length).toFixed(5)) : null
});

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', hourCycle: 'h23' });
const porHora = {};
const porSalida = {};
for (const t of trades) {
  const h = fmt.format(new Date(t.hora)) + ':00';
  const gh = (porHora[h] ||= { operaciones: 0, ganadas: 0, netoUSDT: 0 });
  gh.operaciones++;
  if (t.netoUSDT > 0) gh.ganadas++;
  gh.netoUSDT += t.netoUSDT;

  const gs = (porSalida[t.salida] ||= { operaciones: 0, netoUSDT: 0 });
  gs.operaciones++;
  gs.netoUSDT += t.netoUSDT;
}

console.log('\nPOR HORA (hora de cierre, zona ' + zona + ')');
console.table(
  Object.entries(porHora).sort().map(([hora, g]) => ({
    hora,
    operaciones: g.operaciones,
    'acierto %': ((g.ganadas / g.operaciones) * 100).toFixed(0),
    'neto USDT': g.netoUSDT.toFixed(4)
  }))
);

console.log('POR TIPO DE SALIDA');
console.table(
  Object.entries(porSalida).map(([salida, g]) => ({
    salida,
    operaciones: g.operaciones,
    'neto USDT': g.netoUSDT.toFixed(4),
    'neto prom USDT': (g.netoUSDT / g.operaciones).toFixed(4)
  }))
);