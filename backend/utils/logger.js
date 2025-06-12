const fs = require('fs');
const path = require('path');

function logOperacion(botId, operacion) {
  const logsDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }

  const logPath = path.join(logsDir, `bot-${botId}.json`);

  let logs = [];
  if (fs.existsSync(logPath)) {
    try {
      logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    } catch (e) {
      console.error(`⚠️ Error leyendo logs del bot ${botId}:`, e);
    }
  }

  logs.push({ ...operacion, hora: new Date().toISOString() });

  fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
}

module.exports = { logOperacion };
