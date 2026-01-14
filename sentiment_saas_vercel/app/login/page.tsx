"use client"
import { createClient } from "@/lib/supabase"
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export default function Login() {
    const supabase = createClient()
    const router = useRouter()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                router.push('/dashboard')
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    if (!mounted) return null

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full bg-white p-8 rounded shadow">
                <h1 className="text-2xl font-bold mb-6 text-center">Sentiment SaaS Login</h1>
                <Auth
                    supabaseClient={supabase}
                    appearance={{ theme: ThemeSupa }}
                    providers={['github']}
                    redirectTo={`${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard`}
                />
            </div>
        </div>
    )
}
