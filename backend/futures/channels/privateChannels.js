const INST_TYPE = 'USDT-FUTURES';

class FuturesPrivateChannels {
  constructor(wsClient) {
    this.ws = wsClient;
    this.ws.on(`channel:${INST_TYPE}:orders`, (msg) => this._onOrders(msg));
    this.ws.on(`channel:${INST_TYPE}:positions`, (msg) => this._onPositions(msg));
    this.ws.on(`channel:${INST_TYPE}:account`, (msg) => this._onAccount(msg));
  }

  subscribe() {
    this.ws.send(JSON.stringify({
      op: 'subscribe',
      args: [
        { instType: INST_TYPE, channel: 'orders', instId: 'default' },
        { instType: INST_TYPE, channel: 'positions', instId: 'default' },
        { instType: INST_TYPE, channel: 'account', coin: 'default' }
      ]
    }));
  }

  _onOrders(msg) {
    if (!Array.isArray(msg.data)) return;
    for (const o of msg.data) {
      const upd = {
        instId: o.instId,
        orderId: o.orderId,
        clientOid: o.clientOid,
        status: o.status, // live | partially_filled | filled | canceled
        side: o.side,
        tradeSide: o.tradeSide,
        posSide: o.posSide,
        price: Number(o.price || 0),
        size: Number(o.size || 0),
        filled: Number(o.accBaseVolume || 0),
        avgPrice: Number(o.priceAvg || 0),
        feeDetail: Array.isArray(o.feeDetail) ? o.feeDetail : [],
        uTime: o.uTime,
        raw: o
      };
      this.ws.emit('futures:ORDER_UPDATE', upd);
      if (upd.status === 'filled') this.ws.emit('futures:ORDER_FILLED', upd);
      if (['canceled', 'cancelled'].includes(upd.status)) this.ws.emit('futures:ORDER_CANCELED', upd);
    }
  }

  _onPositions(msg) {
    if (!Array.isArray(msg.data)) return;
    for (const p of msg.data) {
      this.ws.emit('futures:POSITION_UPDATE', { instId: p.instId, holdSide: p.holdSide, raw: p });
    }
  }

  _onAccount(msg) {
    if (!Array.isArray(msg.data)) return;
    for (const a of msg.data) {
      this.ws.emit('futures:ACCOUNT_UPDATE', { raw: a });
    }
  }
}

module.exports = { FuturesPrivateChannels, INST_TYPE };