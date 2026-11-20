-- Run once in Supabase SQL Editor. Keep Row Level Security enabled.
create table if not exists public.webos_cloud_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.webos_cloud_data enable row level security;
drop policy if exists "Users can read their own WebOS cloud data" on public.webos_cloud_data;
create policy "Users can read their own WebOS cloud data" on public.webos_cloud_data for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create their own WebOS cloud data" on public.webos_cloud_data;
create policy "Users can create their own WebOS cloud data" on public.webos_cloud_data for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their own WebOS cloud data" on public.webos_cloud_data;
create policy "Users can update their own WebOS cloud data" on public.webos_cloud_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.webos_cloud_data to authenticated;
