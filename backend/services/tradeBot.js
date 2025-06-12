const {
  accountClient,
  orderClient,
  marketClient,
  apiKey,
  apiSecret,
  passphrase
} = require('../config/bitget');

const {
  BitgetWsClient,
  Listenner,
  SubscribeReq
} = require('bitget-api-node-sdk');

const { logOperacion } = require('../utils/logger');

let botActivo = false;
let currentAmount = null;

// Mapa para escuchar ejecuciones por ID
const ordenesPendientes = new Map();

// 🎧 WebSocket privado para fills
class FillListener extends Listenner {
  reveice(msg) {
    try {
      if (msg === 'pong' || msg === 'ping') return; // ⛔ Ignora pings

      const parsed = JSON.parse(msg);
      if (parsed && parsed.data && parsed.arg.channel === 'fills') {
        const fill = parsed.data[0];
        const orderId = fill.orderId;
        if (ordenesPendientes.has(orderId)) {
          ordenesPendientes.get(orderId)(); // Ejecuta el resolve()
          ordenesPendientes.delete(orderId);
          console.log(`✅ Orden ${orderId} ejecutada vía WS`);
        }
      }
    } catch (e) {
      console.error('Error procesando mensaje WS:', e);
    }
  }
}

// Iniciar WS privado global
const listener = new FillListener();
const wsPrivado = new BitgetWsClient(listener, apiKey, apiSecret, passphrase);
wsPrivado.subscribe([new SubscribeReq('spot', 'fills', '')]);

// Obtener precio por WebSocket público (ticker)
function obtenerPrecioWebSocket(symbol) {
  return new Promise((resolve) => {
    const { BitgetWsClient, SubscribeReq, Listenner } = require('bitget-api-node-sdk');

    class PrecioListener extends Listenner {
      constructor(resolve) {
        super();
        this.resolve = resolve;
        this.resuelto = false;
      }

      reveice(msg) {
        try {
          const parsed = JSON.parse(msg);
          if (parsed?.data?.c && !this.resuelto) {
            this.resuelto = true;
            this.resolve(parseFloat(parsed.data.c));
          }
        } catch (e) {
          console.error('Error WS precio:', e);
        }
      }
    }

    const priceListener = new PrecioListener(resolve);
    const ws = new BitgetWsClient(priceListener, apiKey, apiSecret, passphrase);
    const cleanSymbol = symbol.replace('_SPBL', '');
    const sub = new SubscribeReq('spot', 'ticker', cleanSymbol);
    ws.subscribe([sub]);
  });
}

async function esperarEjecucion(orderId) {
  return new Promise((resolve) => {
    ordenesPendientes.set(orderId, resolve);
  });
}

async function ejecutarScalping({ symbol, amount, profitMargin, entryDiscountPercentage }) {
  try {
    if (currentAmount === null) currentAmount = amount;

    const currentPrice = await obtenerPrecioWebSocket(symbol);
    console.log(`📈 Precio actual: ${currentPrice}`);

    const entryPrice = currentPrice * (1 - entryDiscountPercentage);
    const quantity = (currentAmount / entryPrice).toFixed(6);

    const buyOrder = await orderClient.placeOrder({
      symbol,
      side: 'buy',
      orderType: 'limit',
      price: entryPrice.toFixed(6),
      size: quantity,
      force: 'gtc'
    });

    const buyOrderId = buyOrder.data.orderId;
    console.log(`🟢 Orden de compra enviada: ${buyOrderId} a ${entryPrice.toFixed(6)}`);

    await esperarEjecucion(buyOrderId);
    logOperacion(config.botId, {
      tipo: 'compra',
      precio: entryPrice,
      monto: currentAmount,
      symbol: config.symbol
    });

    const sellPrice = entryPrice * (1 + profitMargin);
    const sellQty = (currentAmount / entryPrice).toFixed(6);

    const sellOrder = await orderClient.placeOrder({
      symbol,
      side: 'sell',
      orderType: 'limit',
      price: sellPrice.toFixed(6),
      size: sellQty,
      force: 'gtc'
    });

    const sellOrderId = sellOrder.data.orderId;
    console.log(`📤 Orden de venta enviada: ${sellOrderId} a ${sellPrice.toFixed(6)}`);

    await esperarEjecucion(sellOrderId);
    logOperacion(config.botId, {
      tipo: 'venta',
      precio: sellPrice,
      monto: currentAmount,
      symbol: config.symbol
    });

    currentAmount *= (1 + profitMargin);
    console.log(`📊 Monto actualizado: ${currentAmount.toFixed(6)} USDT`);
  } catch (error) {
    console.error('❗ Error durante el ciclo:', error.message || error);
  }
}

async function ejecutarTradeLoop(config, id, onMontoUpdate = () => {}) {
  botActivo = true;
  currentAmount = config.amount;
  console.log(`🤖 Bot iniciado para ${config.symbol}`);

  while (botActivo) {
    await ejecutarScalping(config);
    onMontoUpdate(currentAmount);
    console.log('⏸️ Esperando 5 segundos antes del próximo ciclo...');
    await new Promise(res => setTimeout(res, 5000));
  }

  console.log('🛑 Bot detenido');
}

function detenerBot() {
  botActivo = false;
}

function estaActivo() {
  return botActivo;
}

function getMontoActual() {
  return currentAmount;
}

module.exports = {
  ejecutarTradeLoop,
  detenerBot,
  estaActivo,
  getMontoActual
};
