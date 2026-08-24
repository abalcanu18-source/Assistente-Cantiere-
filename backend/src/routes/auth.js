import { Router } from 'express';
import db from '../db.js';
import { createWorkerSession, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Public: list of workers (id + name only) so the login screen can show
// "who are you?" buttons without exposing PIN codes.
router.get('/workers', (req, res) => {
  const workers = db.data.workers.map(({ id, name }) => ({ id, name }));
  res.json(workers);
});

router.post('/worker-login', async (req, res) => {
  const { workerId, pin } = req.body;
  const worker = db.data.workers.find((w) => w.id === workerId);

  if (!worker || String(worker.pin) !== String(pin)) {
    return res.status(401).json({ error: 'PIN non corretto.' });
  }

  const token = createWorkerSession(worker.id);
  res.json({ token, worker: { id: worker.id, name: worker.name } });
});

router.post('/admin-login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Password non corretta.' });
  }
  res.json({ ok: true });
});

// Lightweight helper so the admin frontend can verify a stored password is
// still valid before showing the panel.
router.get('/admin-check', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

export default router;
