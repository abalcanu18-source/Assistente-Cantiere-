import cron from 'node-cron';
import db from '../db.js';
import { notifyWorker, isPushConfigured } from './push.js';
import { sendDigestForDate } from './digest.js';
import { todayKey, getRomeClock, hhmmToMinutes, TIMEZONE } from './time.js';

let morningJob = null;
let eveningJob = null;
let eveningJob2 = null;
let digestJob = null;
let catchUpTimer = null;
let catchingUp = false;

function workerIdsWithOpenSessionToday() {
  const key = todayKey();
  return new Set(
    db.data.sessions.filter((s) => s.date === key && s.status === 'in_corso').map((s) => s.workerId)
  );
}

function notifyWorkersNotYetStarted(payload) {
  const openIds = workerIdsWithOpenSessionToday();
  const targets = db.data.workers.filter((w) => !openIds.has(w.id));
  console.log(`[scheduler] sveglia mattina → ${targets.length} operai non ancora in turno`);
  return Promise.all(targets.map((w) => notifyWorker(w.id, payload)));
}

function notifyWorkersStillOpen(payload) {
  const openIds = workerIdsWithOpenSessionToday();
  console.log(`[scheduler] sveglia sera → ${openIds.size} turni ancora aperti`);
  return Promise.all([...openIds].map((id) => notifyWorker(id, payload)));
}

function timeToCron(hhmm, weekdaysOnly) {
  const [hour, minute] = (hhmm || '00:00').split(':').map((n) => parseInt(n, 10));
  const dayOfWeek = weekdaysOnly ? '1-5' : '*';
  return `${minute} ${hour} * * ${dayOfWeek}`;
}

function cronOpts() {
  return { timezone: TIMEZONE };
}

function alreadyFired(slot, dateKey) {
  db.data.alarmLastFired = db.data.alarmLastFired || {};
  return db.data.alarmLastFired[slot] === dateKey;
}

async function markFired(slot, dateKey) {
  db.data.alarmLastFired = db.data.alarmLastFired || {};
  db.data.alarmLastFired[slot] = dateKey;
  await db.write();
}

/**
 * If the free-tier host was asleep at the exact alarm minute, still send
 * the notification as soon as the process is awake, as long as we're still
 * in a reasonable window after the scheduled time.
 */
async function catchUpMissedAlarms() {
  if (catchingUp) return;
  catchingUp = true;
  try {
    const { dateKey, minutes, isWeekend } = getRomeClock();
    const s = db.data.settings || {};
    if (s.weekdaysOnly !== false && isWeekend) return;

    const morningAt = hhmmToMinutes(s.alarmMorning || '06:30');
    const eveningAt = hhmmToMinutes(s.alarmEvening || '17:00');
    const evening2At = hhmmToMinutes(s.alarmEvening2 || '17:30');

    if (morningAt != null && minutes >= morningAt && minutes <= morningAt + 90 && !alreadyFired('morning', dateKey)) {
      await markFired('morning', dateKey);
      await notifyWorkersNotYetStarted({
        type: 'morning',
        title: 'Buongiorno! 🔔',
        body: 'È ora di iniziare la giornata. Apri l\'app e dimmi dove andiamo oggi.',
      });
    }

    if (eveningAt != null && minutes >= eveningAt && minutes <= eveningAt + 40 && !alreadyFired('evening', dateKey)) {
      await markFired('evening', dateKey);
      await notifyWorkersStillOpen({
        type: 'evening',
        title: 'Fine giornata 🔔',
        body: 'Apri l\'app per raccontarmi cosa hai fatto oggi, così preparo il rapportino.',
      });
    }

    if (evening2At != null && minutes >= evening2At && minutes <= evening2At + 90 && !alreadyFired('evening2', dateKey)) {
      await markFired('evening2', dateKey);
      await notifyWorkersStillOpen({
        type: 'evening',
        title: 'Promemoria: fine giornata 🔔',
        body: 'Non hai ancora chiuso la giornata. Apri l\'app per raccontarmi cosa hai fatto oggi.',
      });
    }
  } catch (err) {
    console.error('[scheduler] catch-up fallito:', err.message);
  } finally {
    catchingUp = false;
  }
}

export function rescheduleAlarms() {
  if (morningJob) morningJob.stop();
  if (eveningJob) eveningJob.stop();
  if (eveningJob2) eveningJob2.stop();
  if (digestJob) digestJob.stop();
  if (catchUpTimer) clearInterval(catchUpTimer);

  const { alarmMorning, alarmEvening, alarmEvening2, digestSendTime, emailMode, weekdaysOnly } = db.data.settings;

  morningJob = cron.schedule(
    timeToCron(alarmMorning, weekdaysOnly),
    () => {
      catchUpMissedAlarms();
    },
    cronOpts()
  );

  eveningJob = cron.schedule(
    timeToCron(alarmEvening, weekdaysOnly),
    () => {
      catchUpMissedAlarms();
    },
    cronOpts()
  );

  if (alarmEvening2) {
    eveningJob2 = cron.schedule(
      timeToCron(alarmEvening2, weekdaysOnly),
      () => {
        catchUpMissedAlarms();
      },
      cronOpts()
    );
  }

  if ((emailMode || 'digest') !== 'immediate') {
    digestJob = cron.schedule(
      timeToCron(digestSendTime || '19:00', weekdaysOnly),
      async () => {
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
      },
      cronOpts()
    );
  }

  catchUpMissedAlarms();
  catchUpTimer = setInterval(catchUpMissedAlarms, 60 * 1000);

  if (!isPushConfigured()) {
    console.warn(
      '[scheduler] Chiavi VAPID non configurate: le notifiche push di sveglia non verranno inviate finché non esegui "npm run generate-vapid" e compili il file .env.'
    );
  } else {
    console.log(
      `[scheduler] Sveglie (fuso ${TIMEZONE}, ${weekdaysOnly ? 'lun-ven' : 'tutti i giorni'}): mattina ${alarmMorning}, sera ${alarmEvening}${alarmEvening2 ? ` e ${alarmEvening2}` : ''}.`
    );
  }
}
