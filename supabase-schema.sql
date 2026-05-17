-- ============================================================
-- AvatarMe — Supabase Schema v3
-- "Record yourself. Post as an avatar."
--
-- Run in Supabase SQL Editor (idempotent).
-- ============================================================

create extension if not exists "uuid-ossp";

-- ─── Profiles ─────────────────────────────────────────────────

create table if not exists public.profiles (
  id                 uuid references auth.users on delete cascade primary key,
  email              text not null,
  full_name          text,
  avatar_url         text,
  credits            integer not null default 3,
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup (gives 3 free credits)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Generations ──────────────────────────────────────────────
-- Columns match DbGeneration TypeScript interface exactly.
--
-- Concept:
--   user_video_url   = creator's recorded video (motion reference)
--   character_image_url = chosen character image (user-uploaded — any source) (visual identity)
--   output_video_url = same performance, different visible person

create table if not exists public.generations (
  id                   text primary key,
  user_id              uuid not null references public.profiles(id) on delete cascade,
  user_video_url       text not null,
  character_image_url     text not null,
  keep_original_audio  boolean not null default true,
  prompt               text not null default '',
  aspect_ratio         text not null default '9:16',
  quality              text not null default 'standard',
  mode                 text not null default 'replacement',
  provider             text not null default 'mock',
  job_id               text,
  fal_endpoint         text,
  status               text not null default 'pending'
                         check (status in ('pending','processing','completed','failed')),
  output_video_url     text,
  error_message        text,
  credits_used         integer not null default 1,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.generations enable row level security;

create policy "generations_select_own"
  on public.generations for select using (auth.uid() = user_id);

create policy "generations_insert_own"
  on public.generations for insert with check (auth.uid() = user_id);

create policy "generations_update_service"
  on public.generations for update using (true);

-- ─── Credit Transactions ──────────────────────────────────────

create table if not exists public.credit_transactions (
  id                       text primary key,
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  amount                   integer not null,
  type                     text not null check (type in ('purchase','usage','refund','bonus')),
  description              text not null,
  stripe_payment_intent_id text,
  created_at               timestamptz not null default now()
);

alter table public.credit_transactions enable row level security;

create policy "transactions_select_own"
  on public.credit_transactions for select using (auth.uid() = user_id);

-- ─── Storage Buckets ──────────────────────────────────────────

-- User-recorded videos (private)
insert into storage.buckets (id, name, public)
values ('user-videos', 'user-videos', false)
on conflict (id) do nothing;

-- Avatar images (private)
insert into storage.buckets (id, name, public)
values ('character-images', 'character-images', false)
on conflict (id) do nothing;

-- Output anonymous avatar videos (public — for sharing)
insert into storage.buckets (id, name, public)
values ('output-videos', 'output-videos', true)
on conflict (id) do nothing;

-- RLS for user-videos
create policy "user_videos_insert"
  on storage.objects for insert
  with check (bucket_id = 'user-videos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "user_videos_select"
  on storage.objects for select
  using (bucket_id = 'user-videos' and auth.uid()::text = (storage.foldername(name))[1]);

-- RLS for character-images
create policy "avatar_images_insert"
  on storage.objects for insert
  with check (bucket_id = 'character-images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "avatar_images_select"
  on storage.objects for select
  using (bucket_id = 'character-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- RLS for output-videos (public read)
create policy "output_videos_public_read"
  on storage.objects for select
  using (bucket_id = 'output-videos');
