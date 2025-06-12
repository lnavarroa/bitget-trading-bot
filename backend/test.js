/*require('dotenv').config();
var bitgetApi = require("bitget-openapi")
var Console = require("console")

const apiKey = process.env.BITGET_API_KEY;
const secretKey = process.env.BITGET_API_SECRET;
const passphrase = process.env.BITGET_PASSPHRASE;
//处理消息的实现类
class ListennerObj extends bitgetApi.Listenner{
    reveice(message){
        Console.info('>>>'+message);
    }
}

const listenner = new ListennerObj();
const bitgetWsClient = new bitgetApi.BitgetWsClient(listenner,apiKey,secretKey,passphrase);
const subArr = new Array();

const subscribeOne = new bitgetApi.SubscribeReq('mc','ticker','BTCUSD');
const subscribeTow = new bitgetApi.SubscribeReq('SP','candle1W','BTCUSDT');

subArr.push(subscribeOne);
subArr.push(subscribeTow);

bitgetWsClient.subscribe(subArr)
*/

require('dotenv').config();
const { SpotAccountApi } = require('bitget-api-node-sdk');

const credentials = {
  apiKey: process.env.BITGET_API_KEY,
  apiSecret: process.env.BITGET_API_SECRET,
  passphrase: process.env.BITGET_PASSPHRASE,
  baseURL: 'https://api.bitget.com' // fuerza mainnet
};
console.log('API_KEY:', process.env.BITGET_API_KEY);
console.log('API_SECRET:', process.env.BITGET_API_SECRET);
console.log('PASSPHRASE:', process.env.BITGET_PASSPHRASE);

const accountClient = new SpotAccountApi(credentials);

(async () => {
  try {
    const result = await accountClient.assets(); // <- Método correcto
    console.log('✅ Balance spot:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Error al obtener el balance:', error.message || error);
  }
})();
