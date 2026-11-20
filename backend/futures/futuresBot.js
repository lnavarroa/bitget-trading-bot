const fs = require('fs');
const path = require('path');
const api = require('./futuresApi');
const feed = require('./accountFeed');
const S = require('./strategy');
const { SimExchange } = require('./simExchange');
const { enVentana, minutosHastaCierre } = require('./schedule');
const { crearEventLog } = require('./eventLog');
const { RealExchange } = require('./realExchange');

const TRADES_DIR = path.join(__dirname, '../logs/futures/trades');

const DEFAULTS = {
  dryRun: true,
  netoPct: 1,               // % neto sobre margen (incluye el apalancamiento)
  apalancamiento: 5,
  factorApertura: 1,
  confirmoReal: false,
  slPct: 0.36,              // stop loss, % de precio
  margenMax: null,          // USDT de margen máximo (null = todo lo abrible)
  ventana: { activa: false, desde: '22:00', hasta: '06:00', zona: 'America/Santiago' },
  minutosSinEntradaCierre: 10,
  recentrarMin: 15,
  cierreForzadoMin: 15,
  maxPerdidaDiariaUSDT: 1,
  maxCaidaMin: 30,
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
    pausaHasta: 0,
    primerError: null,
    errores: 0,
    detenido: false,
    motivo: null
  };

  let contrato = null;
  let ctx = null;
  let sim = null;
  let timer = null;
  let ocupado = false;
  let ticks = 0;

  const dia = () => new Intl.DateTimeFormat('en-CA', { timeZone: cfg.ventana.zona }).format(new Date());

  function registrarTrade(f) {
    const bruto = f.leg === 'long' ? (f.precio - f.entry) * f.size : (f.entry - f.precio) * f.size;
    const feeEntrada = f.entry * f.size * ctx.feeMaker;
    const feeSalida = f.precio * f.size * (f.tipo === 'tp' ? ctx.feeMaker : ctx.feeTaker);
    const fees = Number.isFinite(f.fees) ? f.fees : feeEntrada + feeSalida;
    const neto = bruto - fees;
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
    nota(lineaResumen());
    elog.resumen({ botId: id, symbol: cfg.symbol, config: cfg, ...resumen() });
  }

  function onFill(f) {
    if (f.tipo === 'entry') {
      nota(`ENTRADA ${f.leg} llenada @ ${f.precio}`);
      const otra = f.leg === 'long' ? 'short' : 'long';
      if (sim.tieneEntradaActiva(otra)) {
        sim.cancelarEntrada(otra);
          if (cfg.dryRun) nota(`entrada ${otra} cancelada`);
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

    // Tamaño por pata = mitad de la apertura máxima que informa Bitget (la menor entre long y short)
    let cantidad;
    let cumpleMinimo;
    try {
      const [maxLong, maxShort] = await Promise.all([
        api.getMaxOpen(cfg.symbol, 'long', inferior),
        api.getMaxOpen(cfg.symbol, 'short', superior)
      ]);
      let maxBase = Math.min(maxLong, maxShort);
      if (cfg.margenMax) {
        // BTC que cabe en el margen máximo configurado (entre las dos patas)
        maxBase = Math.min(maxBase, (cfg.margenMax * cfg.apalancamiento) / superior);
      }
      const mult = Number(contrato.sizeMultiplier);
      const mitad = (maxBase * cfg.factorApertura) / 2;
      cantidad = Number((Math.floor(mitad / mult + 1e-9) * mult).toFixed(Number(contrato.volumePlace)));
      cumpleMinimo = cantidad >= Number(contrato.minTradeNum);
      nota(`apertura máxima long ${maxLong} / short ${maxShort} -> ${cantidad} por pata`);
    } catch (e) {
      notaError(`max-open no disponible (${e.message}); uso el cálculo conservador`);
      const nominalPorPata = (margen / 2) * 0.95 * cfg.apalancamiento;
      ({ cantidad, cumpleMinimo } = S.calcularCantidad({
        nominalUSDT: nominalPorPata,
        precio: superior,
        volumePlace: contrato.volumePlace,
        sizeMultiplier: contrato.sizeMultiplier,
        minTradeNum: contrato.minTradeNum
      }));
    }
    if (!cumpleMinimo || cantidad * superior < Number(contrato.minTradeUSDT)) {
      throw new Error(`Margen insuficiente: ${cantidad} por pata no cumple el mínimo del contrato`);
    }

    const slLong = S.redondearAbajo(inferior * (1 - cfg.slPct / 100), contrato.pricePlace, contrato.priceEndStep);
    const slShort = S.redondearArriba(superior * (1 + cfg.slPct / 100), contrato.pricePlace, contrato.priceEndStep);

    estado.ciclo = { precioRef: precio, inferior, superior, cantidad, inicio: Date.now(), mov };
    estado.fase = 'entradas';

    try {
      await Promise.all([
        sim.colocarEntrada('long', inferior, cantidad, slLong),
        sim.colocarEntrada('short', superior, cantidad, slShort)
      ]);
    } catch (e) {
      await sim.cancelarEntrada('long');
      await sim.cancelarEntrada('short');
      throw e;
    }
    
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
          await Promise.all(['long', 'short'].map((l) => sim.cerrarAMercado(l)));
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
    if (Date.now() < estado.pausaHasta) return; // espera tras un error
    ocupado = true;
    try {
      const t = await api.getTicker(cfg.symbol);
      const precio = Number(t.lastPr);
      estado.precio = precio;
      sim.onPrecio(precio);
      await gestionar(precio);
      ticks += 1;
      if (!cfg.dryRun && ticks % 20 === 0) await sim.reconciliar();
      if (estado.errores > 0) nota(`conexión recuperada tras ${estado.errores} errores`);
      estado.errores = 0;
      estado.primerError = null;
    } catch (e) {
      estado.errores += 1;
      if (!estado.primerError) estado.primerError = Date.now();
      estado.pausaHasta = Date.now() + Math.min(30000, 1500 * 2 ** Math.min(estado.errores, 5));
      const detalle = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      if (estado.errores === 1 || estado.errores % 10 === 0) {
        notaError(`error (${estado.errores}): ${detalle}`);
      }
      const caidaMin = (Date.now() - estado.primerError) / 60000;
      if (caidaMin > cfg.maxCaidaMin) detener(`sin conexión por más de ${cfg.maxCaidaMin} min`);
    } finally {
      ocupado = false;
    }
  }

  async function iniciar() {
    contrato = await api.getContract(cfg.symbol);
    if (!contrato || contrato.symbolStatus !== 'normal') {
      throw new Error(`Contrato no operable: ${contrato?.symbolStatus}`);
    }
    ctx = { feeMaker: Number(contrato.makerFeeRate), feeTaker: Number(contrato.takerFeeRate) };
    const tick = S.paso(contrato.pricePlace, contrato.priceEndStep);
        if (cfg.dryRun) {
      sim = new SimExchange({ tick, slipTicks: cfg.slipTicks });
    } else {
      if (!cfg.confirmoReal) throw new Error('Modo real sin confirmación (confirmoReal)');
      if (!(cfg.margenMax > 0)) throw new Error('En modo real debes definir un margen máximo (margenMax)');
      const ws = feed.iniciar();
      sim = new RealExchange({ ws, symbol: cfg.symbol, contrato, apalancamiento: cfg.apalancamiento, botId: id });
      await sim.preparar({
        movimientoPct: S.movimientoRequerido({
          netoPct: cfg.netoPct, apalancamiento: cfg.apalancamiento, feeMaker: ctx.feeMaker
        })
      });
      sim.on('log', (m) => nota(m));
      sim.on('problema', (m) => {
        notaError(`PROBLEMA: ${m}`);
        notaError('Revisa la app de Bitget o ejecuta utils/emergencia.js si quedó algo abierto');
        detener(`problema con el exchange: ${m}`);
      });
    }
    sim.on('fill', (f) => {
      try { onFill(f); }
      catch (e) { notaError(`error en onFill: ${e.message}`); }
    });
    await feed.esperarCuenta();
    const saldo = await leerSaldo();
    if (saldo) {
      estado.saldoInicial = saldo.total;
      nota(`SALDO INICIAL FUTUROS: ${saldo.total.toFixed(4)} USDT (disponible ${saldo.disponible.toFixed(4)})`);
      elog.log('saldo_inicial', saldo);
    } else {
      notaError('No pude leer el saldo inicial de futuros');
    }
    estado.dia = dia();
    estado.fase = 'esperando';
    nota(`${cfg.dryRun ? 'SIMULACIÓN' : 'MODO REAL'} iniciado (maker ${ctx.feeMaker}, taker ${ctx.feeTaker})`);
    timer = setInterval(latido, cfg.intervaloMs);
  }

  async function detener(motivo = 'manual', { cerrarPosiciones = cfg.dryRun } = {}) {
    if (estado.detenido) return;
    estado.detenido = true;
    estado.motivo = motivo;
    clearInterval(timer);
    if (sim) {
      try {
        await Promise.all([sim.cancelarEntrada('long'), sim.cancelarEntrada('short')]);
        if (cerrarPosiciones) {
          await Promise.all(['long', 'short'].map((l) => sim.cerrarAMercado(l)));
        } else if (sim.hayPosiciones()) {
          nota('Posiciones abiertas: quedan en Bitget con su take profit y stop loss');
        }
      } catch (e) {
        notaError(`error al cerrar: ${e.message}`);
      }
    }
    try { store.cerrarBot(id, motivo); } catch (e) { /* la base de datos es opcional */ }
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
      pnlDiaUSDT: Number(estado.pnlDia.toFixed(4)),
      iniciado: Number.isFinite(Number(id)) ? new Date(Number(id)).toISOString() : null,
      saldoInicialUSDT: estado.saldoInicial ?? null,
      saldoFinalUSDT: estado.saldoFinal ?? null
    };
  }

  async function leerSaldo() {
    let c = null;
    let fuente = 'rest';
    try {
      c = await api.getAccount(cfg.symbol);
    } catch (e) {
      c = feed.getCuenta();
      fuente = 'ws';
    }
    if (!c) return null;
    const total = Number(c.usdtEquity ?? c.accountEquity ?? c.equity);
    const disponible = Number(c.available);
    if (!Number.isFinite(total)) return null;
    return { total, disponible, fuente };
  }

  // Solo en real: en simulación el saldo de la cuenta no cambia
  async function registrarSaldoFinal() {
    if (cfg.dryRun) return;
    const s = await leerSaldo();
    if (!s) return;
    estado.saldoFinal = s.total;
    const dif = estado.saldoInicial != null ? s.total - estado.saldoInicial : null;
    nota(`SALDO FINAL FUTUROS: ${s.total.toFixed(4)} USDT` +
         (dif != null ? ` (${dif >= 0 ? '+' : ''}${dif.toFixed(4)} vs inicio)` : ''));
    elog.log('saldo_final', { ...s, diferencia: dif });
  }

  function lineaResumen() {
    const r = resumen();
    return `RESUMEN: ${r.operaciones} ops, ${r.ganadas} ganadas (${r.tasaAciertoPct ?? '-'}%), ` +
           `neto ${r.netoTotalUSDT} USDT, salidas ${JSON.stringify(r.porSalida)}`;
  }

  return {
    id,
    config: cfg,
    iniciar,
    detener,
    resumen,
    guardarResumen: () => elog.resumen({ botId: id, symbol: cfg.symbol, config: cfg, ...resumen() }),
    archivos: { eventos: elog.archivoEventos, resumen: elog.archivoResumen },
    estado: () => estado,
    registrarSaldoFinal
  };
}

module.exports = { crearBot };