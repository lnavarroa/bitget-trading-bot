const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Servicios y Configuración
const tradeBot = require('./services/tradeBot');
const { bitgetApi } = require('./config/client'); 

const app = express();
const PORT = process.env.PORT || 3001;

// --- CONFIGURACIÓN DE LOGS ---
// Silenciamos logs repetitivos de librerías pero mantenemos los nuestros
const originalLog = console.log;
console.log = (...args) => {
    if (args[0] && typeof args[0] === 'string' && args[0].startsWith('request:')) return;
    originalLog(`[${new Date().toLocaleTimeString()}]`, ...args);
};

// Middlewares
app.use(cors());
app.use(express.json());

// Middleware de Seguridad (API Token)
app.use((req, res, next) => {
    const token = req.headers['authorization'];
    if (!token || token !== process.env.API_TOKEN) {
        console.warn(`⚠️ Intento de acceso no autorizado desde IP: ${req.ip}`);
        return res.status(403).json({ error: 'Acceso no autorizado' });
    }
    next();
});

/**
 * @route GET /balance
 * Obtiene el balance disponible de USDT en Spot V2
 */
app.get('/balance', async (req, res) => {
    try {
        console.log("🔍 Consultando balance en Bitget...");
        const response = await bitgetApi.get('/api/v2/spot/account/assets');
        
        if (response.data?.code === '00000') {
            const assets = response.data.data;
            const usdt = assets.find(a => a.coin === 'USDT' || a.coinName === 'USDT');
            const available = usdt ? usdt.available : "0";
            
            console.log(`✅ Balance recuperado: ${available} USDT`);
            return res.json({ balance: available });
        }
        throw new Error(response.data?.msg || "Error en respuesta de Bitget");
    } catch (e) {
        console.error("❌ Error al obtener balance:", e.message);
        res.status(500).json({ error: "No se pudo obtener el balance", details: e.message });
    }
});

/**
 * @route GET /pairs
 * Lista pares disponibles filtrados por USDT
 */
app.get('/pairs', async (req, res) => {
    try {
        console.log("📡 Cargando lista de pares USDT...");
        const response = await bitgetApi.get('/api/v2/spot/public/symbols');
        
        if (response.data.code === '00000') {
            const pairs = response.data.data
                .filter(p => p.quoteCoin === 'USDT' && p.status === 'online')
                .map(p => ({ 
                    symbol: p.symbol, 
                    base: p.baseCoin,
                    quote: p.quoteCoin 
                }));
            console.log(`✅ ${pairs.length} pares cargados correctamente.`);
            return res.json({ pairs });
        }
        res.status(400).json({ error: "Error al obtener pares de la API" });
    } catch (e) {
        console.error("❌ Error en /pairs:", e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * @route POST /start-bot
 * Lanza una nueva instancia del bot
 */
app.post('/start-bot', (req, res) => {
    const { symbol, amount, profitMargin, entryDiscountPercentage } = req.body;

    // Validación de entrada (Lo mejor de tu código anterior)
    if (!symbol || !amount || isNaN(amount) || amount <= 0) {
        console.warn("⚠️ Intento de inicio de bot con datos inválidos:", req.body);
        return res.status(400).json({ error: 'Símbolo y monto son obligatorios y deben ser válidos' });
    }

    const id = Date.now();
    const config = {
        symbol,
        amount: parseFloat(amount),
        profitMargin: parseFloat(profitMargin || 0.01),
        entryDiscountPercentage: parseFloat(entryDiscountPercentage || 0.001),
        botId: id
    };

    try {
        console.log(`🤖 Iniciando ciclo de trading para ${symbol} (ID: ${id})`);
        tradeBot.ejecutarTradeLoop(config, id);
        
        res.json({ 
            message: 'Bot lanzado con éxito', 
            id,
            config: { symbol, amount: config.amount } 
        });
    } catch (error) {
        console.error(`❌ Fallo crítico al lanzar bot ${id}:`, error.message);
        res.status(500).json({ error: 'Error interno al iniciar el proceso' });
    }
});

/**
 * @route POST /stop-bot
 */
app.post('/stop-bot', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "ID de bot requerido" });

    console.log(`🛑 Deteniendo bot ID: ${id}...`);
    tradeBot.detenerBot(id);
    res.json({ message: `Bot ${id} detenido y eliminado de memoria` });
});

/**
 * @route GET /bots-activos
 * Devuelve el estado real de los procesos en ejecución
 */
app.get('/bots-activos', (req, res) => {
    const activos = tradeBot.getBotsActivos();
    res.json({ count: activos.length, bots: activos });
});

/**
 * @route GET /monto-actual-total
 */
app.get('/monto-actual-total', (req, res) => {
    const total = tradeBot.getMontoActualTotal();
    res.json({ montoActualTotal: total });
});

/**
 * @route GET /top-prices
 * Precios en tiempo real para el Dashboard
 */
app.get('/top-prices', async (req, res) => {
    try {
        const response = await bitgetApi.get('/api/v2/spot/market/tickers');
        const targetSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
        
        if (response.data.code === '00000') {
            const prices = {};
            response.data.data
                .filter(t => targetSymbols.includes(t.symbol))
                .forEach(t => prices[t.symbol] = t.lastPr);
            return res.json(prices);
        }
        res.status(400).json({ error: "Error capturando tickers" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, async () => {
    console.log("========================================");
    console.log(`🚀 SERVIDOR ACTIVO: http://localhost:${PORT}`);
    console.log(`🔧 MODO: Bitget V2 API (Axios + WS)`);
    console.log("========================================");

    // ✅ RECUPERACIÓN PROFESIONAL DE BOTS
    try {
        await tradeBot.recuperarBotsDesdeStorage();
        console.log('🔄 Recuperación de bots completada');
    } catch (err) {
        console.error('❌ Error recuperando bots:', err.message);
    }
});
