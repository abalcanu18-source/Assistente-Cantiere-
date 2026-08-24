import { api } from './api.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * Asks the browser for notification permission and, if granted, subscribes
 * this device to push and registers the subscription with the backend so
 * the 6:30 / 17:00 cron job can reach it. Fails silently (returns false)
 * on unsupported browsers/denied permission -- the app still works, it
 * just won't "ring" automatically on that device.
 */
export async function setupPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  try {
    const { publicKey, configured } = await api.getPushPublicKey();
    if (!configured || !publicKey) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await api.subscribePush(subscription.toJSON());
    return true;
  } catch (err) {
    console.warn('Impossibile attivare le notifiche push:', err);
    return false;
  }
}
