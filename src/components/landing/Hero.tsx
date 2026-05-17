'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, EyeOff, Zap } from 'lucide-react'

const ROTATING_ENDS = [
  'as any character.',
  'without showing your face.',
  'as an AI-generated persona.',
  'as any fictional character.',
  'with full privacy.',
]

export function Hero() {
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false)
      setTimeout(() => { setIdx(i => (i + 1) % ROTATING_ENDS.length); setVisible(true) }, 300)
    }, 2600)
    return () => clearInterval(t)
  }, [])

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 pt-24 pb-16">
      <div className="absolute inset-0 bg-grid" />
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(200,255,0,0.08) 0%, transparent 70%)',
      }} />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px]" style={{
        background: 'radial-gradient(ellipse at center, rgba(255,61,255,0.06) 0%, transparent 70%)',
      }} />
      <div className="absolute top-1/4 left-[10%] w-64 h-64 rounded-full opacity-10 blur-3xl animate-float"
        style={{ background: '#C8FF00' }} />
      <div className="absolute top-1/3 right-[8%] w-48 h-48 rounded-full opacity-8 blur-3xl animate-float"
        style={{ background: '#FF3DFF', animationDelay: '2s' }} />

      <div className="relative z-10 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-volt-500/30 mb-8">
          <EyeOff size={14} className="text-volt-500" />
          <span className="font-mono text-xs text-volt-500 tracking-widest uppercase">
            Upload any character · full motion transfer
          </span>
        </div>

        <h1 className="font-display font-bold text-5xl sm:text-6xl lg:text-8xl leading-none tracking-tight mb-6">
          <span className="block text-white">Record yourself.</span>
          <span className="block text-volt-500 glow-volt-text">Post as any character.</span>
        </h1>

        <div className="flex items-center justify-center mt-4 mb-8 min-h-[36px]">
          <span
            className="font-display font-semibold text-xl sm:text-2xl text-white/70 transition-all duration-300"
            style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(8px)' }}
          >
            Create content{' '}
            <span className="text-ice-500">{ROTATING_ENDS[idx]}</span>
          </span>
        </div>

        <p className="font-body text-white/50 text-lg sm:text-xl max-w-2xl mx-auto mb-12 leading-relaxed">
          Upload your own video, add any character image — AI-generated or otherwise —
          and get a new video where that character performs your exact movements,
          expressions, and gestures.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link href="/auth/signup" className="btn-volt text-lg px-8 py-4 rounded-xl">
            <Zap size={20} />
            Try free — 3 videos
            <ArrowRight size={20} />
          </Link>
          <Link href="#how-it-works" className="btn-ghost text-lg px-8 py-4 rounded-xl">
            How it works
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-8 text-white/40">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {['bg-volt-500','bg-plasma-500','bg-ice-500','bg-orange-400','bg-blue-400'].map((c, i) => (
                <div key={i} className={`w-7 h-7 rounded-full ${c} border-2 border-ink-950`} />
              ))}
            </div>
            <span className="text-sm font-body"><span className="text-white font-medium">3,200+</span> creators</span>
          </div>
          <div className="w-px h-4 bg-white/10 hidden sm:block" />
          <span className="text-sm"><span className="text-white font-medium">24,000+</span> videos generated</span>
          <div className="w-px h-4 bg-white/10 hidden sm:block" />
          <span className="text-sm">
            <EyeOff size={13} className="inline mr-1 text-volt-500" />
            <span className="text-volt-500 font-medium">Zero</span> real faces published
          </span>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-ink-950 to-transparent" />
    </section>
  )
}
