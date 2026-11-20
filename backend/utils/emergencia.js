const api = require('../futures/futuresApi');

const SYMBOL = process.argv[2] || 'BTCUSDT';

async function main() {
  const pend = await api.getOrdenesPendientes(SYMBOL);
  for (const o of pend?.entrustedList || []) {
    try { await api.cancelarOrden(SYMBOL, o.orderId); console.log('cancelada', o.orderId); }
    catch (e) { console.log('no se pudo cancelar', o.orderId, e.message); }
  }

  const pos = await api.getPosiciones(SYMBOL);
  for (const p of pos || []) {
    const size = Number(p.available ?? p.total ?? 0);
    if (!(size > 0)) continue;
    try {
      await api.colocarOrden({
        symbol: SYMBOL,
        side: p.holdSide === 'long' ? 'buy' : 'sell',
        tradeSide: 'close',
        size,
        orderType: 'market',
        clientOid: `emerg${Date.now()}${p.holdSide}`
      });
      console.log(`cierre a mercado enviado: ${p.holdSide} ${size}`);
    } catch (e) {
      console.log(`ERROR cerrando ${p.holdSide}:`, e.message, '-> ciérrala desde la app');
    }
  }
  console.log('Confirma en la app de Bitget que no quedan posiciones, órdenes ni TP/SL pendientes.');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌', e.response?.data ? JSON.stringify(e.response.data) : e.message);
  process.exit(1);
});