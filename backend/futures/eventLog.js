const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '../logs/futures/sim');

function crearEventLog(botId) {
  fs.mkdirSync(DIR, { recursive: true });
  const archivoEventos = path.join(DIR, `bot_${botId}_eventos.jsonl`);
  const archivoResumen = path.join(DIR, `bot_${botId}_resumen.json`);

  return {
    archivoEventos,
    archivoResumen,

    log(tipo, datos = {}) {
      const linea = JSON.stringify({ ts: new Date().toISOString(), tipo, ...datos });
      try {
        fs.appendFileSync(archivoEventos, linea + '\n');
      } catch (e) {
        console.error('No se pudo escribir el log:', e.message);
      }
    },

    // Se sobrescribe cada vez; se escribe en un temporal y se renombra para no dejarlo a medias
    resumen(obj) {
      try {
        const tmp = archivoResumen + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({ actualizado: new Date().toISOString(), ...obj }, null, 2));
        fs.renameSync(tmp, archivoResumen);
      } catch (e) {
        console.error('No se pudo escribir el resumen:', e.message);
      }
    }
  };
}

module.exports = { crearEventLog };