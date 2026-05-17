export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDate, getStatusColor, getStatusLabel } from '@/lib/utils'
import { CheckCircle, Clock, Loader, AlertCircle, Download, EyeOff, Plus } from 'lucide-react'
import type { DbGeneration } from '@/types'

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data } = await supabase
    .from('generations')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const generations = (data ?? []) as DbGeneration[]

  function StatusIcon({ status }: { status: string }) {
    if (status === 'completed') return <CheckCircle size={14} className="text-volt-500" />
    if (status === 'processing') return <Loader size={14} className="text-ice-500 animate-spin" />
    if (status === 'pending') return <Clock size={14} className="text-yellow-400" />
    if (status === 'failed') return <AlertCircle size={14} className="text-red-400" />
    return null
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl text-white mb-1">Generation History</h1>
        <p className="text-white/40 font-body text-sm">{generations.length} anonymous avatar videos</p>
      </div>

      {generations.length === 0 ? (
        <div className="glass border border-white/10 border-dashed rounded-2xl p-20 text-center">
          <EyeOff size={48} className="text-white/15 mx-auto mb-4" />
          <h3 className="font-display font-semibold text-white/50 text-xl mb-2">No videos yet</h3>
          <p className="text-white/30 font-body text-sm mb-6">Your anonymous avatar videos will appear here</p>
          <Link href="/generate" className="btn-volt px-6 py-3 rounded-xl">
            <Plus size={16} /> Generate your first video
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {generations.map((gen) => (
            <div
              key={gen.id}
              className="glass border border-white/10 rounded-2xl p-5 flex items-center gap-5 hover:border-white/20 transition-all"
            >
              {/* Output thumbnail */}
              <div className="w-20 h-14 rounded-lg overflow-hidden bg-ink-800 flex-shrink-0">
                {gen.output_video_url ? (
                  <video src={gen.output_video_url} className="w-full h-full object-cover" muted />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <EyeOff size={16} className="text-white/20" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-display font-semibold text-white text-sm flex items-center gap-1.5">
                    <EyeOff size={12} className="text-volt-500" />
                    Anonymous avatar video
                  </span>
                  <span className={`badge glass border border-white/20 ${getStatusColor(gen.status)}`}>
                    <StatusIcon status={gen.status} />
                    {getStatusLabel(gen.status)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-white/25 font-mono text-[10px]">
                  <span>{formatDate(gen.created_at)}</span>
                  <span>·</span>
                  <span>{gen.aspect_ratio}</span>
                  <span>·</span>
                  <span>{gen.quality}</span>
                  <span>·</span>
                  <span>{gen.keep_original_audio ? '🔊 audio' : '🔇 silent'}</span>
                  <span>·</span>
                  <span>{gen.provider}</span>
                  <span>·</span>
                  <span>{gen.credits_used} credit</span>
                </div>
                {gen.prompt && (
                  <p className="text-white/30 font-body text-xs mt-1 truncate">
                    &ldquo;{gen.prompt}&rdquo;
                  </p>
                )}
              </div>

              {/* Download */}
              {gen.output_video_url && (
                <a
                  href={gen.output_video_url}
                  download
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-volt-500/30 text-volt-500 hover:bg-volt-500/10 font-mono text-xs transition-all flex-shrink-0"
                >
                  <Download size={13} /> Download
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
