// Reads the Arbor house points live feed and writes the totals to Supabase for the TVs.
// Called on a schedule (see supabase/schedule.sql and vercel.json). Settings are Vercel environment variables:
//   ARBOR_HOUSEPOINTS_FEED_URL   the Arbor live feed address (secret: it contains its own access key)
//   SUPABASE_URL                 the screens' Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY    that project's service role key (secret; never put it in config.js)
//   CRON_SECRET                  any long random string; callers must send it as "Authorization: Bearer <CRON_SECRET>"
//   ARBOR_POINTS_COLUMN, ARBOR_HOUSE_COLUMN, ARBOR_GROUP_COLUMN, ARBOR_YEAR_COLUMN   optional, if auto-detection picks wrong
const { toRows, totals } = require('../lib/housepoints');

module.exports = async (req, res) => {
  const env = process.env;
  if (!env.CRON_SECRET || req.headers.authorization !== 'Bearer ' + env.CRON_SECRET) return res.status(401).json({ error: 'Not allowed' });
  const missing = ['ARBOR_HOUSEPOINTS_FEED_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !env[k]);
  if (missing.length) return res.status(500).json({ error: 'Missing settings: ' + missing.join(', ') });
  try {
    const feed = await fetch(env.ARBOR_HOUSEPOINTS_FEED_URL, { headers: { accept: 'text/csv, application/json, */*' } });
    if (!feed.ok) throw new Error('Arbor feed answered ' + feed.status);
    const rows = toRows(await feed.text(), feed.headers.get('content-type') || '');
    const r = totals(rows, { pointsColumn: env.ARBOR_POINTS_COLUMN, houseColumn: env.ARBOR_HOUSE_COLUMN, groupColumn: env.ARBOR_GROUP_COLUMN, yearColumn: env.ARBOR_YEAR_COLUMN });
    const now = new Date().toISOString();
    const docs = Object.entries(r.totals).map(([k, points]) => ({ path: 'housepoints/' + k, data: { source: 'arbor', syncedAt: now, points }, updated_at: now }));
    const up = await fetch(env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/screen_docs?on_conflict=path', {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(docs),
    });
    if (!up.ok) throw new Error('Supabase answered ' + up.status + ': ' + (await up.text()).slice(0, 200));
    // Report only totals and column names, never rows (they may name students).
    res.status(200).json({ ok: true, syncedAt: now, rowsUsed: r.used, rowsSkipped: r.skipped, columns: r.cols, totals: r.totals });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e.message || e) });
  }
};
