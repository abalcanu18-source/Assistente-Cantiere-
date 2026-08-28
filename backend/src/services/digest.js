import db from '../db.js';
import { generateReportPdfBuffer, reportFileName } from './pdf.js';
import { sendDailyDigestEmail } from './email.js';
import { resolveJobsite, resolveVehicle } from './sessionHelpers.js';

/**
 * Sends ONE email to the secretary with every completed, not-yet-sent
 * report for the given day attached together. Used both by the nightly
 * scheduled job and by the "Invia adesso" button in Admin.
 */
export async function sendDigestForDate(dateKey) {
  const pending = db.data.sessions.filter(
    (s) => s.date === dateKey && s.status === 'completato' && !s.emailSent
  );

  if (pending.length === 0) {
    return { sent: false, count: 0, error: 'Nessun rapportino da inviare per questo giorno.' };
  }

  const reports = [];
  for (const session of pending) {
    const worker = db.data.workers.find((w) => w.id === session.workerId);
    if (!worker) continue;
    const jobsite = resolveJobsite(session);
    const vehicle = resolveVehicle(session);
    const pdfBuffer = await generateReportPdfBuffer({
      session,
      worker,
      vehicle,
      jobsite,
      companyName: db.data.settings.companyName,
    });
    reports.push({ pdfBuffer, fileName: reportFileName(worker, session), workerName: worker.name, session });
  }

  const result = await sendDailyDigestEmail({
    reports,
    date: dateKey,
    toOverride: db.data.settings.secretaryEmail,
  });

  if (result.sent) {
    for (const r of reports) {
      r.session.emailSent = true;
    }
    await db.write();
  }

  return { ...result, count: reports.length };
}
