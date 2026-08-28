import { Router } from 'express';
import db from '../db.js';
import { requireAdmin, requireWorker, getWorkerIdFromToken } from '../middleware/auth.js';
import { generateReportPdfBuffer, reportFileName } from '../services/pdf.js';
import { resolveJobsite, resolveVehicle } from '../services/sessionHelpers.js';
import { sendDigestForDate } from '../services/digest.js';

const router = Router();

function enrich(session) {
  return {
    ...session,
    jobsite: resolveJobsite(session),
    vehicle: resolveVehicle(session),
    worker: (() => {
      const w = db.data.workers.find((w) => w.id === session.workerId);
      return w ? { id: w.id, name: w.name } : null;
    })(),
  };
}

// The logged-in worker's own report history.
router.get('/mine', requireWorker, (req, res) => {
  const mine = db.data.sessions
    .filter((s) => s.workerId === req.workerId && s.status === 'completato')
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(enrich);
  res.json(mine);
});

// Admin view across every operator, optionally filtered by worker/date.
router.get('/', (req, res) => {
  const isAdmin = req.headers['x-admin-password'] === process.env.ADMIN_PASSWORD;
  if (!isAdmin) return res.status(401).json({ error: 'Accesso non autorizzato.' });

  const { workerId, date } = req.query;
  let sessions = db.data.sessions.filter((s) => s.status === 'completato');
  if (workerId) sessions = sessions.filter((s) => s.workerId === workerId);
  if (date) sessions = sessions.filter((s) => s.date === date);

  sessions = sessions.sort((a, b) => new Date(b.date) - new Date(a.date)).map(enrich);
  res.json(sessions);
});

// Admin-only: sends the once-a-day digest email right now, for a given
// date (defaults to today), instead of waiting for the scheduled time.
router.post('/send-daily', requireAdmin, async (req, res) => {
  const date = req.body?.date || new Date().toISOString().slice(0, 10);
  try {
    const result = await sendDigestForDate(date);
    res.json(result);
  } catch (err) {
    res.status(500).json({ sent: false, error: err.message });
  }
});

router.get('/:id/pdf', async (req, res) => {
  const session = db.data.sessions.find((s) => s.id === req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Rapportino non trovato.' });
  }

  // Plain <a href> downloads can't set custom headers, so the admin panel
  // passes the password as a query param for this one endpoint instead.
  const isAdmin =
    req.headers['x-admin-password'] === process.env.ADMIN_PASSWORD ||
    (req.query.adminPassword && req.query.adminPassword === process.env.ADMIN_PASSWORD);

  // Ownership/admin check: either the admin password header, or a valid
  // worker session token that belongs to the same worker as this report.
  if (!isAdmin) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token;
    const workerId = getWorkerIdFromToken(token);
    if (!workerId || workerId !== session.workerId) {
      return res.status(401).json({ error: 'Accesso non autorizzato.' });
    }
  }

  const worker = db.data.workers.find((w) => w.id === session.workerId);
  if (!worker) return res.status(404).json({ error: 'Operaio non trovato.' });

  // Regenerated on demand from the persisted session data instead of being
  // read from disk -- identical output, but nothing to lose if the host's
  // filesystem gets wiped between requests.
  const jobsite = resolveJobsite(session);
  const vehicle = resolveVehicle(session);
  const pdfBuffer = await generateReportPdfBuffer({
    session,
    worker,
    vehicle,
    jobsite,
    companyName: db.data.settings.companyName,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${reportFileName(worker, session)}"`);
  res.send(pdfBuffer);
});

export default router;
