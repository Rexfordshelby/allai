create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  mode text not null check (mode in ('chat', 'compare', 'image')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant')),
  content text not null,
  model_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.model_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id text not null,
  provider text not null default 'openrouter',
  status text not null check (status in ('pending', 'completed', 'failed')),
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.image_generations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  negative_prompt text,
  model_id text not null,
  width integer not null,
  height integer not null,
  seed integer,
  storage_path text,
  status text not null check (status in ('pending', 'completed', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.user_model_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_chat_model text,
  compare_models text[] not null default '{}',
  image_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations(user_id, updated_at desc);

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at asc);

create index if not exists model_runs_conversation_created_idx
  on public.model_runs(conversation_id, created_at asc);

create index if not exists image_generations_user_created_idx
  on public.image_generations(user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists set_user_model_preferences_updated_at on public.user_model_preferences;
create trigger set_user_model_preferences_updated_at
before update on public.user_model_preferences
for each row execute function public.set_updated_at();

create or replace function public.touch_conversation_from_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id and user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists touch_conversation_on_message on public.messages;
create trigger touch_conversation_on_message
after insert on public.messages
for each row execute function public.touch_conversation_from_message();

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.model_runs enable row level security;
alter table public.image_generations enable row level security;
alter table public.user_model_preferences enable row level security;

drop policy if exists "Profiles are owned by users" on public.profiles;
create policy "Profiles are owned by users"
on public.profiles for all
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Users manage own conversations" on public.conversations;
create policy "Users manage own conversations"
on public.conversations for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users manage own messages" on public.messages;
create policy "Users manage own messages"
on public.messages for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users manage own model runs" on public.model_runs;
create policy "Users manage own model runs"
on public.model_runs for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users manage own image generations" on public.image_generations;
create policy "Users manage own image generations"
on public.image_generations for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users manage own model preferences" on public.user_model_preferences;
create policy "Users manage own model preferences"
on public.user_model_preferences for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('generated-images', 'generated-images', false)
on conflict (id) do nothing;

drop policy if exists "Users can read own generated images" on storage.objects;
create policy "Users can read own generated images"
on storage.objects for select
using (
  bucket_id = 'generated-images'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload own generated images" on storage.objects;
create policy "Users can upload own generated images"
on storage.objects for insert
with check (
  bucket_id = 'generated-images'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own generated images" on storage.objects;
create policy "Users can update own generated images"
on storage.objects for update
using (
  bucket_id = 'generated-images'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'generated-images'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own generated images" on storage.objects;
create policy "Users can delete own generated images"
on storage.objects for delete
using (
  bucket_id = 'generated-images'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);
