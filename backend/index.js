const express = require('express');
const bot = require('./services/tradeBot');
require('dotenv').config();

const app = express();
const PORT = 3001;

app.get('/start-bot', async (req, res) => {
  const result = await bot.runBot();
  res.send(result);
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
