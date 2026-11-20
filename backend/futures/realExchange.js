const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const esTimeout = (e) => /timeout|ECONNABORTED|EAI_AGAIN|ECONNRESET|socket hang up/i.test(`${e.code} ${e.message}`);

const { EventEmitter } = require('events');
const api = require('./futuresApi');

const ENTRADA = 'e';
const TP = 't';
const FORZADO = 'f';

const esCancelada = (s) => s === 'canceled' || s === 'cancelled';

function sumarFees(feeDetail) {
  if (!Array.isArray(feeDetail)) return 0;
  return feeDetail
    .filter((f) => !f.feeCoin || f.feeCoin === 'USDT')
    .reduce((a, f) => a + Math.abs(Number(f.fee ?? f.totalFee ?? 0)), 0);
}

class RealExchange extends EventEmitter {
  constructor({ ws, symbol, contrato, apalancamiento, botId }) {
    super();
    this.symbol = symbol;
    this.pricePlace = Number(contrato.pricePlace);
    this.volumePlace = Number(contrato.volumePlace);
    this.apalancamiento = apalancamiento;
    this.botId = botId;
    this.legs = {
      long: { entrada: null, posicion: null, tp: null, cerrando: false },
      short: { entrada: null, posicion: null, tp: null, cerrando: false }
    };
    this.porClientOid = new Map();
    this.vistos = new Set();
    this.ultimoEvento = Date.now();
    this.mismatch = { long: 0, short: 0 };
    ws.on('futures:ORDER_UPDATE', (u) => this._onOrden(u));
  }

  async _buscarPendiente(clientOid) {
    try {
      const r = await api.getOrdenesPendientes(this.symbol);
      return (r?.entrustedList || []).find((o) => o.clientOid === clientOid) || null;
    } catch (e) {
      return null;
    }
  }

  _p(x) { return Number(x).toFixed(this.pricePlace); }
  _s(x) { return Number(x).toFixed(this.volumePlace); }
  // En hedge, abrir y cerrar un lado usan el mismo side: long = buy, short = sell
  _lado(leg) { return leg === 'long' ? 'buy' : 'sell'; }
  _cid(leg, rol) { return `fb${this.botId}${leg[0]}${rol}${Date.now()}`; }
  _log(m) { this.emit('log', m); }

  // ---------- preparación ----------
  async preparar({ movimientoPct }) {
    const cuenta = await api.verificarCuenta(this.symbol);
    if (cuenta.marginMode && String(cuenta.marginMode).toLowerCase() !== 'isolated') {
      throw new Error(`Modo de margen ${cuenta.marginMode}: se requiere isolated`);
    }
    for (const lado of ['long', 'short']) {
      try {
        await api.setLeverage(this.symbol, this.apalancamiento, lado);
      } catch (e) {
        this._log(`aviso: no se pudo fijar apalancamiento ${lado} (${e.message}); se asume el actual`);
      }
    }
    await this.adoptar(movimientoPct);
    this._log('Exchange listo: cobertura verificada y estado previo adoptado');
  }

  async adoptar(movimientoPct) {
    const pend = (await api.getOrdenesPendientes(this.symbol))?.entrustedList || [];
    const pos = (await api.getPosiciones(this.symbol)) || [];

    // 1) Entradas pendientes de una corrida anterior: se cancelan
    for (const o of pend.filter((x) => x.tradeSide === 'open')) {
      try {
        await api.cancelarOrden(this.symbol, o.orderId);
        this._log(`entrada anterior cancelada (${o.posSide} @ ${o.price})`);
      } catch (e) {
        throw new Error(`No pude cancelar la entrada pendiente ${o.orderId}: ${e.message}`);
      }
    }

    // 2) Posiciones abiertas: se adoptan con su take profit
    for (const p of pos) {
      const size = Number(p.total ?? p.available ?? 0);
      if (!(size > 0)) continue;
      const leg = p.holdSide;
      if (leg !== 'long' && leg !== 'short') {
        throw new Error(`Posición con holdSide inesperado (${p.holdSide}). Revisa la app o usa emergencia.js`);
      }
      const entry = Number(p.openPriceAvg);
      if (!(entry > 0)) {
        throw new Error(`No pude leer el precio de entrada de la posición ${leg}. Ciérrala desde la app o con emergencia.js`);
      }
      const L = this.legs[leg];
      L.posicion = { entry, size, feeEntrada: 0 };

      const tpExistente = pend.find((o) => o.tradeSide === 'close' && o.posSide === leg);
      if (tpExistente) {
        L.tp = { clientOid: tpExistente.clientOid, orderId: tpExistente.orderId, precio: Number(tpExistente.price) };
        this.porClientOid.set(tpExistente.clientOid, { leg, rol: TP });
        this._log(`posición ${leg} adoptada: ${size} @ ${entry}, TP existente @ ${tpExistente.price}`);
      } else {
        const factor = leg === 'long' ? 1 + movimientoPct / 100 : 1 - movimientoPct / 100;
        const tp = entry * factor;
        this._log(`posición ${leg} adoptada: ${size} @ ${entry}, sin TP: se coloca @ ${this._p(tp)}`);
        await this.colocarSalida(leg, tp);
      }
    }
  }

  async verificarLimpio() {
    const pend = await api.getOrdenesPendientes(this.symbol);
    const pos = await api.getPosiciones(this.symbol);
    const abiertas = (pos || []).filter((p) => Number(p.total ?? p.available ?? 0) > 0);
    if ((pend?.entrustedList || []).length || abiertas.length) {
      throw new Error('Hay órdenes pendientes o posiciones abiertas en ese par. Ciérralas (utils/emergencia.js) antes de iniciar.');
    }
  }

  // ---------- interfaz igual a SimExchange ----------
  onPrecio() {}
  tieneEntradaActiva(leg) { return !!this.legs[leg].entrada?.activa; }
  hayEntradas() { return this.tieneEntradaActiva('long') || this.tieneEntradaActiva('short'); }
  hayPosiciones() { return !!(this.legs.long.posicion || this.legs.short.posicion); }

  async colocarEntrada(leg, precio, size, sl) {
    const L = this.legs[leg];
    if (L.entrada?.activa || L.posicion) throw new Error(`Ya hay entrada o posición en ${leg}`);
    const clientOid = this._cid(leg, ENTRADA);
    this.porClientOid.set(clientOid, { leg, rol: ENTRADA });
    const E = { clientOid, orderId: null, precio, size, sl, activa: true, cancelando: false, filled: 0 };
    L.entrada = E;
    E.colocando = api.colocarOrden({
      symbol: this.symbol,
      side: this._lado(leg),
      tradeSide: 'open',
      size: this._s(size),
      price: this._p(precio),
      force: 'post_only',
      clientOid,
      stopLossPrice: this._p(sl)
    }).then((r) => { E.orderId = r.orderId; return r; });
    try {
      await E.colocando;
    } catch (e) {
      if (esTimeout(e)) {
        await dormir(2000);
        const ex = await this._buscarPendiente(clientOid);
        if (ex) { E.orderId = ex.orderId; return; }
      }
      if (L.entrada === E) L.entrada = null;
      throw e;
    }
  }

  async cancelarEntrada(leg) {
    const E = this.legs[leg].entrada;
    if (!E || !E.activa || E.cancelando) return;
    E.cancelando = true;
    try {
      if (E.colocando) await E.colocando.catch(() => {});
      if (!E.orderId) { E.activa = false; return; }
      for (let i = 0; i < 3 && E.activa; i++) {
        try {
          await api.cancelarOrden(this.symbol, E.orderId);
          E.activa = false;
          return;
        } catch (e) {
          if (!esTimeout(e) || i === 2) throw e;
          await dormir(1000);
        }
      }
    } catch (e) {
      this._log(`cancelar entrada ${leg}: ${e.message}`);
    } finally {
      E.cancelando = false;
    }
  }

  async colocarSalida(leg, tp) {
    const L = this.legs[leg];
    if (!L.posicion || L.tp) return;
    let force = 'post_only';
    for (let intento = 0; intento < 4; intento++) {
      const clientOid = this._cid(leg, TP);
      this.porClientOid.set(clientOid, { leg, rol: TP });
      const T = { clientOid, orderId: null, precio: tp };
      L.tp = T;
      try {
        const r = await api.colocarOrden({
          symbol: this.symbol,
          side: this._lado(leg),
          tradeSide: 'close',
          size: this._s(L.posicion?.size ?? 0),
          price: this._p(tp),
          force,
          clientOid
        });
        T.orderId = r.orderId;
        if (force === 'gtc') this._log(`TP ${leg} colocado como gtc`);
        return;
      } catch (e) {
        if (esTimeout(e)) {
          await dormir(2000);
          if (!L.posicion) return;
          const existente = await this._buscarPendiente(clientOid);
          if (existente) {
            T.orderId = existente.orderId;
            this._log(`TP ${leg} confirmado tras timeout`);
            return;
          }
          this._log(`TP ${leg}: no llegó al exchange, reintentando`);
          continue;
        }
        this._log(`TP ${leg} (${force}) rechazado: ${e.message}`);
        if (L.tp === T) L.tp = null;
        if (!L.posicion) return;
        force = 'gtc';
      }
    }
    this.emit('problema', `No se pudo colocar el take profit ${leg}`);
  }

  async cerrarAMercado(leg) {
    const L = this.legs[leg];
    if (!L.posicion) return;
    L.cerrando = true;
    const tpId = L.tp?.orderId;
    if (tpId) {
      try { await api.cancelarOrden(this.symbol, tpId); }
      catch (e) { this._log(`cancelar TP ${leg}: ${e.message}`); }
    }
    if (!L.posicion) return; // el TP se llenó mientras cancelábamos
    const clientOid = this._cid(leg, FORZADO);
    this.porClientOid.set(clientOid, { leg, rol: FORZADO });
    try {
      await api.colocarOrden({
        symbol: this.symbol,
        side: this._lado(leg),
        tradeSide: 'close',
        size: this._s(L.posicion.size),
        orderType: 'market',
        clientOid
      });
    } catch (e) {
      L.cerrando = false;
      this._log(`ERROR al cerrar ${leg} a mercado: ${e.message}`);
      throw e;
    }
  }

  // ---------- eventos del exchange ----------
  _onOrden(u) {
    if (u.instId !== this.symbol) return;
    this.ultimoEvento = Date.now();
    const clave = `${u.orderId}|${u.status}|${u.filled}`;
    if (this.vistos.has(clave)) return;
    this.vistos.add(clave);

    const info = this.porClientOid.get(u.clientOid);
    if (!info) return this._ordenAjena(u);

    const L = this.legs[info.leg];
    if (info.rol === ENTRADA) {
      if (!L.entrada || L.entrada.clientOid !== u.clientOid) return;
      L.entrada.filled = u.filled;
      if (u.status === 'filled' || (esCancelada(u.status) && u.filled > 0)) {
        this._entradaLlena(info.leg, u);
      } else if (esCancelada(u.status)) {
        L.entrada.activa = false;
        this._log(`entrada ${info.leg} cancelada`);
      }
    } else if (info.rol === TP) {
      if (!L.tp || L.tp.clientOid !== u.clientOid) return;
      if (u.status === 'filled') {
        this._cierre(info.leg, 'tp', u);
      } else if (esCancelada(u.status) && L.posicion && !L.cerrando) {
        this.emit('problema', `El exchange canceló el take profit ${info.leg}`);
      }
    } else if (info.rol === FORZADO) {
      if (u.status === 'filled') this._cierre(info.leg, 'forzado', u);
    }
  }

  // Orden que no creó el bot: normalmente el stop loss adjunto al dispararse
  _ordenAjena(u) {
    if (u.status === 'filled' && u.tradeSide === 'close') {
      const leg = u.posSide === 'long' || u.posSide === 'short'
        ? u.posSide
        : (u.side === 'buy' ? 'long' : 'short');
      if (!this.legs[leg].posicion) return;
      this._log(`Cierre externo (stop loss) en ${leg} @ ${u.avgPrice || u.price}`);
      this._cancelarTp(leg);
      this._cierre(leg, 'sl', u);
    } else {
      this._log(`Orden ajena: ${JSON.stringify({ id: u.orderId, st: u.status, side: u.side, ts: u.tradeSide, ps: u.posSide })}`);
    }
  }

  // Compara el estado interno con las posiciones reales (se llama cada ~30 s)
  async reconciliar() {
    if (Date.now() - this.ultimoEvento < 8000) return; // deja asentar eventos recientes
    const pos = await api.getPosiciones(this.symbol);
    for (const leg of ['long', 'short']) {
      const real = (pos || []).find((p) => p.holdSide === leg);
      const hayReal = Number(real?.total ?? real?.available ?? 0) > 0;
      const hayInterna = !!this.legs[leg].posicion;
      if (hayReal !== hayInterna) {
        this.mismatch[leg] += 1;
        if (this.mismatch[leg] >= 2) {
          this.emit('problema', `Estado distinto en ${leg}: exchange=${hayReal ? 'abierta' : 'sin posición'}, bot=${hayInterna ? 'abierta' : 'sin posición'}`);
        }
      } else {
        this.mismatch[leg] = 0;
      }
    }
  }

  async _cancelarTp(leg) {
    const L = this.legs[leg];
    const id = L.tp?.orderId;
    L.cerrando = true;
    if (!id) return;
    try { await api.cancelarOrden(this.symbol, id); }
    catch (e) { this._log(`no se pudo cancelar el TP ${leg}: ${e.message}`); }
  }

  _entradaLlena(leg, u) {
    const L = this.legs[leg];
    if (L.posicion || !L.entrada) return;
    const size = u.filled > 0 ? u.filled : L.entrada.size;
    const precio = u.avgPrice > 0 ? u.avgPrice : L.entrada.precio;
    L.posicion = { entry: precio, size, feeEntrada: sumarFees(u.feeDetail) };
    L.entrada.activa = false;
    this.emit('fill', { leg, tipo: 'entry', precio, size });
  }

  _cierre(leg, tipo, u) {
    const L = this.legs[leg];
    if (!L.posicion) return;
    const { entry, size, feeEntrada } = L.posicion;
    const precio = u.avgPrice > 0 ? u.avgPrice : u.price;
    const feeCierre = sumarFees(u.feeDetail);
    const fees = feeEntrada + feeCierre;
    L.posicion = null;
    L.tp = null;
    L.cerrando = false;
    this.emit('fill', {
      leg, tipo, precio, size, entry,
      fees: feeEntrada > 0 && feeCierre > 0 ? fees : undefined
    });
  }
}

module.exports = { RealExchange };