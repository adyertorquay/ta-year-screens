/* Data, sign-in and image storage for the year group screens.
   The page talks to a small `claude.use(name)` interface (db, user, assets). This file provides it from:
   - Supabase, when config.js has a project URL and public key (live: shared data, real sign-in), or
   - demo mode otherwise: sample Year 7 data, changes kept in this browser only, signed in as a demo admin. */
(() => {
  const CFG = window.SCREENS_CONFIG || {};
  const live = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
  const BUCKET = 'screen-media';
  const refused = () => Object.assign(new Error('Not allowed'), { code: 'invalid_argument' });
  const snap = d => ({ exists: d != null, data: () => d });

  // ---------- demo mode ----------
  function demoBackend() {
    const KEY = 'ta_screens_demo_docs';
    let docs = {}, ready;
    const watchers = {};
    const load = () => ready || (ready = (async () => {
      let saved = null; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
      let seed = {}; try { seed = await (await fetch('data/demo.json')).json(); } catch (e) {}
      docs = Object.assign(seed, saved || {});
    })());
    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(docs)); } catch (e) {} };
    const fire = p => (watchers[p] || []).forEach(fn => fn(snap(docs[p] ?? null)));
    const blobs = {};
    const me = { id: 'demo', name: 'Demo admin', avatarUrl: avatar('Demo admin'), color: '#8A1A4D', email: null, isOwner: true, canEdit: true };
    return {
      mode: 'demo',
      db: { doc: p => ({
        onSnapshot(fn) { (watchers[p] = watchers[p] || []).push(fn); load().then(() => fn(snap(docs[p] ?? null))); return () => { watchers[p] = watchers[p].filter(f => f !== fn); }; },
        async set(d) { await load(); docs[p] = JSON.parse(JSON.stringify(d)); persist(); fire(p); },
      }) },
      user: {
        me: async () => me, isOwner: async () => true, canEdit: async () => true, can: async () => true, id: async () => me.id,
        profiles: async ids => Object.fromEntries([].concat(ids).map(i => [i, { id: i, name: i === 'demo' ? me.name : '', avatarUrl: avatar(''), isMe: i === 'demo', guest: false }])),
        search: async () => [],
      },
      assets: { async upload(blob) { const id = 'demo-' + Math.random().toString(36).slice(2); blobs[id] = URL.createObjectURL(blob); return { id, url: blobs[id] }; } },
      blobUrl: async id => blobs[id] || '',
      reset() { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); },
    };
  }

  // ---------- Supabase ----------
  function supabaseBackend() {
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    const watchers = {}, cache = {};
    let channel = null;
    const fire = (p, d) => { cache[p] = d; (watchers[p] || []).forEach(fn => fn(snap(d))); };
    function listen() {
      if (channel) return;
      channel = sb.channel('screen_docs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_docs' }, ev => {
          const row = ev.new && ev.new.path ? ev.new : ev.old;
          if (row && row.path && watchers[row.path]) fire(row.path, ev.eventType === 'DELETE' ? null : ev.new.data);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_staff' }, () => { if (watchers['config/staff']) loadStaffDoc(); })
        .subscribe(status => { if (status === 'SUBSCRIBED') Object.keys(watchers).forEach(refetch); });
    }
    async function refetch(p) {
      if (p === 'config/staff') return loadStaffDoc();
      const { data, error } = await sb.from('screen_docs').select('data').eq('path', p).maybeSingle();
      if (!error) fire(p, data ? data.data : null);
    }
    // TVs run all day: re-read everything when the tab wakes or the network comes back.
    addEventListener('online', () => Object.keys(watchers).forEach(refetch));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) Object.keys(watchers).forEach(refetch); });

    // "Year teams" is the screen_staff table: editors and the years they may edit.
    async function loadStaffDoc() {
      const { data, error } = await sb.from('screen_staff').select('user_id, role, years').eq('role', 'editor');
      if (error) return;
      fire('config/staff', { members: Object.fromEntries(data.map(r => [r.user_id, { years: r.years || [] }])) });
    }
    async function saveStaffDoc(d) {
      const want = d.members || {};
      const { data: cur, error } = await sb.from('screen_staff').select('user_id, role').in('role', ['editor']);
      if (error) throw refused();
      for (const r of cur) if (!want[r.user_id]) { const { error: e } = await sb.from('screen_staff').update({ role: 'viewer', years: [] }).eq('user_id', r.user_id); if (e) throw refused(); }
      for (const [id, m] of Object.entries(want)) { const { error: e } = await sb.from('screen_staff').update({ role: 'editor', years: m.years || [] }).eq('user_id', id).neq('role', 'admin'); if (e) throw refused(); }
      loadStaffDoc();
    }

    let session = null, profile = null;
    const people = {};
    const toProfile = r => ({ id: r.user_id, name: r.name || r.email || '', avatarUrl: avatar(r.name || r.email || ''), isMe: !!session && r.user_id === session.user.id, guest: false, email: r.email || null });
    const me = () => {
      const n = profile ? (profile.name || profile.email || '') : '';
      return { id: session ? session.user.id : null, name: n, avatarUrl: avatar(n), color: '#8A1A4D', email: session ? session.user.email : null,
        isOwner: !!profile && profile.role === 'admin', canEdit: !!profile && profile.role === 'admin' };
    };
    const signedUrls = {};
    return {
      mode: 'live',
      async init() {
        const { data } = await sb.auth.getSession(); session = data.session;
        sb.auth.onAuthStateChange((ev, s) => { const was = session && session.user.id; session = s; if (ev === 'SIGNED_OUT' || (s && s.user.id !== was && was)) location.reload(); });
        if (session) {
          const { data: p } = await sb.from('screen_staff').select('user_id, name, email, role, years').eq('user_id', session.user.id).maybeSingle();
          profile = p || null;
        }
      },
      signedIn: () => !!session && !!profile,
      hasSession: () => !!session,
      async signIn(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return 'That login wasn\'t recognised. Check the email and password.';
        location.reload();
      },
      async signOut() { await sb.auth.signOut(); location.reload(); },
      db: { doc: p => ({
        onSnapshot(fn) {
          (watchers[p] = watchers[p] || []).push(fn);
          listen();
          if (p in cache) fn(snap(cache[p])); else refetch(p);
          return () => { watchers[p] = watchers[p].filter(f => f !== fn); };
        },
        async set(d) {
          if (p === 'config/staff') return saveStaffDoc(d);
          const { error } = await sb.from('screen_docs').upsert({ path: p, data: d, updated_at: new Date().toISOString(), updated_by: session && session.user.id });
          if (error) throw (error.code === '42501' || /row-level security/i.test(error.message) ? refused() : error);
          fire(p, d);
        },
      }) },
      user: {
        me: async () => me(), isOwner: async () => me().isOwner, canEdit: async () => me().canEdit, id: async () => me().id,
        can: async name => name === 'data.write' ? !!profile && (profile.role === 'admin' || profile.role === 'editor') : false,
        async profiles(ids) {
          ids = [].concat(ids); const need = ids.filter(i => !people[i]);
          if (need.length) { const { data } = await sb.from('screen_staff').select('user_id, name, email').in('user_id', need); (data || []).forEach(r => { people[r.user_id] = toProfile(r); }); }
          return Object.fromEntries(ids.map(i => [i, people[i] || { id: i, name: '', avatarUrl: avatar(''), isMe: false, guest: false }]));
        },
        async search(q) {
          let req = sb.from('screen_staff').select('user_id, name, email, role').neq('role', 'admin').order('name').limit(8);
          if (q) req = req.or(`name.ilike.%${q.replace(/[%,()]/g, '')}%,email.ilike.%${q.replace(/[%,()]/g, '')}%`);
          const { data } = await req; return (data || []).map(r => (people[r.user_id] = toProfile(r)));
        },
      },
      assets: {
        async upload(blob, opts = {}) {
          const ext = (opts.type || blob.type || '').split('/')[1] || 'bin';
          const id = crypto.randomUUID() + '.' + ext.replace(/[^a-z0-9]/gi, '');
          const { error } = await sb.storage.from(BUCKET).upload(id, blob, { contentType: opts.type || blob.type, upsert: false });
          if (error) throw refused();
          return { id, url: await this._url(id) };
        },
        async _url(id) { return signedFor(id); },
      },
      blobUrl: id => signedFor(id),
    };
    // Images are private; the page gets short-lived links, refreshed well before they expire.
    async function signedFor(id) {
      const c = signedUrls[id];
      if (c && c.until > Date.now()) return c.url;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(id, 60 * 60 * 12);
      if (error || !data) return '';
      signedUrls[id] = { url: data.signedUrl, until: Date.now() + 1000 * 60 * 60 * 11 };
      return data.signedUrl;
    }
  }

  function avatar(name) {
    const ini = (name || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#8A1A4D"/><text x="20" y="25.5" font-family="Arial" font-weight="700" font-size="15" fill="#fff" text-anchor="middle">${ini.replace(/[<&>]/g, '')}</text></svg>`);
  }

  const B = live ? supabaseBackend() : demoBackend();
  // A TV left on for days reloads once each night (about 4am) to pick up new versions and fresh image links.
  if (live) { const started = Date.now(); setInterval(() => { const d = new Date(); if (d.getHours() === 4 && Date.now() - started > 3600e3) location.reload(); }, 600e3); }
  window.SCREENS_BACKEND = B;
  const ready = (B.init ? B.init() : Promise.resolve()).catch(e => console.warn('backend', e));
  window.claude = {
    async use(name) {
      await ready;
      if (B.mode === 'live' && !B.signedIn()) return name === 'user' ? B.user : null;
      return name === 'db' ? B.db : name === 'user' ? B.user : name === 'assets' ? B.assets : null;
    },
  };

  // Uploaded images are referenced as /_blob/<id>; swap in a real address once it is known.
  const fix = img => {
    const src = img.getAttribute('src') || '';
    if (!src.startsWith('/_blob/')) return;
    const id = src.slice(7);
    img.removeAttribute('src');
    Promise.resolve(B.blobUrl(id)).then(u => { if (u && !img.getAttribute('src')) img.src = u; });
  };
  new MutationObserver(ms => ms.forEach(m => {
    if (m.type === 'attributes') fix(m.target);
    else m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.tagName === 'IMG') fix(n); n.querySelectorAll && n.querySelectorAll('img[src^="/_blob/"]').forEach(fix); });
  })).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
})();
