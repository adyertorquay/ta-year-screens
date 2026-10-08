// Picks the Learning Legends out of the Arbor behaviour feed (columns: Date/Time, Severity, Behaviour,
// Students Involved, Status). A today-only feed with no date column (Students, Incident Name, Year group(s) today) works
// too: its rows get opts.defaultDate. Returns only each award's date and the "Students Involved" text; matching names to
// pupils happens in the database (screens.save_legends), so nothing else about pupils is handled here.
const { toRows } = require('./housepoints');
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');

// "07/10/2026 09:15", "7/10/26", "2026-10-07 09:15:00", "7 Oct 2026 09:15" or "Wed 7 Oct 2026" -> "2026-10-07"
function isoDate(v) {
  const t = String(v || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(t);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return y + '-' + pad(m[2]) + '-' + pad(m[1]); }
  m = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(t);
  if (m && MONTHS[m[2].toLowerCase()]) return m[3] + '-' + pad(MONTHS[m[2].toLowerCase()]) + '-' + pad(m[1]);
  return null;
}

function legends(body, contentType, opts = {}) {
  const rows = toRows(body, contentType);
  if (!rows.length) return { awards: [], cols: {}, rows: 0 };
  const keys = Object.keys(rows[0]);
  const find = re => keys.find(k => re.test(k));
  const cols = {
    date: opts.dateColumn || find(/date|time/i) || null,
    behaviour: opts.behaviourColumn || find(/^behaviou?r$/i) || find(/behaviou?r|type|incident/i),
    students: opts.studentsColumn || find(/student/i),
    status: opts.statusColumn || find(/status/i),
  };
  if ((!cols.date && !opts.defaultDate) || !cols.behaviour || !cols.students) throw new Error('Could not find the Behaviour (or Incident Name) and Students columns. Columns are: ' + keys.join(', '));
  const want = new RegExp(opts.behaviour || 'learning legend', 'i');
  const awards = [];
  for (const r of rows) {
    if (!want.test(r[cols.behaviour] || '')) continue;
    if (cols.status && /delet|void|cancel|withdrawn/i.test(r[cols.status] || '')) continue;
    const date = cols.date ? isoDate(r[cols.date]) : opts.defaultDate, students = String(r[cols.students] || '').trim();
    if (date && students) awards.push({ date, students });
  }
  return { awards, cols, rows: rows.length };
}

module.exports = { legends, isoDate };
