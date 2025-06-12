import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [view, setView] = useState('nuevo');
  const [symbol, setSymbol] = useState('CHEEMSUSDT_SPBL');
  const [amount, setAmount] = useState(10);
  const [profitMargin, setProfitMargin] = useState(0.006);
  const [entryDiscount, setEntryDiscount] = useState(0.003);
  const [response, setResponse] = useState(null);
  const [botActivo, setBotActivo] = useState(false);
  const [montoActual, setMontoActual] = useState(null);
  const [botsActivos, setBotsActivos] = useState([]);
  const [montoTotal, setMontoTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [saldoUSDT, setSaldoUSDT] = useState(0);
  const [pairs, setPairs] = useState([]);
  const filteredPairs = pairs.filter(p => p.symbol.includes(searchTerm));

  const fetchBalance = async () => {
    try {
      const res = await fetch('http://localhost:3001/balance');
      const data = await res.json();
      setSaldoUSDT(data.balance);
    } catch (err) {
      console.error('Error al obtener el balance:', err);
    }
  };

  const handleStartBot = async () => {
    const res = await fetch('http://localhost:3001/start-bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        amount,
        profitMargin,
        entryDiscountPercentage: entryDiscount
      })
    });
    const data = await res.json();
    setResponse(data.message || 'Bot ejecutado');
    setBotActivo(true);
    fetchBotsActivos();
  };

  const handleStopBot = async (id) => {
    const confirm = window.confirm('¿Estás seguro de que deseas detener este bot?');
    if (!confirm) return;

    const res = await fetch('http://localhost:3001/stop-bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    setResponse(data.message || 'Bot detenido');
    fetchBotsActivos();
  };

  const fetchBotsActivos = async () => {
    const res = await fetch('http://localhost:3001/bots-activos');
    const data = await res.json();
    setBotsActivos(data.bots);
  };

  const fetchMontoTotal = async () => {
    const res = await fetch('http://localhost:3001/monto-actual-total');
    const data = await res.json();
    setMontoTotal(data.montoActualTotal);
  };

  const fetchPairs = async () => {
    try {
      const res = await fetch('http://localhost:3001/pairs');
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
              <label>% de Ganancia (ej: 0.006 = 0.6%):</label>
              <input type="number" step="0.0001" value={profitMargin} onChange={e => setProfitMargin(parseFloat(e.target.value))} />
            </div>

            <div>
              <label>% de Descuento de Entrada (ej: 0.003 = 0.3%):</label>
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
