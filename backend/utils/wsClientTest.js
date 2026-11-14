// websocket/wsClientTest.js
const WebSocket = require('ws');

const WS_URL = 'wss://ws.bitget.com/v2/ws/public';

function connectPublicTicker(symbol, onPrice) {
  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('✅ Conectado al WebSocket público');

    const payload = {
      op: 'subscribe',
      args: [
        {
          channel: 'ticker',
          instId: symbol // Ejemplo: BTCUSDT
        }
      ]
    };

    console.log('📤 Enviando suscripción:', JSON.stringify(payload));
    ws.send(JSON.stringify(payload));
  });

  ws.on('message', (raw) => {
    console.log('📩 Mensaje recibido:', raw); // Log completo del mensaje recibido
    try {
      const msg = JSON.parse(raw);
      if (msg.event) {
        console.log('ℹ️ Evento recibido:', msg.event);
        return;
      }

      if (msg.arg?.channel === 'ticker') {
        const data = msg.data?.[0];
        if (data?.last) {
          console.log('💰 Precio recibido:', data.last);
          onPrice(parseFloat(data.last));
        } else {
          console.log('⚠️ No se encontró el precio en el mensaje:', msg);
        }
      } else {
        console.log('⚠️ Canal no esperado:', msg.arg?.channel);
      }
    } catch (e) {
      console.error('❌ Error al procesar mensaje:', e);
    }
  });

  ws.on('error', (err) => {
    console.error('❌ Error en WebSocket:', err);
  });

  ws.on('close', () => {
    console.warn('⚠️ Conexión cerrada. Intentando reconectar...');
    setTimeout(() => connectPublicTicker(symbol, onPrice), 5000);
  });

  return ws;
}

module.exports = {
  connectPublicTicker
};