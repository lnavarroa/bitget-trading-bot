const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '../logs');

/**
 * Almacén de sesiones por tipo de bot ('spot' | 'futures').
 * Guarda en logs/<tipo>/sessions/bot_<id>.json
 */
function crearStorage(tipo) {
  const dir = path.join(LOGS_DIR, tipo, 'sessions');
  fs.mkdirSync(dir, { recursive: true });

  const rutaSesion = (botId) => path.join(dir, `bot_${botId}.json`);

  return {
    saveBotSession(botId, data) {
      try {
        fs.writeFileSync(rutaSesion(botId), JSON.stringify(data, null, 2));
      } catch (err) {
        console.error(`❌ Error guardando sesión ${botId}:`, err.message);
      }
    },

    getBotSession(botId) {
      const ruta = rutaSesion(botId);
      if (!fs.existsSync(ruta)) return null;
      try {
        return JSON.parse(fs.readFileSync(ruta, 'utf-8'));
      } catch (err) {
        console.error(`❌ Error leyendo sesión ${botId}:`, err.message);
        return null;
      }
    },

    getAllSessions() {
      try {
        return fs.readdirSync(dir)
          .filter(f => f.endsWith('.json'))
          .map(f => {
            try {
              return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
            } catch (err) {
              console.error(`❌ Sesión ilegible (${f}):`, err.message);
              return null;
            }
          })
          .filter(Boolean);
      } catch {
        return [];
      }
    },

    deleteBotSession(botId) {
      const ruta = rutaSesion(botId);
      if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
    }
  };
}

module.exports = { crearStorage };