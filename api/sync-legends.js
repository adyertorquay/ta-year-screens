// Fills the Learning Legends slides from the Arbor behaviour live feed.
// The TVs call this every few minutes while they are on; the database lets it read Arbor at most every four minutes.
// Settings are Vercel environment variables:
//   ARBOR_LEGENDS_FEED_URL   the Arbor live feed address (JSON format; secret: it contains its own access key)
//   LEGENDS_SECRET           from the database: select secret from screens.feed_keys where name = 'legends';
//   LEGENDS_BEHAVIOUR        optional, the Behaviour text to keep (default "learning legend", any case)
// The Supabase address and public key come from config.js. No Supabase password or service key is used: the secret
// only lets screens.save_legends() write the five legends/<year> entries.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { legends } = require('../lib/legends');

function siteConfig() {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8'), box);
  return box.window.SCREENS_CONFIG || {};
}

module.exports = async (req, res) => {
  const env = process.env;
  // Pasting into Vercel can bring a stray space, line break or quotes along with the secret.
  const secret = String(env.LEGENDS_SECRET || '').trim().replace(/^["']+|["']+$/g, '');
  res.setHeader('cache-control', 'no-store');
  const missing = ['ARBOR_LEGENDS_FEED_URL', 'LEGENDS_SECRET'].filter(k => !env[k]);
  if (missing.length) return res.status(500).json({ error: 'Missing settings: ' + missing.join(', ') });
  try {
    const cfg = siteConfig();
    const rpc = (fn, body) => fetch(cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: cfg.SUPABASE_ANON_KEY, 'content-type': 'application/json', 'content-profile': 'screens', 'accept-profile': 'screens' },
      body: JSON.stringify(body || {}),
    });
    const force = req.query && req.query.force === secret;
    if (!force) {
      const due = await rpc('legends_due');
      if (!due.ok) throw new Error('Supabase answered ' + due.status + ': ' + (await due.text()).slice(0, 200));
      if (!(await due.json())) return res.status(200).json({ ok: true, skipped: 'synced in the last few minutes' });
    }
    const feed = await fetch(env.ARBOR_LEGENDS_FEED_URL, { headers: { accept: 'application/json, text/csv, */*' } });
    if (!feed.ok) throw new Error('Arbor feed answered ' + feed.status);
    const r = legends(await feed.text(), feed.headers.get('content-type') || '', { behaviour: env.LEGENDS_BEHAVIOUR });
    // Only today's and the previous school day's awards are needed.
    const uk = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
    const now = new Date(), dow = new Date(uk(now) + 'T12:00:00Z').getUTCDay();
    const keep = [uk(now), uk(new Date(now - 864e5 * (dow === 1 ? 3 : dow === 0 ? 2 : 1)))];
    const awards = r.awards.filter(a => keep.includes(a.date));
    const saved = await rpc('save_legends', { p_secret: secret, p_rows: awards });
    if (saved.status === 401 || saved.status === 403) throw new Error('The database did not accept LEGENDS_SECRET (' + secret.length + ' characters; it should be 64). It should match: select secret from screens.feed_keys where name = \'legends\'; then redeploy.');
    if (!saved.ok) throw new Error('Supabase answered ' + saved.status + ': ' + (await saved.text()).slice(0, 200));
    // Counts and column names only, never names.
    res.status(200).json({ ok: true, feedRows: r.rows, learningLegends: r.awards.length, todayAndPrevious: awards.length, today: awards.filter(a => a.date === keep[0]).length, previousDay: awards.filter(a => a.date === keep[1]).length, newestInFeed: r.awards.map(a => a.date).sort().pop() || null, columns: r.cols, saved: await saved.json() });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
