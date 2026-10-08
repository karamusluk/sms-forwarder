-- SMS forwarder schema. Every object is prefixed smsfwd_ so this can share a
-- Supabase project with another app.
--
-- Do not drop or replace existing triggers on auth.users. This migration only
-- adds smsfwd_on_auth_user_created.
--
-- SMS bodies are never stored. smsfwd_dedupe keeps dedupe_key for 5 minutes.
-- smsfwd_send_log keeps user_id + sent_at so the Edge Function can rate-limit.
-- Neither table has a message body or sender column.

create table public.smsfwd_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  destination_email text not null,
  destination_verified boolean not null default true,
  forwarding_enabled boolean not null default false,
  include_metadata boolean not null default true,
  filter_mode text not null default 'all'
    check (filter_mode in ('all', 'senders', 'contains')),
  filter_values text[] not null default '{}',
  language text not null default 'tr' check (language in ('tr', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.smsfwd_profiles enable row level security;

create policy smsfwd_own_profile_read
  on public.smsfwd_profiles
  for select
  using (auth.uid() = id);

create policy smsfwd_own_profile_update
  on public.smsfwd_profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy smsfwd_own_profile_insert
  on public.smsfwd_profiles
  for insert
  with check (auth.uid() = id);

-- Dedupe claims. The Edge Function inserts (user_id, dedupe_key) before SMTP
-- and deletes that row if SMTP fails, so a retry is not treated as a duplicate.
-- smsfwd_prune() deletes rows older than 5 minutes.
create table public.smsfwd_dedupe (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  dedupe_key text not null check (char_length(dedupe_key) > 0),
  seen_at timestamptz not null default now(),
  constraint smsfwd_dedupe_user_key unique (user_id, dedupe_key)
);

create index smsfwd_dedupe_seen_at_idx on public.smsfwd_dedupe (seen_at);

alter table public.smsfwd_dedupe enable row level security;

create policy smsfwd_own_dedupe_select
  on public.smsfwd_dedupe
  for select
  using (auth.uid() = user_id);

create policy smsfwd_own_dedupe_insert
  on public.smsfwd_dedupe
  for insert
  with check (auth.uid() = user_id);

create policy smsfwd_own_dedupe_delete
  on public.smsfwd_dedupe
  for delete
  using (auth.uid() = user_id);

-- Successful sends only. No delete policy: a user cannot clear their own quota.
create table public.smsfwd_send_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index smsfwd_send_log_user_sent_idx
  on public.smsfwd_send_log (user_id, sent_at desc);

alter table public.smsfwd_send_log enable row level security;

create policy smsfwd_own_send_log_select
  on public.smsfwd_send_log
  for select
  using (auth.uid() = user_id);

create policy smsfwd_own_send_log_insert
  on public.smsfwd_send_log
  for insert
  with check (auth.uid() = user_id);

create or replace function public.smsfwd_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.smsfwd_profiles (id, email, destination_email)
  values (new.id, new.email, new.email);
  return new;
end;
$$;

revoke all on function public.smsfwd_handle_new_user() from public;

create trigger smsfwd_on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.smsfwd_handle_new_user();

-- Deletes expired dedupe claims and send-log rows older than 2 days.
-- Does not touch fresh quota rows. security definer so retention is not
-- blocked by RLS; authenticated callers cannot choose which rows go.
create or replace function public.smsfwd_prune()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.smsfwd_dedupe
  where seen_at < now() - interval '5 minutes';

  delete from public.smsfwd_send_log
  where sent_at < now() - interval '2 days';
end;
$$;

revoke all on function public.smsfwd_prune() from public;
grant execute on function public.smsfwd_prune() to authenticated;
