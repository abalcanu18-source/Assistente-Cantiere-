import webpush from 'web-push';
import db from '../db.js';

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT_EMAIL } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return false;
  }
  webpush.setVapidDetails(
    VAPID_CONTACT_EMAIL || 'mailto:info@example.com',
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
 * Sends a "wake up, it's time" push notification to every device
 * subscribed for the given worker (an operator might have logged in on
 * more than one phone). Silently drops subscriptions that the browser has
 * since invalidated (410/404), which is normal and expected.
 */
export async function notifyWorker(workerId, payload) {
  if (!ensureConfigured()) return;

  const subs = db.data.pushSubscriptions.filter((s) => s.workerId === workerId);
  const stale = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, JSON.stringify(payload));
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          stale.push(s.subscription.endpoint);
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
}

export async function notifyAllWorkers(payload) {
  const workerIds = [...new Set(db.data.pushSubscriptions.map((s) => s.workerId))];
  await Promise.all(workerIds.map((id) => notifyWorker(id, payload)));
}
