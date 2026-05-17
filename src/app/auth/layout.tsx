import Link from 'next/link'
import { Zap } from 'lucide-react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-950 flex flex-col">
      <div className="absolute inset-0 bg-grid opacity-50" />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(200,255,0,0.06) 0%, transparent 60%)' }}
      />

      {/* Header */}
      <header className="relative z-10 p-6">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-volt-500 flex items-center justify-center">
            <Zap size={16} className="text-ink-950 fill-ink-950" />
          </div>
          <span className="font-display font-bold text-white text-lg tracking-tight">
            Motion<span className="text-volt-500">Avatar</span>
          </span>
        </Link>
      </header>

      {/* Content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
        {children}
      </div>
    </div>
  )
}
