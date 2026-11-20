const { crearBot } = require('../futures/futuresBot');

const args = process.argv.slice(2);
const confirmo = args.includes('--confirmo');
const cerrarAlSalir = args.includes('--cerrar-al-salir');
const [SYMBOL = 'BTCUSDT', NETO = '1', SL = '0.36', MARGEN = '0', VENTANA = ''] =
  args.filter((a) => !a.startsWith('--'));
const [desde, hasta] = VENTANA.split('-');

if (!(Number(MARGEN) > 0)) {
  console.error('❌ En modo real el margen máximo (4º argumento) debe ser mayor que 0');
  process.exit(1);
}
console.log(`MODO REAL: ${SYMBOL}, neto ${NETO}%, stop ${SL}%, margen máx ${MARGEN} USDT, ventana ${VENTANA || 'sin ventana'}`);
if (!confirmo) {
  console.log('Esto envía órdenes reales. Agrega --confirmo para continuar.');
  process.exit(0);
}

const bot = crearBot({
  symbol: SYMBOL,
  netoPct: Number(NETO),
  slPct: Number(SL),
  margenMax: Number(MARGEN),
  dryRun: false,
  confirmoReal: true,
  maxPerdidaDiariaUSDT: Number(process.env.MAX_PERDIDA_DIA || 0.4),
  maxCaidaMin: 10,
  ventana: desde && hasta ? { activa: true, desde, hasta } : { activa: false }
});

console.log('Archivos:', bot.archivos);
bot.iniciar().catch((e) => { console.error('❌', e.message); process.exit(1); });

let minutos = 0;
setInterval(() => bot.guardarResumen(), 60000);

let saliendo = false;
async function salir(motivo) {
  saliendo = true;
  const tope = setTimeout(() => {
    console.error('Cierre demasiado lento. Revisa la app de Bitget (utils/estado.js).');
    process.exit(1);
  }, 30000);
  try {
    await bot.detener(motivo, { cerrarPosiciones: cerrarAlSalir });
    await new Promise((r) => setTimeout(r, 6000)); // deja llegar las confirmaciones finales
  } catch (e) {
    console.error('Error al cerrar:', e.message);
  }
  clearTimeout(tope);
  try { bot.guardarResumen(); } catch (e) {}
  console.log('\nRESUMEN FINAL', JSON.stringify(bot.resumen(), null, 2));
  console.log('Si quedó una posición abierta, sigue en Bitget con su TP y SL. Revísala con: node -r dotenv/config utils/estado.js');
  process.exit(0);
}
process.on('SIGINT', () => {
  if (saliendo) { console.log('Salida forzada. Revisa la app de Bitget.'); process.exit(1); }
  salir('Ctrl+C');
});
process.on('SIGTERM', () => { if (!saliendo) salir('SIGTERM'); });
process.on('unhandledRejection', (e) => { console.error('Rechazo no capturado:', e); if (!saliendo) salir('error interno'); });
process.on('uncaughtException', (e) => { console.error('Excepción no capturada:', e); if (!saliendo) salir('excepción'); });