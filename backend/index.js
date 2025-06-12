const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();
//dotenv.config();
const { SpotMarketApi } = require('bitget-api-node-sdk');

const {
  ejecutarTradeLoop,
  detenerBot,
  estaActivo,
  getMontoActual
} = require('./services/tradeBot');

const { accountClient, marketClient } = require('./config/bitget'); // ← usamos cliente centralizado

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

let botsActivos = [];

//console.log('🔑 API_KEY:', process.env.BITGET_API_KEY);

app.post('/start-bot', async (req, res) => {
  //const config = req.body;
  const id = Date.now();
  const config = { ...req.body, botId: id };

  botsActivos.push({ id, ...config });

  ejecutarTradeLoop(config, id, (nuevoMonto) => {
    const index = botsActivos.findIndex(b => b.id === id);
    if (index !== -1) botsActivos[index].amount = nuevoMonto;
  });

  res.json({ message: `Bot iniciado con ID: ${id}` });
});

app.post('/stop-bot', (req, res) => {
  const { id } = req.body;
  detenerBot(id);
  botsActivos = botsActivos.filter(b => b.id !== id);
  res.json({ message: `Bot detenido con ID: ${id}` });
});

app.get('/bot-status', (req, res) => {
  res.json({ activo: estaActivo() });
});

app.get('/bots-activos', (req, res) => {
  res.json({ bots: botsActivos });
});

app.get('/monto-actual-total', (req, res) => {
  const monto = getMontoActual();
  res.json({ montoActualTotal: monto });
});

app.get('/balance', async (req, res) => {
  try {
    const result = await accountClient.assets(); // ← método más común en SDK reciente
    //console.log('📦 Respuesta completa de assets():', JSON.stringify(result, null, 2));

    if (!result.data || !Array.isArray(result.data)) {
      throw new Error('Respuesta inesperada del API');
    }

    const usdt = result.data.find(asset => asset.coinName === 'USDT' || asset.coinDisplayName === 'USDT');
    
    const balance = parseFloat(usdt?.available || 0);

    res.json({ balance });
  } catch (error) {
    console.error('❌ Error al obtener el balance:', error?.message || error);
    res.status(500).json({ error: 'Error al obtener el balance' });
  }
});

// En backend/index.js (o archivo de rutas)
app.get('/pairs', async (req, res) => {
  try {
    console.log('🌐 Llamando a Bitget /api/v2/spot/public/symbols');
    const response = await fetch('https://api.bitget.com/api/v2/spot/public/symbols');
    const result = await response.json();

    if (!result.data || !Array.isArray(result.data)) {
      throw new Error('Respuesta inválida del API');
    }

    const pairs = result.data
      .filter(p => p.quoteCoin === 'USDT')
      .map(p => ({
        symbol: p.symbol,
        base: p.baseCoin,
        quote: p.quoteCoin
      }));

    res.json({ pairs });
  } catch (error) {
    console.error('❌ Error al obtener pares:', error?.message || error);
    res.status(500).json({ error: 'Error al obtener pares' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
