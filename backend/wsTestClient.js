// wsTest.js
//const { subscribeTicker, subscribeOrders } = require('./websocket/wsClientTest');
const { connectPublicTicker } = require('./websocket/wsClient');

const testSymbol = 'BTCUSDT';

connectPublicTicker(testSymbol, (price) => {
  console.log(`💰 Precio actual de ${testSymbol}: ${price}`);
});
/*
// Escuchar precios en tiempo real
subscribeTicker(testSymbol, (data) => {
  console.log('📡 Datos recibidos en ticker:', data);
});

// Escuchar actualizaciones de órdenes privadas
subscribeOrders((order) => {
  console.log('📥 Actualización de orden:', JSON.stringify(order, null, 2));
});
*/