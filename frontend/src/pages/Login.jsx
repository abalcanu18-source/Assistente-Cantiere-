import React, { useEffect, useState } from 'react';
import { api, saveWorkerSession } from '../api.js';

export default function Login({ companyName, onLogin, onOpenAdmin }) {
  const [workers, setWorkers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [registering, setRegistering] = useState(false);
  const [regName, setRegName] = useState('');
  const [regPin, setRegPin] = useState('');

  function loadWorkers() {
    api
      .listWorkersPublic()
      .then(setWorkers)
      .catch(() => setError('Impossibile contattare il server. Controlla la connessione.'));
  }

  useEffect(() => {
    loadWorkers();
  }, []);

  function pressDigit(d) {
    setError('');
    if (pin.length < 6) setPin(pin + d);
  }

  function backspace() {
    setPin(pin.slice(0, -1));
  }

  async function submit() {
    if (!selected || !pin) return;
    setLoading(true);
    setError('');
    try {
      const { token, worker } = await api.workerLogin(selected.id, pin);
      saveWorkerSession(token);
      onLogin(worker.name);
    } catch (err) {
      setError(err.message);
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  function pressRegDigit(d) {
    setError('');
    if (regPin.length < 6) setRegPin(regPin + d);
  }

  function backspaceReg() {
    setRegPin(regPin.slice(0, -1));
  }

  async function submitRegister() {
    if (!regName.trim() || regPin.length < 4) return;
    setLoading(true);
    setError('');
    try {
      const { token, worker } = await api.registerWorker(regName.trim(), regPin);
      saveWorkerSession(token);
      onLogin(worker.name);
    } catch (err) {
      setError(err.message);
      setRegPin('');
    } finally {
      setLoading(false);
    }
  }

  function backToList() {
    setSelected(null);
    setRegistering(false);
    setPin('');
    setRegName('');
    setRegPin('');
    setError('');
    loadWorkers();
  }

  if (registering) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <button className="link-btn back-btn" onClick={backToList}>
            ← Torna indietro
          </button>
          <h1>Registrati</h1>
          <p className="login-subtitle">Scrivi il tuo nome e scegli un PIN (4-6 cifre)</p>

          {error && <div className="alert alert-error">{error}</div>}

          <input
            className="text-answer-input"
            style={{ width: '100%', marginBottom: 16 }}
            type="text"
            placeholder="Il tuo nome"
            value={regName}
            onChange={(e) => setRegName(e.target.value)}
            autoFocus
          />

          <div className="pin-display">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`pin-dot ${regPin.length > i ? 'filled' : ''}`} />
            ))}
          </div>

          <div className="keypad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button key={n} className="keypad-btn" onClick={() => pressRegDigit(String(n))}>
                {n}
              </button>
            ))}
            <button className="keypad-btn keypad-btn-muted" onClick={backspaceReg}>
              ⌫
            </button>
            <button className="keypad-btn" onClick={() => pressRegDigit('0')}>
              0
            </button>
            <button
              className="keypad-btn keypad-btn-primary"
              onClick={submitRegister}
              disabled={loading || !regName.trim() || regPin.length < 4}
            >
              {loading ? '...' : 'OK'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>{companyName}</h1>
          <p className="login-subtitle">Chi sei?</p>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="worker-grid">
            {workers.map((w) => (
              <button key={w.id} className="worker-btn" onClick={() => setSelected(w)}>
                {w.name}
              </button>
            ))}
            {workers.length === 0 && !error && (
              <p className="muted">Nessun operaio configurato ancora. Registrati qui sotto.</p>
            )}
          </div>

          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => setRegistering(true)}>
            + Registrati
          </button>

          <button className="link-btn" onClick={onOpenAdmin}>
            Sono l'amministratore →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <button className="link-btn back-btn" onClick={() => { setSelected(null); setPin(''); setError(''); }}>
          ← Cambia operaio
        </button>
        <h1>Ciao {selected.name}</h1>
        <p className="login-subtitle">Inserisci il tuo PIN</p>

        <div className="pin-display">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`pin-dot ${pin.length > i ? 'filled' : ''}`} />
          ))}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} className="keypad-btn" onClick={() => pressDigit(String(n))}>
              {n}
            </button>
          ))}
          <button className="keypad-btn keypad-btn-muted" onClick={backspace}>
            ⌫
          </button>
          <button className="keypad-btn" onClick={() => pressDigit('0')}>
            0
          </button>
          <button className="keypad-btn keypad-btn-primary" onClick={submit} disabled={loading || pin.length === 0}>
            {loading ? '...' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
