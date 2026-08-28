import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE !== 'false',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export function isEmailConfigured() {
  return Boolean(getTransporter());
}

/**
 * Sends the daily PDF report to the office/secretary. Returns
 * { sent: boolean, error?: string } instead of throwing, so a missing SMTP
 * configuration never blocks the rest of the end-of-day flow (the operator
 * still gets their spoken confirmation, and the PDF can always be
 * downloaded/regenerated later even if the email fails).
 */
export async function sendReportEmail({ pdfBuffer, fileName, worker, session, toOverride }) {
  const to = toOverride || process.env.SECRETARY_EMAIL;
  const t = getTransporter();

  if (!t || !to) {
    return { sent: false, error: 'Email non configurata (SMTP o indirizzo segreteria mancante nelle impostazioni).' };
  }

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: `Rapportino di lavoro - ${worker.name} - ${new Date(session.date).toLocaleDateString('it-IT')}`,
      text: `In allegato il rapportino di lavoro di ${worker.name} per il giorno ${new Date(session.date).toLocaleDateString('it-IT')}.\n\nGenerato automaticamente da Assistente Cantieri.`,
      attachments: [{ filename: fileName, content: pdfBuffer }],
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

/**
 * Sends ONE email with every worker's PDF report for a given day attached
 * together, instead of one email per worker. This is the default mode:
 * the secretary gets a single message per day with everything inside.
 */
export async function sendDailyDigestEmail({ reports, date, toOverride }) {
  const to = toOverride || process.env.SECRETARY_EMAIL;
  const t = getTransporter();

  if (!t || !to) {
    return { sent: false, error: 'Email non configurata (SMTP o indirizzo segreteria mancante nelle impostazioni).' };
  }
  if (!reports || reports.length === 0) {
    return { sent: false, error: 'Nessun rapportino da inviare per questo giorno.' };
  }

  const dateLabel = new Date(date).toLocaleDateString('it-IT');
  const workerNames = reports.map((r) => r.workerName).join(', ');

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: `Rapportini di lavoro - ${dateLabel} (${reports.length})`,
      text: `In allegato i rapportini di lavoro del giorno ${dateLabel} per: ${workerNames}.\n\nGenerato automaticamente da Assistente Cantieri.`,
      attachments: reports.map((r) => ({ filename: r.fileName, content: r.pdfBuffer })),
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}
