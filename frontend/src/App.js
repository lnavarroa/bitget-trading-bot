import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [data, setData] = useState(null);

  const startBot = async () => {
    const response = await axios.get('http://localhost:3001/start-bot');
    setData(response.data);
  };

  return (
    <div>
      <h1>Bitget Trading Bot</h1>
      <button onClick={startBot}>Start Bot</button>
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

export default App;
