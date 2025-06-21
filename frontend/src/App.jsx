import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [view, setView] = useState('nuevo');
  const [symbol, setSymbol] = useState('RIFSOLUSDT');
  const [amount, setAmount] = useState(2);
  const [profitMargin, setProfitMargin] = useState(0.004);
  const [entryDiscount, setEntryDiscount] = useState(0.002);
  const [response, setResponse] = useState(null);
  const [botActivo, setBotActivo] = useState(false);
  const [montoActual, setMontoActual] = useState(null);
  const [botsActivos, setBotsActivos] = useState([]);
  const [montoTotal, setMontoTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [saldoUSDT, setSaldoUSDT] = useState(0);
  const [pairs, setPairs] = useState([]);
  const filteredPairs = pairs.filter(p => p.symbol.includes(searchTerm));

  const API_TOKEN = 'mi-token-seguro'; // Token de autenticación

  const fetchBalance = async () => {
    try {
      const res = await fetch('http://localhost:3001/balance', {
        headers: { Authorization: API_TOKEN }
      });
      const data = await res.json();
      setSaldoUSDT(data.balance);
    } catch (err) {
      console.error('Error al obtener el balance:', err);
    }
  };

  const handleStartBot = async () => {
    if (!symbol || !amount || !profitMargin || !entryDiscount) {
      setResponse('Por favor, completa todos los campos antes de iniciar el bot.');
      return;
    }
  
    if (amount <= 0 || profitMargin <= 0 || entryDiscount <= 0) {
      setResponse('Los valores deben ser positivos.');
      return;
    }
  
    try {
      const res = await fetch('http://localhost:3001/start-bot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: API_TOKEN
        },
        body: JSON.stringify({
          symbol,
          amount,
          profitMargin,
          entryDiscountPercentage: entryDiscount
        })
      });
      const data = await res.json();
      setResponse(data.message || 'Bot ejecutado');
      if (data.id) {
        setResponse(`Bot iniciado con ID: ${data.id}`);
      }
      setBotActivo(true);
      fetchBotsActivos();
    } catch (err) {
      console.error('Error al iniciar el bot:', err);
      setResponse('Error al iniciar el bot.');
    }
  };

  const handleStopBot = async (id) => {
    const confirm = window.confirm('¿Estás seguro de que deseas detener este bot?');
    if (!confirm) return;

    try {
      const res = await fetch('http://localhost:3001/stop-bot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: API_TOKEN
        },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      setResponse(data.message || 'Bot detenido');
      fetchBotsActivos();
    } catch (err) {
      console.error('Error al detener el bot:', err);
      setResponse('Error al detener el bot.');
    }
  };

  const fetchBotsActivos = async () => {
    try {
      const res = await fetch('http://localhost:3001/bots-activos', {
        headers: { Authorization: API_TOKEN }
      });
      const data = await res.json();
      setBotsActivos(data.bots);
    } catch (err) {
      console.error('Error al obtener bots activos:', err);
    }
  };

  const fetchMontoTotal = async () => {
    try {
      const res = await fetch('http://localhost:3001/monto-actual-total', {
        headers: { Authorization: API_TOKEN }
      });
      const data = await res.json();
      setMontoTotal(data.montoActualTotal);
    } catch (err) {
      console.error('Error al obtener monto total:', err);
    }
  };

  const fetchPairs = async () => {
    try {
      const res = await fetch('http://localhost:3001/pairs', {
        headers: { Authorization: API_TOKEN }
      });
      const json = await res.json();

      if (Array.isArray(json.pairs)) {
        setPairs(json.pairs);
        if (json.pairs.length > 0 && !symbol) {
          setSymbol(json.pairs[0].symbol);
        }
      } else {
        console.error('Respuesta inválida del backend /pairs:', json);
      }
    } catch (err) {
      console.error('Error al obtener pares:', err);
    }
  };

  useEffect(() => {
    fetchBotsActivos();
    fetchMontoTotal();
    fetchBalance();
    fetchPairs();
    const interval = setInterval(() => {
      fetchBotsActivos();
      fetchMontoTotal();
      fetchBalance();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="App" style={{ display: 'flex' }}>
      <aside style={{ width: '200px', padding: '1rem', backgroundColor: '#f0f0f0' }}>
        <h3>Menú</h3>
        <button onClick={() => setView('nuevo')}>Nuevo Bot</button>
        <button onClick={() => setView('activos')}>Bots Activos</button>
      </aside>

      <main style={{ flex: 1, padding: '1rem' }}>
        <h1>Panel de Control - Bitget Bot</h1>
        <p><strong>Saldo disponible (USDT):</strong> {Number(saldoUSDT || 0).toFixed(8)} USDT</p>

        {view === 'nuevo' && (
          <>
            <div>
              <label>Buscar par:</label>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value.toUpperCase())}
                placeholder="Ej: BTC, CHEEMS..."
              />
              <label>Par de Trading:</label>
              <select value={symbol} onChange={e => setSymbol(e.target.value)}>
                {filteredPairs.map(p => (
                  <option key={p.symbol} value={p.symbol}>
                    {p.symbol}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Monto Inicial (USDT):</label>
              <input type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value))} />
            </div>

            <div>
              <label>% de Ganancia (ej: 0.004 = 0.4%):</label>
              <input type="number" step="0.0001" value={profitMargin} onChange={e => setProfitMargin(parseFloat(e.target.value))} />
            </div>

            <div>
              <label>% de Descuento de Entrada (ej: 0.002 = 0.2%):</label>
              <input type="number" step="0.0001" value={entryDiscount} onChange={e => setEntryDiscount(parseFloat(e.target.value))} />
            </div>

            <button onClick={handleStartBot}>Iniciar Bot</button>
            {response && <p>{response}</p>}
          </>
        )}

        {view === 'activos' && (
          <>
            <h2>Bots Activos</h2>
            <p><strong>Monto Total Acumulado:</strong> {montoTotal.toFixed(6)} USDT</p>
            <ul>
              {botsActivos.map(bot => (
                <li key={bot.id}>
                  <strong>ID:</strong> {bot.id} | <strong>Par:</strong> {bot.symbol} | <strong>Monto:</strong> {bot.amount.toFixed(6)} USDT
                  <button onClick={() => handleStopBot(bot.id)} style={{ marginLeft: '1rem' }}>Detener</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

export default App;