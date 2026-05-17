'use client'

import { TrendingUp, ShieldCheck, Sparkles, Globe } from 'lucide-react'

const USE_CASES = [
  {
    icon: TrendingUp,
    title: 'TikTok & Reels creators',
    description: 'Grow your audience without ever showing your real face. Stay anonymous while building a personal brand.',
    color: 'text-volt-500',
    bg: 'bg-volt-500/10',
    border: 'border-volt-500/20',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy-conscious professionals',
    description: 'Share expertise and knowledge online without personal identity exposure. Perfect for sensitive industries.',
    color: 'text-ice-500',
    bg: 'bg-ice-500/10',
    border: 'border-ice-500/20',
  },
  {
    icon: Sparkles,
    title: 'Entertainers & storytellers',
    description: 'Create character-driven content. Voice actors, storytellers, and educators who want a consistent persona.',
    color: 'text-plasma-500',
    bg: 'bg-plasma-500/10',
    border: 'border-plasma-500/20',
  },
  {
    icon: Globe,
    title: 'Multilingual content creators',
    description: 'Record once, adapt to any language with avatar lip-sync. Scale your content globally without re-recording.',
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    border: 'border-orange-400/20',
  },
]

export function UseCases() {
  return (
    <section id="use-cases" className="relative py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <span className="font-mono text-xs text-volt-500 tracking-widest uppercase mb-4 block">
            — Who it&apos;s for —
          </span>
          <h2 className="font-display font-bold text-4xl sm:text-5xl text-white mb-5">
            Create content.{' '}
            <span className="text-volt-500">Stay private.</span>
          </h2>
          <p className="text-white/50 font-body text-lg max-w-xl mx-auto">
            Any creator who wants to build an audience without revealing their real identity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {USE_CASES.map((uc, i) => {
            const Icon = uc.icon
            return (
              <div key={i} className={`glass border ${uc.border} rounded-2xl p-6 hover:scale-[1.01] transition-all duration-300`}>
                <div className={`${uc.bg} w-11 h-11 rounded-xl flex items-center justify-center mb-4`}>
                  <Icon size={20} className={uc.color} />
                </div>
                <h3 className="font-display font-semibold text-white text-lg mb-2">{uc.title}</h3>
                <p className="font-body text-white/50 text-sm leading-relaxed">{uc.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
