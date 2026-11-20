const api = require('../futures/futuresApi');

const SYMBOL = process.argv[2] || 'BTCUSDT';

(async () => {
  const pend = (await api.getOrdenesPendientes(SYMBOL))?.entrustedList || [];
  const pos = (await api.getPosiciones(SYMBOL)) || [];
  const abiertas = pos.filter((p) => Number(p.total ?? p.available ?? 0) > 0);

  console.log('Campos de posición:', Object.keys(pos[0] || {}).join(', ') || '(sin posiciones)');
  console.log('\nPOSICIONES ABIERTAS');
  console.table(abiertas.map((p) => ({
    lado: p.holdSide, tamaño: p.total ?? p.available, entrada: p.openPriceAvg,
    pnlNoRealizado: p.unrealizedPL, liquidacion: p.liquidationPrice
  })));
  console.log('ÓRDENES PENDIENTES');
  console.table(pend.map((o) => ({
    id: o.orderId, lado: o.posSide, tipo: o.tradeSide, precio: o.price, tamaño: o.size, stopAdjunto: o.presetStopLossPrice
  })));
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });