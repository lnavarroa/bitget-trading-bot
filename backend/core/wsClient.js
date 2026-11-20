const WebSocket = require('ws');
const { EventEmitter } = require('events');
const crypto = require('crypto');
require('dotenv').config();

class WsClient extends EventEmitter {
  
  constructor(wsUrl) {
    super();
    this.wsUrl = wsUrl;
    this.socket = null;
    this.pingInterval = null;
    this.reconnectTimeout = null;
    this.isConnecting = false;
    this.hasLoggedIn = false;

    this.apiKey = process.env.BITGET_API_KEY;
    this.apiSecret = process.env.BITGET_API_SECRET;
    this.passphrase = process.env.BITGET_PASSPHRASE;

    // ✅ NUEVO: memoria de suscripciones
    this.subscriptions = [];
  }


  
  connect(auth = false) {
    if (this.socket?.readyState === WebSocket.OPEN || this.isConnecting) return;

    this.isConnecting = true;
    this.socket = new WebSocket(this.wsUrl);

    this.socket.on('open', () => {
      this.isConnecting = false;
      this.startPing();
      auth ? this.login() : this.emit('open');
    });

    this.socket.on('message', (data) => {
      
    const text = data.toString();

      // ✅ IGNORAR PING / PONG
      if (text === 'pong' || text === 'ping') {
        return;
      }

      let msg;
      try {
        msg = JSON.parse(text);
      } catch (err) {
        console.warn('⚠️ WS mensaje no JSON ignorado:', text);
        return;
      }

      if (msg.event === 'login' && (msg.code === 0 || msg.code === '0')) {
        this.hasLoggedIn = true;

        // ✅ RE-SUSCRIPCIÓN AUTOMÁTICA
        this.subscriptions.forEach(sub => {
          this.send(sub);
        });

        this.emit('login_success');
      }

            if (msg.event === 'error') {
        console.error('❌ WS error:', JSON.stringify(msg));
      }

      // Datos y confirmaciones: arg es un objeto { instType, channel, instId }
      if (msg.arg && !Array.isArray(msg.arg) && msg.arg.channel) {
        const { instType, channel } = msg.arg;
        this.emit(`channel:${instType}:${channel}`, msg);
      }

      // Respuestas a órdenes enviadas por WebSocket: arg llega como lista
      if (msg.event === 'trade' && Array.isArray(msg.arg)) {
        this.emit('trade_response', msg);
      }
    });

    this.socket.on('error', (err) => {
      // 'close' se dispara después y programa la reconexión
      console.error('❌ WS error de conexión:', err.message);
    });

    this.socket.on('close', () => {
      this.isConnecting = false;
      this.hasLoggedIn = false;
      this.stopPing();
      this.reconnectTimeout = setTimeout(() => this.connect(auth), 5000);
    });
  }


  login() {
    // Bitget V2 requiere timestamp en segundos para el Login WS
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const path = '/user/verify';
    
    const preHash = timestamp + method + path;
    const sign = crypto
      .createHmac('sha256', this.apiSecret)
      .update(preHash)
      .digest('base64');

    const loginMsg = {
      op: 'login',
      args: [{
        apiKey: this.apiKey,
        passphrase: this.passphrase,
        timestamp: timestamp,
        sign: sign
      }]
    };

    console.log('🔒 Enviando credenciales de autenticación...');
    this.send(loginMsg);
  }

  // Método genérico para enviar objetos JSON

  send(data) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    if (!this.subscriptions.includes(msg) && msg.includes('"op":"subscribe"')) {
      this.subscriptions.push(msg);
    }
    this.socket?.readyState === 1 && this.socket.send(msg);
  }


  startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send('ping');
      }
    }, 25000); // 25s para estar dentro del límite de 30s de Bitget
  }

  stopPing() {
    if (this.pingInterval) clearInterval(this.pingInterval);
  }
}

module.exports = { WsClient };