const WebSocket = require('ws');

// Dominio correcto para el canal público
const WS_URL = 'wss://ws.bitget.com/v2/ws/public';

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ Conexión al WebSocket establecida');
  const payload = {
    op: 'subscribe',
    args: [
      {
        instType: 'SPOT',
        channel: 'trade', // Cambia el canal si es necesario
        instId: 'BTCUSDT', // Identificador confirmado
      },
    ],
  };

  console.log('📤 Enviando payload:', JSON.stringify(payload));
  ws.send(JSON.stringify(payload));
});

ws.on('message', (data) => {
  console.log('📩 Mensaje recibido:', data);
  try {
    const msg = JSON.parse(data);
    if (msg.event === 'error') {
      console.error(`❌ Error recibido: ${msg.msg}`);
      console.error(`Detalles del error:`, msg.arg);
    } else {
      console.log('💰 Datos recibidos:', msg);
    }
  } catch (error) {
    console.error('❌ Error al procesar el mensaje:', error);
  }
});

ws.on('error', (error) => {
  console.error('❌ Error en WebSocket:', error);
});

ws.on('close', () => {
  console.warn('⚠️ Conexión cerrada');
});