import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log('\nChiavi VAPID generate! Copiale nel file .env del backend:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('\nRicorda di aggiungere anche VAPID_PUBLIC_KEY nel file .env del FRONTEND (VITE_VAPID_PUBLIC_KEY), così il browser può iscriversi alle notifiche push.\n');
