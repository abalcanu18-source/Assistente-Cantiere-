import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function History() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .myReports()
      .then(setReports)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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
            <a className="btn btn-secondary btn-sm" href={api.reportPdfUrl(r.id)} target="_blank" rel="noreferrer">
              PDF
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
