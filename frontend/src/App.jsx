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
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const API_TOKEN = 'mi-token-seguro';

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
      if (data.id) setResponse(`Bot iniciado con ID: ${data.id}`);
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
    <div className="container-fluid px-0">
      <nav className="navbar fixed-top d-flex justify-content-between align-items-center px-3">
        <span className="navbar-brand mb-0 h4 text-light">
          ⚙️ Panel de Control - Bitget Bot
        </span>
        {/* Mostrar solo en móvil */}
        <button
          className="btn btn-outline-light d-md-none"
          onClick={() => setSidebarVisible(prev => !prev)}
        >
          ☰
        </button>
      </nav>


      <div className="row g-0" style={{ paddingTop: '56px' }}>
        {/* Sidebar */}
        <div className={`col-12 col-md-3 sidebar-custom ${sidebarVisible ? 'd-block' : 'd-none'} d-md-block`}>
          <div className="p-3">
            <h4>Menú</h4>
            <button className="btn btn-outline-primary w-100 mb-2" onClick={() => setView('nuevo')}>Nuevo Bot</button>
            <button className="btn btn-outline-secondary w-100" onClick={() => setView('activos')}>Bots Activos</button>
          </div>
        </div>

        {/* Panel principal */}
        <div className="col-12 col-md-6">
          <div className="p-4">
            <span role="img" aria-label="dinero">💰</span>{' '}
            <p className="saldo-destacado text-center"><strong>Saldo disponible:</strong> {Number(saldoUSDT || 0).toFixed(8)} USDT</p>

            {response && <div className="alert alert-info">{response}</div>}

            {view === 'nuevo' && (
              <div className="card p-4">
                <h5 className="mb-3">Configurar Nuevo Bot</h5>

                <div className="mb-3">
                  <label className="form-label">Buscar par:</label>
                  <input
                    type="text"
                    className="form-control"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value.toUpperCase())}
                    placeholder="Ej: BTC, CHEEMS..."
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Par de Trading:</label>
                  <select className="form-select" value={symbol} onChange={e => setSymbol(e.target.value)}>
                    {filteredPairs.map(p => (
                      <option key={p.symbol} value={p.symbol}>{p.symbol}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-3">
                  <label className="form-label">Monto Inicial (USDT):</label>
                  <input
                    type="number"
                    className="form-control"
                    value={amount}
                    onChange={e => setAmount(parseFloat(e.target.value))}
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">% de Ganancia (ej: 0.004 = 0.4%):</label>
                  <input
                    type="number"
                    step="0.0001"
                    className="form-control"
                    value={profitMargin}
                    onChange={e => setProfitMargin(parseFloat(e.target.value))}
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">% de Descuento de Entrada (ej: 0.002 = 0.2%):</label>
                  <input
                    type="number"
                    step="0.0001"
                    className="form-control"
                    value={entryDiscount}
                    onChange={e => setEntryDiscount(parseFloat(e.target.value))}
                  />
                </div>

                <button className="btn btn-primary" onClick={handleStartBot}>Iniciar Bot</button>
              </div>
            )}

            {view === 'activos' && (
              <div className="card p-4">
                <h5 className="mb-3">Bots Activos</h5>
                <p><strong>Monto Total Acumulado:</strong> {montoTotal.toFixed(6)} USDT</p>
                <ul className="list-group">
                  {botsActivos.map(bot => (
                    <li key={bot.id} className="list-group-item d-flex justify-content-between align-items-center">
                      <div>
                        <strong>ID:</strong> {bot.id} | <strong>Par:</strong> {bot.symbol} | <strong>Monto:</strong> {bot.amount.toFixed(6)} USDT
                      </div>
                      <button className="btn btn-sm btn-danger" onClick={() => handleStopBot(bot.id)}>Detener</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha - widgets */}
        <div className="col-12 col-md-3">
          <div className="d-flex flex-column gap-3 p-3">
            <div className="card p-3">
              <h6 className="text-muted mb-2">🧮 Precios destacados</h6>
              <ul className="list-unstyled mb-0">
                <li>BTC/USDT: <strong>$62,580</strong></li>
                <li>ETH/USDT: <strong>$3,290</strong></li>
                <li>SOL/USDT: <strong>$138.20</strong></li>
              </ul>
            </div>
            <div className="card p-3">
              <h6 className="text-muted mb-2">💧 Pares con alta liquidez</h6>
              <ul className="list-unstyled mb-0">
                <li>BTC/USDT</li>
                <li>ETH/USDT</li>
                <li>OP/USDT</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
