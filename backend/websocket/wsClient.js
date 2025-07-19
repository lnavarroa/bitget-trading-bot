const WebSocket = require('ws');
const { EventEmitter } = require('events');
const { toJsonString } = require('bitget-api-node-sdk/build/lib/util');
const { WsLoginReq } = require('bitget-api-node-sdk/build/lib/model/ws/WsLoginReq');
const { SubscribeReq } = require('bitget-api-node-sdk/build/lib/model/ws/SubscribeReq');
const { apiKey, apiSecret, passphrase } = require('../config/bitget');
const crypto = require('crypto');

class WsClient extends EventEmitter {
  constructor(wsUrl, listener) {
    super();
    this.wsUrl = wsUrl || 'wss://ws.bitget.com/v2/ws/public';
    this.listener = listener;
    this.socket = null;
    this.pingInterval = null;
    this.isConnecting = false;
    this.hasLoggedIn = false;
    this.printedChannels = new Set();
  }

  connect(auth = false) {
    if (this.socket?.readyState === WebSocket.OPEN || this.isConnecting) {
      console.log('⚠️ WebSocket ya conectado o en proceso de conexión.');
      return;
    }

    this.isConnecting = true;
    this.socket = new WebSocket(this.wsUrl);
  
    this.socket.on('open', () => {
      console.info(`✅ WebSocket conectado: ${this.wsUrl}`);
      this.isConnecting = false;
      if (auth && !this.hasLoggedIn && this.wsUrl.includes('/ws/private')) {
        this.login();
      }
      this.startPing();
      this.emit('open');
    });
  
    this.socket.on('message', (data) => {
      if (data.toString() === 'pong') return;
      try {
        const msg = JSON.parse(data.toString());

        if (msg.arg?.channel && !this.printedChannels.has(msg.arg.channel)) {
          this.printedChannels.add(msg.arg.channel);
          console.log(`📥 Primer mensaje del canal '${msg.arg.channel}':`, data.toString());
        }

        if (msg.event === 'login' && msg.code === 0) {
          console.log('✅ Autenticación exitosa en el WebSocket privado.');
          this.hasLoggedIn = true;
          this.emit('login_success');
        } else if (msg.event === 'error') {
          console.error(`❌ Error en autenticación: ${msg.code} - ${msg.msg}`);
        }

        if (msg.arg?.channel === 'orders' && msg.data?.length > 0) {
          //console.log(`📥 Evento 'orders' recibido:`, data.toString());
          //console.log(`📥 Evento 'orders' recibido (raw):`, JSON.stringify(msg, null, 2));
          this.emit('orderUpdate', msg.data[0]);
        }

        if (msg.event === 'subscribe' && msg.arg?.channel === 'orders') {
          console.log(`📌 Suscripción confirmada al canal 'orders' para ${msg.arg.instId}`);
        }

      } catch (error) {
        console.error('❌ Error al procesar mensaje:', error);
      }

      if (this.listener?.receive && typeof this.listener.receive === 'function') {
        this.listener.receive(data.toString());
      }
      this.emit('message', data.toString());
    });
  
    this.socket.on('close', () => {
      console.warn('❌ WebSocket cerrado');
      this.stopPing();
      this.hasLoggedIn = false;
      this.isConnecting = false;

      // 🔁 Reintentar conexión SOLO si es WebSocket privado
      if (this.wsUrl.includes('/ws/private')) {
        setTimeout(() => this.connect(true), 5000);
      }

      this.emit('close');
    });
  
    this.socket.on('error', (error) => {
      console.error('❌ Error en WebSocket:', error);
      this.emit('error', error);
    });
  }

  login() {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const preHash = timestamp + 'GET' + '/user/verify';
    const sign = crypto.createHmac('sha256', apiSecret).update(preHash).digest('base64');

    const loginReq = new WsLoginReq(apiKey, passphrase, timestamp, sign);
    const msg = {
      op: 'login',
      args: [loginReq]
    };

    console.log('🔒 Intentando autenticación en el WebSocket privado...');
    this.send(msg);
  }

  send(msgObj) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      const msg = toJsonString(msgObj);
      this.socket.send(msg);
    } else {
      console.warn('⚠️ No se puede enviar el mensaje, WebSocket no está conectado');
    }
  }

  subscribe(subs = []) {
    const subReq = {
      op: 'subscribe',
      args: subs.map(sub => ({
        instType: sub.instType,
        channel: sub.channel,
        instId: sub.instId || 'default'
      }))
    };
    console.log(`📤 Enviando solicitud de suscripción: ${JSON.stringify(subReq)}`);
    this.send(subReq);
  }

  startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send('ping');
      }
    }, 5000);
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  close() {
    this.stopPing();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.close();
    }

    // ❗ IMPORTANTE: Evita reconectar si es WebSocket público
    if (this.wsUrl.includes('/ws/public')) {
      this.socket = null; // evitar reintento automático externo
      this.isConnecting = false;
    }
  }
}

function initWsPrivate(symbol, listener) {
  const client = new WsClient('wss://ws.bitget.com/v2/ws/private', listener);

  client.on('login_success', () => {
    client.subscribe([
      new SubscribeReq('SPOT', 'orders', symbol)
    ]);
  });

  client.connect(true);
  return client;
}

module.exports = {
  WsClient,
  initWsPrivate,
  SubscribeReq,
};
