# Torquay Academy year group screens

TV notice screens for each year group: a landscape **centre** screen and portrait **left** and **right** screens. Year teams edit them in the browser.

It's a static site (no build step), hosted on Vercel, with data and sign-in in its own Supabase project.

## Pages

| Address | What it shows |
|---|---|
| `/` | Home: choose a year to edit |
| `/#all` | All screens, with links to every TV screen |
| `/#homework` | Homework: Sparx and Tassomai uploads (linked from the home page) |
| `/#y7` | Year 7 centre screen (landscape TV) |
| `/#y7-left`, `/#y7-right` | Year 7 portrait screens |
| `/#y7-right@2026-11-05` | Any screen link with `@date` on the end previews that day's posters and effects |
| `/#edit-y7`, `/#edit-y7-left`, `/#edit-y7-right` | Editors for those screens |
| `/#staff` | Year teams: who can edit which year (admins only; not linked from the pages, type the address) |

These work the same way for `y8` to `y11`.

## Demo mode

If `config.js` has no Supabase keys, the site runs in demo mode:

- It shows sample Year 7 data.
- You're treated as an admin.
- Changes are saved in your own browser only.
- Uploaded images are kept in your browser too (large or many images may not fit).

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

## House points from Arbor

House points are read from an Arbor **live feed** (a report published as CSV or JSON). They then replace the typed-in house points on every screen, and the editor shows them as automatic.

1. **Make the report.** In Arbor, create a report of house points and publish it as a live feed.

   Any of these shapes works:
   - one row per student;
   - one row per tutor group;
   - one row per house.

   The report needs:
   - a points column, whose heading contains "Points", "Total" or "Score";
   - **either** a House column **or** a tutor group column (for example "7B", where the letter gives the house).

   A Year or tutor group column also splits the totals by year. Without one, every year shows whole-school totals.
2. **Add Vercel environment variables.** In Vercel, open Project, Settings, Environment Variables, and add:

   | Variable | Value |
   |---|---|
   | `ARBOR_HOUSEPOINTS_FEED_URL` | the feed address (keep it secret) |
   | `SUPABASE_URL` | the screens project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase: Project Settings, API, service_role (secret, server only) |
   | `CRON_SECRET` | any long random string |

   Then redeploy.
3. **Test it.** Run:

   ```
   curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-site>.vercel.app/api/sync-house-points
   ```

   The reply shows which columns it used and the totals. It never shows student rows.
4. **Choose how often it runs.**
   - Vercel's free plan runs the sync once a day, at 7am on weekdays.
   - To run it every 10 minutes during the school day, fill in and run `supabase/schedule.sql` in the screens' Supabase project.

If it picks the wrong column, set `ARBOR_POINTS_COLUMN`, `ARBOR_HOUSE_COLUMN`, `ARBOR_GROUP_COLUMN` or `ARBOR_YEAR_COLUMN` to the exact heading.

## Celebrations for every year

Each celebration has a "Show on" choice. "All year groups" (the default for new ones) saves it to `celebrations/all`, so it shows on every year's centre screen and can be edited from any year's editor. "Year N only" keeps it on that year's screen. Editors may write `celebrations/all` (see `supabase/schema.sql`).

## Homework reports (Sparx and Tassomai)

Signed-in staff who can edit see a **Homework reports** section on the home page, with two uploads: **Sparx** (one report covering Maths, Reader and Science) and **Tassomai**.

1. Export the report as Excel or CSV, with one row per student. The Sparx columns can be on one sheet or on separate Maths, Reader and Science sheets. For the Sparx report it uses the **M (AT)**, **R (AT)** and **S (AT)** columns (Maths, Reader, Science) under the newest "Week N" heading that has any results, so it keeps working as new weeks are added.
2. Choose the file. The page guesses the tutor group column (Sparx: "Reg. Group"; values like 7B or 11Q5) and the Maths, Reader, Science or score columns, using the column and sheet names. Change them in the drop-downs if needed; "Not in this file" skips one. A summary for each year shows before anything is saved.
3. Press Upload.

The file is read in the browser. Only tutor group and whole-year totals are saved (`homework/sparx-maths`, `homework/sparx-reader`, `homework/sparx-science` and `homework/tassomai`), never student names.

Race and breakdown slides use the upload automatically when their title starts with "Sparx Maths", "Sparx Reader", "Sparx Science" or "Tassomai". In the editor, "Numbers come from" on those slides can change this or switch back to typed-in numbers.

| Upload | Race slide (per tutor group) | Breakdown slide (whole year) |
|---|---|---|
| Sparx Maths, Sparx Science | % of the class on 100% | On 100%, 75 to 99%, below 75%, not started |
| Sparx Reader | % of the class on 100% (R (AT) is a percentage on the report) | On 100%, 75 to 99%, below 75%, not started |
| Tassomai | Average score | 500 plus, 300 to 499, 1 to 299, not started |

### Which week each subject shows

The Sparx report has a block of columns per week ("Week 5, Set w/c 28/09/2026"). Each subject picks its own block from the upload time and the homework timetable (`HW_SCHEDULE` in `index.html`): Maths and Science are set Wednesday 6am and due the next Tuesday 11.30am, and Reader is set Friday 4.15pm and due the next Thursday 11.30am. The page uses the homework running at upload time, or between homeworks the one just due. So an upload on a Wednesday shows the new week's Maths and Science and the previous week's Reader. Slides show the due date (for example "due Tue 6 Oct"). The column can still be changed by hand before saving. Tassomai exports have no week columns, so its homework (set Saturday 12am, due Thursday 11.30am) is worked out from the upload time. Its "Form(s)" column lists subject classes ("Y7 Eng,Y7 PE"), not tutor groups, so on the Homework uploads page each Tassomai student is matched by name (and year) to the Sparx report chosen in the Sparx box during the same visit, and given that tutor group. The names stay in the browser tab's memory; only totals are saved. Students with no single match count in their year's totals only. Without a Sparx report chosen, Tassomai gives whole-year results only. "Points Achieved" is the value used; Year 12 and 13 rows are left out.

## Timetable and term dates

"Up next" shows every class in the year for the next period, from the Week A and Week B timetables. The week slide shows "Week B, Teaching week 5", "Assessment week" and so on by itself when its fields are left blank.

**Which week it is** comes from two lists near the top of the script in `index.html`:

- **`WEEK_PLAN`**: the school's week plan, one line per week: the Monday, A or B, the week number, and the kind of week when it isn't normal teaching (for example `2026-11-09 B 1 Assessment week`). Holiday weeks are left out, and in a holiday the screens show the week school returns in. Copy in next year's plan before September.
- **`TERMS`** and **`NON_PUPIL_DAYS`**: the term dates, used to tell which days are school days.

**Updating the timetable** (for example in September):

1. In Arbor, export the School Timetable report for one Week A and one Week B, as Excel.
2. Run `pip install openpyxl`, then `python3 tools/build_timetable.py WeekA.xlsx WeekB.xlsx`.
3. Paste the `timetable.sql` it writes into the screens' Supabase SQL editor and run it. The TVs update straight away.

Staff names are never copied. If `timetable/y7` is missing for a year, "Up next" falls back to `lessons/y7` below.

## Next lessons (Arbor)

The fallback "Up next" source is the `screen_docs` row `lessons/y7` (one per year), in this shape:

```json
{"source":"arbor","syncedAt":"2026-10-05T08:00:00Z",
 "periods":{"P1":[{"group":"7B","subject":"English","room":"E3"}], "P2":[], "P3":[], "P4":[], "P5":[]}}
```

A scheduled job holding the Supabase **service role** key (never put that key in this site) can fill these rows from Arbor before each period.

## Bell times and timed messages

Both of these are set near the top of the script in `index.html`:

- **`BELLS`**: period start times, taken from the school day timetable (P1 08:25 to P5 15:15). "Up next" uses them.
- **`TAKEOVERS`**: full-screen messages that every TV shows on weekdays. At the moment it holds one message, "Go To Line Up 1", at 08:15 for 2 minutes. Add a line to include another, for example `{ at: '09:05', minutes: 2, text: 'Go To Line Up 2' }`.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app: screens, editors, sign-in |
| `backend.js` | Supabase (live) or demo data, sign-in and image storage |
| `config.js` | Supabase URL and anon key |
| `supabase/schema.sql` | Database setup |
| `supabase/schedule.sql` | Optional 10-minute house points refresh |
| `api/sync-house-points.js`, `lib/housepoints.js` | Arbor feed to house points sync |
| `tools/build_timetable.py` | Arbor timetable exports to `timetable.sql` |
| `vendor/xlsx.full.min.js` | SheetJS, reads the homework exports in the browser |
| `media/` | House mascots, Keep TA Tidy posters, logo |
| `data/demo.json` | Demo-mode sample data |
