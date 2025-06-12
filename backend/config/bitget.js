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

// ✅ Clientes REST
const orderClient = new SpotOrderApi(apiKey, apiSecret, passphrase);
const accountClient = new SpotAccountApi(apiKey, apiSecret, passphrase);
const marketClient = new SpotMarketApi(apiKey, apiSecret, passphrase);

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

// ✅ Suscripción correcta (sin instId)
const privateSubscriptions = [ new SubscribeReq('spot', 'fills') ];
//privateWsClient.subscribe(privateSubscriptions);

module.exports = {
  orderClient,
  accountClient,
  marketClient,
  apiKey,
  apiSecret,
  passphrase
};