import cron from 'node-cron';
import db from '../db.js';
import { notifyAllWorkers, isPushConfigured } from './push.js';
import { sendDigestForDate } from './digest.js';

let morningJob = null;
let eveningJob = null;
let digestJob = null;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function timeToCron(hhmm) {
  const [hour, minute] = (hhmm || '00:00').split(':').map((n) => parseInt(n, 10));
  return `${minute} ${hour} * * *`; // every day at HH:MM, server local time
}

/**
 * (Re)schedules the two daily "alarm" push notifications based on the
 * current settings (settings.alarmMorning / settings.alarmEvening). Call
 * this once at startup and again any time the admin changes the times.
 */
export function rescheduleAlarms() {
  if (morningJob) morningJob.stop();
  if (eveningJob) eveningJob.stop();
  if (digestJob) digestJob.stop();

  const { alarmMorning, alarmEvening, digestSendTime, emailMode } = db.data.settings;

  morningJob = cron.schedule(timeToCron(alarmMorning), () => {
    notifyAllWorkers({
      type: 'morning',
      title: 'Buongiorno! 🔔',
      body: 'È ora di iniziare la giornata. Apri l\'app e dimmi dove andiamo oggi.',
    });
  });

  eveningJob = cron.schedule(timeToCron(alarmEvening), () => {
    notifyAllWorkers({
      type: 'evening',
      title: 'Fine giornata 🔔',
      body: 'Apri l\'app per raccontarmi cosa hai fatto oggi, cos\u00ec preparo il rapportino.',
    });
  });

  if ((emailMode || 'digest') !== 'immediate') {
    digestJob = cron.schedule(timeToCron(digestSendTime || '19:00'), async () => {
      try {
        const result = await sendDigestForDate(todayKey());
        if (result.sent) {
          console.log(`[digest] Email giornaliera inviata con ${result.count} rapportino/i.`);
        } else if (result.count > 0) {
          console.warn(`[digest] Invio email giornaliera fallito: ${result.error}`);
        }
      } catch (err) {
        console.error('[digest] Errore imprevisto durante l\'invio giornaliero:', err.message);
      }
    });
  }

  if (!isPushConfigured()) {
    console.warn(
      '[scheduler] Chiavi VAPID non configurate: le notifiche push di sveglia non verranno inviate finché non esegui "npm run generate-vapid" e compili il file .env.'
    );
  } else {
    console.log(
      `[scheduler] Sveglie pianificate: mattina ${alarmMorning}, sera ${alarmEvening}.`
    );
  }
}
