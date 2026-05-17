'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Zap, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled ? 'glass border-b border-white/10 py-3' : 'py-5'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-volt-500 flex items-center justify-center group-hover:glow-volt transition-all">
            <Zap size={16} className="text-ink-950 fill-ink-950" />
          </div>
          <span className="font-display font-bold text-white text-lg tracking-tight">
            Motion<span className="text-volt-500">Avatar</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          <Link href="#how-it-works" className="font-body text-white/60 hover:text-white text-sm transition-colors">
            How it works
          </Link>
          <Link href="#templates" className="font-body text-white/60 hover:text-white text-sm transition-colors">
            Templates
          </Link>
          <Link href="#pricing" className="font-body text-white/60 hover:text-white text-sm transition-colors">
            Pricing
          </Link>
        </div>

        {/* Auth buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/auth/login" className="font-body text-white/70 hover:text-white text-sm transition-colors px-4 py-2">
            Log in
          </Link>
          <Link href="/auth/signup" className="btn-volt text-sm px-5 py-2.5 rounded-lg">
            <Zap size={14} />
            Get started
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden text-white/70 hover:text-white"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden glass border-t border-white/10 px-4 py-5 flex flex-col gap-4">
          <Link href="#how-it-works" className="text-white/70 font-body py-2" onClick={() => setOpen(false)}>How it works</Link>
          <Link href="#templates" className="text-white/70 font-body py-2" onClick={() => setOpen(false)}>Templates</Link>
          <Link href="#pricing" className="text-white/70 font-body py-2" onClick={() => setOpen(false)}>Pricing</Link>
          <div className="flex gap-3 pt-2 border-t border-white/10">
            <Link href="/auth/login" className="flex-1 text-center py-2.5 rounded-lg border border-white/20 text-white/70 font-body text-sm">
              Log in
            </Link>
            <Link href="/auth/signup" className="btn-volt flex-1 text-sm py-2.5 rounded-lg justify-center">
              Get started
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
