const { WsClient } = require('../core/wsClient');
const api = require('../futures/futuresApi');
const { FuturesPrivateChannels } = require('../futures/channels/privateChannels');

const SYMBOL = process.argv[2] || 'BTCUSDT';
const SEGUNDOS = Number(process.argv[3] || 40);
const APALANCAMIENTO = Number(process.argv[4] || 5);

const pick = (obj, campos) =>
  Object.fromEntries(campos.filter((c) => obj && c in obj).map((c) => [c, obj[c]]));

async function intentar(titulo, fn) {
  console.log(`\n--- ${titulo} ---`);
  try {
    const r = await fn();
    console.log(JSON.stringify(r, null, 2));
    return r;
  } catch (e) {
    console.log('ERROR:', e.response?.data ? JSON.stringify(e.response.data) : e.message);
    return null;
  }
}

async function main() {
  const contrato = await intentar('1) Contrato', async () => {
    const c = await api.getContract(SYMBOL);
    console.log('campos disponibles:', Object.keys(c).join(', '));
    return pick(c, ['symbol', 'minTradeNum', 'minTradeUSDT', 'pricePlace', 'priceEndStep',
      'volumePlace', 'sizeMultiplier', 'makerFeeRate', 'takerFeeRate', 'minLever', 'maxLever', 'symbolStatus']);
  });

  const cuenta = await intentar('2) Cuenta (¡revisa posMode y marginMode!)', async () => {
    const a = await api.getAccount(SYMBOL);
    console.log('campos disponibles:', Object.keys(a).join(', '));
    return pick(a, ['marginCoin', 'available', 'locked', 'accountEquity', 'usdtEquity', 'marginMode',
      'posMode', 'isolatedMaxAvailable', 'crossedMaxAvailable', 'maxTransferOut',
      'isolatedLongLever', 'isolatedShortLever', 'crossedMarginLeverage', 'unrealizedPL']);
  });

  const ticker = await intentar('3) Precio', async () => {
    const t = await api.getTicker(SYMBOL);
    return pick(t, ['symbol', 'lastPr', 'bidPr', 'askPr', 'markPrice']);
  });

  if (cuenta && ticker) {
    await intentar('4) Cantidad abrible (open-count)', () =>
      api.getOpenCount(SYMBOL, ticker.lastPr, cuenta.available, APALANCAMIENTO));
  }

  await intentar('5) Órdenes pendientes', () => api.getOrdenesPendientes(SYMBOL));
  await intentar('6) Posiciones', () => api.getPosiciones(SYMBOL));

  console.log(`\n--- 7) WebSocket privado, ${SEGUNDOS} s (si no hay actividad, solo verás la confirmación) ---`);
  const ws = new WsClient('wss://ws.bitget.com/v2/ws/private');
  const canales = new FuturesPrivateChannels(ws);
  ws.once('login_success', () => canales.subscribe());
  for (const ev of ['futures:ORDER_UPDATE', 'futures:POSITION_UPDATE', 'futures:ACCOUNT_UPDATE']) {
    ws.on(ev, (d) => console.log(ev, JSON.stringify(d.raw ?? d, null, 2)));
  }
  ws.connect(true);

  setTimeout(() => {
    console.log('\nFin del sondeo.');
    process.exit(0);
  }, SEGUNDOS * 1000);
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});