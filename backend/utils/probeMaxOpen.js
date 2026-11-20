const { bitgetApi } = require('../core/httpClient');
const api = require('../futures/futuresApi');

const SYMBOL = process.argv[2] || 'BTCUSDT';

async function intentar(titulo, params) {
  console.log(`\n--- ${titulo} ---`);
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await bitgetApi.get(`/api/v2/mix/account/max-open?${qs}`);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.log('ERROR:', e.response?.data ? JSON.stringify(e.response.data) : e.message);
  }
}

async function main() {
  const t = await api.getTicker(SYMBOL);
  const cuenta = await api.getAccount(SYMBOL);
  console.log('Precio:', t.lastPr);
  console.log('Cuenta completa:', JSON.stringify(cuenta, null, 2));

  const base = { symbol: SYMBOL, productType: 'USDT-FUTURES', marginCoin: 'USDT' };
  await intentar('long, mercado', { ...base, posSide: 'long', orderType: 'market' });
  await intentar('short, mercado', { ...base, posSide: 'short', orderType: 'market' });
  await intentar('long, límite', { ...base, posSide: 'long', orderType: 'limit', openPrice: t.lastPr });
  await intentar('short, límite', { ...base, posSide: 'short', orderType: 'limit', openPrice: t.lastPr });
  process.exit(0);
}

main().catch((e) => {
  console.error('❌', e.response?.data ? JSON.stringify(e.response.data) : e.message);
  process.exit(1);
});