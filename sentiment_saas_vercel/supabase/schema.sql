-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. user_settings
create table user_settings (
  user_id uuid references auth.users not null primary key,
  news_weight float default 0.7,
  guba_weight float default 0.3,
  api_key_preference text, -- Optional
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table user_settings enable row level security;

create policy "Users can view their own settings"
  on user_settings for select
  using (auth.uid() = user_id);

create policy "Users can update their own settings"
  on user_settings for update
  using (auth.uid() = user_id);

create policy "Users can insert their own settings"
  on user_settings for insert
  with check (auth.uid() = user_id);


-- 2. user_portfolios
create table user_portfolios (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  stock_code text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table user_portfolios enable row level security;

create policy "Users can view their own portfolios"
  on user_portfolios for select
  using (auth.uid() = user_id);

create policy "Users can insert their own portfolios"
  on user_portfolios for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own portfolios"
  on user_portfolios for delete
  using (auth.uid() = user_id);


-- 3. raw_corpus (Public Read, Service Role Write)
create table raw_corpus (
  id uuid default uuid_generate_v4() primary key,
  stock_code text not null,
  source text not null check (source in ('news', 'guba')),
  title text not null,
  content text,
  publish_time timestamp with time zone,
  is_analyzed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for faster queries
create index idx_raw_corpus_stock_analyzed on raw_corpus(stock_code, is_analyzed);
create index idx_raw_corpus_title on raw_corpus(title); -- Simple deduplication check

alter table raw_corpus enable row level security;

-- Allow authenticated users to view raw data (needed for visualization/debugging if we want)
-- Or strictly, maybe only backend needs to write. Frontend might need to read pending items.
create policy "Authenticated users can read raw_corpus"
  on raw_corpus for select
  to authenticated
  using (true);

-- Allow Service Role (Backend) to do everything.
-- We can also allow authenticated users to INSERT if we move the "fetch" logic to client,
-- but here we are using a Python Backend endpoint `fetch_raw` which will use the SERVICE_ROLE_KEY or allow public insert?
-- Ideally the python backend uses a Service Role key to bypass RLS or we allow Authenticated users to INSERT?
-- The request says: "Frontend calls API... to fetch".
-- The API runs on Vercel Backend. It has secrets.
-- We will assume the Vercel Backend uses `SUPABASE_SERVICE_ROLE_KEY` to write.


-- 4. sentiment_results
create table sentiment_results (
  id uuid default uuid_generate_v4() primary key,
  corpus_id uuid references raw_corpus(id) not null,
  news_score_raw float, -- -1 to 1
  guba_score_raw float, -- -1 to 1
  summary text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table sentiment_results enable row level security;

create policy "Authenticated users can read sentiment_results"
  on sentiment_results for select
  to authenticated
  using (true);

-- Backend (Service Role) writes.

