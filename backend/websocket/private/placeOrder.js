/**
 * @file placeOrder.js
 * @description Canal para ejecutar órdenes de compra/venta vía WebSocket (SPOT)
 */

class PlaceOrderChannel {
    constructor(wsClient) {
        this.ws = wsClient;
        this.channel = 'place-order';
        this.instType = 'SPOT';

        // Escuchar la respuesta de las operaciones 'trade'
        // Bitget responde con event: 'trade' para confirmar la creación de la orden
        this.ws.on('message', (msg) => {
            if (msg.event === 'trade' || msg.event === 'error') {
                this.handleResponse(msg);
            }
        });
    }

    /**
     * Envía una orden al exchange
     * @param {Object} params - Parámetros de la orden (side, size, price, etc.)
     */
    execute(params) {
        const id = `TS-${Date.now()}`; // Identificador único de la petición
        
        const tradeMsg = {
            op: 'trade',
            args: [
                {
                    id: id,
                    instType: this.instType,
                    instId: params.symbol || 'BTCUSDT',
                    channel: this.channel,
                    params: {
                        orderType: params.orderType || 'limit',
                        side: params.side, // 'buy' o 'sell'
                        size: params.size.toString(),
                        price: params.price ? params.price.toString() : undefined,
                        force: params.force || 'gtc',
                        clientOid: params.clientOid || id
                    }
                }
            ]
        };

        console.info(`⚡ [WS-TRADE] Enviando orden ${params.side}: ${params.size} a ${params.price || 'Market'}`);
        this.ws.send(JSON.stringify(tradeMsg));
        return id;
    }

    /**
     * Maneja la confirmación (o error) de la orden enviada
     */
    handleResponse(response) {
        // Si hay error en la ejecución
        if (response.event === 'error' || (response.code && response.code !== "0")) {
            console.error(`❌ [WS-TRADE] Fallo en la orden: [${response.code}] ${response.msg}`);
            this.ws.emit('PLACE_ORDER_ERROR', response);
            return;
        }

        // Si la orden fue aceptada por el motor de Bitget
        if (response.event === 'trade' && response.arg) {
            response.arg.forEach(res => {
                console.log(`✅ [WS-TRADE] Orden aceptada. ID: ${res.params.orderId}`);
                this.ws.emit('PLACE_ORDER_SUCCESS', res.params);
            });
        }
    }
}

module.exports = PlaceOrderChannel;