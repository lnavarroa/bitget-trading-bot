const { WsClient } = require('../core/wsClient');
const { FuturesPrivateChannels } = require('./channels/privateChannels');

let ws = null;
let ultimaCuenta = null;

function iniciar() {
  if (ws) return ws;
  ws = new WsClient('wss://ws.bitget.com/v2/ws/private');
  const canales = new FuturesPrivateChannels(ws);
  ws.on('futures:ACCOUNT_UPDATE', ({ raw }) => {
    ultimaCuenta = { ...raw, recibidoEn: Date.now() };
  });
  ws.once('login_success', () => canales.subscribe());
  ws.connect(true);
  return ws;
}

const getCuenta = () => ultimaCuenta;

async function esperarCuenta(timeoutMs = 10000) {
  iniciar();
  const t0 = Date.now();
  while (!ultimaCuenta && Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, 200));
  }
  return ultimaCuenta;
}

module.exports = { iniciar, getCuenta, esperarCuenta };