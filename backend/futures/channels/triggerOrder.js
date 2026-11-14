/**
 * @file triggerOrder.js
 * @description Canal privado para órdenes condicionales/algorítmicas (Stop-Loss, Take-Profit)
 */

class TriggerOrderChannel {
    constructor(wsClient) {
        this.ws = wsClient;
        this.channel = 'orders-algo';
        this.instType = 'SPOT';

        // Escuchar el evento del distribuidor modular en wsClient.js
        this.ws.on(`channel:${this.channel}`, (msg) => this.handleMessage(msg));
    }

    /**
     * Suscribirse al canal de órdenes trigger (Plan Orders)
     * @param {string} symbol - 'default' para todos o uno específico 'BTCUSDT'
     */
    subscribe(symbol = 'default') {
        const subMsg = {
            op: 'subscribe',
            args: [
                {
                    instType: this.instType,
                    channel: this.channel,
                    instId: symbol
                }
            ]
        };

        console.info(`📤 [WS-PRIVATE] Suscribiendo al canal: ${this.channel} [${symbol}]`);
        this.ws.send(JSON.stringify(subMsg));
    }

    /**
     * Procesa las actualizaciones de órdenes automáticas
     */
    handleMessage(response) {
        if (!response.data || !Array.isArray(response.data)) return;

        response.data.forEach(order => {
            const triggerUpdate = {
                instId: order.instId,
                orderId: order.orderId,
                clientOid: order.clientOid,
                triggerPrice: parseFloat(order.triggerPrice || 0),
                price: parseFloat(order.price || 0), // Precio al que se ejecutará
                size: parseFloat(order.size || 0),
                side: order.side,
                status: order.status, // live, executed, cancelled
                orderType: order.orderType, // market, limit
                triggerType: order.triggerType, // fill_price, mark_price
                cTime: order.cTime
            };

            // Logs informativos para saber si el "seguro" (Stop Loss) está puesto
            this._logTriggerStatus(triggerUpdate);

            // Emitir evento para el bot
            this.ws.emit('TRIGGER_ORDER_UPDATE', triggerUpdate);

            // Si la orden se disparó y se convirtió en una orden real
            if (triggerUpdate.status === 'executed') {
                this.ws.emit('TRIGGER_ORDER_EXECUTED', triggerUpdate);
            }
        });
    }

    _logTriggerStatus(order) {
        const statusIcon = order.status === 'live' ? '⏰' : '🚀';
        console.log(`${statusIcon} [TRIGGER] ${order.instId} | Esperando: ${order.triggerPrice} | Lado: ${order.side.toUpperCase()}`);
    }
}

module.exports = TriggerOrderChannel;