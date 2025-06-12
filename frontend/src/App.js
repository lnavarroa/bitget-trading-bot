import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [marketData, setMarketData] = useState(null);
  const [orderResult, setOrderResult] = useState(null);

  const getMarketData = async () => {
    const res = await axios.get('http://localhost:3001/start-bot');
    setMarketData(res.data);
  };

  const placeOrder = async () => {
    const res = await axios.get('http://localhost:3001/place-order');
    setOrderResult(res.data);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Bitget Trading Bot</h1>

      <button onClick={getMarketData}>Ver Datos del Mercado</button>
      <button onClick={placeOrder}>Colocar Orden de Compra</button>

      {marketData && (
        <div>
          <h3>Ticker</h3>
          <pre>{JSON.stringify(marketData.ticker, null, 2)}</pre>
          <h3>Order Book</h3>
          <pre>{JSON.stringify(marketData.orderBook, null, 2)}</pre>
          <h3>Recent Trades</h3>
          <pre>{JSON.stringify(marketData.trades, null, 2)}</pre>
        </div>
      )}

      {orderResult && (
        <div>
          <h3>Resultado de Orden</h3>
          <pre>{JSON.stringify(orderResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
