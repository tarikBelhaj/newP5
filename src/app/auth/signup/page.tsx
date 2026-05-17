'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Loader2, Sparkles, Check } from 'lucide-react'

const PERKS = [
  '3 free credits on signup',
  'Access to all 10 templates',
  'No credit card required',
]

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!agreed) {
      toast.error('Please accept the terms and consent policy')
      return
    }
    setLoading(true)

    try {
      // Lazy import — never executed during SSR prerender
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success('Account created! Check your email to confirm.')
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex flex-wrap justify-center gap-3 mb-6">
        {PERKS.map((p, i) => (
          <span key={i} className="flex items-center gap-1.5 text-volt-500 font-mono text-xs">
            <Check size={12} />
            {p}
          </span>
        ))}
      </div>

      <div className="glass border border-white/10 rounded-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="font-display font-bold text-3xl text-white mb-2">Start creating</h1>
          <p className="text-white/50 font-body text-sm">Get 3 free credits. No card needed.</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block font-mono text-xs text-white/50 uppercase tracking-wider mb-2">
              Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Your name"
              required
              className="input-dark"
            />
          </div>

          <div>
            <label className="block font-mono text-xs text-white/50 uppercase tracking-wider mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="input-dark"
            />
          </div>

          <div>
            <label className="block font-mono text-xs text-white/50 uppercase tracking-wider mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              minLength={8}
              className="input-dark"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer group">
            <div
              className={`mt-0.5 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                agreed ? 'bg-volt-500 border-volt-500' : 'border-white/20 group-hover:border-white/40'
              }`}
              onClick={() => setAgreed(!agreed)}
            >
              {agreed && <Check size={12} className="text-ink-950" />}
            </div>
            <span className="text-white/50 font-body text-xs leading-relaxed">
              I confirm I have rights or consent for any face I upload. I agree to the{' '}
              <Link href="/terms" className="text-volt-500 hover:underline">Terms</Link>,{' '}
              <Link href="/privacy" className="text-volt-500 hover:underline">Privacy Policy</Link>, and{' '}
              <Link href="/consent" className="text-volt-500 hover:underline">Consent Policy</Link>.
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !agreed}
            className="btn-volt w-full py-3.5 rounded-xl text-base disabled:opacity-40 disabled:cursor-not-allowed mt-2"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {loading ? 'Creating account...' : 'Create free account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-white/40 font-body text-sm">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-volt-500 hover:text-volt-400 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
