import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [view, setView] = useState('nuevo');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [amount, setAmount] = useState(2);
  const [profitMargin, setProfitMargin] = useState(0.004);
  const [entryDiscount, setEntryDiscount] = useState(0.002);
  const [response, setResponse] = useState(null);
  const [botsActivos, setBotsActivos] = useState([]);
  const [montoTotal, setMontoTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [saldoUSDT, setSaldoUSDT] = useState(0);
  const [pairs, setPairs] = useState([]);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [topPrices, setTopPrices] = useState({ BTCUSDT: '...', ETHUSDT: '...', SOLUSDT: '...' });

  const API_TOKEN = 'mi-token-seguro'; // Debe coincidir con tu .env del backend

  // --- UTILIDADES ---
  const calcularTiempo = (fechaInicio) => {
    if (!fechaInicio) return "Iniciando...";
    const inicio = new Date(fechaInicio);
    const diff = Math.abs(new Date() - inicio);
    const horas = Math.floor(diff / (1000 * 60 * 60));
    const minutos = Math.floor((diff / (1000 * 60)) % 60);
    return `${horas}h ${minutos}m`;
  };

  /* --- PETICIONES API (CON LOGS DE DEBUG) --- */

  const fetchData = async (endpoint, setter, label) => {
    try {
      const res = await fetch(`http://localhost:3001${endpoint}`, {
        headers: { 'Authorization': API_TOKEN }
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setter(data);
      // console.log(`[DEBUG] ${label} cargado:`, data);
    } catch (err) {
      console.error(`[ERROR] Falló fetch ${label}:`, err.message);
    }
  };

  const fetchTodo = () => {
    // Especial para balance ya que la estructura del JSON es {balance: X}
    fetch('http://localhost:3001/balance', { headers: { 'Authorization': API_TOKEN } })
      .then(r => r.json()).then(d => setSaldoUSDT(d.balance || 0));
    
    fetch('http://localhost:3001/bots-activos', { headers: { 'Authorization': API_TOKEN } })
      .then(r => r.json()).then(d => setBotsActivos(d.bots || []));

    fetch('http://localhost:3001/monto-actual-total', { headers: { 'Authorization': API_TOKEN } })
      .then(r => r.json()).then(d => setMontoTotal(d.montoActualTotal || 0));

    fetch('http://localhost:3001/top-prices', { headers: { 'Authorization': API_TOKEN } })
      .then(r => r.json()).then(d => setTopPrices(d));
  };

  /* --- ACCIONES --- */

  const handleStartBot = async () => {
    console.log(`🚀 Intentando lanzar bot: ${symbol} con ${amount} USDT`);
    if (!symbol || amount <= 0) {
      setResponse('Monto inválido o par no seleccionado.');
      return;
    }

    try {
      const res = await fetch('http://localhost:3001/start-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': API_TOKEN },
        body: JSON.stringify({ 
          symbol, 
          amount, 
          profitMargin, 
          entryDiscountPercentage: entryDiscount 
        })
      });
      const data = await res.json();
      console.log("[RESPUESTA BACKEND]:", data);
      setResponse(data.id ? `✅ Bot ${data.id} iniciado correctamente.` : data.message);
      fetchTodo();
    } catch (err) {
      setResponse('❌ Error de conexión con el servidor.');
    }
  };

  const handleStopBot = async (id) => {
    if (!window.confirm(`¿Detener bot ${id}?`)) return;
    console.log(`🛑 Deteniendo bot ID: ${id}`);
    try {
      await fetch('http://localhost:3001/stop-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': API_TOKEN },
        body: JSON.stringify({ id })
      });
      fetchTodo();
    } catch (err) { console.error('Error al detener:', err); }
  };

  useEffect(() => {
    // Carga inicial de pares
    fetch('http://localhost:3001/pairs', { headers: { 'Authorization': API_TOKEN } })
      .then(r => r.json()).then(d => setPairs(d.pairs || []));

    fetchTodo();
    const interval = setInterval(fetchTodo, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredPairs = pairs.filter(p => p.symbol.includes(searchTerm));

  return (
    <div className="container-fluid px-0">
      {/* NAVBAR */}
      <nav className="navbar fixed-top px-3 shadow-sm d-flex justify-content-between align-items-center">
        <span className="navbar-brand mb-0 h4 text-primary-neon fw-bold">⚙️ BITGET BOT v2</span>
        <div className="d-flex align-items-center">
          <span className="badge bg-dark border border-success text-success me-2 d-none d-md-inline">SISTEMA ONLINE</span>
          <button className="btn btn-outline-light d-md-none" onClick={() => setSidebarVisible(!sidebarVisible)}>☰</button>
        </div>
      </nav>

      <div className="row g-0" style={{ paddingTop: '60px' }}>
        
        {/* SIDEBAR */}
        <div className={`col-12 col-md-3 sidebar-custom p-3 ${sidebarVisible ? 'd-block' : 'd-none'} d-md-block`}>
          <h6 className="text-muted small text-uppercase mb-3 fw-bold">Navegación</h6>
          <button className={`btn w-100 mb-2 text-start ${view === 'nuevo' ? 'btn-primary' : 'btn-outline-light'}`} onClick={() => setView('nuevo')}>➕ Nuevo Bot</button>
          <button className={`btn w-100 text-start ${view === 'activos' ? 'btn-primary' : 'btn-outline-light'}`} onClick={() => setView('activos')}>🤖 Bots Activos</button>
          
          <div className="mt-5 p-3 rounded bg-dark border border-secondary">
             <small className="text-muted d-block mb-1">RESUMEN</small>
             <div className="small">Bots: <span className="text-primary-neon">{botsActivos.length}</span></div>
             <div className="small">Monto: <span className="text-success-neon">{montoTotal.toFixed(2)} USDT</span></div>
          </div>
        </div>

        {/* CONTENIDO PRINCIPAL */}
        <div className="col-12 col-md-6 p-4">
          <div className="card p-3 mb-4 text-center border-0 shadow">
            <span className="text-muted small text-uppercase fw-bold">Disponible Spot</span>
            <h2 className="mb-0 fw-bold text-success-neon" style={{ fontFamily: 'monospace' }}>
              {Number(saldoUSDT).toFixed(6)} <small style={{fontSize: '1rem'}}>USDT</small>
            </h2>
          </div>

          {response && (
            <div className="alert alert-info border-0 shadow-sm mb-4 alert-dismissible">
              {response}
              <button className="btn-close" onClick={() => setResponse(null)}></button>
            </div>
          )}

          {view === 'nuevo' && (
            <div className="card p-4 shadow border-0">
              <h5 className="mb-4 fw-bold">Configuración de Estrategia</h5>
              <div className="mb-3">
                <label className="form-label small fw-bold">1. Seleccionar Mercado</label>
                <input type="text" className="form-control mb-2" placeholder="🔍 Filtrar par..." value={searchTerm} onChange={e => setSearchTerm(e.target.value.toUpperCase())} />
                <select className="form-select" value={symbol} onChange={e => setSymbol(e.target.value)}>
                  {filteredPairs.map(p => <option key={p.symbol} value={p.symbol}>{p.symbol}</option>)}
                </select>
              </div>
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label small fw-bold">2. Inversión (USDT)</label>
                  <input type="number" className="form-control form-control-lg" value={amount} onChange={e => setAmount(parseFloat(e.target.value))} />
                </div>
                <div className="col-6">
                  <label className="form-label small fw-bold">% Profit Objetivo</label>
                  <input type="number" step="0.0001" className="form-control" value={profitMargin} onChange={e => setProfitMargin(parseFloat(e.target.value))} />
                </div>
                <div className="col-6">
                  <label className="form-label small fw-bold">% Descuento Entrada</label>
                  <input type="number" step="0.0001" className="form-control" value={entryDiscount} onChange={e => setEntryDiscount(parseFloat(e.target.value))} />
                </div>
              </div>
              <button className="btn btn-primary btn-lg w-100 mt-4 fw-bold shadow" onClick={handleStartBot}>🚀 LANZAR BOT</button>
            </div>
          )}

          {view === 'activos' && (
            <div className="card p-4 shadow border-0">
              <h5 className="mb-4 fw-bold">Monitoreo en Tiempo Real</h5>
              {botsActivos.length === 0 ? <p className="text-muted text-center py-4">No hay operaciones activas.</p> : (
                <div className="list-group list-group-flush">
                  {botsActivos.map(bot => {
                    const bId = bot.botId || bot.id;
                    const bAmount = bot.amount || bot.stats?.saldoTotalActual || 0;
                    return (
                      <div key={bId} className="list-group-item p-3 mb-3 border rounded shadow-sm">
                        <div className="d-flex justify-content-between align-items-center">
                          <h6 className="mb-0 fw-bold text-primary-neon">{bot.symbol || bot.config?.symbol}</h6>
                          <span className="badge bg-dark border border-warning text-warning">{bot.estadoActual?.fase?.toUpperCase() || 'TRADING'}</span>
                        </div>
                        <div className="row g-0 my-3 text-center bg-dark rounded p-2">
                          <div className="col-4 border-end border-secondary"><small className="text-muted d-block">HORA</small><span className="small">{calcularTiempo(bot.stats?.fechaInicio)}</span></div>
                          <div className="col-4 border-end border-secondary"><small className="text-muted d-block">CICLOS</small><span className="small text-info">{bot.stats?.ciclosCompletados || 0}</span></div>
                          <div className="col-4"><small className="text-muted d-block">SALDO</small><span className="small text-success">{bAmount.toFixed(4)}</span></div>
                        </div>
                        <div className="d-flex justify-content-end">
                           <button className="btn btn-sm btn-danger" onClick={() => handleStopBot(bId)}>DETENER</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* TICKERS LATERALES */}
        <div className="col-12 col-md-3 p-3 d-none d-md-block">
          <div className="card p-3 border-0 shadow-sm mb-3">
            <h6 className="text-muted small fw-bold mb-3">TICKERS EN VIVO</h6>
            <div className="d-flex justify-content-between mb-2"><span>BTC</span><span className="text-warning fw-bold">${topPrices.BTCUSDT}</span></div>
            <div className="d-flex justify-content-between mb-2"><span>ETH</span><span className="text-info fw-bold">${topPrices.ETHUSDT}</span></div>
            <div className="d-flex justify-content-between"><span>SOL</span><span className="text-success-neon fw-bold">${topPrices.SOLUSDT}</span></div>
          </div>
          <div className="card p-3 border-0 shadow-sm">
            <h6 className="text-muted small fw-bold mb-2">QUICK ACCESS</h6>
            <div className="d-flex flex-wrap gap-2">
              {['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PEPEUSDT'].map(p => (
                <span key={p} className="badge bg-dark border border-secondary pointer p-2" onClick={() => setSymbol(p)}>{p}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;