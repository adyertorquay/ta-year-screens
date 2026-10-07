-- Year group screens, sharing the Tutor Slides Supabase project.
-- Run once in that project's SQL editor (and again after changes; it is safe to re-run).
--
-- What it does to the Tutor Slides project:
--   * adds a separate "screens" schema with the screens' own two tables, helper functions and access rules;
--   * adds a private "screen-media" storage bucket (its policies only ever match that bucket);
--   * adds screens.screen_docs to live updates.
-- What it does NOT do: it never creates, alters, drops or writes any Tutor Slides table, and adds no trigger to
-- auth.users. Tutor Slides data is only READ, by screens.shared_doc() below, and only these columns:
--   house_points (upn, form, house, points), students (upn, forename, surname, year_group, form, dob),
--   homework (upn, form, subject, value, unit, updated_at), hidden_pupils (upn) and hidden_homework (upn, subject), whose pupils are left out of homework figures only.
-- What leaves the database: house totals per year, homework averages per tutor group and year, and birthdays as
-- "first name + surname initial, tutor group, day/month" for three days ago to a week ahead. Never a full date of
-- birth, age, UPN, email or a pupil's homework result.
--
-- After running it, in Supabase open Project Settings, then Data API, and add "screens" to Exposed schemas.
--
-- Roles (screens.screen_staff.role):
--   viewer  can see the screens (TVs, and any school account that signs in)
--   editor  can also edit the screens for the years listed in screen_staff.years ('all' = every year)
--   admin   can edit everything and manage who is an editor

create schema if not exists screens;
grant usage on schema screens to authenticated;

-- ---------- tables ----------
create table if not exists screens.screen_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email   text,
  name    text,
  role    text not null default 'viewer' check (role in ('viewer', 'editor', 'admin')),
  years   text[] not null default '{}'
);

-- One row per screen document, e.g. 'screens/y7', 'screens/y7-left', 'lessons/y7', 'config/houses'.
create table if not exists screens.screen_docs (
  path       text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

grant select, update on screens.screen_staff to authenticated;
grant select, insert, update, delete on screens.screen_docs to authenticated;

-- ---------- helpers used by the policies ----------
create or replace function screens.screen_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from screens.screen_staff where user_id = auth.uid()
$$;

-- May the signed-in person write this document?
--   admins: anything.  editors: screens/<year> and screens/<year>-left|right for their years, and celebrations/all.
--   housepoints/, birthdays/ and homework/ come from Tutor Slides (screens.shared_doc), so nobody writes those here.
create or replace function screens.screen_can_write(doc_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when doc_path ~ '^(housepoints|birthdays|homework)/' then false
      when s.role = 'admin' then true
      when s.role = 'editor' then doc_path = 'celebrations/all' or (doc_path like 'screens/%'
        and ('all' = any (s.years) or split_part(split_part(doc_path, '/', 2), '-', 1) = any (s.years)))
      else false end
    from screens.screen_staff s where s.user_id = auth.uid()
  ), false)
$$;

-- The project's sign-ins are shared with Tutor Slides, so nobody is added to the screens automatically on sign-up.
-- Instead the page calls this after sign-in: a school account (@tqacademy.co.uk) becomes a viewer the first time.
-- Anyone else (for example a TV account on another address) is added by hand, see the end of this file.
create or replace function screens.join() returns void
language plpgsql security definer set search_path = '' as $$
declare u record;
begin
  select id, email, raw_user_meta_data from auth.users where id = auth.uid() into u;
  if u.id is null or lower(u.email) not like '%@tqacademy.co.uk' then return; end if;
  insert into screens.screen_staff (user_id, email, name)
  values (u.id, u.email, coalesce(u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1)))
  on conflict (user_id) do nothing;
end $$;

-- ---------- row level security ----------
alter table screens.screen_staff enable row level security;
alter table screens.screen_docs  enable row level security;

drop policy if exists "staff read"   on screens.screen_staff;
drop policy if exists "staff admin"  on screens.screen_staff;
create policy "staff read"  on screens.screen_staff for select to authenticated using (screens.screen_role() is not null);
create policy "staff admin" on screens.screen_staff for update to authenticated
  using (screens.screen_role() = 'admin') with check (screens.screen_role() = 'admin');

drop policy if exists "docs read"   on screens.screen_docs;
drop policy if exists "docs insert" on screens.screen_docs;
drop policy if exists "docs update" on screens.screen_docs;
drop policy if exists "docs delete" on screens.screen_docs;
create policy "docs read"   on screens.screen_docs for select to authenticated using (screens.screen_role() is not null);
create policy "docs insert" on screens.screen_docs for insert to authenticated with check (screens.screen_can_write(path));
create policy "docs update" on screens.screen_docs for update to authenticated using (screens.screen_can_write(path)) with check (screens.screen_can_write(path));
create policy "docs delete" on screens.screen_docs for delete to authenticated using (screens.screen_role() = 'admin');

-- Live updates to the TVs.
do $$ begin
  alter publication supabase_realtime add table screens.screen_docs;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table screens.screen_staff;
exception when duplicate_object then null; end $$;

-- ---------- feeds read from Tutor Slides ----------
-- Tutor groups left off the screens and out of year totals (Adam, 5 Oct 2026).
create or replace function screens.hidden_groups() returns text[] language sql immutable as $$ select array['10PFH', '11JAG'] $$;

-- Screen homework names -> Tutor Slides homework.subject, and how the screens band the results.
create or replace function screens.hw_subject(kind text) returns text language sql immutable as $$
  select case kind when 'sparx-maths' then 'sparx_maths' when 'sparx-reader' then 'sparx_reader'
    when 'sparx-science' then 'sparx_science' when 'tassomai' then 'tassomai' end
$$;

-- One read-only document in the same shape the screens already use:
--   housepoints/y7  {source, points: {Brunel: 1234, ...}}
--   birthdays/y7    {source: 'arbor', people: "Amelia S, 7B, 07/10\n...", list: [{name, group, date}]}
--   homework/sparx-maths  {source, uploadedAt, rows, what, years: {y7: {students, average, groups: {B: 92.5}, breakdown}}}
-- Only people on the screens (screens.screen_role()) get anything back.
create or replace function screens.shared_doc(doc_path text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  kind text := split_part(doc_path, '/', 1);
  arg  text := split_part(doc_path, '/', 2);
  yr   int;
  today date := (now() at time zone 'Europe/London')::date;
  out  jsonb;
begin
  if screens.screen_role() is null then return null; end if;

  if kind = 'housepoints' then
    if arg !~ '^y(7|8|9|10|11)$' then return null; end if;
    yr := substr(arg, 2)::int;
    select jsonb_build_object('source', 'tutor-slides', 'updatedAt', max(hp.updated_at),
             'points', coalesce(jsonb_object_agg(hp.house, hp.total), '{}'::jsonb))
      into out
      from (select h.house, sum(h.points) as total, max(h.updated_at) as updated_at
              from public.house_points h join public.students s on s.upn = h.upn
             where s.year_group::text = yr::text and h.house is not null
             group by h.house) hp;
    return case when out -> 'points' = '{}'::jsonb then null else out end;

  elsif kind = 'birthdays' then
    if arg !~ '^y(7|8|9|10|11)$' then return null; end if;
    yr := substr(arg, 2)::int;
    with days as (select (today + k) as d from generate_series(-3, 7) k),
    hits as (
      select s.forename, s.surname, s.form, d.d
        from public.students s join days d
          on extract(month from s.dob) = extract(month from d.d)
         and (extract(day from s.dob) = extract(day from d.d)
              -- 29 February birthdays show on 28 February in other years
              or (extract(month from s.dob) = 2 and extract(day from s.dob) = 29 and extract(day from d.d) = 28
                  and extract(day from (date_trunc('year', d.d) + interval '1 month 28 days')) <> 29))
       where s.year_group::text = yr::text and s.dob is not null
    ),
    named as (
      select trim(split_part(trim(forename), ' ', 1)) || coalesce(' ' || upper(left(trim(surname), 1)), '') as name,
             coalesce(form, '') as grp, d from hits
    )
    select jsonb_build_object('source', 'arbor', 'from', 'tutor-slides',
             'people', coalesce(string_agg(concat_ws(', ', name, nullif(grp, ''), to_char(d, 'DD/MM')), e'\n' order by d, name), ''),
             'list', coalesce(jsonb_agg(jsonb_build_object('name', name, 'group', grp, 'date', to_char(d, 'YYYY-MM-DD')) order by d, name), '[]'::jsonb))
      into out from named;
    return out;

  elsif kind = 'homework' then
    if screens.hw_subject(arg) is null then return null; end if;
    with raw as (
      select h.upn, h.form, h.value, h.updated_at, s.year_group::text as y,
             -- tutor group letter(s) as on the screens: 7B -> B, 10Q5 -> Q5, 11JEM -> JEM
             upper(substring(h.form from '^\s*0?(?:7|8|9|10|11)\s*[-/.]?\s*([A-Za-z]{1,3}[0-9]?)')) as grp
        from public.homework h join public.students s on s.upn = h.upn
       where h.subject = screens.hw_subject(arg) and s.year_group::text in ('7', '8', '9', '10', '11')
         -- pupils excused homework in Tutor Slides (all subjects, or just this one) are left out
         and not exists (select 1 from public.hidden_pupils x where x.upn = h.upn)
         and not exists (select 1 from public.hidden_homework x where x.upn = h.upn and x.subject = h.subject)
    ),
    -- Percentages may be stored as 0 to 1; the screens work in 0 to 100.
    scale as (select case when arg <> 'tassomai' and max(value) <= 1 then 100 else 1 end as k from raw),
    r as (
      select y, grp, coalesce(value, 0) * (select k from scale) as v, updated_at from raw
       where grp is null or not (y || grp = any (screens.hidden_groups()))
    ),
    b as (  -- bands, matching HW_BANDS in index.html
      select r.*, case when arg = 'tassomai'
          then case when v >= 500 then 0 when v >= 300 then 1 when v > 0 then 2 else 3 end
          else case when v >= 100 then 0 when v >= 75 then 1 when v > 0 then 2 else 3 end end as band
        from r
    ),
    labels as (
      select * from (values (0, '500 plus', 'On 100%'), (1, '300 to 499', '75 to 99%'), (2, '1 to 299', 'Below 75%'), (3, 'Not started', 'Not started')) t(band, score_label, pct_label)
    ),
    per_group as (  -- Tassomai: average score; Sparx: % of the group on 100%
      select y, grp, case when arg = 'tassomai' then round(avg(v)) else round(100.0 * count(*) filter (where band = 0) / count(*), 1) end as val
        from b where grp is not null group by y, grp
    ),
    groups as (select y, jsonb_object_agg(grp, val) as g from per_group group by y),
    years as (
      select y, count(*) as n, round(avg(v)) as average from b group by y
    ),
    breakdown as (
      select yy.y, jsonb_agg(jsonb_build_object('label', case when arg = 'tassomai' then l.score_label else l.pct_label end,
               'value', round(100.0 * (select count(*) from b where b.y = yy.y and b.band = l.band) / yy.n, 1)) order by l.band) as segs
        from years yy cross join labels l group by yy.y
    )
    select jsonb_build_object('source', 'tutor-slides', 'what', case when arg = 'tassomai' then 'score' else 'completion' end,
             'uploadedAt', (select max(updated_at) from r), 'rows', (select count(*) from r),
             'years', coalesce(jsonb_object_agg('y' || years.y, jsonb_build_object('students', years.n, 'average', years.average,
               'groups', coalesce(groups.g, '{}'::jsonb), 'breakdown', breakdown.segs)), '{}'::jsonb))
      into out
      from years left join groups using (y) left join breakdown using (y);
    return case when out -> 'years' = '{}'::jsonb then null else out end;
  end if;
  return null;
end $$;

revoke all on function screens.shared_doc(text) from public, anon;
grant execute on function screens.shared_doc(text) to authenticated;
revoke all on function screens.join() from public, anon;
grant execute on function screens.join() to authenticated;
grant execute on function screens.screen_role() to authenticated;
grant execute on function screens.screen_can_write(text) to authenticated;

-- ---------- images (private; the page gets short-lived links) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('screen-media', 'screen-media', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "screen media read"   on storage.objects;
drop policy if exists "screen media upload" on storage.objects;
create policy "screen media read" on storage.objects for select to authenticated
  using (bucket_id = 'screen-media' and screens.screen_role() is not null);
create policy "screen media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'screen-media' and screens.screen_role() in ('editor', 'admin'));

-- ---------- starting content ----------
insert into screens.screen_docs (path, data) values
  ('config/houses', '{"mascots":{"B":"media/mascot-B.png","C":"media/mascot-C.png","D":"media/mascot-D.png","F":"media/mascot-F.png","H":"media/mascot-H.png","K":"media/mascot-K.png","N":"media/mascot-N.png","P":"media/mascot-P.png"}}')
on conflict (path) do nothing;

-- ---------- people ----------
-- Make yourself admin (sign in to the screens once first, or use this to add anyone who already has a login):
-- insert into screens.screen_staff (user_id, email, name, role)
--   select id, email, split_part(email, '@', 1), 'admin' from auth.users where email = 'you@tqacademy.co.uk'
--   on conflict (user_id) do update set role = 'admin';
-- A TV or other account on a non-school address (view only):
-- insert into screens.screen_staff (user_id, email, name)
--   select id, email, 'TV Year 7' from auth.users where email = 'tv-y7@example.org' on conflict do nothing;
