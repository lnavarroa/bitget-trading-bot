const { bitgetApi } = require('../core/httpClient');

const PRODUCT_TYPE = 'USDT-FUTURES';
const MARGIN_COIN = 'USDT';

function datos(res) {
  if (res.data?.code !== '00000') {
    throw new Error(`${res.data?.code}: ${res.data?.msg}`);
  }
  return res.data.data;
}

async function getContract(symbol) {
  const res = await bitgetApi.get(`/api/v2/mix/market/contracts?productType=${PRODUCT_TYPE}&symbol=${symbol}`);
  return datos(res)[0];
}

async function getTicker(symbol) {
  const res = await bitgetApi.get(`/api/v2/mix/market/ticker?productType=${PRODUCT_TYPE}&symbol=${symbol}`);
  return datos(res)[0];
}

async function getAccount(symbol) {
  const res = await bitgetApi.get(
    `/api/v2/mix/account/account?symbol=${symbol}&productType=${PRODUCT_TYPE}&marginCoin=${MARGIN_COIN}`
  );
  return datos(res);
}

// Ruta y campos por confirmar en la documentación v2 (se usa en el sondeo)
async function getOpenCount(symbol, openPrice, openAmount, leverage) {
  const res = await bitgetApi.post('/api/v2/mix/account/open-count', {
    symbol,
    productType: PRODUCT_TYPE,
    marginCoin: MARGIN_COIN,
    openPrice: String(openPrice),
    openAmount: String(openAmount),
    leverage: String(leverage)
  });
  return datos(res);
}

async function getOrdenesPendientes(symbol) {
  const res = await bitgetApi.get(`/api/v2/mix/order/orders-pending?productType=${PRODUCT_TYPE}&symbol=${symbol}`);
  return datos(res);
}

async function getPosiciones(symbol) {
  const res = await bitgetApi.get(
    `/api/v2/mix/position/single-position?symbol=${symbol}&productType=${PRODUCT_TYPE}&marginCoin=${MARGIN_COIN}`
  );
  return datos(res);
}

module.exports = {
  PRODUCT_TYPE,
  MARGIN_COIN,
  getContract,
  getTicker,
  getAccount,
  getOpenCount,
  getOrdenesPendientes,
  getPosiciones
};