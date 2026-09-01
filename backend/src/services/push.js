import webpush from 'web-push';
import db from '../db.js';

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT_EMAIL } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return false;
  }
  const contact = VAPID_CONTACT_EMAIL || 'mailto:info@example.com';
  webpush.setVapidDetails(
    contact.startsWith('mailto:') || contact.startsWith('https://') ? contact : `mailto:${contact}`,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  configured = true;
  return true;
}

export function isPushConfigured() {
  return ensureConfigured();
}

export async function saveSubscription(workerId, subscription) {
  db.data.pushSubscriptions = db.data.pushSubscriptions.filter(
    (s) => !(s.workerId === workerId && s.subscription.endpoint === subscription.endpoint)
  );
  db.data.pushSubscriptions.push({ workerId, subscription });
  await db.write();
}

/**
 * Sends a push to every device registered for this worker.
 * Returns how many actually went out, so the "prova sveglia" button can
 * tell the operator the truth instead of pretending it worked.
 */
export async function notifyWorker(workerId, payload) {
  if (!ensureConfigured()) {
    return { sent: 0, failed: 0, error: 'Notifiche non configurate sul server.' };
  }

  const subs = db.data.pushSubscriptions.filter((s) => s.workerId === workerId);
  if (subs.length === 0) {
    return { sent: 0, failed: 0, error: 'Nessun telefono iscritto per questo operaio.' };
  }

  const stale = [];
  const errors = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, JSON.stringify(payload), {
          TTL: 60 * 60 * 12,
          urgency: 'high',
        });
        sent += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          stale.push(s.subscription.endpoint);
          errors.push('Iscrizione scaduta: riattiva le notifiche da questo telefono.');
        } else {
          const detail = err.body ? `${err.statusCode || ''} ${err.body}`.trim() : err.message;
          errors.push(detail || 'Invio rifiutato dal telefono.');
          console.warn(`[push] invio fallito (${err.statusCode || 'n/d'}): ${err.message}`);
        }
      }
    })
  );

  if (stale.length) {
    db.data.pushSubscriptions = db.data.pushSubscriptions.filter(
      (s) => !stale.includes(s.subscription.endpoint)
    );
    await db.write();
  }

  return {
    sent,
    failed: subs.length - sent,
    error: sent === 0 ? errors[0] || 'Invio non riuscito.' : null,
  };
}

export async function notifyAllWorkers(payload) {
  const workerIds = [...new Set(db.data.pushSubscriptions.map((s) => s.workerId))];
  await Promise.all(workerIds.map((id) => notifyWorker(id, payload)));
}
