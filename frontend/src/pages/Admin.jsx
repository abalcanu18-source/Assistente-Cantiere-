import React, { useEffect, useState } from 'react';
import { api, isAdminLoggedIn, saveAdminPassword, clearAdminPassword } from '../api.js';

function WorkersTab() {
  const [workers, setWorkers] = useState([]);
  const [form, setForm] = useState({ name: '', pin: '', phone: '' });
  const [error, setError] = useState('');

  const load = () => api.listWorkers().then(setWorkers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    if (!form.name || !form.pin) return setError('Nome e PIN obbligatori.');
    try {
      await api.createWorker(form);
      setForm({ name: '', pin: '', phone: '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Eliminare questo operaio?')) return;
    await api.deleteWorker(id);
    load();
  }

  return (
    <div>
      <h3>Operai</h3>
      {error && <div className="alert alert-error">{error}</div>}
      <table className="admin-table">
        <thead>
          <tr><th>Nome</th><th>PIN</th><th>Telefono</th><th></th></tr>
        </thead>
        <tbody>
          {workers.map((w) => (
            <tr key={w.id}>
              <td>{w.name}</td><td>{w.pin}</td><td>{w.phone}</td>
              <td><button className="btn btn-danger btn-sm" onClick={() => remove(w.id)}>Elimina</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="admin-form" onSubmit={add}>
        <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="PIN (4 cifre)" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
        <input placeholder="Telefono (opzionale)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <button className="btn btn-primary" type="submit">Aggiungi operaio</button>
      </form>
    </div>
  );
}

function VehiclesTab() {
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState({ name: '', plate: '', type: '' });
  const [error, setError] = useState('');

  const load = () => api.listVehicles().then(setVehicles).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    if (!form.name) return setError('Il nome del mezzo è obbligatorio.');
    try {
      await api.createVehicle(form);
      setForm({ name: '', plate: '', type: '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Eliminare questo mezzo?')) return;
    await api.deleteVehicle(id);
    load();
  }

  return (
    <div>
      <h3>Mezzi di lavoro</h3>
      {error && <div className="alert alert-error">{error}</div>}
      <table className="admin-table">
        <thead>
          <tr><th>Nome</th><th>Targa</th><th>Tipo</th><th></th></tr>
        </thead>
        <tbody>
          {vehicles.map((v) => (
            <tr key={v.id}>
              <td>{v.name}</td><td>{v.plate}</td><td>{v.type}</td>
              <td><button className="btn btn-danger btn-sm" onClick={() => remove(v.id)}>Elimina</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="admin-form" onSubmit={add}>
        <input placeholder="Nome (es. Furgone 1)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Targa (opzionale)" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} />
        <input placeholder="Tipo (opzionale)" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
        <button className="btn btn-primary" type="submit">Aggiungi mezzo</button>
      </form>
    </div>
  );
}

function JobsitesTab() {
  const [jobsites, setJobsites] = useState([]);
  const [form, setForm] = useState({ name: '', address: '' });
  const [error, setError] = useState('');

  const load = () => api.listJobsites().then(setJobsites).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    if (!form.name) return setError('Il nome del cantiere è obbligatorio.');
    try {
      await api.createJobsite(form);
      setForm({ name: '', address: '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Eliminare questo cantiere?')) return;
    await api.deleteJobsite(id);
    load();
  }

  return (
    <div>
      <h3>Cantieri</h3>
      {error && <div className="alert alert-error">{error}</div>}
      <table className="admin-table">
        <thead>
          <tr><th>Nome</th><th>Indirizzo</th><th></th></tr>
        </thead>
        <tbody>
          {jobsites.map((j) => (
            <tr key={j.id}>
              <td>{j.name}</td><td>{j.address}</td>
              <td><button className="btn btn-danger btn-sm" onClick={() => remove(j.id)}>Elimina</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="admin-form" onSubmit={add}>
        <input placeholder="Nome (es. Cantiere Via Roma)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Indirizzo (opzionale)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <button className="btn btn-primary" type="submit">Aggiungi cantiere</button>
      </form>
    </div>
  );
}

function SettingsTab() {
  const [settings, setSettings] = useState({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getSettings().then(setSettings).catch((e) => setError(e.message));
  }, []);

  async function save(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    try {
      await api.updateSettings(settings);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h3>Impostazioni</h3>
      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="alert alert-success">Impostazioni salvate.</div>}

      <form className="admin-form admin-form-vertical" onSubmit={save}>
        <label>
          Nome azienda
          <input value={settings.companyName || ''} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} />
        </label>
        <label>
          Orario sveglia mattina
          <input type="time" value={settings.alarmMorning || ''} onChange={(e) => setSettings({ ...settings, alarmMorning: e.target.value })} />
        </label>
        <label>
          Orario sveglia sera
          <input type="time" value={settings.alarmEvening || ''} onChange={(e) => setSettings({ ...settings, alarmEvening: e.target.value })} />
        </label>
        <label>
          Email segreteria (riceve i PDF)
          <input type="email" value={settings.secretaryEmail || ''} onChange={(e) => setSettings({ ...settings, secretaryEmail: e.target.value })} />
        </label>
        <label>
          Modalità invio email
          <select
            value={settings.emailMode || 'digest'}
            onChange={(e) => setSettings({ ...settings, emailMode: e.target.value })}
          >
            <option value="digest">Un'unica email al giorno con tutti i rapportini (consigliato)</option>
            <option value="immediate">Un'email separata ogni volta che un operaio finisce</option>
          </select>
        </label>
        {(settings.emailMode || 'digest') === 'digest' && (
          <label>
            Orario invio email giornaliera
            <input
              type="time"
              value={settings.digestSendTime || '19:00'}
              onChange={(e) => setSettings({ ...settings, digestSendTime: e.target.value })}
            />
          </label>
        )}
        <button className="btn btn-primary" type="submit">Salva impostazioni</button>
      </form>
    </div>
  );
}

function ReportsTab() {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const load = () => api.allReports().then(setReports).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function sendToday() {
    setSending(true);
    setSendResult(null);
    setError('');
    try {
      const result = await api.sendDailyDigest(new Date().toISOString().slice(0, 10));
      setSendResult(result);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h3>Tutti i rapportini</h3>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="admin-form" style={{ marginBottom: 16 }}>
        <button className="btn btn-secondary" onClick={sendToday} disabled={sending}>
          {sending ? 'Invio...' : '📧 Invia rapportini di oggi ora'}
        </button>
      </div>

      {sendResult && (
        <div className={`alert ${sendResult.sent ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 16 }}>
          {sendResult.sent
            ? `Email inviata con ${sendResult.count} rapportino/i.`
            : sendResult.error || 'Invio non riuscito.'}
        </div>
      )}
      <table className="admin-table">
        <thead>
          <tr><th>Data</th><th>Operaio</th><th>Cantiere</th><th>Email inviata</th><th></th></tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.date).toLocaleDateString('it-IT')}</td>
              <td>{r.worker?.name}</td>
              <td>{r.jobsite?.name || '-'}</td>
              <td>{r.emailSent ? '✅' : '❌'}</td>
              <td>
                <a
                  className="btn btn-secondary btn-sm"
                  href={`${api.API_URL}/api/reports/${r.id}/pdf?adminPassword=${encodeURIComponent(sessionStorage.getItem('adminPassword') || '')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  PDF
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Admin({ onExit }) {
  const [authed, setAuthed] = useState(isAdminLoggedIn());
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('workers');

  async function login(e) {
    e.preventDefault();
    setError('');
    try {
      await api.adminLogin(password);
      saveAdminPassword(password);
      setAuthed(true);
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    clearAdminPassword();
    setAuthed(false);
  }

  if (!authed) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>Area amministrazione</h1>
          {error && <div className="alert alert-error">{error}</div>}
          <form className="admin-form admin-form-vertical" onSubmit={login}>
            <input
              type="password"
              placeholder="Password amministratore"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn btn-primary" type="submit">Entra</button>
          </form>
          <button className="link-btn" onClick={onExit}>← Torna all'app</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <strong>Amministrazione</strong>
        <nav className="app-nav">
          <button className="nav-btn nav-btn-logout" onClick={logout}>Esci</button>
          <button className="nav-btn" onClick={onExit}>Torna all'app</button>
        </nav>
      </header>

      <div className="admin-tabs">
        <button className={tab === 'workers' ? 'nav-btn active' : 'nav-btn'} onClick={() => setTab('workers')}>Operai</button>
        <button className={tab === 'vehicles' ? 'nav-btn active' : 'nav-btn'} onClick={() => setTab('vehicles')}>Mezzi</button>
        <button className={tab === 'jobsites' ? 'nav-btn active' : 'nav-btn'} onClick={() => setTab('jobsites')}>Cantieri</button>
        <button className={tab === 'reports' ? 'nav-btn active' : 'nav-btn'} onClick={() => setTab('reports')}>Rapportini</button>
        <button className={tab === 'settings' ? 'nav-btn active' : 'nav-btn'} onClick={() => setTab('settings')}>Impostazioni</button>
      </div>

      <main className="app-main">
        {tab === 'workers' && <WorkersTab />}
        {tab === 'vehicles' && <VehiclesTab />}
        {tab === 'jobsites' && <JobsitesTab />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
    </div>
  );
}
