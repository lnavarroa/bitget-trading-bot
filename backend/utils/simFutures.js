const { crearBot } = require('../futures/futuresBot');

const [, , SYMBOL = 'BTCUSDT', NETO = '10', SL = '5', MARGEN = '0', VENTANA = ''] = process.argv;
const [desde, hasta] = VENTANA.split('-');

const bot = crearBot({
  symbol: SYMBOL,
  netoPct: Number(NETO),
  slPct: Number(SL),
  margenMax: Number(MARGEN) || null,
  ventana: desde && hasta ? { activa: true, desde, hasta } : { activa: false }
});

console.log('Archivos:', bot.archivos);

bot.iniciar().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});

// Cada minuto se actualiza el archivo de resumen; en terminal solo una línea cada 10 min
let minutos = 0;
setInterval(() => {
  bot.guardarResumen();
  minutos += 1;
  if (minutos % 10 === 0) console.log('RESUMEN', JSON.stringify(bot.resumen()));
}, 60000);

async function salir(senal) {
  await bot.detener(senal);
  bot.guardarResumen();
  console.log('\nRESUMEN FINAL', JSON.stringify(bot.resumen(), null, 2));
  process.exit(0);
}
process.on('SIGINT', () => salir('Ctrl+C'));
process.on('SIGTERM', () => salir('SIGTERM'));