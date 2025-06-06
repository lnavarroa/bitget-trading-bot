const client = require('../config/bitget');

async function runBot() {
  try {
    const marketData = await client.spot().market().ticker('RIFUSDT');
    console.log(marketData.data);
    return marketData.data;
  } catch (error) {
    console.error(error);
    return { error: 'Error getting market data' };
  }
}

module.exports = { runBot };
