// Turn an Arbor "next birthday" report (CSV or JSON) into the few birthdays each year's screen needs.
// Expected headings (Arbor student list): Student, Year Group, Reg. Form, Next Birthday, Age on Next Birthday.
// Only first name, surname initial, tutor group and day/month are kept. Ages and full dates of birth are never saved.
const { toRows } = require('./housepoints');
const SCREEN_YEARS = ['y7', 'y8', 'y9', 'y10', 'y11'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const findCol = (head, want, override) => {
  if (override) return head.find(h => h.trim().toLowerCase() === override.trim().toLowerCase()) || null;
  for (const re of want) { const h = head.find(x => re.test(x) && !/age/i.test(x)); if (h) return h; }
  return null;
};

// "07/10/2026", "2026-10-07", "7 Oct 2026", "7 October 2026" (UK day-first) -> "2026-10-07"
function isoDate(v) {
  const s = String(v || '').trim(); let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(s))) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  if ((m = /^(?:[a-z]+,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})/i.exec(s))) {
    const mo = MONTHS.indexOf(m[2].toLowerCase()); if (mo >= 0) return m[3] + '-' + String(mo + 1).padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }
  return null;
}
// "Smith, Amelia" or "Amelia Smith" -> "Amelia S"
function shortName(v) {
  const s = String(v || '').replace(/\s+/g, ' ').trim(); if (!s) return '';
  let first, last;
  if (s.includes(',')) { [last, first] = s.split(',').map(x => x.trim()); first = (first || '').split(' ')[0]; }
  else { const p = s.split(' '); first = p[0]; last = p.length > 1 ? p[p.length - 1] : ''; }
  return (first + (last ? ' ' + last[0].toUpperCase() : '')).trim();
}
function yearOf(yearVal, form) {
  const m = /(\d{1,2})/.exec(String(yearVal || '')) || /^\s*(\d{1,2})/.exec(String(form || ''));
  return m ? 'y' + +m[1] : null;
}
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// rows -> { byYear: { y7: [{ name, group, date }] }, used, skipped, cols }. Keeps birthdays from `from` to `to` (inclusive).
function upcoming(rows, { from, to, studentColumn, yearColumn, formColumn, dateColumn } = {}) {
  const head = rows.length ? Object.keys(rows[0]) : [];
  const cols = {
    student: findCol(head, [/^student$/i, /student/i, /^name$/i, /name/i], studentColumn),
    year: findCol(head, [/^year\s*group$/i, /year/i], yearColumn),
    form: findCol(head, [/reg/i, /form/i, /tutor/i], formColumn),
    date: findCol(head, [/next\s*birthday/i, /birthday/i, /date\s*of\s*birth|dob/i], dateColumn),
  };
  if (!cols.student || !cols.date) throw new Error('Could not find the Student and Next Birthday columns. Headings: ' + head.join(', '));
  const byYear = {}; let used = 0, skipped = 0;
  for (const r of rows) {
    const date = isoDate(r[cols.date]), y = yearOf(cols.year && r[cols.year], cols.form && r[cols.form]), name = shortName(r[cols.student]);
    if (!date || !y || !name) { skipped++; continue; }
    if (!SCREEN_YEARS.includes(y)) continue; // only years with screens (7 to 11)
    if ((from && date < from) || (to && date > to)) continue;
    (byYear[y] = byYear[y] || []).push({ name, group: cols.form ? String(r[cols.form] || '').trim() : '', date });
    used++;
  }
  return { byYear, used, skipped, cols };
}
// Same format the editor uses: "Amelia S, 7B, 07/10"
const toPeople = list => list.slice().sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
  .map(p => [p.name, p.group, p.date.slice(8, 10) + '/' + p.date.slice(5, 7)].filter(Boolean).join(', ')).join('\n');

module.exports = { toRows, upcoming, toPeople, isoDate, shortName, addDays };
