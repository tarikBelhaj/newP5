// ─── AI layer types ───────────────────────────────────────────────────────────

export type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type AspectRatio = '9:16' | '1:1' | '16:9'
export type AIQuality = 'fast' | 'standard'
export type ProviderName = 'wan-runpod' | 'wan-vast' | 'wan-animate' | 'seedance' | 'mock'
export type GenerationMode = 'replacement' | 'animation'

/**
 * Core concept:
 *   userVideoUrl      — creator's recorded video (defines all motion)
 *   characterImageUrl — any uploaded character/person image (replaces visible identity)
 *   mode              — "replacement" (default) replaces the performer in the video
 *                       "animation" animates the character from the driving video
 *
 * "Record yourself. Post as any character."
 */
export interface CharacterReplacementInput {
  userVideoUrl: string
  characterImageUrl: string
  prompt?: string
  keepOriginalAudio: boolean
  aspectRatio: AspectRatio
  durationSeconds: number
  quality: AIQuality
  mode: GenerationMode
}

export interface CharacterReplacementOutput {
  provider: ProviderName
  jobId: string
  status: GenerationStatus
  videoUrl?: string
  error?: string
  /** The fal.ai endpoint used — needed for accurate status polling */
  endpoint?: string
}

export interface AIProvider {
  readonly name: ProviderName
  generateCharacterReplacementVideo(input: CharacterReplacementInput): Promise<CharacterReplacementOutput>
  checkStatus(jobId: string, endpoint?: string): Promise<CharacterReplacementOutput>
}

// ─── Database row types (match Supabase columns exactly) ─────────────────────

export interface DbGeneration {
  id: string
  user_id: string
  user_video_url: string
  character_image_url: string
  keep_original_audio: boolean
  prompt: string
  aspect_ratio: string
  quality: string
  mode: string
  provider: string
  job_id: string | null
  fal_endpoint: string | null
  status: string
  output_video_url: string | null
  error_message: string | null
  credits_used: number
  created_at: string
  updated_at: string
}

export interface DbProfile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  credits: number
  stripe_customer_id: string | null
  created_at: string
  updated_at: string
}

export interface DbCreditTransaction {
  id: string
  user_id: string
  amount: number
  type: 'purchase' | 'usage' | 'refund' | 'bonus'
  description: string
  stripe_payment_intent_id: string | null
  created_at: string
}

// ─── API shapes ───────────────────────────────────────────────────────────────

export interface GenerateRequest {
  userVideoUrl: string
  characterImageUrl: string
  keepOriginalAudio: boolean
  prompt?: string
  aspectRatio: AspectRatio
  quality?: AIQuality
  mode?: GenerationMode
}

export interface GenerateResponse {
  generationId: string
  jobId: string
  provider: ProviderName
  status: GenerationStatus
}

export interface StatusResponse {
  status: GenerationStatus
  videoUrl?: string
  error?: string
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

export interface PricingPlan {
  id: string
  name: string
  credits: number
  price: number
  priceId: string
  popular?: boolean
  features: string[]
}

// ─── Demo template (secondary feature) ───────────────────────────────────────

export type TemplateCategory = 'education' | 'social' | 'business' | 'fitness' | 'media' | 'fashion'

export interface DemoTemplate {
  id: string
  name: string
  description: string
  thumbnailUrl: string
  category: TemplateCategory
  aspectRatio: string
  durationSeconds: number
}
