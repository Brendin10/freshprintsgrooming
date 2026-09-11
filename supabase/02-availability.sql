-- =========================================================
-- Fresh Prints Grooming — availability / time slots
-- Run AFTER schema.sql:
--   Supabase → SQL Editor → New query → paste → Run
-- Safe to re-run.
-- =========================================================

-- ---------- Table ----------
-- One row per bookable time. Renee creates these in the admin
-- dashboard; the public site can only read the open ones.
create table if not exists public.slots (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  slot_date      date not null,
  -- 'HH:MM' on a 24-hour clock. Deliberately text, not `time`:
  -- it sorts correctly zero-padded and never gets shifted by a
  -- timezone conversion on the way to or from the browser.
  slot_time      text not null,

  status         text not null default 'open',
  appointment_id uuid references public.appointments(id) on delete set null,

  constraint slots_status_check check (status in ('open','booked')),
  constraint slots_time_format  check (slot_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint slots_unique_time  unique (slot_date, slot_time)
);

create index if not exists slots_date_idx   on public.slots (slot_date);
create index if not exists slots_status_idx on public.slots (status);

-- Link an appointment back to the slot it took.
alter table public.appointments add column if not exists slot_id uuid references public.slots(id) on delete set null;


-- ---------- Row Level Security ----------
alter table public.slots enable row level security;

drop policy if exists "anyone can see open slots" on public.slots;
drop policy if exists "staff manage slots"        on public.slots;

-- The public site sees ONLY open, non-past slots. It can read them and
-- nothing else — no insert, update or delete. A visitor therefore cannot
-- block out the calendar by marking slots taken.
create policy "anyone can see open slots"
  on public.slots for select to anon, authenticated
  using (status = 'open' and slot_date >= current_date);

-- Signed-in staff do everything.
create policy "staff manage slots"
  on public.slots for all to authenticated
  using (true) with check (true);


-- ---------- Claiming a slot ----------
-- Booking is an INSERT into appointments carrying a slot_id. The public
-- role cannot update slots directly, so the claim happens here, inside a
-- SECURITY DEFINER trigger, as one atomic statement.
--
-- "where id = ... and status = 'open'" is what makes a double-booking
-- impossible: if two requests race, the second one matches no row, and
-- the exception rolls the whole insert back.

create or replace function public.claim_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.slots%rowtype;
begin
  if new.slot_id is null then
    return new;
  end if;

  update public.slots
     set status = 'booked'
   where id = new.slot_id
     and status = 'open'
     and slot_date >= current_date
  returning * into s;

  if not found then
    raise exception 'That time has just been booked. Please choose another.'
      using errcode = 'P0001';
  end if;

  -- Take the date and time from the slot itself, so the appointment can
  -- never disagree with the slot it holds.
  new.preferred_date := s.slot_date;
  new.preferred_time := s.slot_time;

  return new;
end;
$$;

drop trigger if exists appointments_claim_slot on public.appointments;
create trigger appointments_claim_slot
  before insert on public.appointments
  for each row execute function public.claim_slot();


-- The back-reference can only be set once the appointment row exists.
create or replace function public.link_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.slot_id is not null then
    update public.slots set appointment_id = new.id where id = new.slot_id;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_link_slot on public.appointments;
create trigger appointments_link_slot
  after insert on public.appointments
  for each row execute function public.link_slot();


-- ---------- Releasing a slot ----------
-- Cancelling or deleting an appointment puts its time back on the calendar.

create or replace function public.release_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.slots
     set status = 'open', appointment_id = null
   where appointment_id = old.id;
  return old;
end;
$$;

drop trigger if exists appointments_release_slot on public.appointments;
create trigger appointments_release_slot
  after delete on public.appointments
  for each row execute function public.release_slot();


create or replace function public.release_slot_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.slots
       set status = 'open', appointment_id = null
     where appointment_id = new.id;

  -- Un-cancelling takes the time back off the calendar, if it's still free.
  elsif old.status = 'cancelled' and new.status is distinct from 'cancelled'
        and new.slot_id is not null then
    update public.slots
       set status = 'booked', appointment_id = new.id
     where id = new.slot_id and status = 'open';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_release_on_cancel on public.appointments;
create trigger appointments_release_on_cancel
  after update of status on public.appointments
  for each row execute function public.release_slot_on_cancel();

-- =========================================================
-- Done. Add times under Availability in the admin dashboard.
-- Until slots exist, every date on the booking calendar shows
-- as unavailable — that is correct, not a bug.
-- =========================================================
