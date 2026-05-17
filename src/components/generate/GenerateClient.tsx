'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import Image from 'next/image'
import toast from 'react-hot-toast'
import {
  ChevronRight, ChevronLeft, Upload, Video, ImageIcon,
  Mic, MicOff, Maximize2, Loader2, CheckCircle,
  AlertCircle, Download, RefreshCw, Zap, Gauge, EyeOff, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AspectRatio, AIQuality } from '@/types'

const STEPS = ['Your Video', 'Character Image', 'Settings', 'Generate']

const ASPECT_OPTIONS: { value: AspectRatio; label: string; desc: string }[] = [
  { value: '9:16', label: '9:16', desc: 'TikTok / Reels / Shorts' },
  { value: '1:1',  label: '1:1',  desc: 'Instagram / Feed' },
  { value: '16:9', label: '16:9', desc: 'YouTube / Web' },
]

const QUALITY_OPTIONS: { value: AIQuality; label: string; desc: string; icon: typeof Zap }[] = [
  { value: 'fast',     label: 'Fast',     desc: '~30s — good for testing', icon: Zap },
  { value: 'standard', label: 'Standard', desc: '~90s — best quality',     icon: Gauge },
]

const PROHIBITED_USES = [
  'Real people without their explicit consent',
  'Public figures or celebrities',
  'Minors (under 18)',
  'Sexual or explicit content',
  'Misleading political content',
  'Fraud, scam, or identity theft',
]

interface Props {
  initialCredits: number
  userId: string
}

interface GenerationResult {
  generationId: string
  status: string
  videoUrl?: string
}

export function GenerateClient({ initialCredits, userId }: Props) {
  const [step, setStep] = useState(0)
  const [credits, setCredits] = useState(initialCredits)

  // Step 0 — User video
  const [userVideoFile, setUserVideoFile]     = useState<File | null>(null)
  const [userVideoPreview, setUserVideoPreview] = useState<string | null>(null)
  const [userVideoUrl, setUserVideoUrl]       = useState<string | null>(null)
  const [uploadingVideo, setUploadingVideo]   = useState(false)

  // Step 1 — Character image
  const [charFile, setCharFile]         = useState<File | null>(null)
  const [charPreview, setCharPreview]   = useState<string | null>(null)
  const [charUrl, setCharUrl]           = useState<string | null>(null)
  const [uploadingChar, setUploadingChar] = useState(false)
  const [consentChecked, setConsentChecked] = useState(false)

  // Step 2 — Settings
  const [keepOriginalAudio, setKeepOriginalAudio] = useState(true)
  const [aspectRatio, setAspectRatio]             = useState<AspectRatio>('9:16')
  const [quality, setQuality]                     = useState<AIQuality>('standard')
  const [prompt, setPrompt]                       = useState('')

  // Step 3 — Generation
  const [generating, setGenerating] = useState(false)
  const [result, setResult]         = useState<GenerationResult | null>(null)

  // ─── User video upload ────────────────────────────────────

  const onDropVideo = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return
    setUserVideoFile(file)
    setUserVideoPreview(URL.createObjectURL(file))
    setUploadingVideo(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'mp4'
      const { data, error } = await supabase.storage
        .from('user-videos')
        .upload(`${userId}/${Date.now()}.${ext}`, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('user-videos').getPublicUrl(data.path)
      setUserVideoUrl(publicUrl)
      toast.success('Video uploaded!')
    } catch {
      toast.error('Upload failed. Please try again.')
      setUserVideoFile(null); setUserVideoPreview(null)
    } finally {
      setUploadingVideo(false)
    }
  }, [userId])

  const videoDropzone = useDropzone({
    onDrop: onDropVideo,
    accept: { 'video/*': ['.mp4', '.mov', '.webm'] },
    maxFiles: 1,
    maxSize: 200 * 1024 * 1024,
  })

  // ─── Character image upload ───────────────────────────────

  const onDropChar = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return
    setCharFile(file)
    setCharPreview(URL.createObjectURL(file))
    setUploadingChar(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'png'
      const { data, error } = await supabase.storage
        .from('character-images')
        .upload(`${userId}/${Date.now()}.${ext}`, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('character-images').getPublicUrl(data.path)
      setCharUrl(publicUrl)
      toast.success('Character image uploaded!')
    } catch {
      toast.error('Upload failed. Please try again.')
      setCharFile(null); setCharPreview(null)
    } finally {
      setUploadingChar(false)
    }
  }, [userId])

  const charDropzone = useDropzone({
    onDrop: onDropChar,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  })

  // ─── Generation ───────────────────────────────────────────

  async function handleGenerate() {
    if (!userVideoUrl || !charUrl) return
    if (credits < 1) { toast.error('No credits remaining'); return }

    setGenerating(true)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userVideoUrl,
          characterImageUrl: charUrl,
          keepOriginalAudio,
          prompt: prompt.trim() || undefined,
          aspectRatio,
          quality,
        }),
      })

      const data = await res.json() as {
        generationId?: string; status?: string; error?: string
      }
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')

      setResult({ generationId: data.generationId!, status: data.status! })
      setCredits(c => c - 1)
      toast.success('Character replacement job submitted!')
      startPolling(data.generationId!)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start generation')
    } finally {
      setGenerating(false)
    }
  }

  function startPolling(generationId: string) {
    const interval = setInterval(async () => {
      try {
        const res  = await fetch(`/api/generate/${generationId}/status`)
        const data = await res.json() as { status: string; videoUrl?: string; error?: string }
        setResult(prev => prev ? { ...prev, status: data.status, videoUrl: data.videoUrl } : prev)
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(interval)
          if (data.status === 'completed') {
            toast.success('Your anonymous character video is ready! 🎬')
          } else {
            toast.error('Generation failed — credit refunded.')
          }
        }
      } catch { /* keep polling */ }
    }, 3000)
    setTimeout(() => clearInterval(interval), 10 * 60 * 1000)
  }

  function resetAll() {
    setResult(null); setGenerating(false); setStep(0)
    setUserVideoFile(null); setUserVideoPreview(null); setUserVideoUrl(null)
    setCharFile(null); setCharPreview(null); setCharUrl(null)
    setConsentChecked(false)
    setKeepOriginalAudio(true); setAspectRatio('9:16'); setQuality('standard'); setPrompt('')
  }

  // Step 1 requires consent + uploaded image
  const canGoNext = [!!userVideoUrl, !!charUrl && consentChecked, true]

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto">
      {/* Credits */}
      <div className="flex items-center justify-between mb-8 px-5 py-3.5 rounded-xl glass border border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-volt-500 animate-pulse" />
          <span className="font-mono text-sm text-white/60">
            Credits: <span className="text-volt-500 font-bold">{credits}</span>
          </span>
        </div>
        <span className="font-mono text-xs text-white/25">1 credit per generation</span>
      </div>

      {/* Step indicator */}
      <div className="flex items-center mb-10">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center font-mono text-sm font-bold transition-all',
                i < step   ? 'bg-volt-500 text-ink-950' :
                i === step ? 'border-2 border-volt-500 text-volt-500 bg-volt-500/10' :
                             'border border-white/20 text-white/30'
              )}>
                {i < step ? <CheckCircle size={16} /> : i + 1}
              </div>
              <span className={cn(
                'font-mono text-[10px] mt-1.5 tracking-wide whitespace-nowrap',
                i === step ? 'text-volt-500' : i < step ? 'text-white/50' : 'text-white/20'
              )}>
                {s}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('flex-1 h-px mx-2 mt-[-18px]', i < step ? 'bg-volt-500/40' : 'bg-white/10')} />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="glass border border-white/10 rounded-2xl p-8 min-h-[440px]">

        {/* ─── Step 0: User video ─── */}
        {step === 0 && (
          <div>
            <h2 className="font-display font-bold text-2xl text-white mb-1">Upload your video</h2>
            <p className="text-white/40 font-body text-sm mb-6">
              Record yourself talking, gesturing, or performing face-camera.
              All your movements will be transferred to the character.
            </p>

            {!userVideoPreview ? (
              <div
                {...videoDropzone.getRootProps()}
                className={cn(
                  'border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-all duration-300',
                  videoDropzone.isDragActive
                    ? 'border-volt-500 bg-volt-500/10'
                    : 'border-white/20 hover:border-white/40 hover:bg-white/2'
                )}
              >
                <input {...videoDropzone.getInputProps()} />
                <Video size={44} className="text-white/20 mx-auto mb-4" />
                <p className="font-display font-semibold text-white/70 text-lg mb-2">
                  {videoDropzone.isDragActive ? 'Drop your video' : 'Drop your video, or click to browse'}
                </p>
                <p className="text-white/30 font-body text-sm">MP4, MOV, WebM · max 200MB</p>
                <p className="text-white/20 font-mono text-xs mt-2">
                  Face camera · good lighting · single person · natural movement
                </p>
              </div>
            ) : (
              <div className="flex gap-6 items-start">
                <div className="relative w-32 h-48 rounded-xl overflow-hidden border border-white/20 flex-shrink-0 bg-ink-800">
                  <video src={userVideoPreview} className="w-full h-full object-cover" muted loop autoPlay />
                  {uploadingVideo && (
                    <div className="absolute inset-0 bg-ink-950/80 flex items-center justify-center">
                      <Loader2 size={22} className="text-volt-500 animate-spin" />
                    </div>
                  )}
                </div>
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-3">
                    {uploadingVideo
                      ? <><Loader2 size={15} className="text-ice-500 animate-spin" /><span className="text-ice-500 font-mono text-sm">Uploading...</span></>
                      : <><CheckCircle size={15} className="text-volt-500" /><span className="text-volt-500 font-mono text-sm">Video ready</span></>
                    }
                  </div>
                  <p className="text-white/50 font-body text-sm mb-1">{userVideoFile?.name}</p>
                  <p className="text-white/25 font-mono text-xs mb-6">
                    {userVideoFile ? `${(userVideoFile.size / 1024 / 1024).toFixed(1)} MB` : ''}
                  </p>
                  <button
                    onClick={() => { setUserVideoFile(null); setUserVideoPreview(null); setUserVideoUrl(null) }}
                    className="text-red-400 hover:text-red-300 font-body text-sm flex items-center gap-1.5"
                  >
                    <Upload size={13} /> Replace video
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 p-4 rounded-xl border border-white/10 bg-white/2">
              <p className="text-white/40 font-body text-xs leading-relaxed">
                <strong className="text-white/60">Privacy:</strong> Your video is stored privately.
                It is only used to extract motion data for your generation. Only you can access it.
              </p>
            </div>
          </div>
        )}

        {/* ─── Step 1: Character image ─── */}
        {step === 1 && (
          <div>
            <h2 className="font-display font-bold text-2xl text-white mb-1">Upload your character image</h2>
            <p className="text-white/40 font-body text-sm mb-2">
              Upload any image of the character who will appear in the final video.
            </p>
            <p className="text-white/30 font-mono text-xs mb-6">
              Use any AI-generated character (ChatGPT, Midjourney, Gemini / Nano Banana),
              authorized personal photo, fictional character, or stock image.
              For best results, use a clear front-facing portrait.
            </p>

            {!charPreview ? (
              <div
                {...charDropzone.getRootProps()}
                className={cn(
                  'border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-all duration-300',
                  charDropzone.isDragActive
                    ? 'border-plasma-500 bg-plasma-500/10'
                    : 'border-white/20 hover:border-white/40 hover:bg-white/2'
                )}
              >
                <input {...charDropzone.getInputProps()} />
                <ImageIcon size={44} className="text-white/20 mx-auto mb-4" />
                <p className="font-display font-semibold text-white/70 text-lg mb-2">
                  {charDropzone.isDragActive ? 'Drop character image' : 'Drop character image, or click to browse'}
                </p>
                <p className="text-white/30 font-body text-sm">JPG, PNG, WebP · max 10MB</p>
                <p className="text-white/20 font-mono text-xs mt-2">
                  Front-facing · clear face · single subject · good lighting
                </p>
              </div>
            ) : (
              <div className="flex gap-6 items-start mb-6">
                <div className="relative w-32 h-40 rounded-xl overflow-hidden border border-white/20 flex-shrink-0">
                  <Image src={charPreview} alt="Character" fill className="object-cover" unoptimized />
                  {uploadingChar && (
                    <div className="absolute inset-0 bg-ink-950/80 flex items-center justify-center">
                      <Loader2 size={22} className="text-volt-500 animate-spin" />
                    </div>
                  )}
                </div>
                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-3">
                    {uploadingChar
                      ? <><Loader2 size={15} className="text-ice-500 animate-spin" /><span className="text-ice-500 font-mono text-sm">Uploading...</span></>
                      : <><CheckCircle size={15} className="text-volt-500" /><span className="text-volt-500 font-mono text-sm">Character image ready</span></>
                    }
                  </div>
                  <p className="text-white/50 font-body text-sm mb-1">{charFile?.name}</p>
                  <p className="text-white/25 font-mono text-xs mb-6">
                    {charFile ? `${(charFile.size / 1024 / 1024).toFixed(2)} MB` : ''}
                  </p>
                  <button
                    onClick={() => { setCharFile(null); setCharPreview(null); setCharUrl(null); setConsentChecked(false) }}
                    className="text-red-400 hover:text-red-300 font-body text-sm flex items-center gap-1.5"
                  >
                    <Upload size={13} /> Change image
                  </button>
                </div>
              </div>
            )}

            {/* Mandatory consent checkbox */}
            <div className="p-5 rounded-xl border border-yellow-500/30 bg-yellow-500/5 space-y-4">
              <div className="flex items-start gap-2 mb-1">
                <ShieldCheck size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="font-display font-semibold text-yellow-400 text-sm">Content policy — required</p>
              </div>

              <div className="font-body text-xs text-white/40 leading-relaxed space-y-1">
                <p className="font-semibold text-white/60 mb-2">Prohibited uses:</p>
                {PROHIBITED_USES.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-red-400 text-[10px]">✕</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <label className="flex items-start gap-3 cursor-pointer group mt-3">
                <div
                  role="checkbox"
                  aria-checked={consentChecked}
                  onClick={() => setConsentChecked(c => !c)}
                  className={cn(
                    'mt-0.5 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-all',
                    consentChecked
                      ? 'bg-volt-500 border-volt-500'
                      : 'border-white/30 group-hover:border-white/50'
                  )}
                >
                  {consentChecked && <CheckCircle size={12} className="text-ink-950" />}
                </div>
                <span className="text-white/60 font-body text-xs leading-relaxed">
                  I confirm I have the rights or permission to use this image.
                  I will not use this tool to impersonate real people without consent,
                  create misleading content, or violate the content policy above.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* ─── Step 2: Settings ─── */}
        {step === 2 && (
          <div className="space-y-7">
            <div>
              <h2 className="font-display font-bold text-2xl text-white mb-1">Settings</h2>
              <p className="text-white/40 font-body text-sm">Configure your anonymous character video.</p>
            </div>

            {/* Audio */}
            <div>
              <label className="block font-mono text-xs text-white/50 uppercase tracking-wider mb-3">Audio</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: true,  label: 'Keep my audio', desc: 'Original voice preserved', icon: Mic },
                  { value: false, label: 'Remove audio',  desc: 'Silent output',             icon: MicOff },
                ].map(opt => {
                  const Icon = opt.icon
                  return (
                    <button
                      key={String(opt.value)}
                      onClick={() => setKeepOriginalAudio(opt.value)}
                      className={cn(
                        'p-4 rounded-xl border-2 text-left transition-all',
                        keepOriginalAudio === opt.value
                          ? 'border-volt-500 bg-volt-500/10'
                          : 'border-white/10 hover:border-white/25'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={15} className={keepOriginalAudio === opt.value ? 'text-volt-500' : 'text-white/40'} />
                        <span className={cn('font-display font-semibold text-sm',
                          keepOriginalAudio === opt.value ? 'text-volt-500' : 'text-white/70'
                        )}>
                          {opt.label}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-white/30">{opt.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Aspect ratio */}
            <div>
              <label className="block font-mono text-xs text-white/50 uppercase tracking-wider mb-3">Output format</label>
              <div className="grid grid-cols-3 gap-3">
                {ASPECT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setAspectRatio(opt.value)}
                    className={cn(
                      'p-4 rounded-xl border-2 text-center transition-all',
                      aspectRatio === opt.value
                        ? 'border-volt-500 bg-volt-500/10'
                        : 'border-white/10 hover:border-white/25'
                    )}
                  >
                    <Maximize2 size={17} className={cn('mx-auto mb-2', aspectRatio === opt.value ? 'text-volt-500' : 'text-white/30')} />
                    <p className={cn('font-mono font-bold text-sm', aspectRatio === opt.value ? 'text-volt-500' : 'text-white/60')}>
                      {opt.label}
                    </p>
                    <p className="font-body text-[11px] text-white/25 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Quality */}
            <div>
              <label className="block font-mono text-xs text-white/50 uppercase tracking-wider mb-3">Generation quality</label>
              <div className="grid grid-cols-2 gap-3">
                {QUALITY_OPTIONS.map(opt => {
                  const Icon = opt.icon
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setQuality(opt.value)}
                      className={cn(
                        'p-4 rounded-xl border-2 text-left transition-all',
                        quality === opt.value
                          ? 'border-volt-500 bg-volt-500/10'
                          : 'border-white/10 hover:border-white/25'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={15} className={quality === opt.value ? 'text-volt-500' : 'text-white/40'} />
                        <span className={cn('font-display font-semibold text-sm',
                          quality === opt.value ? 'text-volt-500' : 'text-white/70'
                        )}>
                          {opt.label}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-white/30">{opt.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Optional prompt */}
            <div>
              <label className="block font-mono text-xs text-white/50 uppercase tracking-wider mb-2">
                Additional instructions <span className="text-white/25 normal-case">(optional)</span>
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value.slice(0, 500))}
                placeholder="e.g. Maintain a professional tone. Keep the character's style consistent."
                rows={3}
                className="input-dark resize-none text-sm"
              />
              <p className="font-mono text-xs text-white/25 mt-1">{prompt.length}/500</p>
            </div>
          </div>
        )}

        {/* ─── Step 3: Generate ─── */}
        {step === 3 && (
          <div>
            {!result ? (
              <div>
                <h2 className="font-display font-bold text-2xl text-white mb-1">Generate anonymous video</h2>
                <p className="text-white/40 font-body text-sm mb-8">
                  The AI will replace you with the character while keeping all your movements.
                </p>

                {/* Summary */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="glass border border-white/10 rounded-xl p-4">
                    <p className="font-mono text-xs text-white/30 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <EyeOff size={11} /> Your video
                    </p>
                    {userVideoPreview && (
                      <div className="w-full h-20 rounded-lg overflow-hidden bg-ink-800">
                        <video src={userVideoPreview} className="w-full h-full object-cover" muted />
                      </div>
                    )}
                    <p className="font-mono text-[10px] text-white/30 mt-2 truncate">{userVideoFile?.name}</p>
                  </div>

                  <div className="glass border border-white/10 rounded-xl p-4">
                    <p className="font-mono text-xs text-white/30 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <ImageIcon size={11} /> Character
                    </p>
                    {charPreview && (
                      <div className="relative w-full h-20 rounded-lg overflow-hidden bg-ink-800">
                        <Image src={charPreview} alt="Character" fill className="object-cover" unoptimized />
                      </div>
                    )}
                    <p className="font-mono text-[10px] text-white/30 mt-2 truncate">{charFile?.name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[
                    { label: 'Audio',   value: keepOriginalAudio ? 'Keep original' : 'Remove' },
                    { label: 'Format',  value: aspectRatio },
                    { label: 'Quality', value: quality },
                  ].map(item => (
                    <div key={item.label} className="glass border border-white/10 rounded-xl p-3 text-center">
                      <p className="font-mono text-[10px] text-white/30 uppercase mb-1">{item.label}</p>
                      <p className="font-display font-semibold text-white text-sm capitalize">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-volt-500/30 bg-volt-500/5 mb-6">
                  <div>
                    <p className="font-mono text-xs text-white/40">Provider</p>
                    <p className="font-display font-semibold text-white text-sm">Seedance 2.0 — Character Replacement</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs text-white/40">Cost</p>
                    <p className="font-display font-bold text-volt-500">1 credit</p>
                  </div>
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={generating || credits < 1}
                  className="btn-volt w-full py-4 rounded-xl text-lg disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {generating
                    ? <><Loader2 size={20} className="animate-spin" /> Submitting...</>
                    : <><EyeOff size={20} /> Replace me with this character</>
                  }
                </button>

                {credits < 1 && (
                  <p className="text-center text-red-400 font-mono text-xs mt-3">No credits — please purchase more.</p>
                )}
              </div>
            ) : (
              <div className="text-center">
                {(result.status === 'pending' || result.status === 'processing') && (
                  <div className="py-16">
                    <div className="relative w-20 h-20 mx-auto mb-6">
                      <div className="absolute inset-0 rounded-full border-4 border-volt-500/20" />
                      <div className="absolute inset-0 rounded-full border-4 border-t-volt-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                    </div>
                    <h3 className="font-display font-bold text-2xl text-white mb-2">
                      {result.status === 'pending' ? 'In queue...' : 'Replacing your identity...'}
                    </h3>
                    <p className="text-white/40 font-body text-sm max-w-sm mx-auto">
                      {result.status === 'pending'
                        ? 'Your job is queued. Processing starts shortly.'
                        : 'Transferring all motion from your video to the character. ~30–90 seconds.'}
                    </p>
                  </div>
                )}

                {result.status === 'completed' && result.videoUrl && (
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <CheckCircle size={22} className="text-volt-500" />
                      <h3 className="font-display font-bold text-2xl text-white">Anonymous video ready!</h3>
                    </div>
                    <p className="text-white/40 font-body text-sm mb-6">
                      Same performance. Your character. Ready to post.
                    </p>
                    <div className="max-w-xs mx-auto rounded-2xl overflow-hidden border border-volt-500/30 mb-6">
                      <video src={result.videoUrl} controls autoPlay loop className="w-full" />
                    </div>
                    <div className="flex items-center justify-center gap-4">
                      <a href={result.videoUrl} download className="btn-volt px-7 py-3 rounded-xl">
                        <Download size={17} /> Download
                      </a>
                      <button onClick={resetAll} className="btn-ghost px-7 py-3 rounded-xl">
                        <RefreshCw size={15} /> New video
                      </button>
                    </div>
                  </div>
                )}

                {result.status === 'failed' && (
                  <div className="py-16">
                    <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
                    <h3 className="font-display font-bold text-2xl text-white mb-2">Generation failed</h3>
                    <p className="text-white/40 font-body mb-6">Your credit has been refunded automatically.</p>
                    <button onClick={resetAll} className="btn-volt px-7 py-3 rounded-xl">
                      <RefreshCw size={15} /> Try again
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      {!result && (
        <div className="flex items-center justify-between mt-5">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="btn-ghost px-5 py-2.5 rounded-xl text-sm disabled:opacity-30"
          >
            <ChevronLeft size={16} /> Back
          </button>
          {step < 3 && (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canGoNext[step]}
              className="btn-volt px-6 py-2.5 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue <ChevronRight size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
