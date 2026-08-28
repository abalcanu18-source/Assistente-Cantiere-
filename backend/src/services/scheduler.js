import cron from 'node-cron';
import db from '../db.js';
import { notifyWorker, isPushConfigured } from './push.js';
import { sendDigestForDate } from './digest.js';

let morningJob = null;
let eveningJob = null;
let eveningJob2 = null;
let digestJob = null;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Only pesters people who actually still need to do something: the morning
// alarm skips anyone who already clocked in, the evening ones skip anyone
// who already closed their day.
function workerIdsWithOpenSessionToday() {
  const key = todayKey();
  return new Set(
    db.data.sessions.filter((s) => s.date === key && s.status === 'in_corso').map((s) => s.workerId)
  );
}

function notifyWorkersNotYetStarted(payload) {
  const openIds = workerIdsWithOpenSessionToday();
  const targets = db.data.workers.filter((w) => !openIds.has(w.id));
  return Promise.all(targets.map((w) => notifyWorker(w.id, payload)));
}

function notifyWorkersStillOpen(payload) {
  const openIds = workerIdsWithOpenSessionToday();
  return Promise.all([...openIds].map((id) => notifyWorker(id, payload)));
}

// Mon-Fri only by default: the crew doesn't work weekends, so no point
// waking anyone up with an alarm on Saturday/Sunday.
function timeToCron(hhmm, weekdaysOnly) {
  const [hour, minute] = (hhmm || '00:00').split(':').map((n) => parseInt(n, 10));
  const dayOfWeek = weekdaysOnly ? '1-5' : '*';
  return `${minute} ${hour} * * ${dayOfWeek}`; // server local time
}

/**
 * (Re)schedules the daily "alarm" push notifications based on the current
 * settings (settings.alarmMorning / settings.alarmEvening / .alarmEvening2).
 * Call this once at startup and again any time the admin changes the times.
 */
export function rescheduleAlarms() {
  if (morningJob) morningJob.stop();
  if (eveningJob) eveningJob.stop();
  if (eveningJob2) eveningJob2.stop();
  if (digestJob) digestJob.stop();

  const { alarmMorning, alarmEvening, alarmEvening2, digestSendTime, emailMode, weekdaysOnly } = db.data.settings;

  morningJob = cron.schedule(timeToCron(alarmMorning, weekdaysOnly), () => {
    notifyWorkersNotYetStarted({
      type: 'morning',
      title: 'Buongiorno! 🔔',
      body: 'È ora di iniziare la giornata. Apri l\'app e dimmi dove andiamo oggi.',
    });
  });

  eveningJob = cron.schedule(timeToCron(alarmEvening, weekdaysOnly), () => {
    notifyWorkersStillOpen({
      type: 'evening',
      title: 'Fine giornata 🔔',
      body: 'Apri l\'app per raccontarmi cosa hai fatto oggi, cos\u00ec preparo il rapportino.',
    });
  });

  // Second, gentler reminder half an hour later for whoever missed the first.
  if (alarmEvening2) {
    eveningJob2 = cron.schedule(timeToCron(alarmEvening2, weekdaysOnly), () => {
      notifyWorkersStillOpen({
        type: 'evening',
        title: 'Promemoria: fine giornata 🔔',
        body: 'Non hai ancora chiuso la giornata. Apri l\'app per raccontarmi cosa hai fatto oggi.',
      });
    });
  }

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
      `[scheduler] Sveglie pianificate (${weekdaysOnly ? 'lun-ven' : 'tutti i giorni'}): mattina ${alarmMorning}, sera ${alarmEvening}${alarmEvening2 ? ` e ${alarmEvening2}` : ''}.`
    );
  }
}
