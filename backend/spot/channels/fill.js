/**
 * @file fill.js
 * @description Canal privado para recibir detalles de ejecuciones (Trades)
 */

class FillChannel {
    constructor(wsClient) {
        this.ws = wsClient;
        this.channel = 'fill';
        this.instType = 'SPOT';

        // Escuchar el evento específico que emite el Distribuidor en wsClient.js
        this.ws.on(`channel:${this.channel}`, (msg) => this.handleMessage(msg));
    }

    /**
     * Suscribirse al canal de ejecuciones
     * @param {string} symbol - Símbolo específico (ej. 'BTCUSDT') o 'default' para todos
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
     * Procesa los datos de ejecuciones detalladas
     */
    handleMessage(response) {
        // Validar que el mensaje traiga datos
        if (!response.data || !Array.isArray(response.data)) return;

        response.data.forEach(trade => {
            // Estructura de datos formateada para el bot
            const tradeDetail = {
                orderId: trade.orderId,
                tradeId: trade.tradeId,
                symbol: trade.symbol,
                side: trade.side,
                priceAvg: parseFloat(trade.priceAvg),
                size: parseFloat(trade.size),     // Cantidad de moneda base (BTC)
                amount: parseFloat(trade.amount), // Cantidad de moneda cotizada (USDT)
                fee: this._sumFees(trade.feeDetail),
                feeCoin: trade.feeDetail?.[0]?.feeCoin || 'USDT',
                ts: parseInt(trade.uTime)
            };

            // Emitir evento para que el TradeBot lo capture
            this.ws.emit('TRADE_FILLED', tradeDetail);
            
            console.log(`✅ [FILL] Ejecución de ${tradeDetail.side}: ${tradeDetail.size} ${tradeDetail.symbol} a ${tradeDetail.priceAvg}`);
        });
    }

    /**
     * Suma las comisiones en caso de que vengan desglosadas
     */
    _sumFees(feeDetail) {
        if (!feeDetail || !Array.isArray(feeDetail)) return 0;
        return feeDetail.reduce((acc, curr) => acc + parseFloat(curr.totalFee || 0), 0);
    }
}

module.exports = FillChannel;