-- =========================================================
-- Fresh Prints Grooming — database schema
-- Paste this whole file into: Supabase → SQL Editor → New query → Run
-- Safe to re-run.
-- =========================================================

-- ---------- Table ----------
create table if not exists public.appointments (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  -- Owner
  owner_name      text not null,
  phone           text not null,
  email           text not null,

  -- Dog
  pet_name        text not null,
  breed           text,
  pet_size        text,
  coat_condition  text,
  photo_url       text,

  -- Appointment
  service         text not null,
  preferred_date  date not null,
  preferred_time  text,
  notes           text,

  -- Managed by you in the admin dashboard
  status          text not null default 'pending',
  admin_notes     text,
  quoted_price    numeric(10,2),

  constraint appointments_status_check
    check (status in ('pending','confirmed','completed','cancelled'))
);

create index if not exists appointments_date_idx   on public.appointments (preferred_date);
create index if not exists appointments_status_idx on public.appointments (status);
create index if not exists appointments_email_idx  on public.appointments (email);

-- If you ran an earlier version of this file, this adds the new column.
alter table public.appointments add column if not exists photo_url text;


-- ---------- Row Level Security ----------
-- RLS is what keeps your data safe even though the anon key is public.
alter table public.appointments enable row level security;

-- Clean slate on re-run
drop policy if exists "anyone can request an appointment" on public.appointments;
drop policy if exists "staff can read appointments"       on public.appointments;
drop policy if exists "staff can update appointments"     on public.appointments;
drop policy if exists "staff can delete appointments"     on public.appointments;

-- The public booking form may INSERT only. It cannot read anything back.
create policy "anyone can request an appointment"
  on public.appointments
  for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and preferred_date >= current_date
    and length(owner_name) between 1 and 120
    and length(pet_name)   between 1 and 120
    and length(email)      between 3 and 200
    and length(phone)      between 5 and 40
    and length(coalesce(notes, '')) <= 2000
  );

-- Only signed-in staff can see, edit or remove records.
create policy "staff can read appointments"
  on public.appointments for select to authenticated using (true);

create policy "staff can update appointments"
  on public.appointments for update to authenticated using (true) with check (true);

create policy "staff can delete appointments"
  on public.appointments for delete to authenticated using (true);


-- ---------- Dog photo storage ----------
-- A bucket for the photos owners attach to their booking.
-- Public read (they're just dog pictures, and it keeps the site simple),
-- but only the booking form can write and only you can delete.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dog-photos', 'dog-photos', true,
  10485760,                                            -- 10 MB ceiling
  array['image/jpeg','image/png','image/webp','image/heic']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anyone can upload a dog photo" on storage.objects;
drop policy if exists "dog photos are public"         on storage.objects;
drop policy if exists "staff can delete dog photos"   on storage.objects;
drop policy if exists "staff can update dog photos"   on storage.objects;

create policy "anyone can upload a dog photo"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'dog-photos');

create policy "dog photos are public"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'dog-photos');

create policy "staff can delete dog photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'dog-photos');

create policy "staff can update dog photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'dog-photos');


-- =========================================================
-- Done. Next: create your staff login user.
--   Supabase → Authentication → Users → Add user
--   Enter your email + a strong password, tick "Auto Confirm User".
--   Then sign in at freshprintsgrooming.com/admin.html
--
-- Recommended: Authentication → Providers → Email →
--   turn OFF "Enable sign ups" so nobody else can create an account.
-- =========================================================
