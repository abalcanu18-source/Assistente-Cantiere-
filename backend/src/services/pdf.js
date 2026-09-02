import PDFDocument from 'pdfkit';

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateKey) {
  if (!dateKey) return '';
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('it-IT');
}

export function reportFileName(worker, session) {
  return `rapportino-${worker.name.replace(/\s+/g, '_')}-${session.date}-${session.id.slice(0, 8)}.pdf`;
}

function strokeRect(doc, x, y, w, h) {
  doc.save().lineWidth(0.8).strokeColor('#000').rect(x, y, w, h).stroke().restore();
}

function hLine(doc, x1, y, x2) {
  doc.save().lineWidth(0.6).strokeColor('#000').moveTo(x1, y).lineTo(x2, y).stroke().restore();
}

function vLine(doc, x, y1, y2) {
  doc.save().lineWidth(0.6).strokeColor('#000').moveTo(x, y1).lineTo(x, y2).stroke().restore();
}

function label(doc, text, x, y, opts = {}) {
  doc.font('Helvetica').fontSize(opts.size || 8).fillColor('#000').text(text, x, y, {
    width: opts.width,
    lineBreak: false,
  });
}

function value(doc, text, x, y, opts = {}) {
  doc.font('Helvetica-Bold').fontSize(opts.size || 10).fillColor('#000').text(text || '', x, y, {
    width: opts.width,
    height: opts.height,
  });
}

function drawMetaBox(doc, x, y, w) {
  const rows = [
    ['TIPO:', 'M'],
    ['NUMERO:', '7.07'],
    ['SISTEMA:', 'QSW'],
    ['REV. 2 DEL', '01/09/2017'],
  ];
  const rowH = 16;
  const boxH = rowH * rows.length;
  strokeRect(doc, x, y, w, boxH);
  rows.forEach((row, i) => {
    const ry = y + i * rowH;
    if (i > 0) hLine(doc, x, ry, x + w);
    label(doc, row[0], x + 4, ry + 4, { size: 7, width: w * 0.55 });
    value(doc, row[1], x + w * 0.52, ry + 3, { size: 9, width: w * 0.45 });
  });
  return boxH;
}

function drawWorkTable(doc, title, { x, y, width, rowCount, filledRow }) {
  const headerH = 28;
  const col = {
    cantiere: width * 0.2,
    codice: width * 0.12,
    desc: width * 0.44,
    inizio: width * 0.12,
    fine: width * 0.12,
  };
  const titleH = 18;
  const dataH = 36;
  const tableH = titleH + headerH + rowCount * dataH;

  strokeRect(doc, x, y, width, tableH);
  doc.save().fillColor('#e8e8e8').rect(x, y, width, titleH).fill().restore();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text(title, x + 4, y + 5, { width: width - 8 });

  const hy = y + titleH;
  hLine(doc, x, hy, x + width);
  hLine(doc, x, hy + headerH, x + width);

  let cx = x;
  const cols = [col.cantiere, col.codice, col.desc, col.inizio, col.fine];
  cols.forEach((w, i) => {
    if (i > 0) vLine(doc, cx, hy, y + tableH);
    cx += w;
  });

  label(doc, 'CANTIERE', x + 3, hy + 8, { size: 7, width: col.cantiere - 6 });
  label(doc, 'CODICE', x + col.cantiere + 3, hy + 8, { size: 7, width: col.codice - 6 });
  label(doc, 'DESCRIZIONE FASI LAVORATIVE', x + col.cantiere + col.codice + 3, hy + 4, {
    size: 7,
    width: col.desc - 6,
  });
  label(doc, 'CANTIERE', x + col.cantiere + col.codice + 3, hy + 14, { size: 7, width: col.desc - 6 });

  const timeX = x + col.cantiere + col.codice + col.desc;
  label(doc, 'ORARIO IN CANTIERE', timeX + 3, hy + 3, { size: 6.5, width: col.inizio + col.fine - 6 });
  vLine(doc, timeX + col.inizio, hy + 12, y + tableH);
  hLine(doc, timeX, hy + 12, x + width);
  label(doc, 'INIZIO', timeX + 4, hy + 16, { size: 7, width: col.inizio - 8 });
  label(doc, 'FINE', timeX + col.inizio + 4, hy + 16, { size: 7, width: col.fine - 8 });

  for (let i = 1; i < rowCount; i++) {
    hLine(doc, x, hy + headerH + i * dataH, x + width);
  }

  if (filledRow) {
    const ry = hy + headerH + 4;
    value(doc, filledRow.cantiere, x + 3, ry, { size: 8, width: col.cantiere - 6, height: dataH - 8 });
    value(doc, filledRow.codice, x + col.cantiere + 3, ry, { size: 8, width: col.codice - 6, height: dataH - 8 });
    doc.font('Helvetica').fontSize(8).fillColor('#000').text(filledRow.descrizione || '', x + col.cantiere + col.codice + 3, ry, {
      width: col.desc - 6,
      height: dataH - 8,
    });
    value(doc, filledRow.inizio, timeX + 3, ry + 8, { size: 9, width: col.inizio - 6 });
    value(doc, filledRow.fine, timeX + col.inizio + 3, ry + 8, { size: 9, width: col.fine - 6 });
  }

  return tableH;
}

/**
 * Official-looking daily work report matching the company facsimile
 * "RAPPORTO LAVORATIVO GIORNALIERO" (TIPO M / NUMERO 7.07 / SISTEMA QSW).
 */
export function generateReportPdfBuffer({ session, worker, vehicle, jobsite, companyName }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 36;
    const right = doc.page.width - 36;
    const width = right - left;
    let y = 36;

    if (companyName) {
      label(doc, companyName, left, y, { size: 8, width: width * 0.6 });
      y += 14;
    }

    const metaW = 150;
    const metaH = drawMetaBox(doc, right - metaW, y, metaW);

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000')
      .text('RAPPORTO LAVORATIVO', left, y + 8, { width: width - metaW - 12 });
    doc.font('Helvetica-Bold').fontSize(16)
      .text('GIORNALIERO', left, y + 28, { width: width - metaW - 12 });

    y += Math.max(metaH, 52) + 14;

    label(doc, 'Caposquadra (compilatore)', left, y, { size: 8, width: 160 });
    hLine(doc, left + 128, y + 10, right);
    value(doc, worker.name, left + 132, y - 1, { size: 11, width: width - 140 });
    y += 22;

    const half = width / 2 - 6;
    strokeRect(doc, left, y, half, 32);
    label(doc, 'DATA:', left + 4, y + 4, { size: 8 });
    value(doc, formatDate(session.date), left + 40, y + 10, { size: 11, width: half - 48 });

    strokeRect(doc, left + half + 12, y, half, 32);
    label(doc, 'AUTOMEZZO: (TARGA)', left + half + 16, y + 4, { size: 8, width: half - 20 });
    const vehicleText = vehicle
      ? [vehicle.name, vehicle.plate].filter(Boolean).join('  ')
      : session.vehicleName || '';
    value(doc, vehicleText, left + half + 16, y + 16, { size: 10, width: half - 24 });
    y += 40;

    strokeRect(doc, left, y, width * 0.62, 44);
    label(doc, 'DIPENDENTE/I:', left + 4, y + 4, { size: 8 });
    value(doc, worker.name, left + 4, y + 18, { size: 11, width: width * 0.62 - 10 });

    strokeRect(doc, left + width * 0.62 + 8, y, width * 0.38 - 8, 44);
    label(doc, 'CONDUCENTE:', left + width * 0.62 + 12, y + 4, { size: 8 });
    value(doc, worker.name, left + width * 0.62 + 12, y + 18, { size: 11, width: width * 0.38 - 20 });
    y += 56;

    const description = session.summary || session.eveningTranscript || '';
    const tableH1 = drawWorkTable(doc, 'PRESTAZIONI DA CONTRATTO', {
      x: left,
      y,
      width,
      rowCount: 4,
      filledRow: {
        cantiere: jobsite?.name || session.jobsiteName || '',
        codice: jobsite?.address || '',
        descrizione: description,
        inizio: formatTime(session.clockIn),
        fine: formatTime(session.clockOut),
      },
    });
    y += tableH1 + 16;

    const tableH2 = drawWorkTable(doc, 'PRESTAZIONI IN ECONOMIA', {
      x: left,
      y,
      width,
      rowCount: 3,
      filledRow: null,
    });
    y += tableH2 + 28;

    label(doc, 'NOME E COGNOME:', left, y, { size: 8, width: 110 });
    hLine(doc, left + 92, y + 10, left + width * 0.55);
    value(doc, worker.name, left + 96, y - 1, { size: 11, width: width * 0.4 });

    label(doc, 'FIRMA:', left + width * 0.58, y, { size: 8, width: 40 });
    hLine(doc, left + width * 0.58 + 36, y + 10, right);

    doc.end();
  });
}
