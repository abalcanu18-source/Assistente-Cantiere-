import { Router } from 'express';
import { requireWorker } from '../middleware/auth.js';
import { saveSubscription, isPushConfigured } from '../services/push.js';

const router = Router();

router.get('/public-key', (req, res) => {
  res.json({
    publicKey: process.env.VAPID_PUBLIC_KEY || null,
    configured: isPushConfigured(),
  });
});

router.post('/subscribe', requireWorker, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Subscription non valida.' });
  }
  await saveSubscription(req.workerId, subscription);
  res.status(201).json({ ok: true });
});

export default router;
