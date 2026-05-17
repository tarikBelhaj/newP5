export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Video, Plus, CheckCircle, Loader, AlertCircle, Clock, EyeOff } from 'lucide-react'
import { formatDate, getStatusColor, getStatusLabel } from '@/lib/utils'
import type { DbGeneration, DbProfile } from '@/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: profileData }, { data: generationsData }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('generations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  const profile = profileData as DbProfile | null
  const generations = (generationsData ?? []) as DbGeneration[]

  const stats = {
    total: generations.length,
    completed: generations.filter(g => g.status === 'completed').length,
    processing: generations.filter(g => g.status === 'pending' || g.status === 'processing').length,
  }

  function StatusIcon({ status }: { status: string }) {
    if (status === 'completed') return <CheckCircle size={14} className="text-volt-500" />
    if (status === 'processing') return <Loader size={14} className="text-ice-500 animate-spin" />
    if (status === 'pending') return <Clock size={14} className="text-yellow-400" />
    if (status === 'failed') return <AlertCircle size={14} className="text-red-400" />
    return null
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-bold text-3xl text-white mb-1">
            Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-white/40 font-body text-sm">
            <span className="text-volt-500 font-semibold">{profile?.credits ?? 0} credits</span> remaining
          </p>
        </div>
        <Link href="/generate" className="btn-volt px-6 py-3 rounded-xl">
          <Plus size={18} />
          New anonymous video
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Videos generated', value: stats.total, icon: Video, color: 'text-white' },
          { label: 'Completed', value: stats.completed, icon: CheckCircle, color: 'text-volt-500' },
          { label: 'In progress', value: stats.processing, icon: Loader, color: 'text-ice-500' },
        ].map((stat, i) => {
          const Icon = stat.icon
          return (
            <div key={i} className="glass border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-xs text-white/40 uppercase tracking-wider">{stat.label}</span>
                <Icon size={16} className={stat.color} />
              </div>
              <span className={`font-display font-bold text-4xl ${stat.color}`}>{stat.value}</span>
            </div>
          )
        })}
      </div>

      {/* Recent */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-semibold text-xl text-white">Recent generations</h2>
          <Link href="/history" className="font-mono text-xs text-volt-500 hover:text-volt-400 transition-colors">
            View all →
          </Link>
        </div>

        {generations.length === 0 ? (
          <div className="glass border border-white/10 border-dashed rounded-2xl p-16 text-center">
            <EyeOff size={40} className="text-white/20 mx-auto mb-4" />
            <h3 className="font-display font-semibold text-white/60 text-lg mb-2">No videos yet</h3>
            <p className="text-white/30 font-body text-sm mb-6">
              Record yourself and post as an avatar — 3 free videos to start
            </p>
            <Link href="/generate" className="btn-volt px-6 py-3 rounded-xl">
              <Plus size={16} /> Create first video
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {generations.map((gen) => (
              <div key={gen.id} className="glass border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all">
                <div className="aspect-video bg-ink-800 relative">
                  {gen.output_video_url ? (
                    <video
                      src={gen.output_video_url}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      onMouseEnter={e => void (e.currentTarget as HTMLVideoElement).play()}
                      onMouseLeave={e => (e.currentTarget as HTMLVideoElement).pause()}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center">
                        <StatusIcon status={gen.status} />
                        <p className={`font-mono text-xs mt-2 ${getStatusColor(gen.status)}`}>
                          {getStatusLabel(gen.status)}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <span className={`badge glass border border-white/20 ${getStatusColor(gen.status)}`}>
                      <StatusIcon status={gen.status} />
                      {getStatusLabel(gen.status)}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <p className="font-display font-medium text-white text-sm mb-1 flex items-center gap-1.5">
                    <EyeOff size={12} className="text-volt-500" />
                    Anonymous avatar video
                  </p>
                  <div className="flex items-center gap-2 text-white/25 font-mono text-[10px] mb-3">
                    <span>{gen.aspect_ratio}</span>
                    <span>·</span>
                    <span>{gen.quality}</span>
                    <span>·</span>
                    <span>{gen.keep_original_audio ? 'audio kept' : 'silent'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-white/25">{formatDate(gen.created_at)}</span>
                    {gen.output_video_url && (
                      <a href={gen.output_video_url} download className="font-mono text-xs text-volt-500 hover:text-volt-400">
                        Download
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
