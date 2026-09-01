const TIMEZONE = process.env.TZ || 'Europe/Rome';

function romeParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return parts;
}

export function todayKey() {
  const p = romeParts();
  return `${p.year}-${p.month}-${p.day}`;
}

export function getRomeClock(date = new Date()) {
  const p = romeParts(date);
  const weekday = p.weekday; // Mon, Tue, ...
  return {
    dateKey: `${p.year}-${p.month}-${p.day}`,
    minutes: parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10),
    weekday,
    isWeekend: weekday === 'Sat' || weekday === 'Sun',
  };
}

export function hhmmToMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export { TIMEZONE };
