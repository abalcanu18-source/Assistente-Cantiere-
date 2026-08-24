import PDFDocument from 'pdfkit';

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function formatTime(iso) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export function reportFileName(worker, session) {
  return `rapportino-${worker.name.replace(/\s+/g, '_')}-${session.date}-${session.id.slice(0, 8)}.pdf`;
}

/**
 * Renders one work session into a PDF and returns it as an in-memory
 * Buffer (never touches disk). Hosting platforms with free/ephemeral
 * storage wipe local files on every restart, but since every field here
 * comes from data already persisted in the database, the exact same PDF
 * can always be regenerated on demand -- so there is nothing to lose by
 * not caching it to a file.
 */
export function generateReportPdfBuffer({ session, worker, vehicle, jobsite, companyName }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc
      .fontSize(20)
      .fillColor('#1a2b4c')
      .text(companyName || 'Azienda', { align: 'left' })
      .fontSize(14)
      .fillColor('#555')
      .text('Rapportino di lavoro giornaliero', { align: 'left' })
      .moveDown(1.5);

    doc.fontSize(11).fillColor('#000');
    const row = (label, value) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
      doc.font('Helvetica').text(value || '-');
    };

    row('Data', new Date(session.date).toLocaleDateString('it-IT'));
    row('Operaio', worker.name);
    row('Cantiere', jobsite ? `${jobsite.name}${jobsite.address ? ' - ' + jobsite.address : ''}` : 'Non specificato');
    row('Mezzo utilizzato', vehicle ? vehicle.name : 'Non specificato');
    row('Inizio turno', formatTime(session.clockIn));
    row('Fine turno', formatTime(session.clockOut));

    if (session.clockIn && session.clockOut) {
      const durationMs = new Date(session.clockOut) - new Date(session.clockIn);
      row('Ore lavorate', formatDuration(durationMs));
    }

    doc.moveDown(1);
    doc.font('Helvetica-Bold').text('Attività svolte:');
    doc.moveDown(0.3);
    doc.font('Helvetica').text(session.summary || session.eveningTranscript || 'Nessuna descrizione registrata.', {
      align: 'justify',
    });

    doc.moveDown(2);
    doc
      .fontSize(9)
      .fillColor('#888')
      .text(
        `Rapportino generato automaticamente dall'Assistente Cantieri il ${new Date().toLocaleString('it-IT')}.`
      );

    doc.end();
  });
}
