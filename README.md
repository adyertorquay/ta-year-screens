# Torquay Academy year group screens

TV notice screens for each year group: a landscape **centre** screen and portrait **left** and **right** screens. Year teams edit them in the browser.

It's a static site (no build step), hosted on Vercel, with data and sign-in in its own Supabase project.

## Pages

| Address | What it shows |
|---|---|
| `/` | All years, with links to every screen |
| `/#y7` | Year 7 centre screen (landscape TV) |
| `/#y7-left`, `/#y7-right` | Year 7 portrait screens |
| `/#edit-y7`, `/#edit-y7-left`, `/#edit-y7-right` | Editors for those screens |
| `/#login` | Sign in |
| `/#staff` | Year teams: who can edit which year (admins only) |

These work the same way for `y8` to `y11`.

## Demo mode

If `config.js` has no Supabase keys, the site runs in demo mode:

- It shows sample Year 7 data.
- You're treated as an admin.
- Changes are saved in your own browser only.
- Uploaded images last until the page reloads.

## Going live

1. **Create a new Supabase project** for the screens. Do **not** use the Tutor Slides project.
2. **Run `supabase/schema.sql`** in that project's SQL editor. This creates two tables (`screen_staff` and `screen_docs`), the access rules, live updates and a private `screen-media` image bucket.
3. **Add the keys.** In Supabase, open Project Settings, then API. Copy the Project URL and the anon public key into `config.js`, then commit. Vercel redeploys automatically.
4. **Turn off public sign-ups.** In Supabase, open Authentication, then Sign In / Providers, and turn off "Allow new users to sign up". Accounts should only be made by you.
5. **Create accounts** in Authentication, then Users, then Add user. Use an email and password, and tick auto-confirm. Every new account can only view the screens.
6. **Make yourself an admin.** Sign in once, then run this in the SQL editor:
   `update screen_staff set role = 'admin' where email = 'you@tqacademy.co.uk';`
7. **Set up the year teams.** Open `/#staff`, add each member of staff and tick their year. They can then edit only that year, and the database enforces this.
8. **Set up the TVs.** Give each TV its own view-only account. Sign it in once, open its screen address, and press Full screen. TVs stay signed in, update live and reload themselves each night at about 4am.

## Roles

| Role | Can |
|---|---|
| viewer | See the screens (TVs, and new accounts) |
| editor | Also edit the screens for the years in `screen_staff.years` (`all` = every year) |
| admin | Edit everything, and manage year teams |

## Next lessons (Arbor)

The "Up next" panel reads the `screen_docs` row `lessons/y7` (one per year), in this shape:

```json
{"source":"arbor","syncedAt":"2026-10-05T08:00:00Z",
 "periods":{"P1":[{"group":"7B","subject":"English","room":"E3"}], "P2":[], "P3":[], "P4":[], "P5":[]}}
```

A scheduled job holding the Supabase **service role** key (never put that key in this site) can fill these rows from Arbor before each period.

Bell times are set in `BELLS` near the top of the script in `index.html`. They are placeholders and should be checked against the real school day.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app: screens, editors, sign-in |
| `backend.js` | Supabase (live) or demo data, sign-in and image storage |
| `config.js` | Supabase URL and anon key |
| `supabase/schema.sql` | Database setup |
| `media/` | House mascots, Keep TA Tidy posters, logo |
| `data/demo.json` | Demo-mode sample data |
