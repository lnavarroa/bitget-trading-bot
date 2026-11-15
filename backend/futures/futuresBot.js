const fs = require('fs');
const path = require('path');
const api = require('./futuresApi');
const feed = require('./accountFeed');
const S = require('./strategy');
const { SimExchange } = require('./simExchange');
const { enVentana, minutosHastaCierre } = require('./schedule');
const { crearEventLog } = require('./eventLog');

const TRADES_DIR = path.join(__dirname, '../logs/futures/trades');

const DEFAULTS = {
  dryRun: true,
  netoPct: 1,               // % neto sobre margen (incluye el apalancamiento)
  apalancamiento: 5,
  slPct: 0.36,              // stop loss, % de precio
  margenMax: null,          // USDT de margen máximo (null = todo lo abrible)
  ventana: { activa: false, desde: '22:00', hasta: '06:00', zona: 'America/Santiago' },
  minutosSinEntradaCierre: 10,
  recentrarMin: 15,
  cierreForzadoMin: 15,
  maxPerdidaDiariaUSDT: 1,
  intervaloMs: 1500,
  pausaEntreCiclosMs: 3000,
  slipTicks: 1
};

function crearBot(userConfig) {
  const cfg = {
    ...DEFAULTS,
    ...userConfig,
    ventana: { ...DEFAULTS.ventana, ...(userConfig.ventana || {}) }
  };
  const id = cfg.botId || Date.now();
  const tag = `[FUT ${id} ${cfg.symbol}]`;

  const elog = crearEventLog(id);
  const nota = (mensaje) => {
    console.log(`${tag} ${mensaje}`);
    elog.log('info', { mensaje });
  };
  const notaError = (mensaje) => {
    console.error(`${tag} ${mensaje}`);
    elog.log('error', { mensaje });
  };

  const estado = {
    fase: 'iniciando',
    precio: null,
    ciclo: null,
    trades: [],
    pnlDia: 0,
    dia: null,
    ultimoCierre: 0,
    salioDeVentana: null,
    errores: 0,
    detenido: false,
    motivo: null
  };

  let contrato = null;
  let ctx = null;
  let sim = null;
  let timer = null;
  let ocupado = false;

  const dia = () => new Intl.DateTimeFormat('en-CA', { timeZone: cfg.ventana.zona }).format(new Date());

  function registrarTrade(f) {
    const bruto = f.leg === 'long' ? (f.precio - f.entry) * f.size : (f.entry - f.precio) * f.size;
    const feeEntrada = f.entry * f.size * ctx.feeMaker;
    const feeSalida = f.precio * f.size * (f.tipo === 'tp' ? ctx.feeMaker : ctx.feeTaker);
    const neto = bruto - feeEntrada - feeSalida;
    const margen = (f.entry * f.size) / cfg.apalancamiento;
    const trade = {
      hora: new Date().toISOString(),
      modo: cfg.dryRun ? 'sim' : 'real',
      leg: f.leg,
      salida: f.tipo,
      entrada: f.entry,
      precioSalida: f.precio,
      size: f.size,
      netoUSDT: Number(neto.toFixed(6)),
      netoPctMargen: Number(((neto / margen) * 100).toFixed(3))
    };
    if (estado.dia !== dia()) { estado.dia = dia(); estado.pnlDia = 0; }
    estado.pnlDia += neto;
    estado.trades.push(trade);
    if (estado.trades.length > 500) estado.trades.shift();
    fs.mkdirSync(TRADES_DIR, { recursive: true });
    fs.appendFileSync(path.join(TRADES_DIR, `bot_${id}.jsonl`), JSON.stringify(trade) + '\n');
    nota(`CIERRE ${trade.leg} por ${trade.salida}: ${trade.netoUSDT} USDT (${trade.netoPctMargen}% del margen)`);
  }

  function onFill(f) {
    if (f.tipo === 'entry') {
      nota(`ENTRADA ${f.leg} llenada @ ${f.precio}`);
      const otra = f.leg === 'long' ? 'short' : 'long';
      if (sim.tieneEntradaActiva(otra)) {
        sim.cancelarEntrada(otra);
        nota(`entrada ${otra} cancelada`);
      }
      const tp = f.leg === 'long' ? estado.ciclo.superior : estado.ciclo.inferior;
      sim.colocarSalida(f.leg, tp);
      estado.fase = `${f.leg}_abierto`;
    } else {
      registrarTrade(f);
      if (!sim.hayPosiciones() && !sim.hayEntradas()) {
        estado.ultimoCierre = Date.now();
        estado.fase = 'esperando';
      }
    }
  }

  async function abrirCiclo(precio) {
    const cuenta = feed.getCuenta();
    const abrible = Number(cuenta?.maxOpenPosAvailable ?? cuenta?.available ?? 0);
    const margen = cfg.margenMax ? Math.min(cfg.margenMax, abrible || cfg.margenMax) : abrible;
    if (!(margen > 0)) throw new Error('Sin margen disponible (¿llegó el feed de cuenta?)');

    const mov = S.movimientoRequerido({
      netoPct: cfg.netoPct,
      apalancamiento: cfg.apalancamiento,
      feeMaker: ctx.feeMaker
    });
    const n = S.calcularNiveles(precio, mov);
    const inferior = S.redondearAbajo(n.inferior, contrato.pricePlace, contrato.priceEndStep);
    const superior = S.redondearArriba(n.superior, contrato.pricePlace, contrato.priceEndStep);

    const nominalPorPata = (margen / 2) * 0.95 * cfg.apalancamiento;
    const { cantidad, cumpleMinimo } = S.calcularCantidad({
      nominalUSDT: nominalPorPata,
      precio: superior,
      volumePlace: contrato.volumePlace,
      sizeMultiplier: contrato.sizeMultiplier,
      minTradeNum: contrato.minTradeNum
    });
    if (!cumpleMinimo || cantidad * superior < Number(contrato.minTradeUSDT)) {
      throw new Error(`Margen insuficiente: ${cantidad} por pata no cumple el mínimo del contrato`);
    }

    const slLong = S.redondearAbajo(inferior * (1 - cfg.slPct / 100), contrato.pricePlace, contrato.priceEndStep);
    const slShort = S.redondearArriba(superior * (1 + cfg.slPct / 100), contrato.pricePlace, contrato.priceEndStep);

    sim.colocarEntrada('long', inferior, cantidad, slLong);
    sim.colocarEntrada('short', superior, cantidad, slShort);
    estado.ciclo = { precioRef: precio, inferior, superior, cantidad, inicio: Date.now(), mov };
    estado.fase = 'entradas';
    nota(
      `CICLO: long ${inferior} / short ${superior} (mov ${mov.toFixed(3)}%), ` +
      `${cantidad} por pata, SL ${slLong} / ${slShort}`
    );
  }

  async function gestionar(precio) {
    if (estado.dia !== dia()) { estado.dia = dia(); estado.pnlDia = 0; }
    const dentro = enVentana(cfg.ventana);
    const hayPos = sim.hayPosiciones();
    const hayEnt = sim.hayEntradas();

    // Fuera de la ventana: cancela entradas; una posición abierta tiene un plazo antes del cierre forzado
    if (!dentro) {
      if (hayEnt) {
        sim.cancelarEntrada('long');
        sim.cancelarEntrada('short');
        nota(`fuera de ventana: entradas canceladas`);
      }
      if (hayPos) {
        estado.salioDeVentana = estado.salioDeVentana || Date.now();
        if (Date.now() - estado.salioDeVentana > cfg.cierreForzadoMin * 60000) {
          ['long', 'short'].forEach((l) => sim.cerrarAMercado(l));
        }
      } else {
        estado.fase = 'fuera_de_ventana';
      }
      return;
    }
    estado.salioDeVentana = null;

    if (hayPos) return; // esperamos el TP o el SL

    if (hayEnt) {
      const edadMin = (Date.now() - estado.ciclo.inicio) / 60000;
      if (edadMin >= cfg.recentrarMin) {
        sim.cancelarEntrada('long');
        sim.cancelarEntrada('short');
        nota(`recentrando entradas (${edadMin.toFixed(1)} min sin llenarse)`);
      }
      return;
    }

    if (cfg.ventana.activa && minutosHastaCierre(cfg.ventana) <= cfg.minutosSinEntradaCierre) {
      estado.fase = 'cerca_del_cierre';
      return;
    }
    if (estado.pnlDia <= -cfg.maxPerdidaDiariaUSDT) {
      detener(`pérdida diaria alcanzada (${estado.pnlDia.toFixed(4)} USDT)`);
      return;
    }
    if (Date.now() - estado.ultimoCierre < cfg.pausaEntreCiclosMs) return;
    await abrirCiclo(precio);
  }

  async function latido() {
    if (ocupado || estado.detenido) return;
    ocupado = true;
    try {
      const t = await api.getTicker(cfg.symbol);
      const precio = Number(t.lastPr);
      estado.precio = precio;
      sim.onPrecio(precio);
      await gestionar(precio);
      estado.errores = 0;
    } catch (e) {
      estado.errores += 1;
      const detalle = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      notaError(`error (${estado.errores}): ${detalle}`);
      if (estado.errores >= 20) detener('demasiados errores consecutivos');
    } finally {
      ocupado = false;
    }
  }

  async function iniciar() {
    if (!cfg.dryRun) throw new Error('El modo real aún no está implementado: usa dryRun: true');
    contrato = await api.getContract(cfg.symbol);
    if (!contrato || contrato.symbolStatus !== 'normal') {
      throw new Error(`Contrato no operable: ${contrato?.symbolStatus}`);
    }
    ctx = { feeMaker: Number(contrato.makerFeeRate), feeTaker: Number(contrato.takerFeeRate) };
    const tick = S.paso(contrato.pricePlace, contrato.priceEndStep);
    sim = new SimExchange({ tick, slipTicks: cfg.slipTicks });
    sim.on('fill', onFill);
    await feed.esperarCuenta();
    estado.dia = dia();
    estado.fase = 'esperando';
    nota(`SIMULACIÓN iniciada (maker ${ctx.feeMaker}, taker ${ctx.feeTaker})`);
    timer = setInterval(latido, cfg.intervaloMs);
  }

  function detener(motivo = 'manual') {
    if (estado.detenido) return;
    estado.detenido = true;
    estado.motivo = motivo;
    clearInterval(timer);
    if (sim) {
      sim.cancelarEntrada('long');
      sim.cancelarEntrada('short');
      ['long', 'short'].forEach((l) => sim.cerrarAMercado(l));
    }
    estado.fase = 'detenido';
    nota(`DETENIDO: ${motivo}`);
  }

  function resumen() {
    const t = estado.trades;
    const n = t.length;
    const gan = t.filter((x) => x.netoUSDT > 0).length;
    const neto = t.reduce((s, x) => s + x.netoUSDT, 0);
    const porSalida = t.reduce((a, x) => ({ ...a, [x.salida]: (a[x.salida] || 0) + 1 }), {});
    return {
      fase: estado.fase,
      precio: estado.precio,
      operaciones: n,
      ganadas: gan,
      tasaAciertoPct: n ? Number(((gan / n) * 100).toFixed(1)) : null,
      netoTotalUSDT: Number(neto.toFixed(4)),
      netoPromPctMargen: n ? Number((t.reduce((s, x) => s + x.netoPctMargen, 0) / n).toFixed(3)) : null,
      porSalida,
      pnlDiaUSDT: Number(estado.pnlDia.toFixed(4))
    };
  }

  return {
    id,
    config: cfg,
    iniciar,
    detener,
    resumen,
    guardarResumen: () => elog.resumen({ botId: id, symbol: cfg.symbol, config: cfg, ...resumen() }),
    archivos: { eventos: elog.archivoEventos, resumen: elog.archivoResumen },
    estado: () => estado
  };
}

module.exports = { crearBot };