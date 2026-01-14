"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import axios from "axios"
import {
    ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
    ResponsiveContainer, CartesianGrid, Area, ReferenceLine
} from "recharts"
import { Loader2, Plus, Trash2, RefreshCw, TrendingUp, Newspaper, BarChart3, Activity } from "lucide-react"

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload
        return (
            <div className="bg-slate-900 text-white p-4 rounded-lg shadow-xl max-w-xs border border-slate-700">
                <p className="font-bold text-indigo-400 mb-2">{label}</p>
                {data.close && (
                    <p className="text-sm">
                        <span className="text-slate-400">收盘价:</span>
                        <span className="ml-2 text-green-400 font-mono">¥{data.close}</span>
                    </p>
                )}
                {data.sentiment !== undefined && (
                    <p className="text-sm">
                        <span className="text-slate-400">情感分:</span>
                        <span className={`ml-2 font-mono ${data.sentiment >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {data.sentiment}
                        </span>
                    </p>
                )}
                {data.newsSummary && (
                    <div className="mt-2 pt-2 border-t border-slate-700">
                        <p className="text-xs text-slate-400">当日新闻摘要:</p>
                        <p className="text-xs text-slate-300 mt-1">{data.newsSummary}</p>
                    </div>
                )}
            </div>
        )
    }
    return null
}

export default function Dashboard() {
    const supabase = createClient()
    const [user, setUser] = useState<any>(null)

    // Stock State
    const [portfolios, setPortfolios] = useState<any[]>([])
    const [selectedStock, setSelectedStock] = useState<string | null>(null)
    const [stockName, setStockName] = useState<string>("")
    const [stockInfo, setStockInfo] = useState<{
        open: number | null, close: number | null, high: number | null, low: number | null,
        change: number | null, changePercent: number | null
    }>({ open: null, close: null, high: null, low: null, change: null, changePercent: null })

    // Chart Data
    const [chartData, setChartData] = useState<any[]>([])
    const [newsData, setNewsData] = useState<any[]>([])
    const [selectedArticle, setSelectedArticle] = useState<any>(null)

    // Settings
    const [settings, setSettings] = useState({ news_weight: 0.7, guba_weight: 0.3 })

    // Progress
    const [isUpdating, setIsUpdating] = useState(false)
    const [statusMsg, setStatusMsg] = useState("")
    const [progress, setProgress] = useState(0)
    const [lastUpdateTime, setLastUpdateTime] = useState<string | null>(null)
    const [showCleanupConfirm, setShowCleanupConfirm] = useState(false)

    // Technical Indicators
    const [technicalData, setTechnicalData] = useState<any>(null)
    const [loadingTechnical, setLoadingTechnical] = useState(false)

    useEffect(() => {
        checkUser()
    }, [])

    useEffect(() => {
        if (user) {
            fetchPortfolios()
            fetchSettings()
        }
    }, [user])

    useEffect(() => {
        if (selectedStock) {
            fetchStockInfo(selectedStock)
            fetchChartData(selectedStock)
            fetchNewsDetails(selectedStock)
            fetchTechnicalIndicators(selectedStock)
        }
    }, [selectedStock, settings])

    const checkUser = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) setUser(user)
        else window.location.href = '/login'
    }

    const fetchPortfolios = async () => {
        const { data } = await supabase.from('user_portfolios').select('*')
        if (data) setPortfolios(data)
    }

    const fetchSettings = async () => {
        const { data } = await supabase.from('user_settings').select('*').maybeSingle()
        if (data) {
            setSettings({ news_weight: data.news_weight, guba_weight: data.guba_weight })
        }
    }

    const fetchStockInfo = async (code: string) => {
        try {
            // Fetch name
            const nameRes = await axios.get(`/api/stock_info/${code}`)
            if (nameRes.data.name) setStockName(nameRes.data.name)

            // Fetch price data for today's info
            const priceRes = await axios.post('/api/stock_price', { stock_code: code, days: 10 })
            const prices = priceRes.data.data || []
            if (prices.length >= 2) {
                const today = prices[prices.length - 1]
                const yesterday = prices[prices.length - 2]
                const change = today.close - yesterday.close
                const changePercent = (change / yesterday.close) * 100
                setStockInfo({
                    open: today.open,
                    close: today.close,
                    high: today.high,
                    low: today.low,
                    change: change,
                    changePercent: changePercent
                })
            } else if (prices.length === 1) {
                const today = prices[0]
                setStockInfo({
                    open: today.open,
                    close: today.close,
                    high: today.high,
                    low: today.low,
                    change: null,
                    changePercent: null
                })
            }
        } catch (e) {
            setStockName(code)
        }
    }

    const fetchChartData = async (code: string) => {
        try {
            // Fetch stock prices
            const priceRes = await axios.post('/api/stock_price', { stock_code: code, days: 30 })
            const priceData = priceRes.data.data || []

            // Fetch sentiment data
            const { data: corpus } = await supabase
                .from('raw_corpus')
                .select(`
                    id, title, publish_time, 
                    sentiment_results ( news_score_raw, guba_score_raw, summary )
                `)
                .eq('stock_code', code)
                .eq('is_analyzed', true)
                .order('publish_time', { ascending: true })

            // Group sentiment by date
            const sentimentMap: Record<string, { total: number, count: number, summaries: string[] }> = {}
            corpus?.forEach((item: any) => {
                if (!item.sentiment_results || item.sentiment_results.length === 0) return
                const res = item.sentiment_results[0]
                const news = res.news_score_raw || 0
                const guba = res.guba_score_raw || 0

                let score = 0
                let weightSum = 0
                if (res.news_score_raw != null) {
                    score += news * settings.news_weight
                    weightSum += settings.news_weight
                }
                if (res.guba_score_raw != null) {
                    score += guba * settings.guba_weight
                    weightSum += settings.guba_weight
                }
                const finalScore = weightSum > 0 ? score / weightSum : 0

                const date = new Date(item.publish_time).toISOString().split('T')[0]
                if (!sentimentMap[date]) sentimentMap[date] = { total: 0, count: 0, summaries: [] }
                sentimentMap[date].total += finalScore
                sentimentMap[date].count += 1
                if (res.summary) sentimentMap[date].summaries.push(res.summary)
            })

            // Merge price and sentiment
            const merged = priceData.map((p: any) => {
                const dateStr = typeof p.date === 'string' ? p.date : new Date(p.date).toISOString().split('T')[0]
                const sentiment = sentimentMap[dateStr]
                return {
                    date: dateStr,
                    close: p.close,
                    sentiment: sentiment ? parseFloat((sentiment.total / sentiment.count).toFixed(2)) : null,
                    newsSummary: sentiment?.summaries[0] || null
                }
            })

            setChartData(merged)
        } catch (e) {
            console.error("Error fetching chart data:", e)
        }
    }

    const fetchNewsDetails = async (code: string) => {
        const { data } = await supabase
            .from('raw_corpus')
            .select(`
                id, title, content, publish_time, source,
                sentiment_results ( news_score_raw, guba_score_raw, summary )
            `)
            .eq('stock_code', code)
            .eq('is_analyzed', true)
            .order('publish_time', { ascending: false })
            .limit(50)

        // Deduplicate by title - keep only the first occurrence (newest)
        if (data) {
            const seen = new Set<string>()
            const unique = data.filter(item => {
                if (seen.has(item.title)) return false
                seen.add(item.title)
                return true
            }).slice(0, 20)
            setNewsData(unique)
        }
    }

    const fetchTechnicalIndicators = async (code: string) => {
        setLoadingTechnical(true)
        try {
            const res = await axios.post('/api/technical_indicators', { stock_code: code, days: 60 })
            if (res.data.status === 'success') {
                setTechnicalData(res.data)
            }
        } catch (e) {
            console.error("Error fetching technical indicators:", e)
        } finally {
            setLoadingTechnical(false)
        }
    }

    const deleteStock = async (id: string) => {
        await supabase.from('user_portfolios').delete().eq('id', id)
        fetchPortfolios()
        if (portfolios.length === 1) setSelectedStock(null)
    }

    const handleCleanupClick = () => {
        if (!selectedStock) return
        setShowCleanupConfirm(true)
    }

    const handleCleanupConfirm = async () => {
        setShowCleanupConfirm(false)
        if (!selectedStock) return

        setIsUpdating(true)
        setProgress(0)
        setStatusMsg("正在清理重复数据...")

        try {
            const { data: { session } } = await supabase.auth.getSession()
            const config = { headers: { Authorization: `Bearer ${session?.access_token}` } }

            const cleanupRes = await axios.post('/api/cleanup_data', { stock_code: selectedStock }, config)
            setProgress(30)

            if (cleanupRes.data.status === "success") {
                setStatusMsg(`已删除 ${cleanupRes.data.deleted_duplicates} 条重复，${cleanupRes.data.deleted_english_summaries} 条英文分析`)

                // Now run full update to regenerate
                await handleFullUpdateInternal()
            } else {
                setStatusMsg(`清理失败: ${cleanupRes.data.error}`)
            }
        } catch (e: any) {
            console.error(e)
            setStatusMsg(`错误: ${e.message}`)
        } finally {
            setIsUpdating(false)
        }
    }

    const handleFullUpdateInternal = async () => {
        if (!selectedStock) return

        try {
            const { data: { session } } = await supabase.auth.getSession()
            const config = { headers: { Authorization: `Bearer ${session?.access_token}` } }

            setStatusMsg("正在获取最新数据...")
            const fetchRes = await axios.post('/api/fetch_raw', { stock_code: selectedStock }, config)
            if (fetchRes.data.error) throw new Error(fetchRes.data.error)
            setProgress(50)

            const { data: pendingItems } = await supabase
                .from('raw_corpus')
                .select('id')
                .eq('stock_code', selectedStock)
                .eq('is_analyzed', false)

            if (!pendingItems || pendingItems.length === 0) {
                setStatusMsg("没有新数据需要分析")
                fetchChartData(selectedStock)
                fetchNewsDetails(selectedStock)
                return
            }

            const BATCH_SIZE = 5
            const total = pendingItems.length

            for (let i = 0; i < total; i += BATCH_SIZE) {
                const batchIds = pendingItems.slice(i, i + BATCH_SIZE).map(item => item.id)
                setStatusMsg(`正在分析 ${Math.ceil(i / BATCH_SIZE) + 1}/${Math.ceil(total / BATCH_SIZE)}...`)
                await axios.post('/api/analyze_batch', { corpus_ids: batchIds }, config)
                setProgress(50 + Math.min(((i + BATCH_SIZE) / total) * 50, 50))
            }

            setStatusMsg("更新完成!")
            setLastUpdateTime(new Date().toLocaleString('zh-CN'))
            fetchChartData(selectedStock)
            fetchNewsDetails(selectedStock)
        } catch (e: any) {
            throw e
        }
    }

    const handleFullUpdate = async () => {
        if (!selectedStock) return
        setIsUpdating(true)
        setProgress(0)

        try {
            setStatusMsg("正在获取最新数据...")
            const { data: { session } } = await supabase.auth.getSession()
            const config = { headers: { Authorization: `Bearer ${session?.access_token}` } }

            const fetchRes = await axios.post('/api/fetch_raw', { stock_code: selectedStock }, config)
            if (fetchRes.data.error) throw new Error(fetchRes.data.error)

            const { data: pendingItems } = await supabase
                .from('raw_corpus')
                .select('id')
                .eq('stock_code', selectedStock)
                .eq('is_analyzed', false)

            if (!pendingItems || pendingItems.length === 0) {
                setStatusMsg("没有新数据需要分析")
                fetchChartData(selectedStock)
                fetchNewsDetails(selectedStock)
                setIsUpdating(false)
                return
            }

            const BATCH_SIZE = 5
            const total = pendingItems.length

            for (let i = 0; i < total; i += BATCH_SIZE) {
                const batchIds = pendingItems.slice(i, i + BATCH_SIZE).map(item => item.id)
                setStatusMsg(`正在分析 ${Math.ceil(i / BATCH_SIZE) + 1}/${Math.ceil(total / BATCH_SIZE)}...`)
                await axios.post('/api/analyze_batch', { corpus_ids: batchIds }, config)
                setProgress(Math.min(((i + BATCH_SIZE) / total) * 100, 100))
            }

            setStatusMsg("更新完成!")
            setLastUpdateTime(new Date().toLocaleString('zh-CN'))
            fetchChartData(selectedStock)
            fetchNewsDetails(selectedStock)

        } catch (e: any) {
            console.error(e)
            setStatusMsg(`错误: ${e.message}`)
        } finally {
            setIsUpdating(false)
        }
    }

    return (
        <div className="flex h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* Sidebar */}
            <div className="w-72 bg-slate-800/50 backdrop-blur-xl border-r border-slate-700/50 p-6 flex flex-col">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <TrendingUp className="text-white" size={20} />
                    </div>
                    <h1 className="text-xl font-bold text-white">Sentiment AI</h1>
                </div>

                {/* Stock List */}
                <div className="flex-1 overflow-y-auto">
                    <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">自选股</h2>
                    <div className="space-y-2">
                        {portfolios.map(p => (
                            <div
                                key={p.id}
                                onClick={() => setSelectedStock(p.stock_code)}
                                className={`p-3 rounded-lg cursor-pointer flex justify-between items-center transition-all duration-200 ${selectedStock === p.stock_code
                                    ? 'bg-indigo-600/20 border border-indigo-500/50 text-indigo-400'
                                    : 'bg-slate-700/30 hover:bg-slate-700/50 text-slate-300 border border-transparent'
                                    }`}
                            >
                                <span className="font-mono font-medium">{p.stock_code}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); deleteStock(p.id) }}
                                    className="text-slate-500 hover:text-red-400 transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={async () => {
                            const code = prompt("输入股票代码 (例如 600519)")
                            if (code && user) {
                                await supabase.from('user_portfolios').insert({ user_id: user.id, stock_code: code })
                                fetchPortfolios()
                            }
                        }}
                        className="w-full mt-4 flex items-center justify-center p-3 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-indigo-500 hover:text-indigo-400 transition-all"
                    >
                        <Plus size={16} className="mr-2" /> 添加股票
                    </button>
                </div>

                {/* Weight Sliders */}
                <div className="mt-6 pt-6 border-t border-slate-700/50">
                    <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">权重设置</h2>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-slate-400">新闻权重</span>
                                <span className="text-indigo-400 font-mono">{settings.news_weight}</span>
                            </div>
                            <input
                                type="range" min="0" max="1" step="0.1"
                                value={settings.news_weight}
                                onChange={(e) => setSettings({ ...settings, news_weight: parseFloat(e.target.value) })}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                        </div>
                        <div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-slate-400">股吧权重</span>
                                <span className="text-purple-400 font-mono">{settings.guba_weight}</span>
                            </div>
                            <input
                                type="range" min="0" max="1" step="0.1"
                                value={settings.guba_weight}
                                onChange={(e) => setSettings({ ...settings, guba_weight: parseFloat(e.target.value) })}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                        </div>
                    </div>
                </div>

                {/* User Info */}
                <div className="mt-6 pt-6 border-t border-slate-700/50">
                    <div className="text-sm text-slate-400 truncate">{user?.email}</div>
                    <button onClick={() => supabase.auth.signOut()} className="text-xs text-red-400 mt-1 hover:text-red-300">
                        退出登录
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-8 overflow-y-auto">
                {selectedStock ? (
                    <>
                        {/* Header */}
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-3xl font-bold text-white">
                                    <span className="font-mono text-indigo-400">{selectedStock}</span>
                                    <span className="mx-3 text-slate-600">—</span>
                                    <span className="text-slate-200">{stockName || '加载中...'}</span>
                                </h2>
                                {/* Stock Price Info Card */}
                                <div className="flex gap-4 mt-3">
                                    {stockInfo.close && (
                                        <>
                                            <div className="bg-slate-700/50 px-4 py-2 rounded-lg">
                                                <span className="text-slate-400 text-xs">收盘</span>
                                                <p className="text-white font-mono font-bold">¥{stockInfo.close.toFixed(2)}</p>
                                            </div>
                                            <div className="bg-slate-700/50 px-4 py-2 rounded-lg">
                                                <span className="text-slate-400 text-xs">开盘</span>
                                                <p className="text-white font-mono">¥{stockInfo.open?.toFixed(2)}</p>
                                            </div>
                                            <div className="bg-slate-700/50 px-4 py-2 rounded-lg">
                                                <span className="text-slate-400 text-xs">最高/最低</span>
                                                <p className="text-white font-mono text-sm">¥{stockInfo.high?.toFixed(2)} / ¥{stockInfo.low?.toFixed(2)}</p>
                                            </div>
                                            {stockInfo.changePercent !== null && (
                                                <div className={`px-4 py-2 rounded-lg ${stockInfo.changePercent >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                                                    <span className="text-slate-400 text-xs">涨跌幅</span>
                                                    <p className={`font-mono font-bold ${stockInfo.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                        {stockInfo.changePercent >= 0 ? '+' : ''}{stockInfo.changePercent.toFixed(2)}%
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleCleanupClick}
                                        disabled={isUpdating}
                                        className="flex items-center px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium disabled:opacity-50 transition-all"
                                        title="清理重复数据和英文AI分析"
                                    >
                                        <Trash2 className="mr-2" size={16} />
                                        清理数据
                                    </button>
                                    <button
                                        onClick={handleFullUpdate}
                                        disabled={isUpdating}
                                        className="flex items-center px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/25"
                                    >
                                        {isUpdating ? <Loader2 className="animate-spin mr-2" size={18} /> : <RefreshCw className="mr-2" size={18} />}
                                        {isUpdating ? "更新中..." : "立即运行数据更新"}
                                    </button>
                                </div>
                                {lastUpdateTime && (
                                    <span className="text-xs text-slate-500">上次更新: {lastUpdateTime}</span>
                                )}
                            </div>
                        </div>

                        {/* Progress Bar */}
                        {isUpdating && (
                            <div className="mb-6 bg-slate-800/50 backdrop-blur p-4 rounded-xl border border-slate-700/50">
                                <div className="flex justify-between text-sm text-slate-400 mb-2">
                                    <span>{statusMsg}</span>
                                    <span className="font-mono">{Math.round(progress)}%</span>
                                </div>
                                <div className="w-full bg-slate-700 rounded-full h-2">
                                    <div
                                        className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Dual-Axis Chart */}
                        <div className="bg-slate-800/50 backdrop-blur p-6 rounded-2xl border border-slate-700/50 mb-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <TrendingUp className="text-indigo-400" size={20} />
                                股价与情感因子
                            </h3>
                            <div className="h-80 min-w-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={chartData}>
                                        <defs>
                                            <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                                        <YAxis yAxisId="left" stroke="#6366f1" fontSize={12} />
                                        <YAxis yAxisId="right" orientation="right" domain={[-1, 1]} stroke="#a855f7" fontSize={12} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend />
                                        <Area yAxisId="left" type="monotone" dataKey="close" stroke="#6366f1" fill="url(#colorClose)" name="收盘价" />
                                        <Bar yAxisId="right" dataKey="sentiment" fill="#a855f7" barSize={8} radius={[4, 4, 0, 0]} name="情感分" />
                                        <Line yAxisId="right" type="monotone" dataKey="sentiment" stroke="#22c55e" strokeWidth={2} dot={false} name="情感趋势" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Technical Indicators Panel */}
                        {technicalData && (
                            <div className="bg-slate-800/50 backdrop-blur p-6 rounded-2xl border border-slate-700/50 mb-6">
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                    <BarChart3 className="text-cyan-400" size={20} />
                                    技术指标分析
                                    {loadingTechnical && <Loader2 className="animate-spin ml-2" size={16} />}
                                </h3>

                                {/* Indicator Cards */}
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    {/* MA Trend */}
                                    <div className="bg-slate-700/30 p-4 rounded-xl">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-slate-400 text-sm">均线趋势</span>
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${technicalData.signals.ma_trend === '多头排列' ? 'bg-green-500/20 text-green-400' : technicalData.signals.ma_trend === '空头排列' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                                {technicalData.signals.ma_trend}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500 space-y-1">
                                            <div>MA5: <span className="text-slate-300 font-mono">{technicalData.indicators.ma5}</span></div>
                                            <div>MA10: <span className="text-slate-300 font-mono">{technicalData.indicators.ma10}</span></div>
                                            <div>MA20: <span className="text-slate-300 font-mono">{technicalData.indicators.ma20}</span></div>
                                        </div>
                                    </div>

                                    {/* MACD Signal */}
                                    <div className="bg-slate-700/30 p-4 rounded-xl">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-slate-400 text-sm">MACD</span>
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${technicalData.signals.macd_signal.includes('金叉') || technicalData.signals.macd_signal.includes('多头') ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {technicalData.signals.macd_signal}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500 space-y-1">
                                            <div>DIF: <span className="text-slate-300 font-mono">{technicalData.indicators.macd_dif}</span></div>
                                            <div>DEA: <span className="text-slate-300 font-mono">{technicalData.indicators.macd_dea}</span></div>
                                            <div>柱状: <span className={`font-mono ${(technicalData.indicators.macd_hist || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{technicalData.indicators.macd_hist}</span></div>
                                        </div>
                                    </div>

                                    {/* RSI */}
                                    <div className="bg-slate-700/30 p-4 rounded-xl">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-slate-400 text-sm">RSI (14)</span>
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${technicalData.signals.rsi_signal === '超买' ? 'bg-red-500/20 text-red-400' : technicalData.signals.rsi_signal === '超卖' ? 'bg-green-500/20 text-green-400' : 'bg-slate-600/50 text-slate-300'}`}>
                                                {technicalData.signals.rsi_signal}
                                            </span>
                                        </div>
                                        <div className="text-2xl font-bold text-white font-mono">{technicalData.indicators.rsi}</div>
                                        <div className="w-full bg-slate-600 rounded-full h-2 mt-2">
                                            <div className={`h-2 rounded-full ${technicalData.indicators.rsi > 70 ? 'bg-red-500' : technicalData.indicators.rsi < 30 ? 'bg-green-500' : 'bg-cyan-500'}`} style={{ width: `${technicalData.indicators.rsi}%` }} />
                                        </div>
                                    </div>

                                    {/* KDJ */}
                                    <div className="bg-slate-700/30 p-4 rounded-xl">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-slate-400 text-sm">KDJ</span>
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${technicalData.signals.kdj_signal === '超买' ? 'bg-red-500/20 text-red-400' : technicalData.signals.kdj_signal === '超卖' ? 'bg-green-500/20 text-green-400' : 'bg-slate-600/50 text-slate-300'}`}>
                                                {technicalData.signals.kdj_signal}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500 space-y-1">
                                            <div>K: <span className="text-yellow-400 font-mono">{technicalData.indicators.k}</span></div>
                                            <div>D: <span className="text-cyan-400 font-mono">{technicalData.indicators.d}</span></div>
                                            <div>J: <span className="text-purple-400 font-mono">{technicalData.indicators.j}</span></div>
                                        </div>
                                    </div>
                                </div>

                                {/* MACD Chart */}
                                {technicalData.chart_data && (
                                    <div className="h-48 mb-6">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={technicalData.chart_data}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                                <XAxis dataKey="date" stroke="#64748b" fontSize={10} />
                                                <YAxis stroke="#64748b" fontSize={10} />
                                                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
                                                <ReferenceLine y={0} stroke="#475569" />
                                                <Bar dataKey="macd_hist" fill="#22c55e" name="MACD柱">
                                                    {technicalData.chart_data.map((entry: any, index: number) => (
                                                        <Bar key={index} fill={(entry.macd_hist || 0) >= 0 ? '#22c55e' : '#ef4444'} />
                                                    ))}
                                                </Bar>
                                                <Line type="monotone" dataKey="macd_dif" stroke="#f59e0b" strokeWidth={2} dot={false} name="DIF" />
                                                <Line type="monotone" dataKey="macd_dea" stroke="#3b82f6" strokeWidth={2} dot={false} name="DEA" />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}

                                {/* AI Analysis */}
                                {technicalData.ai_analysis && (
                                    <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 p-4 rounded-xl border border-cyan-500/20">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Activity className="text-cyan-400" size={18} />
                                            <span className="text-sm font-medium text-cyan-400">AI 技术分析</span>
                                        </div>
                                        <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">{technicalData.ai_analysis}</p>
                                    </div>
                                )}

                                {/* Indicator Explanations */}
                                <div className="mt-4 pt-4 border-t border-slate-700/50 grid grid-cols-2 gap-2 text-xs text-slate-500">
                                    <div>📈 MA: MA5{'>'}MA10{'>'}MA20 多头排列</div>
                                    <div>📊 MACD: DIF上穿DEA为金叉</div>
                                    <div>📉 RSI: {'>'}70超买 {'<'}30超卖</div>
                                    <div>⚡ KDJ: K{'>'}80超买 K{'<'}20超卖</div>
                                </div>
                            </div>
                        )}

                        {/* News Table */}
                        <div className="bg-slate-800/50 backdrop-blur p-6 rounded-2xl border border-slate-700/50">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Newspaper className="text-purple-400" size={20} />
                                新闻详情与AI分析
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-700">
                                            <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">日期</th>
                                            <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">标题</th>
                                            <th className="text-center py-3 px-4 text-slate-400 font-medium text-sm">情感分</th>
                                            <th className="text-left py-3 px-4 text-slate-400 font-medium text-sm">AI分析理由</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {newsData.map((item: any) => {
                                            const res = item.sentiment_results?.[0]
                                            const score = res?.news_score_raw ?? res?.guba_score_raw ?? 0
                                            return (
                                                <tr key={item.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                                                    <td className="py-3 px-4 text-slate-400 text-sm font-mono">
                                                        {new Date(item.publish_time).toLocaleDateString()}
                                                    </td>
                                                    <td
                                                        className="py-3 px-4 text-slate-200 text-sm max-w-xs truncate cursor-pointer hover:text-indigo-400 transition-colors"
                                                        onClick={() => setSelectedArticle(item)}
                                                        title="点击查看全文"
                                                    >
                                                        {item.title}
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-mono font-medium ${score > 0 ? 'bg-green-500/20 text-green-400' :
                                                            score < 0 ? 'bg-red-500/20 text-red-400' :
                                                                'bg-slate-600/20 text-slate-400'
                                                            }`}>
                                                            {score.toFixed(2)}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-slate-400 text-sm max-w-md truncate">
                                                        {res?.summary || '-'}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                                {newsData.length === 0 && (
                                    <div className="text-center py-8 text-slate-500">
                                        暂无分析数据，请点击"立即运行数据更新"
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex h-full items-center justify-center">
                        <div className="text-center">
                            <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <TrendingUp className="text-slate-600" size={40} />
                            </div>
                            <p className="text-slate-400 text-lg">选择一个股票开始分析</p>
                            <p className="text-slate-600 text-sm mt-1">在左侧添加或选择股票</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Article Modal */}
            {selectedArticle && (
                <div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-8"
                    onClick={() => setSelectedArticle(null)}
                >
                    <div
                        className="bg-slate-800 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-slate-700/50 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="sticky top-0 bg-slate-800 border-b border-slate-700/50 p-6">
                            <h3 className="text-xl font-bold text-white pr-8">{selectedArticle.title}</h3>
                            <div className="flex items-center gap-4 mt-2 text-sm">
                                <span className="text-slate-400">
                                    {new Date(selectedArticle.publish_time).toLocaleString('zh-CN')}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs ${selectedArticle.source === 'news' ? 'bg-blue-500/20 text-blue-400' : selectedArticle.source === 'report' ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'}`}>
                                    {selectedArticle.source === 'news' ? '新闻' : selectedArticle.source === 'report' ? '研报' : '股吧'}
                                </span>
                            </div>
                        </div>
                        <div className="p-6">
                            <div className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                                {selectedArticle.content || '暂无详细内容'}
                            </div>
                            {selectedArticle.sentiment_results?.[0]?.summary && (
                                <div className="mt-6 p-4 bg-slate-700/30 rounded-xl border border-slate-600/50">
                                    <p className="text-xs text-slate-400 mb-2">AI 分析</p>
                                    <p className="text-slate-300">{selectedArticle.sentiment_results[0].summary}</p>
                                </div>
                            )}
                        </div>
                        <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700/50 p-4 flex justify-end">
                            <button
                                onClick={() => setSelectedArticle(null)}
                                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                            >
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cleanup Confirmation Modal */}
            {showCleanupConfirm && (
                <div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-8"
                    onClick={() => setShowCleanupConfirm(false)}
                >
                    <div
                        className="bg-slate-800 rounded-2xl max-w-md w-full p-6 border border-slate-700/50 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-xl font-bold text-white mb-4">确认清理数据</h3>
                        <p className="text-slate-300 mb-6">
                            这将删除重复数据和英文AI分析，并重新生成中文分析。确定继续？
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowCleanupConfirm(false)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleCleanupConfirm}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                            >
                                确认清理
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
