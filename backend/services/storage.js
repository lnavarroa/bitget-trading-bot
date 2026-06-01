const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '../logs');

// Asegurar que la carpeta existe
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const Storage = {
  // Guarda el estado actual (Fase, OrdenID, Saldo)
  saveBotSession: (botId, data) => {
    const filePath = path.join(LOGS_DIR, `bot_${botId}.json`);
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(`❌ Error guardando sesión ${botId}:`, err.message);
    }
  },

  // ALIAS: Cambiamos loadBotSession por getBotSession para que coincida con el bot
  getBotSession: (botId) => {
    const filePath = path.join(LOGS_DIR, `bot_${botId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      } catch (err) {
          console.error(`❌ Error leyendo sesión ${botId}:`, err.message);
          return null;
      }
    }
    return null;
  },

  getAllSessions: () => {
    try {
        const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.json'));
        return files.map(f => {
            const content = fs.readFileSync(path.join(LOGS_DIR, f), 'utf-8');
            return JSON.parse(content);
        });
    } catch (err) {
        return [];
    }
  },

  // Opcional: Limpiar sesión al terminar (para que no intente recuperar algo viejo)
  deleteBotSession: (botId) => {
    const filePath = path.join(LOGS_DIR, `bot_${botId}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
};

module.exports = Storage;