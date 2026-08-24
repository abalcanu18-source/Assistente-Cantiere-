import { Router } from 'express';
import db, { newId } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// Admin-only: full worker records including PIN, for the management screen.
router.get('/', requireAdmin, (req, res) => {
  res.json(db.data.workers);
});

router.post('/', requireAdmin, async (req, res) => {
  const { name, pin, phone } = req.body;
  if (!name || !pin) {
    return res.status(400).json({ error: 'Nome e PIN sono obbligatori.' });
  }

  const worker = { id: newId(), name, pin: String(pin), phone: phone || '' };
  db.data.workers.push(worker);
  await db.write();
  res.status(201).json(worker);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const worker = db.data.workers.find((w) => w.id === req.params.id);
  if (!worker) return res.status(404).json({ error: 'Operaio non trovato.' });

  const { name, pin, phone } = req.body;
  if (name !== undefined) worker.name = name;
  if (pin !== undefined) worker.pin = String(pin);
  if (phone !== undefined) worker.phone = phone;

  await db.write();
  res.json(worker);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  db.data.workers = db.data.workers.filter((w) => w.id !== req.params.id);
  await db.write();
  res.status(204).end();
});

export default router;
