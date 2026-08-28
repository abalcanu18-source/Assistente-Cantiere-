import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function History() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    api
      .myReports()
      .then(setReports)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function remove(id) {
    if (!confirm('Eliminare questo rapportino? Non potrai più recuperarlo.')) return;
    try {
      await api.deleteReport(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p className="muted">Caricamento...</p>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className="history-screen">
      <h2>I tuoi rapportini</h2>
      {reports.length === 0 && <p className="muted">Nessun rapportino ancora. Completa una giornata di lavoro.</p>}

      <div className="report-list">
        {reports.map((r) => (
          <div key={r.id} className="report-item">
            <div>
              <strong>{new Date(r.date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
              <p className="muted">{r.jobsite?.name || 'Cantiere non specificato'}</p>
              <p className="report-summary">{r.summary}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <a className="btn btn-secondary btn-sm" href={api.reportPdfUrl(r.id)} target="_blank" rel="noreferrer">
                PDF
              </a>
              <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)}>
                Elimina
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
