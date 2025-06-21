const {
  SpotOrderApi,
  SpotAccountApi,
  SpotMarketApi,
  BitgetWsClient,
  Listenner,
  SubscribeReq
} = require('bitget-api-node-sdk');

require('dotenv').config();

const apiKey = process.env.BITGET_API_KEY;
const apiSecret = process.env.BITGET_API_SECRET;
const passphrase = process.env.BITGET_PASSPHRASE;
const credentials = {
  apiKey,
  apiSecret,
  passphrase,
  baseURL: 'https://api.bitget.com' // ✅ fuerza uso de Mainnet
};
const axios = require('axios'); // Asegúrate de tener axios instalado: npm install axios
const crypto = require('crypto'); // Para generar la firma

// ✅ Clientes REST
const orderClient = new SpotOrderApi(apiKey, apiSecret, passphrase);
const accountClient = new SpotAccountApi(apiKey, apiSecret, passphrase);
const marketClient = new SpotMarketApi(apiKey, apiSecret, passphrase);

// ✅ Función para generar la firma
function generateSignature({ method, url, timestamp, body }) {
  const prehash = `${timestamp}${method}${url}${body ? JSON.stringify(body) : ''}`;
  const hmac = crypto.createHmac('sha256', apiSecret);
  return hmac.update(prehash).digest('base64');
}

// ✅ Función para obtener restricciones de los pares de trading
let symbolRestrictions = {};

async function fetchSymbolRestrictions() {
  try {
    const response = await axios.get('https://api.bitget.com/api/v2/spot/public/symbols');
    const result = response.data;

    if (!result.data || !Array.isArray(result.data)) {
      throw new Error('Respuesta inválida del API');
    }

    symbolRestrictions = result.data.reduce((acc, pair) => {
      acc[pair.symbol] = {
        sizeScale: pair.sizeScale,
        priceScale: pair.priceScale
      };
      return acc;
    }, {});
    //console.log('✅ Restricciones de pares obtenidas:', symbolRestrictions);
  } catch (error) {
    console.error('❌ Error al obtener restricciones de pares:', error.message || error);
  }
}

// Llama a la función para obtener las restricciones al iniciar el módulo
fetchSymbolRestrictions();

// ✅ Función para colocar órdenes limit usando axios
async function placeLimitOrder({ symbol, side, price, size, clientOid }) {
  // Ajustar tamaño y precio según las restricciones del par
  const sizeScale = symbolRestrictions[symbol]?.sizeScale || 2; // Escala por defecto: 2 decimales
  const priceScale = symbolRestrictions[symbol]?.priceScale || 6; // Escala por defecto: 6 decimales

  const adjustedSize = parseFloat(size).toFixed(sizeScale);
  const adjustedPrice = parseFloat(price).toFixed(priceScale);

  const url = '/api/v2/spot/trade/place-order';
  const timestamp = new Date().toISOString();
  const body = {
    symbol,
    side,
    orderType: 'limit',
    force: 'gtc',
    price: adjustedPrice,
    size: adjustedSize,
    clientOid,
  };

  const headers = {
    'Content-Type': 'application/json',
    'ACCESS-KEY': apiKey,
    'ACCESS-SIGN': generateSignature({ method: 'POST', url, timestamp, body }),
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': passphrase,
  };

  try {
    const response = await axios.post(`${credentials.baseURL}${url}`, body, { headers });
    console.log(`📤 Orden enviada: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    console.error('❌ Error al enviar la orden:', error.response?.data || error.message || error);
    throw error;
  }
}

// WebSocket privado
class PrivateWsListener extends Listenner {
  reveice(msg) {
    if (msg === 'pong' || msg === 'ping') return;
    try {
      const parsed = JSON.parse(msg);
      if (parsed.event === 'error') {
        console.error('❌ WS Error:', parsed);
      } else {
        console.log("📥 [WS Privado] Mensaje recibido:", parsed);
      }
    } catch (e) {
      console.error("❌ Error al procesar mensaje WS privado:", e);
    }
  }
}

// ✅ Instancia de WebSocket explícitamente en mainnet
const USE_TESTNET = false;
const privateListener = new PrivateWsListener();
const privateWsClient = new BitgetWsClient(privateListener, apiKey, apiSecret, passphrase, USE_TESTNET);
privateWsClient.wsUrl = 'wss://ws.bitget.com/v2/ws/private'; // Forzar URL correcta

// ✅ Suscripción correcta (sin instId)
function suscribirOrdenes(symbol) {
  const subscription = [ new SubscribeReq('SPOT', 'orders', symbol) ];
  privateWsClient.subscribe(subscription);
  console.log(`✅ Suscrito al canal de órdenes para ${symbol}`);
}

module.exports = {
  generateSignature,
  placeLimitOrder, // Nueva función para órdenes limit
  orderClient,
  accountClient,
  marketClient,
  apiKey,
  apiSecret,
  passphrase,
  suscribirOrdenes
};