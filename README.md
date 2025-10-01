# Elevation Office Booking (Clean Reset)

## 1) Environment
Set these in Vercel Project → Settings → Environment Variables:
- NEXT_PUBLIC_SUPABASE_URL = https://YOUR-PROJECT.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY = YOUR-ANON-KEY

## 2) Supabase SQL (run once)
**Supabase → SQL Editor**: run the block below (safe to re-run):

```sql
-- Ensure profiles has display_name, color, active, email
alter table public.profiles
  add column if not exists display_name text,
  add column if not exists email text unique,
  add column if not exists color text default '#6366F1',
  add column if not exists active boolean default true;

-- Allow bookings to keep history if therapist deleted
alter table public.bookings
  alter column user_id drop not null;

do $$ begin
  alter table public.bookings drop constraint if exists bookings_user_id_fkey;
exception when others then null; end $$;

alter table public.bookings
  add constraint bookings_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

-- Simple RLS policies (authenticated users can manage)
drop policy if exists profiles_manage on public.profiles;
create policy profiles_manage on public.profiles
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists bookings_manage on public.bookings;
create policy bookings_manage on public.bookings
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists rooms_read_auth on public.rooms;
create policy rooms_read_auth on public.rooms
  for select using (auth.role() = 'authenticated');

drop policy if exists locations_read_auth on public.locations;
create policy locations_read_auth on public.locations
  for select using (auth.role() = 'authenticated');

-- RLS on
alter table public.profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.rooms enable row level security;
alter table public.locations enable row level security;
