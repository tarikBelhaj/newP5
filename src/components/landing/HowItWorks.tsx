'use client'

import { Video, ImageIcon, Wand2, Share2 } from 'lucide-react'

const STEPS = [
  {
    number: '01', icon: Video, color: 'text-volt-500',
    bg: 'bg-volt-500/10', border: 'border-volt-500/30',
    title: 'Record yourself',
    description: 'Film yourself talking or performing face-camera. Your movements — gestures, expressions, head motion — define the final video.',
  },
  {
    number: '02', icon: ImageIcon, color: 'text-ice-500',
    bg: 'bg-ice-500/10', border: 'border-ice-500/30',
    title: 'Upload any character image',
    description: 'Use any image: AI-generated (ChatGPT, Midjourney, Gemini), a fictional character, authorized photo, or stock image. No library required.',
  },
  {
    number: '03', icon: Wand2, color: 'text-plasma-500',
    bg: 'bg-plasma-500/10', border: 'border-plasma-500/30',
    title: 'Generate your anonymous video',
    description: 'The AI transfers all your motion to the character — head movement, expressions, gestures, posture — while keeping your original audio.',
  },
  {
    number: '04', icon: Share2, color: 'text-orange-400',
    bg: 'bg-orange-400/10', border: 'border-orange-400/30',
    title: 'Post without fear',
    description: 'Download and publish on TikTok, Reels, or Shorts. Same energy, same performance. Different visible identity. Full privacy.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-28 px-4 overflow-hidden">
      <div className="absolute inset-0 opacity-50" style={{
        background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(0,245,255,0.04) 0%, transparent 70%)',
      }} />
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-20">
          <span className="font-mono text-xs text-volt-500 tracking-widest uppercase mb-4 block">
            — How it works —
          </span>
          <h2 className="font-display font-bold text-4xl sm:text-5xl text-white mb-5">
            Same performance.{' '}
            <span className="text-volt-500">Any character.</span>
          </h2>
          <p className="text-white/50 font-body text-lg max-w-xl mx-auto">
            Your movements, energy, and voice — performed by any character you upload.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            return (
              <div key={i} className={`relative p-6 rounded-2xl glass border ${step.border} hover:scale-[1.02] transition-all duration-300`}>
                <div className="font-mono text-5xl font-bold text-white/5 absolute top-4 right-5 select-none">{step.number}</div>
                <div className={`${step.bg} ${step.border} border w-12 h-12 rounded-xl flex items-center justify-center mb-5`}>
                  <Icon size={22} className={step.color} />
                </div>
                <h3 className="font-display font-semibold text-white text-lg mb-3 leading-tight">{step.title}</h3>
                <p className="font-body text-white/50 text-sm leading-relaxed">{step.description}</p>
              </div>
            )
          })}
        </div>

        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full glass border border-white/10">
            <div className="w-2 h-2 rounded-full bg-volt-500 animate-pulse" />
            <span className="font-mono text-sm text-white/60">
              Average generation time: <span className="text-volt-500 font-medium">~60 seconds</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
