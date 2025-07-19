const {
  createOrder,
  accountClient,
  orderClient,
  placeLimitOrder,
  suscribirOrdenes
} = require('../config/bitget');

const { WsClient, initWsPrivate, SubscribeReq } = require('../websocket/wsClient');
const { logOperacion } = require('../utils/logger');

let botActivo = false;
let currentAmount = null;
let ordenActual = null;
let faseActual = null;
let symbolMonitoreado = null;
let configInicial = null;
let ciclesCount = null;

const ordenesPendientes = new Map();
const botsActivos = new Map();

const wsClient = new WsClient('wss://ws.bitget.com/v2/ws/private', {
  receive: (data) => {
    //console.log('📩 Mensaje recibido:', data);
  }
});

wsClient.on('login_success', () => {
  if (symbolMonitoreado) {
    wsClient.subscribe([
      new SubscribeReq('SPOT', 'orders', symbolMonitoreado)
    ]);
  } else {
    console.warn('⚠️ No se pudo suscribir al canal de órdenes: símbolo no definido aún.');
  }
});

wsClient.on('orderUpdate', async (order) => {
  console.log(`✅ --**--Evento Recibido--**--`);
  console.log('📦 Orden completa recibida:\n', JSON.stringify(order, null, 2));

  const orderId = order.orderId;
  const status = order.status;
  const symbol = order.instId;

  if (!ordenActual || ordenActual.symbol !== symbol) {
    console.log('⚠️ Orden recibida pero ignorada por símbolo. Esperado:', ordenActual?.symbol, 'Recibido:', symbol);
    return;
  }

  if (faseActual === 'comprando' && order.side === 'buy' && status === 'filled') {
    console.log(`✅ Orden COMPRA completada (${order.side}): ${orderId}`);
    logOperacion(ordenActual.botId, {
      tipo: 'compra',
      precio: ordenActual.entryPrice,
      monto: currentAmount,
      symbol
    });
    
    const sellPrice = ordenActual.entryPrice * (1 + ordenActual.profitMargin);
    const cantidadComprada = parseFloat(order.accBaseVolume);
    const fee = parseFloat(order.feeDetail?.[0]?.fee || '0');
    const sellQty = (cantidadComprada + fee).toFixed(6);

    console.log(`precio venta: ${sellPrice}, cantidad comprada ${cantidadComprada}, fee: ${fee}, cantidad venta; ${sellQty} `);

//aqui coloca la orden de venta, 
//luego de confirmar el evento que confirma la orden limit de compra
    const sellOrder = await placeLimitOrder({
      symbol,
      side: 'sell',
      price: sellPrice.toFixed(6),
      size: sellQty,
      clientOid: `orden-venta-${Date.now()}`
    });

    const sellOrderId = sellOrder?.data?.orderId;
    if (!sellOrderId) throw new Error('❌ No se recibió orderId de venta');

    faseActual = 'vendiendo';
    ordenActual.orderId = sellOrderId;
    ordenActual.sellPrice = sellPrice;
    
    console.log(`📤 Orden de VENTA puesta: ${sellOrderId}`);

  } else if (faseActual === 'vendiendo' && order.side === 'sell' && status === 'filled') {
      console.log(`✅ Orden VENTA completada (${order.side}): ${orderId}`);
      logOperacion(ordenActual.botId, {
        tipo: 'venta',
        precio: ordenActual.sellPrice,
        monto: currentAmount,
        symbol
      });

      // Calcular datos para log de venta
      const sellPrice = ordenActual.sellPrice;
      const cantidadComprada = parseFloat(order.accBaseVolume);
      const feeDetalle = order.feeDetail || [];

      let feeUSDT = 0;
      for (const f of feeDetalle) {
        if (f.feeCoin === 'USDT') {
          feeUSDT += Math.abs(parseFloat(f.fee));
        }
      }

      const montoRecibido = cantidadComprada * sellPrice;
      const montoNeto = montoRecibido - feeUSDT;
      currentAmount = montoNeto;

      const sellQty = cantidadComprada.toFixed(6); // para mantener consistencia en el log

      console.log(`precio venta: ${sellPrice}, cantidad comprada: ${cantidadComprada}, fee USDT: ${feeUSDT}, cantidad venta: ${sellQty}`);
      console.log(`📊 Monto actualizado: ${currentAmount.toFixed(6)} USDT`);

      setTimeout(() => {
        iniciarCiclo({
          ...configInicial,
          amount: currentAmount  // actualizamos con lo ganado
        });
      }, 3000);
    }
});

async function obtenerPrecio(symbol) {
  return new Promise((resolve, reject) => {
    const wspublic = new WsClient('wss://ws.bitget.com/v2/ws/public');

    const timeout = setTimeout(() => {
      wspublic.close();
      reject(new Error('⏰ Timeout esperando precio'));
    }, 8000);

    wspublic.on('open', () => {
      wspublic.subscribe([
        new SubscribeReq('SPOT', 'ticker', symbol)
      ]);
    });

    wspublic.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (
          ['snapshot', 'update'].includes(msg.action) &&
          msg.arg?.channel === 'ticker' &&
          msg.data?.[0]?.lastPr
        ) {
          clearTimeout(timeout); // 💡 Detener timeout al recibir el precio
          const precio = parseFloat(msg.data[0].lastPr);
          wspublic.close(); // 💡 Cerrar solo si no se cerró aún
          resolve(precio);
        }
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });

    wspublic.connect(false); // sin auth
  });
}

async function iniciarCiclo(config) {
  try {
    const { symbol, amount, profitMargin, entryDiscountPercentage, botId } = config;
    if (currentAmount === null) currentAmount = amount;

    //const wsPublicClient = new WsClient('wss://ws.bitget.com/v2/ws/public', { receive: () => {} });
    const currentPrice = await obtenerPrecio(symbol);

    /* 💡 Cerrar después de obtener precio
    if (wsPublicClient.socket?.readyState === 1) {
      wsPublicClient.close();
    }*/

    const entryPrice = currentPrice * (1 - entryDiscountPercentage);
    const quantity = (currentAmount / entryPrice).toFixed(6);

    console.log(`➡️ Colocando orden de compra: ${quantity} ${symbol} a ${entryPrice.toFixed(6)} USDT`);

    const buyOrder = await placeLimitOrder({
      symbol,
      side: 'buy',
      price: entryPrice.toFixed(6),
      size: quantity,
      clientOid: `orden-compra-${Date.now()}`
    });

    const buyOrderId = buyOrder?.data?.orderId;
    console.log(`➡️ Orden de --COMPRA-- puesta ${buyOrderId}`);

    if (!buyOrderId) throw new Error('❌ No se recibió orderId de compra');

    ordenActual = {
      botId,
      symbol,
      profitMargin,
      entryPrice,
      orderId: buyOrderId
    };
    faseActual = 'comprando';

    //console.log(`🟢 Orden de compra enviada: ${buyOrderId}`);
  } catch (err) {
      console.error('❗ Error en el ciclo de trading:');
      if (err.response?.data) {
        console.error('📦 Respuesta de la API:', JSON.stringify(err.response.data, null, 2));
      } else if (err.message) {
        console.error('💬 Mensaje:', err.message);
      } else if (typeof err === 'object') {
        console.error('📋 Detalles:', JSON.stringify(err, null, 2));
      } else {
        console.error('🧨 Error desconocido:', err.message || err);
      }
    }
}

function ejecutarTradeLoop(config, id, onMontoUpdate = () => {}) {
  console.log('📋 Config actual:\n', JSON.stringify(config, null, 2));
  const { symbol } = config;
  symbolMonitoreado = symbol;
  configInicial = { ...config };
  botsActivos.set(id, { activo: true, monto: config.amount });
  console.log(`🤖 Bot iniciado para ${symbol}`);
  /*wsClient.on('open', () => {
    wsClient.login();
    wsClient.subscribe([
      new SubscribeReq('SPOT', 'orders', symbol)
    ]);
  });*/
  wsClient.connect(true);
  iniciarCiclo(config);
}

function detenerBot(id) {
  if (botsActivos.has(id)) {
    botsActivos.get(id).activo = false;
    botsActivos.delete(id);
  }
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