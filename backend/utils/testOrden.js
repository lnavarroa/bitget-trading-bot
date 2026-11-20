const api = require('../futures/futuresApi');
const feed = require('../futures/accountFeed');
const S = require('../futures/strategy');

const SYMBOL = process.argv[2] || 'BTCUSDT';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const contrato = await api.getContract(SYMBOL);
  const cuenta = await api.getAccount(SYMBOL);
  console.log('Campos de cuenta:', Object.keys(cuenta).join(', '));
  console.log('Cuenta:', { posMode: cuenta.posMode, marginMode: cuenta.marginMode, available: cuenta.available });
  await api.verificarCuenta(SYMBOL);

  const ws = feed.iniciar();
  ws.on('futures:ORDER_UPDATE', (u) =>
    console.log('WS orden:', JSON.stringify({ st: u.status, id: u.orderId, side: u.side, ts: u.tradeSide, ps: u.posSide, px: u.price, sz: u.size })));
  await feed.esperarCuenta();

  const t = await api.getTicker(SYMBOL);
  const px = S.redondearAbajo(Number(t.lastPr) * 0.98, contrato.pricePlace, contrato.priceEndStep);
  const sl = S.redondearAbajo(px * 0.97, contrato.pricePlace, contrato.priceEndStep);
  const { cantidad } = S.calcularCantidad({
    nominalUSDT: 8, precio: px, volumePlace: contrato.volumePlace,
    sizeMultiplier: contrato.sizeMultiplier, minTradeNum: contrato.minTradeNum
  });
  console.log(`Orden de prueba: long ${cantidad} @ ${px} (SL ${sl}), post_only`);

  const r = await api.colocarOrden({
    symbol: SYMBOL, side: 'buy', tradeSide: 'open',
    size: Number(cantidad).toFixed(contrato.volumePlace),
    price: px.toFixed(contrato.pricePlace),
    force: 'post_only', clientOid: `test${Date.now()}`,
    stopLossPrice: sl.toFixed(contrato.pricePlace)
  });
  console.log('Colocada:', r);

  await dormir(4000);
  console.log('Pendientes:', JSON.stringify((await api.getOrdenesPendientes(SYMBOL)).entrustedList, null, 2));

  console.log('Cancelando...');
  console.log('Cancelada:', await api.cancelarOrden(SYMBOL, r.orderId));
  await dormir(3000);
  console.log('Pendientes tras cancelar:', JSON.stringify((await api.getOrdenesPendientes(SYMBOL)).entrustedList));
  process.exit(0);
}

main().catch((e) => {
  console.error('❌', e.response?.data ? JSON.stringify(e.response.data) : e.message);
  process.exit(1);
});