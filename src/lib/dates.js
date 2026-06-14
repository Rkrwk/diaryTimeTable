// All helpers work in the browser's LOCAL time zone (never UTC).

function pad(n) {
  return String(n).padStart(2, '0');
}

// today as YYYY-MM-DD (local)
export function todayISO() {
  return toISODate(new Date());
}

// a given Date as YYYY-MM-DD (local)
export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 'weekend' if Saturday/Sunday, else 'weekday'
export function dayTypeFor(date = new Date()) {
  const d = date.getDay(); // 0 = Sun, 6 = Sat
  return d === 0 || d === 6 ? 'weekend' : 'weekday';
}

// current time as HH:MM (local)
export function nowHHMM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// e.g. "Monday, June 9"
export function prettyDate(date = new Date()) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// the Monday of the week containing `date`
export function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = Sun ... 6 = Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setDate(d.getDate() + diff);
  return d;
}

// first day of `date`'s month
export function firstOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// parse 'YYYY-MM-DD' into a LOCAL Date (avoids UTC shift)
export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// a Monday-first calendar grid for the month containing `date`:
// returns an array of weeks, each an array of 7 cells (Date or null)
export function monthMatrix(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) {
    cells.push(new Date(date.getFullYear(), date.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// minutes between two 'HH:MM' (or 'HH:MM:SS') strings; 0 if invalid/negative
export function durationMins(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? mins : 0;
}

// minutes -> "Xh Ym" (or "Xh" / "Ym")
export function fmtMins(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// e.g. "Mon, Jun 9"
export function prettyShort(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
