/**
 * @file cancelOrder.js
 * @description Canal para cancelar órdenes de SPOT vía WebSocket
 */

class CancelOrderChannel {
    constructor(wsClient) {
        this.ws = wsClient;
        this.channel = 'cancel-order';
        this.instType = 'SPOT';

        // Escuchar respuestas de operaciones 'trade' (compartido con place-order)
        this.ws.on('message', (msg) => {
            if (msg.event === 'trade' && msg.arg?.[0]?.channel === this.channel) {
                this.handleResponse(msg);
            }
        });
    }

    /**
     * Envía una solicitud de cancelación
     * @param {Object} params - Debe incluir orderId o clientOid
     */
    cancel(params) {
        const id = `CANCEL-${Date.now()}`;
        
        const cancelMsg = {
            op: 'trade',
            args: [
                {
                    id: id,
                    instType: this.instType,
                    instId: params.symbol || 'BTCUSDT',
                    channel: this.channel,
                    params: {
                        orderId: params.orderId,
                        clientOid: params.clientOid
                    }
                }
            ]
        };

        console.warn(`⏳ [WS-CANCEL] Solicitando cancelación de orden: ${params.orderId || params.clientOid}`);
        this.ws.send(JSON.stringify(cancelMsg));
        return id;
    }

    /**
     * Maneja la confirmación de la cancelación
     */
    handleResponse(response) {
        if (response.code && response.code !== "0") {
            console.error(`❌ [WS-CANCEL] Error al cancelar: [${response.code}] ${response.msg}`);
            this.ws.emit('CANCEL_ORDER_ERROR', response);
            return;
        }

        if (response.arg) {
            response.arg.forEach(res => {
                console.log(`🗑️ [WS-CANCEL] Orden cancelada exitosamente. ID: ${res.params.orderId}`);
                this.ws.emit('CANCEL_ORDER_SUCCESS', res.params);
            });
        }
    }
}

module.exports = CancelOrderChannel;