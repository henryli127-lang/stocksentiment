# Architecture Design: Sentiment SaaS Vercel (Refined)

## 1. Core Architecture: Client-Side Orchestration
To bypass Vercel's 10s Serverless Function limit, we use a **Map-Reduce** style approach orchestrated by the Frontend.

- **Fetch Phase**: `POST /api/fetch_raw` -> Fetches external data (AkShare) and saves to `raw_corpus`. Fast IO, no AI.
- **Orchestration**: Frontend queries Supabase for `raw_corpus` items where `is_analyzed = FALSE`.
- **Batch Analysis**: Frontend loops through these items in batches (e.g., 5 at a time) and calls `POST /api/analyze_batch` to process them.
- **Visualization**: Frontend pulls `sentiment_results` and applies user-defined weights in real-time.

## 2. Database Schema (Supabase)

### Tables
1.  **`user_settings`**
    - Config: `news_weight`, `guba_weight`.
    - RLS: User private.
2.  **`user_portfolios`**
    - Tracked stocks.
    - RLS: User private.
3.  **`raw_corpus`** (Shared Data Lake)
    - `id`, `stock_code`, `source` (news/guba), `title`, `content`, `publish_time`, `is_analyzed`.
    - RLS: Public Read (authenticated).
4.  **`sentiment_results`** (Analysis Results)
    - `corpus_id` (FK), `news_score_raw`, `guba_score_raw`, `summary`.
    - RLS: Public Read (authenticated).

## 3. Backend API (Python/FastAPI)

### `POST /api/fetch_raw`
- **Logic**: AkShare -> `raw_corpus`.
- **Time Limit**: < 5s.

### `POST /api/analyze_batch`
- **Logic**: Supabase (`raw_corpus`) -> DeepSeek (Parallel) -> `sentiment_results` + Update `raw_corpus.is_analyzed`.
- **Batch Size**: 5 items.
- **Time Limit**: < 10s.

## 4. Frontend (Next.js)

### Dashboard Logic
- **Progress Bar**: Shows Batch completion status.
- **Dynamic Chart**:
  - `FinalScore = (news_raw * user.news + guba_raw * user.guba) / (user.news + user.guba)`
  - Recalculates instantly when User drags sliders.

## 5. Technology Stack
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS + Shadcn UI
- **Backend API**: Python FastAPI (Serverless)
- **DB**: Supabase PostgreSQL
- **AI**: DeepSeek API
