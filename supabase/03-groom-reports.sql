-- =========================================================
-- Fresh Prints Grooming — post-groom reports
-- Run AFTER schema.sql (and 02-availability.sql):
--   Supabase → SQL Editor → New query → paste → Run
-- Safe to re-run.
-- =========================================================

-- ---------- Table ----------
-- One report per completed appointment, written by Renee in the
-- admin dashboard and shown on that client's profile.
--
-- The owner / dog / date / service are copied onto the report on
-- purpose: if the appointment is ever deleted, appointment_id goes
-- to null but the report stays readable and stays on the right
-- client's profile (matched through client_key).
create table if not exists public.groom_reports (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  appointment_id    uuid references public.appointments(id) on delete set null,

  -- Which client this belongs to: the booking's email, lower-cased
  -- (falling back to phone). Same rule the dashboard uses.
  client_key        text not null,
  owner_name        text,
  pet_name          text,
  groom_date        date,
  service           text,

  -- The report
  mood              text not null,          -- great / good / okay / tough
  coat_found        text,                   -- coat condition on arrival
  behavior          text[] not null default '{}',
  health_flags      text[] not null default '{}',
  summary           text,
  health_notes      text,
  recommendations   text,
  next_visit_weeks  smallint,
  before_photo_url  text,
  after_photo_url   text,

  constraint groom_reports_one_per_appt unique (appointment_id),
  constraint groom_reports_mood_check   check (mood in ('great','good','okay','tough')),
  constraint groom_reports_weeks_check  check (next_visit_weeks is null or next_visit_weeks between 1 and 52),
  constraint groom_reports_text_sizes   check (
    length(coalesce(summary, ''))         <= 5000 and
    length(coalesce(health_notes, ''))    <= 5000 and
    length(coalesce(recommendations, '')) <= 5000
  )
);

create index if not exists groom_reports_client_idx on public.groom_reports (client_key);
create index if not exists groom_reports_date_idx   on public.groom_reports (groom_date);

-- Keep updated_at honest on edits.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists groom_reports_touch on public.groom_reports;
create trigger groom_reports_touch
  before update on public.groom_reports
  for each row execute function public.touch_updated_at();


-- ---------- Row Level Security ----------
-- Staff only. The public site cannot read or write reports at all.
alter table public.groom_reports enable row level security;

drop policy if exists "staff manage groom reports" on public.groom_reports;

create policy "staff manage groom reports"
  on public.groom_reports for all to authenticated
  using (true) with check (true);

-- Report photos go in the existing dog-photos bucket under reports/,
-- which the policies in schema.sql already allow staff to write.

-- Make the new table visible to the API straight away.
notify pgrst, 'reload schema';
