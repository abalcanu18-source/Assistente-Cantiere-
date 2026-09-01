import { Router } from 'express';
import { requireWorker } from '../middleware/auth.js';
import { saveSubscription, isPushConfigured, notifyWorker } from '../services/push.js';
import db from '../db.js';

const router = Router();

router.get('/public-key', (req, res) => {
  res.json({
    publicKey: process.env.VAPID_PUBLIC_KEY || null,
    configured: isPushConfigured(),
    subscriberCount: (db.data.pushSubscriptions || []).length,
  });
});

router.post('/subscribe', requireWorker, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Subscription non valida.' });
  }
  if (!subscription.keys?.p256dh || !subscription.keys?.auth) {
    return res.status(400).json({ error: 'Subscription incompleta (mancano le chiavi).' });
  }
  await saveSubscription(req.workerId, subscription);
  res.status(201).json({ ok: true });
});

router.post('/test', requireWorker, async (req, res) => {
  if (!isPushConfigured()) {
    return res.status(503).json({ error: 'Notifiche non configurate sul server (mancano le chiavi VAPID).' });
  }
  const result = await notifyWorker(req.workerId, {
    type: 'test',
    title: 'Prova sveglia 🔔',
    body: 'Se leggi questo, le notifiche su questo telefono funzionano.',
  });
  if (result.sent === 0) {
    return res.status(502).json({
      error: result.error || 'Il server non è riuscito a consegnare la notifica a questo telefono.',
      ...result,
    });
  }
  res.json({ ok: true, ...result });
});

export default router;
