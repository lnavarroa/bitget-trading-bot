const { bitgetApi } = require('../config/client');
const { API_CONFIG } = require('../config/config');
const { WsClient } = require('../websocket/wsClient');
const { initSpotLog, logSpotTrade } = require('./tradeLogger');
const OrderChannel = require('../websocket/private/order');
const AccountChannel = require('../websocket/private/account');
const FillChannel = require('../websocket/private/fill');
const Storage = require('./storage');

const BUY_TIMEOUT_MS = 30 * 60 * 1000;
const RESTART_DELAY_MS = 10_000;

/* =========================
   ESTADO POR BOT
========================= */

const botsActivos = new Map();

/* =========================
   WEBSOCKET ÚNICO
========================= */

const wsPrivate = new WsClient(API_CONFIG.WS_URL.replace('public', 'private'));
const orderSub = new OrderChannel(wsPrivate);
const accountSub = new AccountChannel(wsPrivate);
const fillSub = new FillChannel(wsPrivate);

/* =========================
   UTILS
========================= */

async function getPrecision(symbol) {
  try {
    const res = await bitgetApi.get(`/api/v2/spot/public/symbols?symbol=${symbol}`);
    const info = res.data.data[0];
    return {
      qty: Number(info.quantityPrecision),
      price: Number(info.pricePrecision),
      minTradeUSDT: Number(info.minTradeUSDT)
    };
  } catch {
    return { qty: 6, price: 2 };
  }
}

// Redondea hacia abajo (nunca hacia arriba) para no pedir más de lo que hay en cuenta
function floorTo(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.floor(value * factor + 1e-9) / factor;
}

// Comisión cobrada en la moneda base (se descuenta de lo comprado).
// Ignora comisiones en USDT u otras monedas (p. ej. BGB).
function feeEnMonedaBase(feeDetail, symbol) {
  if (!Array.isArray(feeDetail)) return 0;
  const baseCoin = symbol.endsWith('USDT') ? symbol.slice(0, -4) : null;
  if (!baseCoin) return 0;
  return feeDetail
    .filter(f => f.feeCoin === baseCoin)
    .reduce((acc, f) => acc + Math.abs(Number(f.fee ?? f.totalFee ?? 0)), 0);
}

// Saldo disponible de una moneda en Spot (null si no se pudo consultar)
async function getDisponible(coin) {
  try {
    const res = await bitgetApi.get(`/api/v2/spot/account/assets?coin=${coin}`);
    const item = res.data?.data?.find(a => a.coin === coin);
    return item ? Number(item.available) : null;
  } catch {
    return null;
  }
}

async function colocarOrdenVentaConRetry(payload, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await bitgetApi.post('/api/v2/spot/trade/place-order', payload);
      if (res.data?.code === '00000') return res;
    } catch {}
    await new Promise(r => setTimeout(r, 1200));
  }
  throw new Error('Venta fallida tras reintentos');
}

/* =========================
   PERSISTENCIA
========================= */

function actualizarSesion(botId) {
  const bot = botsActivos.get(botId);
  if (!bot) return;

  Storage.saveBotSession(botId, {
    botId,
    config: bot.configInicial,
    estadoActual: bot.estado,
    stats: bot.stats
  });
}

/* =========================
   LÓGICA DE TRADING
========================= */

async function procesarCompra(order, botId) {
  const bot = botsActivos.get(botId);
  if (!bot || bot.estado.faseActual !== 'comprando') return;
  if (bot.estado.lock) return;

  bot.estado.lock = true;

  try {
    const { symbol, profitMargin } = bot.configInicial;
    const precision = await getPrecision(symbol);

    const sellPrice = (
      bot.estado.ordenActual.entryPrice * (1 + profitMargin)
    ).toFixed(precision.price);

    // La comisión de compra se cobra en la moneda base: hay que descontarla de lo que se vende
    const qtyComprada = Number(order.accBaseVolume || order.size);
    const feeBase = feeEnMonedaBase(order.feeDetail, symbol);
    let qtyVendible = qtyComprada - feeBase;

    // Red de seguridad: nunca vender más de lo disponible en cuenta
    const baseCoin = symbol.endsWith('USDT') ? symbol.slice(0, -4) : null;
    const disponible = baseCoin ? await getDisponible(baseCoin) : null;
    if (Number.isFinite(disponible) && disponible > 0 && disponible < qtyVendible) {
      qtyVendible = disponible;
    }

    const qty = floorTo(qtyVendible, precision.qty).toFixed(precision.qty);
    console.log(
      `[BOT ${botId}] Venta: comprado ${qtyComprada}, comisión base ${feeBase}, disponible ${disponible}, a vender ${qty}`
    );

    if (!(Number(qty) > 0)) {
      throw new Error(`Cantidad a vender inválida (${qty})`);
    }

    logSpotTrade(botId, {
      tipo: 'compra',
      precio: Number(bot.estado.ordenActual.entryPrice),
      monto: Number(bot.estado.currentAmount),
      symbol: bot.configInicial.symbol,
      botId,
      orderId: bot.estado.ordenActual.orderId,
      hora: new Date().toISOString()
    });

    const res = await colocarOrdenVentaConRetry({
      symbol,
      side: 'sell',
      orderType: 'limit',
      force: 'gtc',
      price: sellPrice,
      size: qty,
      clientOid: `sell-${botId}-${Date.now()}`
    });

    bot.estado.ordenActual = {
      ...bot.estado.ordenActual,
      orderId: res.data.data.orderId,
      sellPrice: Number(sellPrice),
      size: Number(qty) // 👈 BTC real vendido
    };

    bot.estado.faseActual = 'vendiendo';
    actualizarSesion(botId);

  } finally {
    bot.estado.lock = false;
  }
}

async function finalizarVenta(order, botId) {
  const bot = botsActivos.get(botId);
  if (!bot || bot.estado.faseActual !== 'vendiendo') return;
  if (bot.estado.lock) return;

  bot.estado.lock = true;

  try {
    // ✅ USAR PRECIO DEFINIDO POR EL BOT, NO POR EL WS
    const price = Number(bot.estado.ordenActual?.sellPrice);

    if (!Number.isFinite(price) || price <= 0) {
      console.error(`[BOT ${botId}] Precio inválido en venta:`, price);
      return;
    }

    // ✅ USAR CANTIDAD REAL DEL BOT, NO DEL EVENTO
    const qty = Number(bot.estado.ordenActual?.size);

    if (!Number.isFinite(qty) || qty <= 0) {
      console.error(`[BOT ${botId}] Qty inválida en venta:`, qty);
      return;
    }

    const bruto = qty * price;

    // ✅ BLINDAJE CLAVE (AQUÍ VA)
    const fees = Number(bot.estado.feesAcumuladasUSDT || 0);

    bot.estado.currentAmount = bruto - fees;

    logSpotTrade(botId, {
      tipo: 'venta',
      precio: Number(bot.estado.ordenActual.sellPrice),
      monto: Number(bot.estado.currentAmount),
      symbol: bot.configInicial.symbol,
      botId,
      orderId: bot.estado.ordenActual.orderId,
      hora: new Date().toISOString()
    });

    bot.estado.feesAcumuladasUSDT = 0;
    bot.estado.fillsProcesados.clear(); // limpia fills del ciclo

    bot.stats.ciclosCompletados += 1;

    actualizarSesion(botId);
    setTimeout(() => iniciarCiclo(botId), RESTART_DELAY_MS);

  } finally {
    bot.estado.lock = false;
  }
}

/* =========================
   EVENTOS WS
========================= */

wsPrivate.on('ORDER_FILLED', async (order) => {
  for (const [botId, bot] of botsActivos.entries()) {
    if (order.orderId !== bot.estado.ordenActual?.orderId) continue;

    try {
      if (bot.estado.faseActual === 'comprando') {
        await procesarCompra(order, botId);
      } else if (bot.estado.faseActual === 'vendiendo') {
        await finalizarVenta(order, botId);
      }
    } catch (e) {
      // Evita que un error en un bot tumbe todo el proceso (rechazo sin capturar)
      const detalle = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      console.error(`[BOT ${botId}] Error procesando ORDER_FILLED: ${detalle}`);
    }
  }
});

wsPrivate.on('TRADE_FILLED', (trade) => {
  for (const [botId, bot] of botsActivos.entries()) {
    const orden = bot.estado.ordenActual;
    if (!orden) continue;
    if (trade.orderId !== orden.orderId) continue;

    // 🛑 Evitar doble conteo
    if (bot.estado.fillsProcesados.has(trade.tradeId)) continue;
    bot.estado.fillsProcesados.add(trade.tradeId);

    // ✅ CONTAR SOLO FEE EN USDT Y SOLO EN LA VENTA
    if (trade.side === 'sell' && trade.feeCoin === 'USDT') {
      const fee = Math.abs(Number(trade.fee || 0));
      bot.estado.feesAcumuladasUSDT += fee;
    }

    actualizarSesion(botId);
  }
});

/* =========================
   FALLBACK + TIMEOUT
========================= */

setInterval(async () => {
  const now = Date.now();

  for (const [botId, bot] of botsActivos.entries()) {
    const orden = bot.estado.ordenActual;
    if (!orden || bot.estado.lock) continue;
    if (bot.estado.faseActual !== 'comprando') continue;

    try {
      const res = await bitgetApi.get(
        `/api/v2/spot/trade/orderInfo?orderId=${orden.orderId}`
      );

      const info = res.data?.data?.[0];
      if (!info) continue;

      const filledQty = Number(info.accBaseVolume || 0);

      /* =========================
         CASO 1: FULLY FILLED
      ========================= */
      if (info.status === 'filled') {
        await procesarCompra(info, botId);
        continue;
      }

      const tiempoEsperando = now - orden.placedAt;
      if (tiempoEsperando < BUY_TIMEOUT_MS) continue;

      /* =========================
         CASO 2: PARTIAL FILL
      ========================= */
      if (filledQty > 0) {
        console.warn(
          `[BOT ${botId}] Partial fill detectado (${filledQty}). Forzando venta.`
        );

        // ✅ Ajustamos los datos reales ejecutados
        bot.estado.ordenActual.entryPrice = Number(info.priceAvg);
        bot.estado.ordenActual.size = filledQty;

        // ❗ NO cambiamos fase aquí
        // procesarCompra se encarga de:
        // - colocar la orden de venta
        // - pasar a "vendiendo"
        await procesarCompra(info, botId);
        continue;
      }

      /* =========================
         CASO 3: NADA EJECUTADO
      ========================= */
      await bitgetApi.post('/api/v2/spot/trade/cancel-order', {
        orderId: orden.orderId,
        symbol: orden.symbol
      });

      bot.estado.ordenActual = null;
      bot.estado.faseActual = 'esperando';
      setTimeout(() => iniciarCiclo(botId), 2000);

    } catch (e) {
      console.error(`[BOT ${botId}] Fallback error:`, e.message);
    }
  }
}, 15_000);


/* =========================
   INICIO DE CICLO
========================= */

async function iniciarCicloInterno(botId) {
  const bot = botsActivos.get(botId);
  if (!bot || !bot.activo) return;

  const { symbol, entryDiscountPercentage } = bot.configInicial;
  const capital = bot.estado.currentAmount;
  // ✅ BLINDAJE CRÍTICO (AQUÍ VA)
  if (!Number.isFinite(capital) || capital <= 0) {
    console.error(
      `[BOT ${botId}] Capital inválido (${capital}). Ciclo detenido preventivamente.`
    );
    return;
  }

  const ticker = await bitgetApi.get(
    `/api/v2/spot/market/tickers?symbol=${symbol}`
  );
  const lastPrice = Number(ticker.data.data[0].lastPr);

  const precision = await getPrecision(symbol);

  // Validaciones previas para no enviar órdenes que Bitget va a rechazar
  if (Number.isFinite(precision.minTradeUSDT) && capital < precision.minTradeUSDT) {
    throw new Error(
      `Capital ${capital} USDT menor al mínimo del par ${symbol} (${precision.minTradeUSDT} USDT)`
    );
  }

  const usdtDisponible = await getDisponible('USDT');
  if (Number.isFinite(usdtDisponible) && usdtDisponible < capital) {
    throw new Error(
      `Saldo USDT insuficiente: disponible ${usdtDisponible}, requerido ${capital}`
    );
  }

  const entryPrice = (
    lastPrice * (1 - entryDiscountPercentage)
  ).toFixed(precision.price);

  const qty = (capital / entryPrice)
    .toFixed(precision.qty);

  const res = await bitgetApi.post('/api/v2/spot/trade/place-order', {
    symbol,
    side: 'buy',
    orderType: 'limit',
    force: 'gtc',
    price: entryPrice,
    size: qty,
    clientOid: `buy-${botId}-${Date.now()}`
  });

  bot.estado.ordenActual = {
    botId,
    symbol,
    entryPrice: Number(entryPrice),
    orderId: res.data.data.orderId,
    side: 'buy',
    placedAt: Date.now()
  };

  bot.estado.faseActual = 'comprando';
  actualizarSesion(botId);
}

/* =========================
   ENTRYPOINT
========================= */

// Envuelve el ciclo para que un error (saldo, red, API) no genere un rechazo sin capturar
// que termine el proceso. Ante un error el bot queda en fase 'error' y no reintenta solo.
async function iniciarCiclo(botId) {
  try {
    await iniciarCicloInterno(botId);
  } catch (e) {
    const detalle = e.response?.data ? JSON.stringify(e.response.data) : e.message;
    console.error(`[BOT ${botId}] No se pudo iniciar el ciclo: ${detalle}`);
    const bot = botsActivos.get(botId);
    if (bot) {
      bot.estado.faseActual = 'error';
      bot.estado.ordenActual = null;
      actualizarSesion(botId);
    }
  }
}

async function ejecutarTradeLoop(config, botId) {
  initSpotLog({
    botId,
    symbol: config.symbol,
    amount: config.amount,
    profitMargin: config.profitMargin,
    entryDiscountPercentage: config.entryDiscountPercentage
  });

  botsActivos.set(botId, {
    configInicial: { ...config },
    estado: {
      faseActual: 'esperando',
      ordenActual: null,
      currentAmount: config.amount,
      lock: false,
      feesAcumuladasUSDT: 0,
      fillsProcesados: new Set()
    },
    stats: {
      fechaInicio: new Date(),
      saldoInicial: config.amount,
      ciclosCompletados: 0
    },
    activo: true
  });

  wsPrivate.connect(true);

  if (wsPrivate.hasLoggedIn) {
    // ✅ WS ya autenticado → iniciar directamente
    orderSub.subscribe(config.symbol);
    accountSub.subscribe();
    fillSub.subscribe(config.symbol);
    setTimeout(() => iniciarCiclo(botId), 500);
  } else {
    // ✅ Primer bot → esperar login
    wsPrivate.once('login_success', () => {
      orderSub.subscribe(config.symbol);
      accountSub.subscribe();
      fillSub.subscribe(config.symbol);
      setTimeout(() => iniciarCiclo(botId), 500);
    });
  }
}

/* =========================
   STOP BOT
========================= */

function detenerBot(botId) {
  botsActivos.delete(botId);
}

function getMontoActualTotal() {
  let total = 0;

  for (const bot of botsActivos.values()) {
    if (typeof bot.estado?.currentAmount === 'number') {
      total += bot.estado.currentAmount;
    }
  }

  return total;
}

/* =========================
   Recuperar Bots
========================= */
async function recuperarBotsDesdeStorage() {
  wsPrivate.connect(true);
  accountSub.subscribe();
  const sesiones = Storage.getAllSessions();

  for (const session of sesiones) {
    
    if (!session?.botId || !session?.config?.symbol) {
      console.warn('⚠️ Sesión inválida ignorada:', session);
      continue;
    }

    const { botId, config, estadoActual, stats } = session;

    console.log(`🔄 Recuperando bot ${botId}...`);

    botsActivos.set(botId, {
      configInicial: config,
      estado: {
        ...estadoActual,
        lock: false,
        fillsProcesados: new Set()
      },
      stats,
      activo: true
    });

    orderSub.subscribe(config.symbol);
    fillSub.subscribe(config.symbol);

    // ✅ Verificar orden real en Bitget
    if (estadoActual?.ordenActual?.orderId) {
      try {
        const res = await bitgetApi.get(
          `/api/v2/spot/trade/orderInfo?orderId=${estadoActual.ordenActual.orderId}`
        );
        const info = res.data?.data?.[0];

        if (info?.status === 'filled') {
          if (estadoActual.faseActual === 'comprando') {
            await procesarCompra(info, botId);
          } 
          else if (estadoActual.faseActual === 'vendiendo') {
            await finalizarVenta(info, botId);
          }
        }
      } catch (e) {
        console.error(`[BOT ${botId}] Error recuperando orden:`, e.message);
      }
    }
  }
}

/* =========================
   EXPORTS
========================= */

module.exports = {
  ejecutarTradeLoop,
  detenerBot,
  getBotsActivos: () => Array.from(botsActivos.values()),
  getMontoActualTotal,
  recuperarBotsDesdeStorage
};