const { BitgetRestClient } = require('bitget-api-node-sdk');
require('dotenv').config();

const client = new BitgetRestClient({
  apiKey: process.env.BITGET_API_KEY,
  apiSecret: process.env.BITGET_SECRET_KEY,
  passphrase: process.env.BITGET_PASSPHRASE,
  baseURL: 'https://api.bitget.com' // usa testnet si estás en modo sandbox
});

module.exports = client;
