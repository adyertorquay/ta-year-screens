// Site login: every page (TVs included) asks for one shared username and password before anything loads.
// Set them as Vercel environment variables (never in this repo):
//   SITE_USERNAME, SITE_PASSWORD
// A correct login is remembered on that browser for a year, so a TV only needs it once.
// Changing either value signs every browser out. /logout signs this browser out.
// /api/ is left alone: the scheduled house points sync has its own secret.

export const config = { matcher: ['/((?!api/).*)'] };

const COOKIE = 'ta_site';
const YEAR = 60 * 60 * 24 * 365;

async function token(user, pass) {
  const data = new TextEncoder().encode(user + '\n' + pass + '\nta-year-screens');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const cookieOf = req => {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  return m ? m[1] : '';
};

export default async function middleware(req) {
  const url = new URL(req.url);
  const user = process.env.SITE_USERNAME, pass = process.env.SITE_PASSWORD;
  if (!user || !pass) return page('The site login has not been set up yet. Add SITE_USERNAME and SITE_PASSWORD in Vercel (Settings, Environment Variables), then redeploy.', false, 503);
  const want = await token(user, pass);

  if (url.pathname === '/logout') {
    return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': COOKIE + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax' } });
  }

  if (url.pathname === '/login' && req.method === 'POST') {
    const form = await req.formData();
    const back = String(form.get('back') || '');
    if (String(form.get('username') || '').trim() === user && String(form.get('password') || '') === pass) {
      return new Response(null, { status: 303, headers: {
        location: '/' + (back.startsWith('#') ? back : ''),
        'set-cookie': COOKIE + '=' + want + '; Path=/; Max-Age=' + YEAR + '; HttpOnly; Secure; SameSite=Lax',
      } });
    }
    return page('That username or password wasn\'t right. Try again.', true, 401);
  }

  if (cookieOf(req) === want) return; // signed in: carry on to the page
  return page('', true, 401);
}

function page(msg, form, status) {
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in · Year group screens</title><meta name="robots" content="noindex">
<style>
:root{--bg:#150911;--panel:#22121c;--ink:#f7eef2;--muted:#c9b3bd;--line:#3a2430;--maroon:#8A1A4D;--bad:#ff8fa8}
@media (prefers-color-scheme: light){:root{--bg:#f6f1f3;--panel:#fff;--ink:#1d0f16;--muted:#6b5560;--line:#e6dbe0;--bad:#b3261e}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.5 "Open Sans",Arial,sans-serif;padding:16px}
.card{width:100%;max-width:360px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:28px}
h1{font:700 1.5rem Arial,sans-serif;margin:0 0 4px}p{margin:0 0 18px;color:var(--muted)}
label{display:block;font-weight:700;font-size:.85rem;color:var(--muted);margin-bottom:12px}
input{display:block;width:100%;margin-top:4px;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:inherit}
button{width:100%;margin-top:6px;padding:11px;border:0;border-radius:999px;background:var(--maroon);color:#fff;font:700 1rem Arial,sans-serif;cursor:pointer}
.msg{color:var(--bad);margin:0 0 14px}
</style></head><body><main class="card">
<h1>Year group screens</h1><p>Torquay Academy</p>
${msg ? `<p class="msg" role="alert">${esc(msg)}</p>` : ''}
${form ? `<form method="post" action="/login">
<label>Username<input name="username" autocomplete="username" autocapitalize="none" required autofocus></label>
<label>Password<input name="password" type="password" autocomplete="current-password" required></label>
<input type="hidden" name="back" id="back"><button type="submit">Sign in</button></form>
<script>document.getElementById('back').value = location.hash;</script>` : ''}
</main></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
