// Turn an Arbor live feed (CSV or JSON) into house point totals.
// Works whether the feed has one row per student, per tutor group or per house:
//   - a "House" column is used directly; otherwise a tutor group such as "7B" or "10 K" gives the house by its letter;
//   - a "Year" column (or the tutor group's number) splits totals by year; rows with no year count towards the whole school;
//   - the points column is the first one whose heading mentions points, total or score (or ARBOR_POINTS_COLUMN).
const HOUSES = { B: 'Brunel', C: 'Christie', D: 'Darwin', F: 'Fawcett', H: 'Harrison', K: 'Kitson', N: 'Nearne', P: 'Pengelly' };
const NAMES = Object.values(HOUSES);

function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const sep = first.includes(',') ? ',' : first.includes('\t') ? '\t' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(v => v.trim() !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some(v => v.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map(s => s.trim());
  return rows.slice(1).map(r => Object.fromEntries(head.map((k, i) => [k, (r[i] ?? '').trim()])));
}

function toRows(body, contentType = '') {
  const t = body.trim();
  if (/json/.test(contentType) || t.startsWith('[') || t.startsWith('{')) {
    let j = JSON.parse(t);
    if (!Array.isArray(j)) j = j.rows || j.data || j.results || Object.values(j).find(Array.isArray) || [];
    return j.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? '' : String(v)])));
  }
  return parseCSV(t);
}

const num = v => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };

function houseOf(row, cols) {
  if (cols.house) {
    const v = String(row[cols.house] || '').trim();
    const byName = NAMES.find(n => v.toLowerCase().startsWith(n.toLowerCase()));
    if (byName) return byName;
    if (HOUSES[v.toUpperCase()]) return HOUSES[v.toUpperCase()];
  }
  if (cols.group) { const m = /(\d{1,2})\s*([A-Z])\b/i.exec(row[cols.group] || ''); if (m && HOUSES[m[2].toUpperCase()]) return HOUSES[m[2].toUpperCase()]; }
  return null;
}
function yearOf(row, cols) {
  for (const k of [cols.year, cols.group]) {
    if (!k) continue;
    const m = /(\d{1,2})/.exec(row[k] || ''); if (m && +m[1] >= 7 && +m[1] <= 11) return 'y' + (+m[1]);
  }
  return null;
}

function totals(rows, opts = {}) {
  if (!rows.length) throw new Error('The feed has no rows.');
  const keys = Object.keys(rows[0]);
  const find = (re, not) => keys.find(k => re.test(k) && !(not && not.test(k)));
  const cols = {
    house: opts.houseColumn || find(/house/i, /point|total|score/i),
    group: opts.groupColumn || find(/tutor|form|registration|reg\b|group|class/i),
    year: opts.yearColumn || find(/^year|year group|nc year/i),
    points: opts.pointsColumn || find(/points?|total|score/i, /house$/i),
  };
  if (!cols.points) throw new Error('No points column found. Columns are: ' + keys.join(', '));
  if (!cols.house && !cols.group) throw new Error('No house or tutor group column found. Columns are: ' + keys.join(', '));
  const out = { all: {} }; let used = 0, skipped = 0;
  for (const r of rows) {
    const house = houseOf(r, cols); if (!house) { skipped++; continue; }
    const pts = num(r[cols.points]); const y = yearOf(r, cols);
    out.all[house] = (out.all[house] || 0) + pts;
    if (y) { out[y] = out[y] || {}; out[y][house] = (out[y][house] || 0) + pts; }
    used++;
  }
  if (!used) throw new Error('No rows matched a house. Columns are: ' + keys.join(', '));
  for (const k in out) for (const n of NAMES) out[k][n] = Math.round(out[k][n] || 0);
  return { totals: out, cols, used, skipped };
}

module.exports = { toRows, totals, parseCSV };
