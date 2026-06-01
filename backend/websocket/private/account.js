/**
 * @file account.js
 * @description Canal privado para monitorear cambios en el balance (SPOT)
 */

class AccountChannel {
    constructor(wsClient) {
        this.ws = wsClient;
        this.channel = 'account';
        this.instType = 'SPOT';
    }

    /**
     * Suscribirse al canal de cuenta
     * @param {string} coin - 'default' para todas las monedas o una específica como 'USDT'
     */
    subscribe(coin = 'default') {
        const subMsg = {
            op: 'subscribe',
            args: [
                {
                    instType: this.instType,
                    channel: this.channel,
                    coin: coin
                }
            ]
        };
        
        console.info(`📤 [WS-PRIVATE] Suscribiendo al canal: ${this.channel}`);
        this.ws.send(JSON.stringify(subMsg));
    }

    /**
     * Procesa los datos crudos del push de Bitget
     * @param {Object} response - El objeto JSON recibido del WS
     */
    handleMessage(response) {
        // Validamos que el mensaje sea para este canal
        if (response.arg?.channel !== this.channel) return;

        if (response.action === 'snapshot' || response.action === 'update') {
            response.data.forEach(asset => {
                const balanceUpdate = {
                    coin: asset.coin,
                    available: parseFloat(asset.available),
                    frozen: parseFloat(asset.frozen),
                    locked: parseFloat(asset.locked),
                    total: parseFloat(asset.available) + parseFloat(asset.frozen) + parseFloat(asset.locked),
                    uTime: asset.uTime
                };

                // Emitimos un evento para que el sistema reaccione (ej. actualizar UI o verificar saldo para compra)
                this.ws.emit('ACCOUNT_UPDATE', balanceUpdate);
                
                // Log opcional para debug
                // console.log(`💰 [BALANCE] ${balanceUpdate.coin}: ${balanceUpdate.available} (Disp)`);
            });
        }
    }
}

module.exports = AccountChannel;