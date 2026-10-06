// Reads the Arbor "next birthday" live feed and writes each year's birthdays for the next week to Supabase.
// Runs once a day (vercel.json). Settings are Vercel environment variables:
//   ARBOR_BIRTHDAYS_FEED_URL     the Arbor live feed address (secret: it contains its own access key)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET   the same as the house points sync
//   ARBOR_STUDENT_COLUMN, ARBOR_YEAR_COLUMN, ARBOR_FORM_COLUMN, ARBOR_BIRTHDAY_COLUMN   optional, if auto-detection picks wrong
// Saved per year in birthdays/<year> as "Amelia S, 7B, 07/10" lines: first name, surname initial, tutor group, day/month.
// "Next Birthday" is never in the past, so yesterday's birthdays are kept from the previous run for a few days.
const { toRows, upcoming, toPeople, addDays } = require('../lib/birthdays');
const KEEP_BACK = 3, AHEAD = 7;
const ukToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

module.exports = async (req, res) => {
  const env = process.env;
  if (!env.CRON_SECRET || req.headers.authorization !== 'Bearer ' + env.CRON_SECRET) return res.status(401).json({ error: 'Not allowed' });
  const missing = ['ARBOR_BIRTHDAYS_FEED_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !env[k]);
  if (missing.length) return res.status(500).json({ error: 'Missing settings: ' + missing.join(', ') });
  const base = env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/screen_docs';
  const sb = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY };
  try {
    const today = ukToday(), from = addDays(today, -KEEP_BACK), to = addDays(today, AHEAD);
    const feed = await fetch(env.ARBOR_BIRTHDAYS_FEED_URL, { headers: { accept: 'text/csv, application/json, */*' } });
    if (!feed.ok) throw new Error('Arbor feed answered ' + feed.status);
    const r = upcoming(toRows(await feed.text(), feed.headers.get('content-type') || ''), {
      from: today, to, studentColumn: env.ARBOR_STUDENT_COLUMN, yearColumn: env.ARBOR_YEAR_COLUMN, formColumn: env.ARBOR_FORM_COLUMN, dateColumn: env.ARBOR_BIRTHDAY_COLUMN });
    // Keep the last few days' birthdays from the previous run, so "Yesterday" still has names.
    const prev = await fetch(base + '?select=path,data&path=like.birthdays/*', { headers: sb });
    if (!prev.ok) throw new Error('Supabase answered ' + prev.status);
    const years = new Set(Object.keys(r.byYear));
    for (const row of await prev.json()) {
      const y = row.path.split('/')[1]; years.add(y);
      const kept = ((row.data && row.data.list) || []).filter(p => p.date >= from && p.date < today);
      r.byYear[y] = [...kept, ...(r.byYear[y] || [])];
    }
    const now = new Date().toISOString();
    const docs = [...years].map(y => { const list = r.byYear[y] || [];
      return { path: 'birthdays/' + y, data: { source: 'arbor', syncedAt: now, people: toPeople(list), list }, updated_at: now }; });
    if (docs.length) {
      const up = await fetch(base + '?on_conflict=path', {
        method: 'POST', headers: { ...sb, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(docs) });
      if (!up.ok) throw new Error('Supabase answered ' + up.status + ': ' + (await up.text()).slice(0, 200));
    }
    // Report only counts and column names, never names.
    res.status(200).json({ ok: true, syncedAt: now, window: [from, to], rowsUsed: r.used, rowsSkipped: r.skipped, columns: r.cols,
      perYear: Object.fromEntries(docs.map(d => [d.path.split('/')[1], d.data.list.length])) });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e.message || e) });
  }
};
