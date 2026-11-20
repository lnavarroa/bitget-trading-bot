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
  const res = await get(`/api/v2/mix/market/contracts?productType=${PRODUCT_TYPE}&symbol=${symbol}`);
  return datos(res)[0];
}

async function getTicker(symbol) {
  const res = await get(`/api/v2/mix/market/ticker?productType=${PRODUCT_TYPE}&symbol=${symbol}`);
  return datos(res)[0];
}

async function getAccount(symbol) {
  const res = await get(
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
  const res = await get(`/api/v2/mix/order/orders-pending?productType=${PRODUCT_TYPE}&symbol=${symbol}`);
  return datos(res);
}

async function getPosiciones(symbol) {
  const res = await get(
    `/api/v2/mix/position/single-position?symbol=${symbol}&productType=${PRODUCT_TYPE}&marginCoin=${MARGIN_COIN}`
  );
  return datos(res);
}

function errorBitget(e) {
  const d = e.response?.data;
  return d?.msg ? new Error(`${d.code}: ${d.msg}`) : e;
}

async function get(url) {
  try {
    return await bitgetApi.get(url);
  } catch (e) {
    throw errorBitget(e);
  }
}

async function colocarOrden(o) {
  const body = {
    symbol: o.symbol,
    productType: PRODUCT_TYPE,
    marginMode: 'isolated',
    marginCoin: MARGIN_COIN,
    size: String(o.size),
    side: o.side,
    tradeSide: o.tradeSide,
    orderType: o.orderType || 'limit',
    clientOid: o.clientOid
  };
  if (body.orderType === 'limit') {
    body.price = String(o.price);
    body.force = o.force || 'post_only';
  }
  if (o.stopLossPrice) body.presetStopLossPrice = String(o.stopLossPrice);
  try {
    const res = await bitgetApi.post('/api/v2/mix/order/place-order', body);
    return datos(res); // { orderId, clientOid }
  } catch (e) {
    throw errorBitget(e);
  }
}

async function cancelarOrden(symbol, orderId) {
  try {
    const res = await bitgetApi.post('/api/v2/mix/order/cancel-order', {
      symbol, productType: PRODUCT_TYPE, marginCoin: MARGIN_COIN, orderId
    });
    return datos(res);
  } catch (e) {
    throw errorBitget(e);
  }
}

async function setLeverage(symbol, leverage, holdSide) {
  try {
    const res = await bitgetApi.post('/api/v2/mix/account/set-leverage', {
      symbol, productType: PRODUCT_TYPE, marginCoin: MARGIN_COIN, leverage: String(leverage), holdSide
    });
    return datos(res);
  } catch (e) {
    throw errorBitget(e);
  }
}

async function verificarCuenta(symbol) {
  const c = await getAccount(symbol);
  if (c.posMode !== 'hedge_mode') {
    throw new Error(`La cuenta no está en modo cobertura (posMode=${c.posMode}). Corrígelo en la app antes de operar.`);
  }
  return c;
}

module.exports = {
  PRODUCT_TYPE,
  MARGIN_COIN,
  getContract,
  getTicker,
  getAccount,
  getOpenCount,
  getOrdenesPendientes,
  getPosiciones,
  colocarOrden,
  cancelarOrden,
  setLeverage,
  verificarCuenta
};