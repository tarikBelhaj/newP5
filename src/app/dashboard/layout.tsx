export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Zap, LayoutDashboard, Video, History, CreditCard } from 'lucide-react'
import { DashboardLogout } from '@/components/dashboard/DashboardLogout'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const navLinks = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/generate', icon: Video, label: 'Generate Video' },
    { href: '/history', icon: History, label: 'History' },
  ]

  return (
    <div className="min-h-screen bg-ink-950 flex">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-white/10 bg-ink-900/50">
        {/* Logo */}
        <div className="p-5 border-b border-white/10">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-volt-500 flex items-center justify-center">
              <Zap size={16} className="text-ink-950 fill-ink-950" />
            </div>
            <span className="font-display font-bold text-white tracking-tight">
              Motion<span className="text-volt-500">Avatar</span>
            </span>
          </Link>
        </div>

        {/* Credits display */}
        <div className="m-4 p-4 rounded-xl border border-volt-500/30 bg-volt-500/5">
          <p className="font-mono text-xs text-white/40 uppercase tracking-wider mb-1">Credits</p>
          <div className="flex items-baseline gap-1">
            <span className="font-display font-bold text-3xl text-volt-500">
              {profile?.credits ?? 0}
            </span>
            <span className="text-white/40 font-body text-sm">remaining</span>
          </div>
          <Link
            href="#pricing"
            className="mt-3 flex items-center gap-1.5 text-xs font-mono text-white/40 hover:text-volt-500 transition-colors"
          >
            <CreditCard size={12} />
            Buy more credits
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1">
          {navLinks.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all font-body text-sm group"
            >
              <Icon size={17} className="group-hover:text-volt-500 transition-colors" />
              {label}
            </Link>
          ))}
        </nav>

        {/* User + logout */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-volt-500/20 flex items-center justify-center">
              <span className="font-display font-bold text-volt-500 text-sm">
                {(profile?.full_name || profile?.email || 'U')[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-body text-white text-sm truncate">{profile?.full_name || 'User'}</p>
              <p className="font-mono text-white/30 text-xs truncate">{profile?.email}</p>
            </div>
          </div>
          <DashboardLogout />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />
        <div className="relative z-10">
          {children}
        </div>
      </main>
    </div>
  )
}
