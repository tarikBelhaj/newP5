import { createFalClient } from '@fal-ai/client'
import type {
  AIProvider,
  CharacterReplacementInput,
  CharacterReplacementOutput,
} from '@/types'

const ENDPOINTS = {
  standard: 'bytedance/seedance-2.0/reference-to-video',
  fast:     'bytedance/seedance-2.0/fast/reference-to-video',
} as const

type FalQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'

interface FalStatusResponse {
  status: FalQueueStatus
  error?: string
}

interface SeedanceResult {
  video?:  { url: string }
  output?: { video_url?: string }
  video_url?: string
}

/**
 * Build the motion-control prompt for character replacement.
 *
 * The user video drives all motion.
 * The character image defines the visible identity.
 * The user uploads any image — no library required.
 */
function buildCharacterPrompt(input: CharacterReplacementInput): string {
  const parts = [
    'Use the uploaded user video as the motion, expression, gesture,',
    'camera framing, timing, and audio reference.',
    'Replace the visible person in the video with the character or person',
    'from the uploaded character image.',
    'Preserve the exact performance, head movement, body movement,',
    'gesture rhythm, facial expression timing, and original audio when supported.',
    'The final video should look like the uploaded character naturally performed',
    "the user's recording.",
    "Do not reveal the original user's identity.",
  ]

  if (input.keepOriginalAudio) {
    parts.push('Keep the original audio. Synchronize lip movement with the audio when possible.')
  }

  if (input.prompt?.trim()) {
    parts.push(`Additional context: ${input.prompt.trim()}`)
  }

  return parts.join(' ')
}

/**
 * SeedanceProvider — Character replacement via fal.ai Seedance 2.0.
 *
 * Concept: user video + any character image = same performance, different face.
 * No avatar library required — the user uploads any image they choose.
 *
 * FAL_KEY is validated lazily — only when a method is called.
 * Safe to import at build time.
 */
export class SeedanceProvider implements AIProvider {
  readonly name = 'seedance' as const

  private getClient(): ReturnType<typeof createFalClient> {
    const apiKey = process.env.FAL_KEY
    if (!apiKey) {
      throw new Error(
        '[SeedanceProvider] Missing FAL_KEY.\n' +
        'Set FAL_KEY in .env.local, or set MOCK_AI=true to use the mock provider.'
      )
    }
    return createFalClient({ credentials: apiKey })
  }

  async generateCharacterReplacementVideo(
    input: CharacterReplacementInput
  ): Promise<CharacterReplacementOutput> {
    const client  = this.getClient()
    const endpoint = input.quality === 'fast' ? ENDPOINTS.fast : ENDPOINTS.standard
    const prompt  = buildCharacterPrompt(input)

    const payload: Record<string, unknown> = {
      reference_video_url: input.userVideoUrl,       // motion source
      image_url:           input.characterImageUrl,  // visual identity
      prompt,
      aspect_ratio: input.aspectRatio,
      duration:     input.durationSeconds,
    }

    console.log('[SeedanceProvider] Submitting character replacement to:', endpoint)

    const { request_id } = await client.queue.submit(endpoint, { input: payload })

    if (!request_id) {
      throw new Error('[SeedanceProvider] No request_id returned from fal.ai')
    }

    return { provider: 'seedance', jobId: request_id, status: 'pending' }
  }

  async checkStatus(jobId: string): Promise<CharacterReplacementOutput> {
    const client   = this.getClient()
    const endpoint = ENDPOINTS.standard

    const statusRes = await client.queue.status(endpoint, {
      requestId: jobId,
      logs: false,
    }) as FalStatusResponse

    if (statusRes.status === 'COMPLETED') {
      const result = await client.queue.result(endpoint, {
        requestId: jobId,
      }) as SeedanceResult

      const videoUrl =
        result.video?.url ??
        result.output?.video_url ??
        result.video_url

      if (!videoUrl) {
        return { provider: 'seedance', jobId, status: 'failed', error: 'No video URL in result' }
      }
      return { provider: 'seedance', jobId, status: 'completed', videoUrl }
    }

    if (statusRes.status === 'FAILED') {
      return {
        provider: 'seedance',
        jobId,
        status: 'failed',
        error: statusRes.error ?? 'Generation failed',
      }
    }

    return {
      provider: 'seedance',
      jobId,
      status: statusRes.status === 'IN_PROGRESS' ? 'processing' : 'pending',
    }
  }
}
