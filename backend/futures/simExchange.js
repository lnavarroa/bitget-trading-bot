const { EventEmitter } = require('events');

class SimExchange extends EventEmitter {
  constructor({ tick, slipTicks = 1 }) {
    super();
    this.slip = tick * slipTicks;
    this.precio = null;
    this.legs = {
      long: { entrada: null, posicion: null, tp: null },
      short: { entrada: null, posicion: null, tp: null }
    };
  }

  // El stop loss va adjunto a la entrada: protege la posición desde que se llena
  colocarEntrada(leg, precio, size, sl) {
    this.legs[leg].entrada = { precio, size, sl, activa: true };
  }
  cancelarEntrada(leg) {
    if (this.legs[leg].entrada) this.legs[leg].entrada.activa = false;
  }
  tieneEntradaActiva(leg) {
    return !!this.legs[leg].entrada?.activa;
  }
  hayEntradas() {
    return this.tieneEntradaActiva('long') || this.tieneEntradaActiva('short');
  }
  hayPosiciones() {
    return !!(this.legs.long.posicion || this.legs.short.posicion);
  }
  colocarSalida(leg, tp) {
    if (this.legs[leg].posicion) this.legs[leg].tp = tp;
  }

  cerrarAMercado(leg) {
    const L = this.legs[leg];
    if (!L.posicion || this.precio == null) return;
    const px = leg === 'long' ? this.precio - this.slip : this.precio + this.slip;
    this._cerrar(leg, px, 'forzado');
  }

  onPrecio(p) {
    this.precio = p;
    for (const leg of ['long', 'short']) {
      const L = this.legs[leg];

      // Entrada maker: el precio debe cruzar el nivel para que se llene
      if (L.entrada?.activa) {
        const llena = leg === 'long' ? p < L.entrada.precio : p > L.entrada.precio;
        if (llena) {
          L.entrada.activa = false;
          L.posicion = { entry: L.entrada.precio, size: L.entrada.size, sl: L.entrada.sl };
          L.tp = null;
          this.emit('fill', { leg, tipo: 'entry', precio: L.entrada.precio, size: L.entrada.size });
        }
      }

      // Salidas
      if (L.posicion) {
        const pos = L.posicion;
        const slToca = leg === 'long' ? p <= pos.sl : p >= pos.sl;
        if (slToca) {
          const px = leg === 'long' ? pos.sl - this.slip : pos.sl + this.slip;
          this._cerrar(leg, px, 'sl');
        } else if (L.tp != null) {
          const tpToca = leg === 'long' ? p > L.tp : p < L.tp;
          if (tpToca) this._cerrar(leg, L.tp, 'tp');
        }
      }
    }
  }

  _cerrar(leg, precio, tipo) {
    const L = this.legs[leg];
    const { entry, size } = L.posicion;
    L.posicion = null;
    L.tp = null;
    this.emit('fill', { leg, tipo, precio, size, entry });
  }
}

module.exports = { SimExchange };