import Link from "next/link"


export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <header className="py-6 px-8 flex justify-between items-center border-b">
        <div className="text-2xl font-bold text-indigo-600">Sentiment SaaS</div>
        <Link href="/login" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
          Login
        </Link>
      </header>

      <main className="max-w-5xl mx-auto py-20 px-8 text-center">
        <h1 className="text-5xl font-extrabold mb-6 tracking-tight text-gray-900">
          AI-Powered Stock Sentiment Analysis
        </h1>
        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Leverage DeepSeek LLM to analyze news and Guba comments in real-time.
          Discover hidden market trends with our multi-source sentiment engine.
        </p>

        <Link href="/dashboard" className="px-8 py-4 bg-black text-white text-lg rounded-full font-semibold hover:bg-gray-800 transition">
          Get Started
        </Link>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 border rounded shadow-sm">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-xl font-bold mb-2">AI Analysis</h3>
            <p className="text-gray-500">Automated sentiment scoring using DeepSeek V3.</p>
          </div>
          <div className="p-6 border rounded shadow-sm">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-xl font-bold mb-2">Dynamic Charts</h3>
            <p className="text-gray-500">Adjust news vs social media weights in real-time.</p>
          </div>
          <div className="p-6 border rounded shadow-sm">
            <div className="text-4xl mb-4">⚡️</div>
            <h3 className="text-xl font-bold mb-2">Serverless</h3>
            <p className="text-gray-500">SaaS architecture built on Vercel & Supabase.</p>
          </div>
        </div>
      </main>
    </div>
  )
}
