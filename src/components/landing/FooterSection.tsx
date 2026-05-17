import Link from 'next/link'
import { Zap, Shield, Lock, Eye } from 'lucide-react'

const TRUST_ITEMS = [
  {
    icon: Shield,
    title: 'Explicit consent required',
    description: 'You confirm ownership or consent rights for every face you upload. We never use your images for training.',
    color: 'text-volt-500',
  },
  {
    icon: Lock,
    title: 'Secure storage',
    description: 'Source images are stored in private, encrypted buckets. Only you can access your files.',
    color: 'text-ice-500',
  },
  {
    icon: Eye,
    title: 'No data resale',
    description: 'We never sell your data to third parties. Your content is yours — period.',
    color: 'text-plasma-500',
  },
]

export function FooterSection() {
  return (
    <>
      {/* Trust / Consent section */}
      <section id="trust" className="py-20 px-4 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs text-volt-500 tracking-widest uppercase mb-4 block">
              — Ethical AI usage —
            </span>
            <h2 className="font-display font-bold text-3xl text-white mb-4">
              We take consent seriously
            </h2>
            <p className="text-white/50 font-body max-w-lg mx-auto">
              Motion Avatar is built with strict ethical guidelines around facial data and AI-generated content.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {TRUST_ITEMS.map((item, i) => {
              const Icon = item.icon
              return (
                <div key={i} className="glass border border-white/10 rounded-2xl p-6 text-center">
                  <div className="flex justify-center mb-4">
                    <Icon size={28} className={item.color} />
                  </div>
                  <h3 className="font-display font-semibold text-white mb-2">{item.title}</h3>
                  <p className="text-white/50 font-body text-sm leading-relaxed">{item.description}</p>
                </div>
              )
            })}
          </div>

          <div className="p-5 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
            <p className="text-yellow-400/80 font-body text-sm text-center leading-relaxed">
              <strong className="text-yellow-400">Usage policy:</strong> You must have explicit rights or consent to use any face
              in your uploads. Generating deepfakes, non-consensual intimate imagery, or content used for harassment
              is strictly prohibited and will result in immediate account termination.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-10 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-volt-500 flex items-center justify-center">
              <Zap size={13} className="text-ink-950 fill-ink-950" />
            </div>
            <span className="font-display font-bold text-white tracking-tight">
              Motion<span className="text-volt-500">Avatar</span>
            </span>
          </Link>

          <div className="flex items-center gap-6 text-white/40 text-sm font-body">
            <Link href="/privacy" className="hover:text-white/70 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white/70 transition-colors">Terms</Link>
            <Link href="/consent" className="hover:text-white/70 transition-colors">Consent policy</Link>
            <Link href="mailto:hello@motionavatar.ai" className="hover:text-white/70 transition-colors">Contact</Link>
          </div>

          <p className="text-white/25 font-mono text-xs">
            © {new Date().getFullYear()} Motion Avatar Templates
          </p>
        </div>
      </footer>
    </>
  )
}
