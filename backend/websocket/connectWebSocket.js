const WebSocket = require('ws');

const API_CONFIG = {
    WS_URL: 'wss://ws.bitget.com/v2/ws/public'
};

function connectWebSocket(symbol, channel = 'ticker') {
    const ws = new WebSocket(API_CONFIG.WS_URL);

    ws.on('open', () => {
        console.log('✅ Conectado al WebSocket público');

        // Payload ajustado según la documentación
        const payload = {
            op: 'subscribe',
            args: [
                {
                    "instType": "SPOT", // Tipo de instrumento
                    "channel":  channel, // Canal dinámico
                    "instId": symbol // Identificador del instrumento
                }
            ]
        };

        console.log('📤 Enviando payload:', JSON.stringify(payload));
        ws.send(JSON.stringify(payload));
    });

    ws.on('message', (raw) => {
        console.log('📩 Mensaje recibido:', raw);
        try {
            const msg = JSON.parse(raw);
            if (msg.event === 'error') {
                console.error(`❌ Error recibido: ${msg.msg}`);
                console.error(`Detalles del error:`, msg.arg);
            } else if (msg.arg?.channel === channel) {
                console.log(`💰 Datos recibidos para ${symbol}:`, msg.data);
            }
        } catch (error) {
            console.error('❌ Error al procesar el mensaje:', error);
        }
    });

    ws.on('error', (err) => {
        console.error('❌ Error en WebSocket:', err);
    });

    ws.on('close', () => {
        console.warn('⚠️ Conexión cerrada.');
    });
}

module.exports = {
    connectWebSocket
};