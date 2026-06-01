const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();
const { API_CONFIG } = require('./config');

const CONFIG = {
    apiKey: process.env.BITGET_API_KEY,
    apiSecret: process.env.BITGET_API_SECRET,
    passphrase: process.env.BITGET_PASSPHRASE,
    baseUrl: API_CONFIG.API_URL,
    timeout: 10000
};

/**
 * Genera la firma siguiendo: timestamp + method + path + queryString + body
 */
const generateSignature = (timestamp, method, path, body = '') => {
    const message = timestamp + method.toUpperCase() + path + body;
    return crypto
        .createHmac('sha256', CONFIG.apiSecret)
        .update(message)
        .digest('base64');
};

const bitgetApi = axios.create({
    baseURL: CONFIG.baseUrl,
    timeout: CONFIG.timeout,
    headers: {
        'Content-Type': 'application/json'
    }
});

bitgetApi.interceptors.request.use((config) => {
    const timestamp = Date.now().toString();
    const method = config.method.toUpperCase();
    
    // IMPORTANTE: Obtener el path completo incluyendo el query string si existe
    // Ejemplo: /api/v2/spot/market/tickers?symbol=BTCUSDT
    const urlObj = new URL(config.url, CONFIG.baseUrl);
    const requestPath = urlObj.pathname + urlObj.search;

    const body = (config.data && Object.keys(config.data).length > 0) 
        ? JSON.stringify(config.data) 
        : '';

    // HEADERS SEGÚN DOCUMENTACIÓN OFICIAL V2
    config.headers['ACCESS-KEY'] = CONFIG.apiKey;
    config.headers['ACCESS-SIGN'] = generateSignature(timestamp, method, requestPath, body);
    config.headers['ACCESS-TIMESTAMP'] = timestamp;
    config.headers['ACCESS-PASSPHRASE'] = CONFIG.passphrase;
    config.headers['locale'] = 'en-US';

    return config;
}, (error) => Promise.reject(error));

module.exports = { bitgetApi };