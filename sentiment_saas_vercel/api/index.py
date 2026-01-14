from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from typing import List, Optional
import os
import asyncio
from supabase import create_client, Client
import akshare as ak
import json
from datetime import datetime
from dotenv import load_dotenv
import pathlib

# Load .env.local if it exists (Next.js convention)
env_path = pathlib.Path(__file__).parent.parent / '.env.local'
load_dotenv(dotenv_path=env_path)

# Initialize FastAPI
app = FastAPI()

# Supabase Conf
SUPABASE_URL = os.environ.get("SUPABASE_URL")
# Use Anon Key for base client
SUPABASE_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_ANON_KEY") 

init_error = None
if not SUPABASE_URL or not SUPABASE_KEY:
    init_error = "Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    print(f"❌ {init_error}")

# Global Client (Optional, mainly for public reads if needed)
try:
    if SUPABASE_URL and SUPABASE_KEY:
         supabase_global: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
         print("✅ Supabase initialized successfully (Anon Key).")
    else:
         supabase_global = None
except Exception as e:
    print(f"❌ Failed to initialize Supabase: {e}")
    supabase_global = None
    init_error = str(e)


def get_user_supabase(request: Request) -> Client:
    """
    Creates a Supabase client scoped to the authenticated user.
    """
    if init_error:
        raise HTTPException(status_code=500, detail=f"Database config error: {init_error}")
    
    auth_header = request.headers.get('Authorization')
    if not auth_header:
         raise HTTPException(status_code=401, detail="Missing Authorization Header")

    # Create fresh client
    client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    # Inject token (User Context)
    client.postgrest.auth(auth_header.replace("Bearer ", ""))
    return client

# Models
class FetchRequest(BaseModel):
    stock_code: str

class BatchAnalyzeRequest(BaseModel):
    corpus_ids: List[str]

class CleanupRequest(BaseModel):
    stock_code: str

class TechnicalIndicatorsRequest(BaseModel):
    stock_code: str
    days: int = 60

# --- Technical Indicators Endpoint ---
@app.post("/api/technical_indicators")
async def get_technical_indicators(req: TechnicalIndicatorsRequest):
    """
    Calculates technical indicators (MA, MACD, RSI, KDJ) for a stock.
    Returns indicator values and AI-generated technical analysis.
    """
    import pandas as pd
    from ta.trend import MACD, SMAIndicator
    from ta.momentum import RSIIndicator, StochasticOscillator
    from openai import OpenAI
    
    stock_code = req.stock_code
    days = req.days
    
    try:
        # 1. Fetch historical price data
        df = ak.stock_zh_a_hist(symbol=stock_code, period="daily", adjust="qfq")
        if df is None or df.empty:
            return {"error": "无法获取股票数据"}
        
        # Use last N days
        df = df.tail(days).copy()
        # AkShare returns 12 columns: ['日期', '股票代码', '开盘', '收盘', '最高', '最低', '成交量', '成交额', '振幅', '涨跌幅', '涨跌额', '换手率']
        df.columns = ['date', 'stock_code', 'open', 'close', 'high', 'low', 'volume', 'amount', 'amplitude', 'change_pct', 'change_amt', 'turnover']
        
        # 2. Calculate Moving Averages
        df['ma5'] = SMAIndicator(close=df['close'], window=5).sma_indicator()
        df['ma10'] = SMAIndicator(close=df['close'], window=10).sma_indicator()
        df['ma20'] = SMAIndicator(close=df['close'], window=20).sma_indicator()
        
        # 3. Calculate MACD
        macd = MACD(close=df['close'], window_slow=26, window_fast=12, window_sign=9)
        df['macd_dif'] = macd.macd()
        df['macd_dea'] = macd.macd_signal()
        df['macd_hist'] = macd.macd_diff()
        
        # 4. Calculate RSI (14-day)
        rsi = RSIIndicator(close=df['close'], window=14)
        df['rsi'] = rsi.rsi()
        
        # 5. Calculate KDJ (Stochastic)
        stoch = StochasticOscillator(high=df['high'], low=df['low'], close=df['close'], window=9, smooth_window=3)
        df['k'] = stoch.stoch()
        df['d'] = stoch.stoch_signal()
        df['j'] = 3 * df['k'] - 2 * df['d']
        
        # Get latest values
        latest = df.iloc[-1]
        prev = df.iloc[-2] if len(df) > 1 else latest
        
        # Determine signals
        ma_trend = "多头排列" if latest['ma5'] > latest['ma10'] > latest['ma20'] else "空头排列" if latest['ma5'] < latest['ma10'] < latest['ma20'] else "震荡整理"
        macd_signal = "金叉" if prev['macd_dif'] < prev['macd_dea'] and latest['macd_dif'] > latest['macd_dea'] else "死叉" if prev['macd_dif'] > prev['macd_dea'] and latest['macd_dif'] < latest['macd_dea'] else "持续多头" if latest['macd_dif'] > latest['macd_dea'] else "持续空头"
        rsi_signal = "超买" if latest['rsi'] > 70 else "超卖" if latest['rsi'] < 30 else "中性"
        kdj_signal = "超买" if latest['k'] > 80 or latest['j'] > 100 else "超卖" if latest['k'] < 20 or latest['j'] < 0 else "中性"
        
        # Prepare chart data (last 30 days for visualization)
        chart_data = []
        for idx, row in df.tail(30).iterrows():
            chart_data.append({
                "date": str(row['date'])[:10] if hasattr(row['date'], 'strftime') else str(row['date'])[:10],
                "close": round(float(row['close']), 2),
                "ma5": round(float(row['ma5']), 2) if pd.notna(row['ma5']) else None,
                "ma10": round(float(row['ma10']), 2) if pd.notna(row['ma10']) else None,
                "ma20": round(float(row['ma20']), 2) if pd.notna(row['ma20']) else None,
                "macd_dif": round(float(row['macd_dif']), 4) if pd.notna(row['macd_dif']) else None,
                "macd_dea": round(float(row['macd_dea']), 4) if pd.notna(row['macd_dea']) else None,
                "macd_hist": round(float(row['macd_hist']), 4) if pd.notna(row['macd_hist']) else None,
                "rsi": round(float(row['rsi']), 2) if pd.notna(row['rsi']) else None,
                "k": round(float(row['k']), 2) if pd.notna(row['k']) else None,
                "d": round(float(row['d']), 2) if pd.notna(row['d']) else None,
                "j": round(float(row['j']), 2) if pd.notna(row['j']) else None,
            })
        
        # Current indicator values
        indicators = {
            "ma5": round(float(latest['ma5']), 2) if pd.notna(latest['ma5']) else None,
            "ma10": round(float(latest['ma10']), 2) if pd.notna(latest['ma10']) else None,
            "ma20": round(float(latest['ma20']), 2) if pd.notna(latest['ma20']) else None,
            "macd_dif": round(float(latest['macd_dif']), 4) if pd.notna(latest['macd_dif']) else None,
            "macd_dea": round(float(latest['macd_dea']), 4) if pd.notna(latest['macd_dea']) else None,
            "macd_hist": round(float(latest['macd_hist']), 4) if pd.notna(latest['macd_hist']) else None,
            "rsi": round(float(latest['rsi']), 2) if pd.notna(latest['rsi']) else None,
            "k": round(float(latest['k']), 2) if pd.notna(latest['k']) else None,
            "d": round(float(latest['d']), 2) if pd.notna(latest['d']) else None,
            "j": round(float(latest['j']), 2) if pd.notna(latest['j']) else None,
            "close": round(float(latest['close']), 2),
        }
        
        signals = {
            "ma_trend": ma_trend,
            "macd_signal": macd_signal,
            "rsi_signal": rsi_signal,
            "kdj_signal": kdj_signal,
        }
        
        # 6. AI Technical Analysis
        ai_analysis = ""
        try:
            DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY")
            if DEEPSEEK_API_KEY:
                client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com")
                prompt = f"""请用中文分析股票 {stock_code} 的技术指标并给出操作建议：

当前价格：{indicators['close']}
均线：MA5={indicators['ma5']}, MA10={indicators['ma10']}, MA20={indicators['ma20']} ({ma_trend})
MACD：DIF={indicators['macd_dif']}, DEA={indicators['macd_dea']}, 柱状={indicators['macd_hist']} ({macd_signal})
RSI(14)：{indicators['rsi']} ({rsi_signal})
KDJ：K={indicators['k']}, D={indicators['d']}, J={indicators['j']} ({kdj_signal})

请综合以上指标，给出：
1. 短期趋势判断（1-5天）
2. 中期趋势判断（1-2周）  
3. 操作建议（买入/持有/观望/卖出）
4. 风险提示

回复请简洁专业，控制在200字以内。"""

                response = client.chat.completions.create(
                    model="deepseek-chat",
                    messages=[
                        {"role": "system", "content": "你是专业的股票技术分析师，擅长解读技术指标。"},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=500,
                    temperature=0.3
                )
                ai_analysis = response.choices[0].message.content
        except Exception as e:
            ai_analysis = f"AI分析暂不可用: {str(e)}"
        
        return {
            "status": "success",
            "stock_code": stock_code,
            "indicators": indicators,
            "signals": signals,
            "chart_data": chart_data,
            "ai_analysis": ai_analysis,
            "indicator_explanations": {
                "ma": "移动平均线：MA5>MA10>MA20为多头排列，反之为空头排列",
                "macd": "MACD：DIF上穿DEA为金叉(买入信号)，下穿为死叉(卖出信号)",
                "rsi": "RSI：>70超买可能回调，<30超卖可能反弹",
                "kdj": "KDJ：K>80或J>100超买，K<20或J<0超卖"
            }
        }
        
    except Exception as e:
        print(f"Technical indicators error: {e}")
        return {"status": "error", "error": str(e)}

# --- 0. Cleanup Duplicates & English Data ---
@app.post("/api/cleanup_data")
async def cleanup_data(req: CleanupRequest, request: Request):
    """
    Cleans up duplicate entries and English AI summaries for a stock.
    - Removes duplicate raw_corpus entries (keeps newest per title)
    - Deletes sentiment_results with English summaries
    - Resets is_analyzed flag for re-analysis
    """
    import re
    supabase = get_user_supabase(request)
    stock_code = req.stock_code
    
    deleted_duplicates = 0
    deleted_english = 0
    reset_count = 0
    
    try:
        # 1. Get all raw_corpus for this stock
        all_corpus = supabase.table("raw_corpus").select("id, title, publish_time").eq("stock_code", stock_code).order("publish_time", desc=True).execute()
        
        if all_corpus.data:
            # Find duplicates (keep first occurrence which is newest due to desc order)
            seen_titles = {}
            duplicate_ids = []
            for item in all_corpus.data:
                title = item["title"]
                if title in seen_titles:
                    duplicate_ids.append(item["id"])
                else:
                    seen_titles[title] = item["id"]
            
            # Delete duplicates from raw_corpus (cascade will delete sentiment_results)
            if duplicate_ids:
                supabase.table("raw_corpus").delete().in_("id", duplicate_ids).execute()
                deleted_duplicates = len(duplicate_ids)
        
        # 2. Find and delete sentiment_results with English summaries
        # Get remaining corpus IDs
        remaining = supabase.table("raw_corpus").select("id").eq("stock_code", stock_code).execute()
        if remaining.data:
            corpus_ids = [r["id"] for r in remaining.data]
            
            # Get sentiment results for these
            results = supabase.table("sentiment_results").select("id, corpus_id, summary").in_("corpus_id", corpus_ids).execute()
            
            if results.data:
                # Check for English text (mostly ASCII letters means English)
                english_ids = []
                corpus_to_reset = []
                for r in results.data:
                    summary = r.get("summary", "") or ""
                    # If more than 50% ASCII letters, consider it English
                    ascii_letters = sum(1 for c in summary if c.isascii() and c.isalpha())
                    if len(summary) > 10 and ascii_letters / max(len(summary), 1) > 0.5:
                        english_ids.append(r["id"])
                        corpus_to_reset.append(r["corpus_id"])
                
                # Delete English sentiment results
                if english_ids:
                    supabase.table("sentiment_results").delete().in_("id", english_ids).execute()
                    deleted_english = len(english_ids)
                
                # Reset is_analyzed for affected corpus entries
                if corpus_to_reset:
                    supabase.table("raw_corpus").update({"is_analyzed": False}).in_("id", corpus_to_reset).execute()
                    reset_count = len(corpus_to_reset)
        
        return {
            "status": "success",
            "deleted_duplicates": deleted_duplicates,
            "deleted_english_summaries": deleted_english,
            "reset_for_reanalysis": reset_count
        }
    
    except Exception as e:
        print(f"Cleanup error: {e}")
        return {"status": "error", "error": str(e)}

# --- 1. Fetch Raw Data (AkShare -> DB) ---
@app.post("/api/fetch_raw")
async def fetch_raw(req: FetchRequest, request: Request):
    """
    Fetches news AND research reports from AkShare and saves to raw_corpus.
    - Limited to last 10 days
    - Deduplicates by title
    """
    from datetime import timedelta
    
    supabase = get_user_supabase(request)
    stock_code = req.stock_code
    new_count = 0
    ten_days_ago = datetime.now() - timedelta(days=10)

    try:
        records = []
        
        # 1. Fetch News (东方财富)
        try:
            df_news = ak.stock_news_em(symbol=stock_code)
            for _, row in df_news.head(20).iterrows():
                pub_time_str = row.get("发布时间", "")
                try:
                    pub_time = datetime.strptime(pub_time_str, "%Y-%m-%d %H:%M:%S")
                except:
                    pub_time = datetime.now()
                
                if pub_time >= ten_days_ago:
                    title = row.get("新闻标题", "No Title")
                    records.append({
                        "stock_code": stock_code,
                        "source": "news",
                        "title": title,
                        "content": row.get("新闻内容", "") or title,
                        "publish_time": pub_time.isoformat(),
                        "is_analyzed": False
                    })
        except Exception as e:
            print(f"News fetch error: {e}")

        # 2. Fetch Research Reports (研报)
        try:
            df_report = ak.stock_research_report_em(symbol=stock_code)
            for _, row in df_report.head(10).iterrows():
                pub_date = row.get("日期", "")
                try:
                    pub_time = datetime.strptime(str(pub_date), "%Y-%m-%d")
                except:
                    pub_time = datetime.now()
                
                if pub_time >= ten_days_ago:
                    title = row.get("报告名称", "研报")
                    org = row.get("研究机构", "")
                    rating = row.get("评级", "")
                    content = f"[{org}] {title} - 评级: {rating}"
                    records.append({
                        "stock_code": stock_code,
                        "source": "report",
                        "title": title,
                        "content": content,
                        "publish_time": pub_time.isoformat(),
                        "is_analyzed": False
                    })
        except Exception as e:
            print(f"Research report fetch error: {e}")

        # 3. Deduplicate: Check existing titles for this stock
        if records:
            titles = [r["title"] for r in records]
            existing = supabase.table("raw_corpus").select("title").eq("stock_code", stock_code).in_("title", titles).execute()
            existing_titles = set([r["title"] for r in existing.data]) if existing.data else set()
            
            # Filter out duplicates
            unique_records = [r for r in records if r["title"] not in existing_titles]
            
            if unique_records:
                data, count = supabase.table("raw_corpus").insert(unique_records).execute()
                new_count = len(data[1]) if data and len(data) > 1 else len(unique_records)

    except Exception as e:
        print(f"Error fetching data: {e}")
        return {"status": "partial_success", "error": str(e)}

    return {"status": "success", "new_items": new_count}


# --- 2. Batch Analyze (DB -> LLM -> DB) ---
@app.post("/api/analyze_batch")
async def analyze_batch(req: BatchAnalyzeRequest, request: Request):
    """
    Receives list of corpus_ids, calls DeepSeek, saves results.
    """
    supabase = get_user_supabase(request)

    ids = req.corpus_ids
    if not ids:
        return {"success": True, "processed_count": 0}

    # 1. Fetch Content
    response = supabase.table("raw_corpus").select("*").in_("id", ids).execute()
    items = response.data

    processed_results = []
    
    # 2. Parallel Analysis using asyncio
    tasks = [analyze_single_item(item) for item in items]
    results = await asyncio.gather(*tasks)

    # 3. Save Results
    sentiment_inserts = []
    analyzed_ids = []

    for res in results:
        if res:
            sentiment_inserts.append(res)
            analyzed_ids.append(res["corpus_id"])

    if sentiment_inserts:
        supabase.table("sentiment_results").insert(sentiment_inserts).execute()
        
    # 4. Mark as Analyzed
    if analyzed_ids:
        supabase.table("raw_corpus").update({"is_analyzed": True}).in_("id", analyzed_ids).execute()

    return {"success": True, "processed_count": len(analyzed_ids)}

# --- DeepSeek Helper ---
async def analyze_single_item(item):
    """
    Calls DeepSeek API for sentiment analysis.
    Outputs in Chinese.
    """
    try:
        text = f"{item['title']} \n {item['content']}"
        source = item['source']
        
        api_key = os.environ.get("DEEPSEEK_API_KEY")
        if not api_key:
            # Fallback for demo without key
            print("DEEPSEEK_API_KEY not set, using mock.")
            await asyncio.sleep(0.3) 
            score = 0.0
            if "跌" in text or "空" in text or "减持" in text or "下调" in text:
                score = -0.5
            elif "涨" in text or "多" in text or "牛" in text or "买入" in text or "增持" in text:
                score = 0.5
            summary = f"模拟分析: {item['title'][:20]}..."
        else:
            # DeepSeek API Call
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key, base_url="https://api.deepseek.com/v1")
            
            completion = await client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": "你是一位专业的金融情感分析师。分析以下财经文本的情绪倾向。请用中文回复，格式为JSON: { \"score\": 浮点数(-1到1, -1极度看空, 0中性, 1极度看多), \"summary\": \"一句话中文解释分析理由\" }"},
                    {"role": "user", "content": f"请分析以下内容的情绪: {text}"}
                ]
            )
            content = completion.choices[0].message.content
            try:
                import json
                clean_content = content.replace("```json", "").replace("```", "").strip()
                data = json.loads(clean_content)
                score = data.get('score', 0)
                summary = data.get('summary', '分析完成')
            except:
                score = 0
                summary = content[:50] if content else "解析失败"

        # Handle all source types
        return {
            "corpus_id": item['id'],
            "news_score_raw": score if source in ['news', 'report'] else None,
            "guba_score_raw": score if source == 'guba' else None,
            "summary": summary
        }
    except Exception as e:
        print(f"Analysis failed for {item['id']}: {e}")
        return None


# --- 3. Fetch Stock Price Data ---
class StockPriceRequest(BaseModel):
    stock_code: str
    days: int = 30

@app.post("/api/stock_price")
async def get_stock_price(req: StockPriceRequest):
    """
    Fetches daily stock prices from AkShare.
    Returns: list of {date, close, open, high, low, volume}
    """
    try:
        # AkShare function for A-share daily data
        df = ak.stock_zh_a_hist(symbol=req.stock_code, period="daily", adjust="qfq")
        # Take last N days
        df = df.tail(req.days)
        # Rename columns to English
        df = df.rename(columns={
            "日期": "date",
            "开盘": "open",
            "收盘": "close",
            "最高": "high",
            "最低": "low",
            "成交量": "volume"
        })
        # Convert to list of dicts
        result = df[["date", "open", "close", "high", "low", "volume"]].to_dict(orient="records")
        return {"status": "success", "data": result}
    except Exception as e:
        print(f"Error fetching stock price: {e}")
        return {"status": "error", "error": str(e)}


# --- 4. Fetch Stock Info (Name) ---
@app.get("/api/stock_info/{stock_code}")
async def get_stock_info(stock_code: str):
    """
    Gets stock name from AkShare.
    """
    try:
        # Get A-share stock list
        df = ak.stock_info_a_code_name()
        # Find the stock
        match = df[df["code"] == stock_code]
        if not match.empty:
            name = match.iloc[0]["name"]
            return {"status": "success", "code": stock_code, "name": name}
        else:
            return {"status": "success", "code": stock_code, "name": stock_code}
    except Exception as e:
        print(f"Error fetching stock info: {e}")
        return {"status": "error", "code": stock_code, "name": stock_code}
