import { Router } from 'express';
import db, { newId } from '../db.js';
import { requireWorker } from '../middleware/auth.js';
import { interpretMorning, interpretEvening, chatReply, isOpenAiConfigured } from '../services/openai.js';
import { generateReportPdfBuffer, reportFileName } from '../services/pdf.js';
import { sendReportEmail } from '../services/email.js';
import { enrichSession, resolveJobsite, resolveVehicle, findOrCreateJobsite, findOrCreateVehicle } from '../services/sessionHelpers.js';

const router = Router();

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD, local-enough for a daily report
}

function findOpenSession(workerId) {
  return db.data.sessions.find(
    (s) => s.workerId === workerId && s.date === todayKey() && s.status === 'in_corso'
  );
}

// Lets the frontend know, on load, whether this worker already has an
// open shift today (e.g. they refreshed the page after clocking in).
router.get('/status', requireWorker, (req, res) => {
  const worker = db.data.workers.find((w) => w.id === req.workerId);
  const open = findOpenSession(req.workerId);
  const lastCompleted = [...db.data.sessions]
    .filter((s) => s.workerId === req.workerId && s.status === 'completato')
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

  res.json({
    worker: { id: worker.id, name: worker.name },
    openSession: open ? enrichSession(open) : null,
    lastCompletedSession: lastCompleted ? enrichSession(lastCompleted) : null,
  });
});

router.post('/start-day', requireWorker, async (req, res) => {
  const { transcript } = req.body;
  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: 'Nessun testo ricevuto dal microfono.' });
  }

  const worker = db.data.workers.find((w) => w.id === req.workerId);
  if (!worker) return res.status(404).json({ error: 'Operaio non trovato.' });

  const existing = findOpenSession(req.workerId);
  if (existing) {
    return res.json({
      alreadyStarted: true,
      reply: `Ciao ${worker.name}, hai già iniziato la giornata al cantiere ${
        resolveJobsite(existing)?.name || ''
      }.`,
      session: enrichSession(existing),
    });
  }

  if (!isOpenAiConfigured()) {
    return res.status(503).json({
      error: 'L\'assistente AI non è configurato: manca OPENAI_API_KEY nel file .env del backend.',
    });
  }

  let interpretation;
  try {
    interpretation = await interpretMorning({
      workerName: worker.name,
      transcript,
      jobsites: db.data.jobsites,
      vehicles: db.data.vehicles,
    });
  } catch (err) {
    return res.status(502).json({ error: `Errore nel contattare l'assistente AI: ${err.message}` });
  }

  if (!interpretation.confident || !interpretation.jobsiteName) {
    return res.json({
      needsClarification: true,
      reply: interpretation.reply || 'Non ho capito bene, puoi ripetere il nome del cantiere?',
    });
  }

  // Auto-save any never-seen-before jobsite/vehicle name so it shows up in
  // Admin from now on and gets recognized automatically next time.
  let jobsite = interpretation.jobsiteId
    ? db.data.jobsites.find((j) => j.id === interpretation.jobsiteId)
    : null;
  if (!jobsite) jobsite = findOrCreateJobsite(interpretation.jobsiteName);

  let vehicle = interpretation.vehicleId
    ? db.data.vehicles.find((v) => v.id === interpretation.vehicleId)
    : null;
  if (!vehicle && interpretation.vehicleName) vehicle = findOrCreateVehicle(interpretation.vehicleName);

  const session = {
    id: newId(),
    workerId: worker.id,
    date: todayKey(),
    jobsiteId: jobsite ? jobsite.id : null,
    jobsiteName: interpretation.jobsiteName,
    vehicleId: vehicle ? vehicle.id : null,
    vehicleName: interpretation.vehicleName || null,
    clockIn: new Date().toISOString(),
    clockOut: null,
    morningTranscript: transcript,
    eveningTranscript: null,
    summary: null,
    status: 'in_corso',
    emailSent: false,
  };

  db.data.sessions.push(session);
  await db.write();

  res.status(201).json({ reply: interpretation.reply, session: enrichSession(session) });
});

router.post('/end-day', requireWorker, async (req, res) => {
  const { transcript } = req.body;
  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: 'Nessun testo ricevuto dal microfono.' });
  }

  const worker = db.data.workers.find((w) => w.id === req.workerId);
  if (!worker) return res.status(404).json({ error: 'Operaio non trovato.' });

  const session = findOpenSession(req.workerId);
  if (!session) {
    return res.status(400).json({ error: 'Non risulta nessun turno iniziato oggi per questo operaio.' });
  }

  if (!isOpenAiConfigured()) {
    return res.status(503).json({
      error: 'L\'assistente AI non è configurato: manca OPENAI_API_KEY nel file .env del backend.',
    });
  }

  const jobsite = resolveJobsite(session);

  let interpretation;
  try {
    interpretation = await interpretEvening({
      workerName: worker.name,
      transcript,
      jobsiteName: jobsite?.name,
    });
  } catch (err) {
    return res.status(502).json({ error: `Errore nel contattare l'assistente AI: ${err.message}` });
  }

  session.clockOut = new Date().toISOString();
  session.eveningTranscript = transcript;
  session.summary = interpretation.summary || transcript;
  session.status = 'completato';

  const vehicle = resolveVehicle(session);
  const digestMode = (db.data.settings.emailMode || 'digest') !== 'immediate';

  let emailResult = { sent: false, error: null };
  if (digestMode) {
    // Don't send yet: this report will go out later today in a single
    // email together with everyone else's, via the scheduled digest job
    // (or the admin's "Invia adesso" button).
    session.emailSent = false;
  } else {
    const pdfBuffer = await generateReportPdfBuffer({
      session,
      worker,
      vehicle,
      jobsite,
      companyName: db.data.settings.companyName,
    });
    emailResult = await sendReportEmail({
      pdfBuffer,
      fileName: reportFileName(worker, session),
      worker,
      session,
      toOverride: db.data.settings.secretaryEmail,
    });
    session.emailSent = emailResult.sent;
  }

  await db.write();

  res.json({
    reply: interpretation.reply || 'Buon lavoro, a domani!',
    session: enrichSession(session),
    pdfDownloadUrl: `/api/reports/${session.id}/pdf`,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? null : emailResult.error,
    emailPending: digestMode,
  });
});

// Free-form chat: "chiedi qualsiasi cosa all'IA", stateless on the server
// (the frontend sends back the whole short conversation each time).
router.post('/chat', requireWorker, async (req, res) => {
  const { history } = req.body;
  if (!Array.isArray(history) || history.length === 0) {
    return res.status(400).json({ error: 'Nessun messaggio ricevuto.' });
  }

  const worker = db.data.workers.find((w) => w.id === req.workerId);
  if (!worker) return res.status(404).json({ error: 'Operaio non trovato.' });

  if (!isOpenAiConfigured()) {
    return res.status(503).json({
      error: 'L\'assistente AI non è configurato: manca OPENAI_API_KEY nel file .env del backend.',
    });
  }

  const safeHistory = history
    .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .slice(-20);

  try {
    const reply = await chatReply({ workerName: worker.name, history: safeHistory });
    res.json({ reply });
  } catch (err) {
    res.status(502).json({ error: `Errore nel contattare l'assistente AI: ${err.message}` });
  }
});

export default router;
