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
const ordenesPendientes = new Map();

const wsClient = new WsClient('wss://ws.bitget.com/v2/ws/private', {
  receive: (data) => {
    console.log('📩 Mensaje recibido:', data);
  }
});
/*
// Suscribirse al canal `orders` para manejar eventos de órdenes llenadas
wsClient.on('open', () => {
  console.log('✅ WebSocket conectado');
  const subscribeReq = {
    op: 'subscribe',
    args: [
      {
        instType: 'SPOT',
        channel: 'orders',
        instId: 'default' // Cambiar dinámicamente según el símbolo
      }
    ]
  };
  console.log('✅ WebSocket conectado');
  wsClient.subscribeReq([
    { instType: 'SPOT', channel: 'orders', instId: 'default' },
    { instType: 'SPOT', channel: 'ticker', instId: 'default' }
  ]);
  wsClient.send(subscribeReq);
  console.log(`sendInfo:${JSON.stringify(subscribeReq)}`);
});
*/
wsClient.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    if (msg.event === 'error') {
      console.error(`❌ Error recibido del WebSocket: ${msg.code} - ${msg.msg}`);
      return;
    }

    if (msg.action === 'update' && msg.arg.channel === 'orders') {
      const order = msg.data[0];
      const orderId = order.orderId;
      if (ordenesPendientes.has(orderId) && order.status === 'filled') {
        ordenesPendientes.get(orderId)();
        ordenesPendientes.delete(orderId);
        console.log(`✅ Orden ${orderId} ejecutada`);
      }
    }
  } catch (error) {
    console.error('❌ Error al procesar el mensaje:', error);
  }
});
/*
async function obtenerPrecio(symbol) {
  console.log(`✅ Entrando a obtener precio para ${symbol}`);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('⏰ Timeout esperando precio'));
    }, 15000);

    wsClient.subscribe([
      new SubscribeReq('SPOT', 'ticker', symbol)
    ]);

    wsClient.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.action === 'snapshot' && msg.arg.channel === 'ticker' && msg.data[0]?.lastPr) {
          const precioActual = parseFloat(msg.data[0].lastPr);
          console.log(`📈 Precio actual para ${symbol}: ${precioActual}`);
          clearTimeout(timeout);
          resolve(parseFloat(msg.data[0].lastPr));
        }
      } catch (error) {
        console.error('❌ Error al procesar el mensaje:', error);
      }
    });
  });
}*/

async function obtenerPrecio(symbol) {
  console.log(`✅ Entrando a obtener precio para ${symbol}`);
  
  // Crear un nuevo cliente WebSocket público para obtener el precio
  const wsPublicClient = new WsClient('wss://ws.bitget.com/v2/ws/public', {
    receive: (data) => {
      console.log('📩 Mensaje recibido del WebSocket público:', data);
    }
  });

  return new Promise((resolve, reject) => {
    wsPublicClient.connect(); // Conectar al WebSocket público

    wsPublicClient.on('open', () => {
      console.log('✅ WebSocket público conectado para obtener precio.');

      wsPublicClient.subscribe([
        new SubscribeReq('SPOT', 'ticker', symbol)
      ]);
    });

    wsPublicClient.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.action === 'snapshot' && msg.arg.channel === 'ticker' && msg.data[0]?.lastPr) {
          const precioActual = parseFloat(msg.data[0].lastPr);
          console.log(`📈 Precio actual para ${symbol}: ${precioActual}`);
          if (wsPublicClient.socket?.readyState === WebSocket.OPEN) {
            wsPublicClient.close();
            console.log('✅ WebSocket público cerrado después de obtener el precio.');
          }
          resolve(precioActual);
        }
      } catch (error) {
        console.error('❌ Error al procesar el mensaje:', error);
      }
    });

    const timeout = setTimeout(() => {
      console.error('❗ Timeout esperando precio.');
      if (wsPublicClient.socket?.readyState === WebSocket.OPEN) {
        wsPublicClient.close();
        console.log('✅ WebSocket público cerrado después de timeout.');
      }
      reject(new Error('⏰ Timeout esperando precio'));
    }, 15000);
  });
}

async function esperarEjecucion(orderId) {
  return new Promise((resolve) => {
    ordenesPendientes.set(orderId, resolve);
  });
}

async function ejecutarScalping(config) {
  try {
    console.log(`🟢 Iniciando ejecutarScalping para ${config.symbol}`);
    const { symbol, amount, profitMargin, entryDiscountPercentage } = config;
    if (currentAmount === null) currentAmount = amount;

    // Obtener el precio actual del mercado
    const currentPrice = await obtenerPrecio(symbol);
    console.log(`📈 Precio actual: ${currentPrice}`);

    // Calcular el precio de entrada con el descuento
    const entryPrice = currentPrice * (1 - entryDiscountPercentage);
    const quantity = (currentAmount / entryPrice).toFixed(6);
    console.log(`➡️ Intentando comprar ${quantity} ${symbol} a ${entryPrice.toFixed(6)} USDT`);

    // Colocar la orden limit de compra usando placeLimitOrder
    const buyOrder = await placeLimitOrder({
      symbol,
      side: 'buy',
      price: entryPrice.toFixed(6), // Precio calculado con entryDiscount
      size: quantity, // Cantidad calculada
      clientOid: `orden-compra-${Date.now()}`, // ID único para la orden
    });

    const buyOrderId = buyOrder?.data?.orderId;
    if (!buyOrderId) throw new Error('❌ No se recibió orderId en respuesta de compra');
    console.log(`🟢 Orden de compra enviada: ${buyOrderId}`);

    // Esperar a que la orden se ejecute
    await esperarEjecucion(buyOrderId);
    logOperacion(config.botId, {
      tipo: 'compra',
      precio: entryPrice,
      monto: currentAmount,
      symbol
    });

    // Calcular el precio de venta y colocar la orden limit de venta
    const sellPrice = entryPrice * (1 + profitMargin);
    const sellQty = (currentAmount / entryPrice).toFixed(6);

    const sellOrder = await placeLimitOrder({
      symbol,
      side: 'sell',
      price: sellPrice.toFixed(6), // Precio calculado para la venta
      size: sellQty, // Cantidad calculada
      clientOid: `orden-venta-${Date.now()}`, // ID único para la orden
    });

    const sellOrderId = sellOrder?.data?.orderId;
    if (!sellOrderId) throw new Error('❌ No se recibió orderId en respuesta de venta');
    console.log(`📤 Orden de venta enviada: ${sellOrderId}`);

    // Esperar a que la orden de venta se ejecute
    await esperarEjecucion(sellOrderId);
    logOperacion(config.botId, {
      tipo: 'venta',
      precio: sellPrice,
      monto: currentAmount,
      symbol
    });

    // Actualizar el monto actual después de la venta
    currentAmount *= (1 + profitMargin);
    console.log(`📊 Monto actualizado: ${currentAmount.toFixed(6)} USDT`);

  } catch (error) {
    console.error('❗ Error durante el ciclo:', error.message || error);
    if (error.response?.data) {
      console.error('❗ Respuesta del API:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

let botsActivos = new Map();

function ejecutarTradeLoop(config, id, onMontoUpdate = () => {}) {
  const { symbol } = config; // El par de trading viene desde el frontend
  botsActivos.set(id, { activo: true, monto: config.amount });
  console.log(`🤖 Bot iniciado para ${symbol}`);

  wsClient.on('open', () => {
    console.log('✅ WebSocket conectando ejecutarTradeLoop');
    wsClient.login();
    console.log('🔒 Autenticación exitosa en el WebSocket privado.');
    
    const subscribeReq = {
      op: 'subscribe',
      args: [
        {
          instType: 'SPOT',
          channel: 'orders',
          instId: symbol || 'default' // Usar el par dinámico o 'default' si no está definido
        }
      ]
    };/*
    wsClient.on('open', () => {
      console.log('✅ WebSocket conectado ejecutarTradeLoop');
      wsClient.subscribe([
        { instType: 'SPOT', channel: 'orders', instId: symbol },
        { instType: 'SPOT', channel: 'ticker', instId: symbol }
      ]);
    });*/
    wsClient.send(JSON.stringify(subscribeReq));
    console.log(`sendInfo:${JSON.stringify(subscribeReq)}`);
  });

  // Escuchar mensajes del WebSocket para confirmar la conexión al canal privado
  wsClient.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.event === 'subscribe' && msg.code === 0) {
        console.log(`✅ Conexión exitosa al canal privado: ${JSON.stringify(msg)}`);
      } else if (msg.event === 'error') {
        console.error(`❌ Error al conectar al canal privado: ${msg.code} - ${msg.msg}`);
      }
    } catch (error) {
      console.error('❌ Error al procesar el mensaje del WebSocket:', error);
    }
  });

  wsClient.on('error', (error) => {
    console.error('❌ WS Error:', error);
  });

  (async function loop() {
    while (botsActivos.get(id)?.activo) {
      console.log(`🔄 Ejecutando ciclo de scalping para el bot con ID: ${id}`);
      await ejecutarScalping(config);
      onMontoUpdate(botsActivos.get(id).monto);
      console.log('⏸️ Esperando 5 segundos antes del próximo ciclo...');
      await new Promise(res => setTimeout(res, 5000));
    }
    console.log(`🛑 Bot detenido para ${symbol} con ID: ${id}`);
  })();
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