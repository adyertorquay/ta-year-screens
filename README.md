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
| `/#y7@2026-11-11T10:59` | Add a time to hold the screen at that time of day, to see full-screen messages |
| `/#edit-y7`, `/#edit-y7-left`, `/#edit-y7-right` | Editors for those screens |
| `/#staff` | Year teams: who can edit which year (admins only; not linked from the pages, type the address) |

These work the same way for `y8` to `y11`.

## Demo mode

If `config.js` has no Supabase keys, the site runs in demo mode:

- It shows sample Year 7 data.
- You're treated as an admin.
- Changes are saved in your own browser only.
- Uploaded images are kept in your browser too (large or many images may not fit).

## Going live (in the Tutor Slides Supabase project)

The screens share the Tutor Slides Supabase project, so there is no second project to pay for. They keep their own tables in a separate `screens` schema and only **read** Tutor Slides' `house_points`, `students`, `homework`, `hidden_pupils` and `hidden_homework` tables. Nothing in Tutor Slides is changed.

1. **Create the Admin login.** In Supabase, open Authentication, then Users, then Add user. Use the email `screens@tqacademy.co.uk` (it doesn't need a real mailbox), a strong password, and tick Auto Confirm User. This one login is used for editing and on every TV.
2. **Run `supabase/schema-tutor-slides.sql`** in the Tutor Slides project's SQL editor. It creates the `screens` schema (`screen_staff`, `screen_docs`, access rules, live updates), a private `screen-media` image bucket, and `screens.shared_doc()`, which turns the Tutor Slides tables into the house points, birthdays and homework the screens show. It makes the Admin login an admin of the screens. It is safe to run again.
3. **Expose the schema.** In Supabase, open Project Settings, then Data API, and add `screens` to Exposed schemas.
4. **Add the keys.** From Project Settings, then API, copy the Project URL and the anon public key into `config.js` (leave `TUTOR_SLIDES: true`), then commit. Vercel redeploys automatically.
5. **Set up the TVs.** On each TV, sign in once as Admin, open its screen address, and press Full screen. TVs stay signed in, update live and reload themselves each night at about 4am. Other Tutor Slides logins can't open the screens unless they are added to `screens.screen_staff`.

### What comes from Tutor Slides

| Screens show | Read from | What leaves the database |
|---|---|---|
| House points (centre screens) | `house_points` joined to `students` for the year | Points per house per year |
| Birthdays (right screens) | `students.dob` | First name, surname initial, tutor group and day/month, three days ago to a week ahead. Never the full date of birth or age |
| Homework race and breakdown slides | `homework` (`sparx_maths`, `sparx_reader`, `sparx_science`, `tassomai`) | Tutor group and whole-year figures only. Pupils in `hidden_pupils` or `hidden_homework` and the groups 10PFH and 11JAG are left out |

These are re-read every five minutes, so the morning homework upload in Tutor Slides reaches the screens without a second upload. The Homework uploads page, and the Arbor syncs below, are only needed for a separate screens-only project (`supabase/schema.sql`, with `TUTOR_SLIDES: false` in `config.js`).

## Roles

| Role | Can |
|---|---|
| viewer | See the screens (TVs, and new accounts) |
| editor | Also edit the screens for the years in `screen_staff.years` (`all` = every year) |
| admin | Edit everything, and manage year teams |

## House points from Arbor

_Only for a separate screens-only project. With `TUTOR_SLIDES: true` these come from Tutor Slides instead, and the daily schedule is not set up: to use this sync, add it back to `crons` in `vercel.json`._

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

## Birthdays from Arbor

_Only for a separate screens-only project. With `TUTOR_SLIDES: true` these come from Tutor Slides instead, and the daily schedule is not set up: to use this sync, add it back to `crons` in `vercel.json`._

`api/sync-birthdays.js` reads an Arbor student report with the columns **Student, Year Group, Reg. Form, Next Birthday** (Age on Next Birthday is ignored) and fills the Birthdays slide on each year's right-hand screen. It runs every morning at 5am (UTC).

Only these are saved, per year in `birthdays/<year>`: first name, surname initial, tutor group, and the day and month (for example "Amelia S, 7B, 07/10"). Ages and full dates of birth are never saved, and only birthdays from three days ago to a week ahead are kept. Sixth form rows are skipped.

1. In Arbor, make the report a live feed and copy its address.
2. In Vercel, add `ARBOR_BIRTHDAYS_FEED_URL` with that address (keep it secret). It uses the same `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` as the house points sync. Then redeploy.
3. Test it:

   ```
   curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-site>.vercel.app/api/sync-birthdays
   ```

   The reply shows the columns it used and how many birthdays each year got. It never shows names.

Once it has run, the typed-in list in the Birthdays slide editor is no longer used. If it picks the wrong column, set `ARBOR_STUDENT_COLUMN`, `ARBOR_YEAR_COLUMN`, `ARBOR_FORM_COLUMN` or `ARBOR_BIRTHDAY_COLUMN` to the exact heading.

## Learning Legends from Arbor

`api/sync-legends.js` reads the Arbor behaviour live feed (columns **Date/Time, Severity, Behaviour, Students Involved, Status**), keeps only rows whose Behaviour says "Learning Legends", and fills the list slides titled "Today's Learning Legends" and "Yesterday's Learning Legends" on the left screens. "Yesterday" is the previous school day (Friday on a Monday).

The feed has no year or tutor group, so `screens.save_legends()` matches each name to the Tutor Slides `students` table in the database. It saves `legends/<year>` as "Amy T, 7B" lines (first name, surname initial, tutor group). Names it can't match are counted but not shown.

The TVs call the sync every five minutes while they're on, and the database lets it read Arbor at most every four minutes, so no schedule is needed. It uses no Supabase password or service key: a secret only lets it write the five `legends/` entries.

1. In Arbor, set the feed's output format to **JSON** and copy its address.
2. Run `supabase/schema-tutor-slides.sql` again. In Data API, Exposed functions, turn on `legends_due` and `save_legends`.
3. Get the secret: `select secret from screens.feed_keys where name = 'legends';`
4. In Vercel, add `ARBOR_LEGENDS_FEED_URL` (the feed address) and `LEGENDS_SECRET` (that secret), then redeploy.
5. Open `https://<your-site>/api/sync-legends`. It shows how many feed rows and Learning Legends it found and how many names matched. It never shows names.

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
| `config.js` | Supabase URL, anon key, and whether the screens share the Tutor Slides project |
| `supabase/schema-tutor-slides.sql` | Database setup in the Tutor Slides project (the `screens` schema and the read-only Tutor Slides feeds) |
| `supabase/schema.sql` | Database setup for a separate screens-only project |
| `api/sync-legends.js`, `lib/legends.js` | Learning Legends from the Arbor behaviour feed |
| `api/sync-birthdays.js`, `lib/birthdays.js` | Daily Arbor birthdays sync |
| `supabase/schedule.sql` | Optional 10-minute house points refresh |
| `api/sync-house-points.js`, `lib/housepoints.js` | Arbor feed to house points sync |
| `tools/build_timetable.py` | Arbor timetable exports to `timetable.sql` |
| `vendor/xlsx.full.min.js` | SheetJS, reads the homework exports in the browser |
| `media/` | House mascots, Keep TA Tidy posters, logo |
| `data/demo.json` | Demo-mode sample data |
