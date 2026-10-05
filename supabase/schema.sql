-- Year group screens: run once in the SQL editor of the screens' OWN Supabase project.
-- Do not run this in the Tutor Slides project.
--
-- Roles (screen_staff.role):
--   viewer  can see the screens (TVs, and every new account until promoted)
--   editor  can also edit the screens for the years listed in screen_staff.years ('all' = every year)
--   admin   can edit everything and manage who is an editor
-- Everything below is enforced by the database, whatever the page does.

-- ---------- tables ----------
create table if not exists public.screen_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email   text,
  name    text,
  role    text not null default 'viewer' check (role in ('viewer', 'editor', 'admin')),
  years   text[] not null default '{}'
);

-- One row per screen document, e.g. 'screens/y7', 'screens/y7-left', 'lessons/y7', 'config/houses'.
create table if not exists public.screen_docs (
  path       text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- ---------- every new account starts as a viewer ----------
create or replace function public.screen_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.screen_staff (user_id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists screen_new_user on auth.users;
create trigger screen_new_user after insert on auth.users for each row execute function public.screen_new_user();

-- ---------- helpers used by the policies ----------
create or replace function public.screen_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.screen_staff where user_id = auth.uid()
$$;

-- May the signed-in person write this document?
--   admins: anything.  editors: screens/<year> and screens/<year>-left|right for their years, and the
--   homework/<kind> totals uploaded on the home page (Sparx and Tassomai).
create or replace function public.screen_can_write(doc_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when s.role = 'admin' then true
      when s.role = 'editor' then doc_path like 'homework/%' or (doc_path like 'screens/%'
        and ('all' = any (s.years) or split_part(split_part(doc_path, '/', 2), '-', 1) = any (s.years)))
      else false end
    from public.screen_staff s where s.user_id = auth.uid()
  ), false)
$$;

-- ---------- row level security ----------
alter table public.screen_staff enable row level security;
alter table public.screen_docs  enable row level security;

drop policy if exists "staff read"   on public.screen_staff;
drop policy if exists "staff admin"  on public.screen_staff;
create policy "staff read"  on public.screen_staff for select to authenticated using (public.screen_role() is not null);
create policy "staff admin" on public.screen_staff for update to authenticated
  using (public.screen_role() = 'admin') with check (public.screen_role() = 'admin');

drop policy if exists "docs read"   on public.screen_docs;
drop policy if exists "docs insert" on public.screen_docs;
drop policy if exists "docs update" on public.screen_docs;
drop policy if exists "docs delete" on public.screen_docs;
create policy "docs read"   on public.screen_docs for select to authenticated using (public.screen_role() is not null);
create policy "docs insert" on public.screen_docs for insert to authenticated with check (public.screen_can_write(path));
create policy "docs update" on public.screen_docs for update to authenticated using (public.screen_can_write(path)) with check (public.screen_can_write(path));
create policy "docs delete" on public.screen_docs for delete to authenticated using (public.screen_role() = 'admin');

-- Live updates to the TVs.
do $$ begin
  alter publication supabase_realtime add table public.screen_docs;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.screen_staff;
exception when duplicate_object then null; end $$;

-- ---------- images (private; the page gets short-lived links) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('screen-media', 'screen-media', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "screen media read"   on storage.objects;
drop policy if exists "screen media upload" on storage.objects;
create policy "screen media read" on storage.objects for select to authenticated
  using (bucket_id = 'screen-media' and public.screen_role() is not null);
create policy "screen media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'screen-media' and public.screen_role() in ('editor', 'admin'));

-- ---------- starting content ----------
-- House mascots ship with the site (media/ folder).
insert into public.screen_docs (path, data) values
  ('config/houses', '{"mascots":{"B":"media/mascot-B.png","C":"media/mascot-C.png","D":"media/mascot-D.png","F":"media/mascot-F.png","H":"media/mascot-H.png","K":"media/mascot-K.png","N":"media/mascot-N.png","P":"media/mascot-P.png"}}')
on conflict (path) do nothing;

-- ---------- after your first sign-in, make yourself admin ----------
-- update public.screen_staff set role = 'admin' where email = 'you@tqacademy.co.uk';
