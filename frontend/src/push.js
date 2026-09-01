import { api } from './api.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

async function subscribeAndSave(publicKey) {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  // Always drop the old subscription: if it was created with a different
  // VAPID key, the server can "send" forever without the phone ever ringing.
  if (existing) {
    try {
      await existing.unsubscribe();
    } catch {
      // ignore: we'll create a fresh one below
    }
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const json = subscription.toJSON();
  if (!json?.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Il telefono non ha restituito una iscrizione valida. Riprova da Chrome.');
  }

  await api.subscribePush(json);
  return true;
}

export async function setupPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error(
      'Questo browser non supporta le sveglie. Su iPhone usa Safari, aggiungi l\'app alla Home e aprila da quella icona.'
    );
  }

  if (isIosDevice() && !isStandalonePwa()) {
    throw new Error(
      'Su iPhone le sveglie funzionano solo se aggiungi l\'app alla schermata Home: Safari → pulsante Condividi → Aggiungi a Home. Poi apri l\'icona e tocca di nuovo "Attiva notifiche".'
    );
  }

  const { publicKey, configured } = await api.getPushPublicKey();
  if (!configured || !publicKey) {
    throw new Error('Le notifiche non sono ancora configurate sul server.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Hai rifiutato le notifiche. Attivale dalle impostazioni del telefono per questo sito, poi riprova.');
  }

  await subscribeAndSave(publicKey);
  return true;
}

export async function restorePushIfGranted() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    if (isIosDevice() && !isStandalonePwa()) return false;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    const { publicKey, configured } = await api.getPushPublicKey();
    if (!configured || !publicKey) return false;
    await subscribeAndSave(publicKey);
    return true;
  } catch {
    return false;
  }
}
