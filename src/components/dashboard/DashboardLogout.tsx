'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

export function DashboardLogout() {
  const router = useRouter()

  async function handleLogout() {
    // Lazy import — safe during SSR
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-all font-body text-sm"
    >
      <LogOut size={15} />
      Sign out
    </button>
  )
}
