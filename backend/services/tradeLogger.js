const fs = require('fs');
const path = require('path');

const BASE_LOG_DIR = path.join(__dirname, '../logs');
const SPOT_LOG_DIR = path.join(BASE_LOG_DIR, 'spot');

if (!fs.existsSync(SPOT_LOG_DIR)) {
  fs.mkdirSync(SPOT_LOG_DIR, { recursive: true });
}

function initSpotLog(botConfig) {
  const filePath = path.join(
    SPOT_LOG_DIR,
    `bot_${botConfig.botId}_trades.json`
  );

  if (fs.existsSync(filePath)) return;

  const initialData = {
    meta: {
      botId: botConfig.botId,
      symbol: botConfig.symbol,
      inversionInicial: botConfig.amount,
      profitObjetivoPct: botConfig.profitMargin,
      descuentoEntradaPct: botConfig.entryDiscountPercentage,
      fechaInicio: new Date().toISOString()
    },
    eventos: []
  };

  fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
}

function logSpotTrade(botId, event) {
  const filePath = path.join(SPOT_LOG_DIR, `bot_${botId}_trades.json`);

  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  content.eventos.push(event);

  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
}

module.exports = { initSpotLog, logSpotTrade };