'use client'

import { Check, Zap } from 'lucide-react'
import Link from 'next/link'
import { PRICING_PLANS } from '@/lib/pricing'
import { cn } from '@/lib/utils'

export function PricingSection() {
  return (
    <section id="pricing" className="relative py-28 px-4 overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(200,255,0,0.04) 0%, transparent 70%)' }}
      />
      <div className="absolute inset-0 bg-grid opacity-40" />

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-16">
          <span className="font-mono text-xs text-volt-500 tracking-widest uppercase mb-4 block">
            — Simple pricing —
          </span>
          <h2 className="font-display font-bold text-4xl sm:text-5xl text-white mb-5">
            Pay per video,{' '}
            <span className="text-volt-500">no subscription</span>
          </h2>
          <p className="text-white/50 font-body text-lg max-w-xl mx-auto">
            Buy credits when you need them. Credits never expire.
            Start with 3 free credits — no credit card needed.
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                'relative rounded-2xl p-7 flex flex-col border transition-all duration-300',
                plan.popular
                  ? 'glass border-volt-500/50 glow-volt scale-[1.03]'
                  : 'glass border-white/10 hover:border-white/20'
              )}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1.5 rounded-full bg-volt-500 text-ink-950 font-mono text-xs font-bold tracking-widest uppercase">
                    Most Popular
                  </span>
                </div>
              )}

              {/* Plan name */}
              <div className="mb-6">
                <h3 className="font-display font-bold text-2xl text-white mb-1">{plan.name}</h3>
                <p className="font-mono text-volt-500 text-sm">{plan.credits} video credits</p>
              </div>

              {/* Price */}
              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="font-display font-bold text-5xl text-white">${plan.price}</span>
                  <span className="text-white/40 font-body">one-time</span>
                </div>
                <p className="text-white/30 font-mono text-xs mt-1">
                  ${(plan.price / plan.credits).toFixed(2)} per video
                </p>
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div className={cn(
                      'mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0',
                      plan.popular ? 'bg-volt-500' : 'bg-white/10'
                    )}>
                      <Check size={10} className={plan.popular ? 'text-ink-950' : 'text-white/60'} />
                    </div>
                    <span className="font-body text-white/70 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href={`/auth/signup?plan=${plan.id}`}
                className={cn(
                  'w-full py-3.5 rounded-xl font-display font-semibold text-center transition-all duration-200 flex items-center justify-center gap-2',
                  plan.popular
                    ? 'bg-volt-500 text-ink-950 hover:bg-volt-400 hover:shadow-lg hover:shadow-volt-500/30'
                    : 'border border-white/20 text-white hover:border-white/40 hover:bg-white/5'
                )}
              >
                {plan.popular && <Zap size={16} />}
                Get {plan.credits} credits
              </Link>
            </div>
          ))}
        </div>

        {/* Free tier callout */}
        <div className="mt-10 text-center p-5 rounded-2xl border border-dashed border-white/15">
          <p className="text-white/50 font-body text-sm">
            Not ready to commit?{' '}
            <Link href="/auth/signup" className="text-volt-500 hover:text-volt-400 font-medium underline underline-offset-4">
              Sign up free
            </Link>{' '}
            and get <strong className="text-white">3 free credits</strong> — no card required. Ever.
          </p>
        </div>
      </div>
    </section>
  )
}
