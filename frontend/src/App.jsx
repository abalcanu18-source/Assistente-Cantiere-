import React, { useEffect, useState } from 'react';
import Login from './pages/Login.jsx';
import Assistant from './pages/Assistant.jsx';
import History from './pages/History.jsx';
import Admin from './pages/Admin.jsx';
import { api, clearWorkerSession, isWorkerLoggedIn } from './api.js';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isWorkerLoggedIn());
  const [workerName, setWorkerName] = useState('');
  const [view, setView] = useState('assistant'); // 'assistant' | 'history' | 'admin'
  const [settings, setSettings] = useState({ companyName: 'La Mia Azienda' });

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    if (loggedIn) {
      api
        .voiceStatus()
        .then((status) => setWorkerName(status.worker.name))
        .catch(() => {
          // Token expired/invalid: send the operator back to login.
          clearWorkerSession();
          setLoggedIn(false);
        });
    }
  }, [loggedIn]);

  function handleLogin(name) {
    setWorkerName(name);
    setLoggedIn(true);
    setView('assistant');
  }

  function handleLogout() {
    clearWorkerSession();
    setLoggedIn(false);
    setWorkerName('');
  }

  if (view === 'admin') {
    return <Admin onExit={() => setView('assistant')} />;
  }

  if (!loggedIn) {
    return <Login companyName={settings.companyName} onLogin={handleLogin} onOpenAdmin={() => setView('admin')} />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <strong>{settings.companyName}</strong>
          <span className="app-header-sub">Ciao, {workerName}</span>
        </div>
        <nav className="app-nav">
          <button className={view === 'assistant' ? 'nav-btn active' : 'nav-btn'} onClick={() => setView('assistant')}>
            Assistente
          </button>
          <button className={view === 'history' ? 'nav-btn active' : 'nav-btn'} onClick={() => setView('history')}>
            Storico
          </button>
          <button className="nav-btn nav-btn-logout" onClick={handleLogout}>
            Esci
          </button>
        </nav>
      </header>

      <main className="app-main">
        {view === 'assistant' && <Assistant workerName={workerName} />}
        {view === 'history' && <History />}
      </main>
    </div>
  );
}
