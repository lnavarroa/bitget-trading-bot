const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('dotenv').config();
const { SpotMarketApi } = require('bitget-api-node-sdk');

const {
  ejecutarTradeLoop,
  detenerBot,
  estaActivo,
  getMontoActual
} = require('./services/tradeBot');

const { accountClient, marketClient } = require('./config/bitget'); // Usamos cliente centralizado

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Middleware de autenticación
app.use((req, res, next) => {
  const token = req.headers['authorization'];
  if (!token || token !== process.env.API_TOKEN) {
    return res.status(403).json({ error: 'Acceso no autorizado' });
  }
  next();
});

// Variable para almacenar los bots activos
let botsActivos = [];

// Endpoint para iniciar un bot de trading
app.post('/start-bot', async (req, res) => {
  const { symbol, amount, profitMargin, entryDiscountPercentage } = req.body;
/*
  // Validaciones de los parámetros
  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'El símbolo es obligatorio y debe ser una cadena de texto' });
  }

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'El monto inicial debe ser un número positivo' });
  }

  if (!profitMargin || isNaN(profitMargin) || profitMargin <= 0 || profitMargin > 0.002) {
    return res.status(400).json({ error: 'El margen de ganancia debe ser un número positivo menor o igual a 0.002 (0.2%)' });
  }

  if (!entryDiscountPercentage || isNaN(entryDiscountPercentage) || entryDiscountPercentage <= 0 || entryDiscountPercentage > 0.01) {
    return res.status(400).json({ error: 'El descuento de entrada debe ser un número positivo menor o igual a 0.01 (1%)' });
  }
*/
  const id = Date.now(); // Generar un ID único para el bot
  const config = { ...req.body, botId: id };

  try {
    botsActivos.push({ id, ...config }); // Agregar el bot a la lista de bots activos
    console.log(`🤖 Bot iniciado con ID: ${id} para el par ${symbol}`);

    // Iniciar el bot de trading
    ejecutarTradeLoop(config, id, (nuevoMonto) => {
      const index = botsActivos.findIndex(b => b.id === id);
      if (index !== -1) botsActivos[index].amount = nuevoMonto;
    });

    res.json({ message: `Bot iniciado con ID: ${id}`, id }); // Incluir el ID en la respuesta
  } catch (error) {
    console.error('❌ Error al iniciar el bot:', error.message || error);
    res.status(500).json({ error: 'Error al iniciar el bot' });
  }
});

// Endpoint para detener un bot de trading
app.post('/stop-bot', (req, res) => {
  const { id } = req.body;

  if (!id || isNaN(id)) {
    return res.status(400).json({ error: 'El ID del bot es obligatorio y debe ser un número' });
  }

  detenerBot(id);
  botsActivos = botsActivos.filter(b => b.id !== id);
  res.json({ message: `Bot detenido con ID: ${id}` });
});

// Endpoint para verificar el estado de un bot
app.get('/bot-status', (req, res) => {
  res.json({ activo: estaActivo() });
});

// Endpoint para listar los bots activos
app.get('/bots-activos', (req, res) => {
  res.json({ bots: botsActivos });
});

// Endpoint para obtener el monto total acumulado
app.get('/monto-actual-total', (req, res) => {
  const monto = getMontoActual();
  res.json({ montoActualTotal: monto });
});

// Endpoint para obtener el balance de USDT
app.get('/balance', async (req, res) => {
  try {
    const result = await accountClient.assets();

    if (!result || typeof result !== 'object') {
      throw new Error('Respuesta del API vacía o inválida');
    }

    const data = result.data;

    if (!Array.isArray(data)) {
      throw new Error('`data` no es una lista');
    }

    const usdt = data.find(asset =>
      asset.coinName === 'USDT' ||
      asset.coinDisplayName === 'USDT' ||
      asset.coin === 'USDT'
    );

    const balance = parseFloat(usdt?.available || 0);
    res.json({ balance });
  } catch (error) {
    console.error('❌ Error al obtener el balance:', error?.message || error);
    res.status(500).json({ error: 'Error al obtener el balance' });
  }
});

// Endpoint para obtener los pares de trading disponibles
app.get('/pairs', async (req, res) => {
  try {
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

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});