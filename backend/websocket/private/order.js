/**
 * @file order.js
 * @description Canal privado para monitorear el ciclo de vida de las órdenes (SPOT)
 */

class OrderChannel {
    constructor(wsClient) {
        this.ws = wsClient;
        this.channel = 'orders';
        this.instType = 'SPOT';

        // Escuchar el evento específico del distribuidor modular
        this.ws.on(`channel:${this.channel}`, (msg) => this.handleMessage(msg));
    }

    /**
     * Suscribirse al canal de órdenes
     * @param {string} symbol - 'default' para todos los pares o uno específico como 'BTCUSDT'
     */
    subscribe(symbol) {
        const subscribeMsg = {
            op: 'subscribe',
            args: [{
                instType: 'SPOT', // Mayúsculas obligatorias
                channel: 'orders',
                instId: symbol
            }]
        };
        console.log(`📤 [WS-PRIVATE] Suscribiendo al canal: orders [${symbol}]`);
        this.ws.send(subscribeMsg);
    }

    /**
     * Procesa los cambios de estado de las órdenes
     */
    handleMessage(response) {
        if (!response.data || !Array.isArray(response.data)) return;

        response.data.forEach(order => {
            const orderUpdate = {
                instId: order.instId,
                orderId: order.orderId,
                clientOid: order.clientOid,
                status: order.status, // live, partially_filled, filled, cancelled
                side: order.side,
                price: parseFloat(order.price || 0),
                avgPrice: parseFloat(order.priceAvg || 0),
                size: parseFloat(order.size || 0),
                accBaseVolume: parseFloat(order.accBaseVolume || 0),
                uTime: order.uTime
            };

            // Logs estratégicos según el estado
            this._logStatus(orderUpdate);

            // Emitimos eventos específicos según el estado para facilitar la lógica del TradeBot
            this.ws.emit('ORDER_UPDATE', orderUpdate);

            if (orderUpdate.status === 'filled') {
                this.ws.emit('ORDER_FILLED', orderUpdate);
            } else if (orderUpdate.status === 'cancelled') {
                this.ws.emit('ORDER_CANCELLED', orderUpdate);
            }
        });
    }

    /**
     * Helper para mostrar en consola qué está pasando con la orden
     */
    _logStatus(order) {
        const icons = {
            live: '🆕',
            partially_filled: '⏳',
            filled: '✅',
            cancelled: '❌'
        };
        const icon = icons[order.status] || '❓';
        console.log(`${icon} [ORDER] ${order.instId} | ID: ${order.orderId} | Status: ${order.status.toUpperCase()}`);
    }
}

module.exports = OrderChannel;