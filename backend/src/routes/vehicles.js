import { Router } from 'express';
import db, { newId } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// Public GET: the worker app needs the list too (to show/confirm which
// vehicle was understood by the voice assistant). Nothing sensitive here.
router.get('/', (req, res) => {
  res.json(db.data.vehicles);
});

router.post('/', requireAdmin, async (req, res) => {
  const { name, plate, type } = req.body;
  if (!name) return res.status(400).json({ error: 'Il nome del mezzo è obbligatorio.' });

  const vehicle = { id: newId(), name, plate: plate || '', type: type || '' };
  db.data.vehicles.push(vehicle);
  await db.write();
  res.status(201).json(vehicle);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const vehicle = db.data.vehicles.find((v) => v.id === req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'Mezzo non trovato.' });

  const { name, plate, type } = req.body;
  if (name !== undefined) vehicle.name = name;
  if (plate !== undefined) vehicle.plate = plate;
  if (type !== undefined) vehicle.type = type;

  await db.write();
  res.json(vehicle);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  db.data.vehicles = db.data.vehicles.filter((v) => v.id !== req.params.id);
  await db.write();
  res.status(204).end();
});

export default router;
