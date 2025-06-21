const { WsClient, SubscribeReq } = require('./websocket/wsClient');

// Crear una instancia del cliente WebSocket
const listener = {
  receive: (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.action === 'update') {
        console.log('💰 Datos recibidos:', msg);
      }
    } catch (error) {
      console.error('❌ Error al procesar el mensaje:', error);
    }
  },
};

const wsClient = new WsClient(listener); // Usar 'new' para instanciar la clase

// Manejo de eventos
wsClient.on('open', () => {
  console.log('✅ Conexión establecida');

  // Suscribirse al canal `ticker` para el instrumento `BTCUSDT`
  const subscription = new SubscribeReq('SPOT', 'trade', 'BTCUSDT');
  wsClient.subscribe([subscription]); // Enviar la suscripción después de que la conexión esté abierta
});

wsClient.on('close', () => {
  console.log('❌ Conexión cerrada');
});

// Conectar al WebSocket público
wsClient.connect();

// Cerrar la conexión después de 30 segundos (opcional)
setTimeout(() => {
  wsClient.close();
  console.log('⚠️ Conexión cerrada manualmente');
}, 30000);