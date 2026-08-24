import { Router } from 'express';
import db, { newId } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// Public GET: same reasoning as vehicles.js.
router.get('/', (req, res) => {
  res.json(db.data.jobsites);
});

router.post('/', requireAdmin, async (req, res) => {
  const { name, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Il nome del cantiere è obbligatorio.' });

  const jobsite = { id: newId(), name, address: address || '' };
  db.data.jobsites.push(jobsite);
  await db.write();
  res.status(201).json(jobsite);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const jobsite = db.data.jobsites.find((j) => j.id === req.params.id);
  if (!jobsite) return res.status(404).json({ error: 'Cantiere non trovato.' });

  const { name, address } = req.body;
  if (name !== undefined) jobsite.name = name;
  if (address !== undefined) jobsite.address = address;

  await db.write();
  res.json(jobsite);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  db.data.jobsites = db.data.jobsites.filter((j) => j.id !== req.params.id);
  await db.write();
  res.status(204).end();
});

export default router;
