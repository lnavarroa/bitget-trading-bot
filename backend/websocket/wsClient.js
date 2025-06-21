const WebSocket = require('ws');
const { EventEmitter } = require('events');
const { toJsonString } = require('bitget-api-node-sdk/build/lib/util');
const { WsLoginReq } = require('bitget-api-node-sdk/build/lib/model/ws/WsLoginReq');
const { WsBaseReq } = require('bitget-api-node-sdk/build/lib/model/ws/WsBaseReq');
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
  }

  connect(auth = false) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('⚠️ WebSocket ya está conectado, no se necesita reconectar.');
      return;
    }

    this.socket = new WebSocket(this.wsUrl);
  
    this.socket.on('open', () => {
      console.info(`✅ WebSocket conectado: ${this.wsUrl}`);
      if (auth) {
        this.login(); // Realizar autenticación
      }
      this.startPing();
      this.emit('open');
    });
  
    this.socket.on('message', (data) => {
      if (data.toString() === 'pong') return;
      if (this.listener?.receive && typeof this.listener.receive === 'function') {
        this.listener.receive(data.toString());
      }
      this.emit('message', data.toString());
    });
  
    this.socket.on('close', () => {
      console.warn('❌ WebSocket cerrado');
      this.stopPing();
      setTimeout(() => this.connect(auth), 5000); // Intentar reconectar después de 5 segundos
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
    const baseReq = new WsBaseReq('login', [loginReq]);

    console.log('🔒 Intentando autenticación en el WebSocket privado...');
    console.log(`📤 Login request: ${JSON.stringify(baseReq)}`);

    this.send(baseReq);

    // Escuchar mensajes para confirmar el login
    this.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.event === 'login' && msg.code === 0) {
                console.log('✅ Autenticación exitosa en el WebSocket privado.');
            } else if (msg.event === 'error') {
                console.error(`❌ Error en autenticación: ${msg.code} - ${msg.msg}`);
            }
        } catch (error) {
            console.error('❌ Error al procesar el mensaje de autenticación:', error);
        }
    });
  }

  send(msgObj) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      const msg = toJsonString(msgObj);
      this.socket.send(msg);
    } else {
      console.warn('⚠️ No se puede enviar el mensaje, el WebSocket no está conectado');
      this.connect(); // Intentar reconectar si el WebSocket no está conectado
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
    if (this.pingInterval) clearInterval(this.pingInterval); // Evitar múltiples intervalos
    this.pingInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send('ping');
      } else {
        console.warn('⚠️ No se puede enviar ping, el WebSocket no está conectado');
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
    } else {
      console.warn('⚠️ No se puede cerrar el WebSocket, ya está cerrado o no conectado');
    }
  }
}

function initWsPrivate(symbol, listener) {
  const client = new WsClient('wss://ws.bitget.com/v2/ws/private', listener);

  client.on('open', () => {
    client.login();
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