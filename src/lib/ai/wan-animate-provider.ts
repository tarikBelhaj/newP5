import { createFalClient } from '@fal-ai/client'
import type {
  AIProvider,
  CharacterReplacementInput,
  CharacterReplacementOutput,
} from '@/types'

/**
 * Wan2.2-Animate endpoints on fal.ai
 *
 * replace — integrates a character image into an existing video,
 *            replacing the original performer while preserving scene
 *            lighting and color tone. Main mode for this app.
 *
 * move    — animates the character image to follow the motion in the
 *            driving video. Secondary/experimental mode.
 *
 * Docs:
 *   https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/replace/api
 *   https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/move/api
 */
const ENDPOINTS = {
  replacement: 'fal-ai/wan/v2.2-14b/animate/replace',
  animation:   'fal-ai/wan/v2.2-14b/animate/move',
} as const

type WanMode = keyof typeof ENDPOINTS

/**
 * Exact input schema for both Wan2.2-Animate endpoints (as of fal.ai docs):
 *
 * Required:
 *   video_url   string  — URL of the driving/reference video
 *   image_url   string  — URL of the character image
 *
 * Optional:
 *   resolution          "480p" | "580p" | "720p"   (default: "480p")
 *   guidance_scale      float                       (default: 1)
 *   num_inference_steps integer                     (default: 20)
 *   use_turbo           boolean                     (turbo mode)
 *   video_quality       "low"|"medium"|"high"|"maximum"  (default: "high")
 *   video_write_mode    "fast"|"balanced"|"small"        (default: "balanced")
 *   seed                integer
 *   enable_safety_checker         boolean
 *   enable_output_safety_checker  boolean
 *   shift               float  (1.0–10.0, default: 5)
 *   return_frames_zip   boolean
 *
 * NOTE: There is NO "prompt" input field for the replace/move endpoints.
 *       The model auto-generates the prompt. The output contains the
 *       auto-generated prompt string.
 *
 * NOTE: There is NO "aspect_ratio" input field for the replace endpoint.
 *       The output aspect ratio follows the input video_url.
 */
interface WanAnimateInput {
  video_url:                    string
  image_url:                    string
  resolution?:                  '480p' | '580p' | '720p'
  guidance_scale?:              number
  num_inference_steps?:         number
  use_turbo?:                   boolean
  video_quality?:               'low' | 'medium' | 'high' | 'maximum'
  video_write_mode?:            'fast' | 'balanced' | 'small'
  seed?:                        number
  enable_safety_checker?:       boolean
  enable_output_safety_checker?: boolean
  shift?:                       number
}

interface WanAnimateOutput {
  video: { url: string; content_type?: string; file_name?: string; file_size?: number }
  prompt: string
  seed: number
}

type FalQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'

interface FalStatusResponse {
  status: FalQueueStatus
  error?: string
}

/**
 * Map our quality setting to Wan2.2 parameters.
 *
 * fast     → use_turbo + lower steps + 480p
 * standard → no turbo  + more steps  + 580p
 */
function buildWanParams(
  input: CharacterReplacementInput,
  mode: WanMode
): WanAnimateInput {
  const isReplace = mode === 'replacement'
  const isFast = input.quality === 'fast'

  const params: WanAnimateInput = {
    video_url:             input.userVideoUrl,
    image_url:             input.characterImageUrl,
    resolution:            isFast ? '480p' : '580p',
    use_turbo:             isFast,
    num_inference_steps:   isFast ? 6 : 20,
    guidance_scale:        isFast ? 1 : 1,
    shift:                 isReplace ? 8 : 5,
    video_quality:         'high',
    video_write_mode:      'balanced',
    enable_safety_checker: false,
    enable_output_safety_checker: false,
  }

  return params
}

/**
 * WanAnimateProvider — character replacement via fal.ai Wan2.2-Animate.
 *
 * Primary mode: "replacement"
 *   Replaces the performer in the user's video with the character image.
 *   Preserves scene lighting, color tone, camera framing.
 *   Endpoint: fal-ai/wan/v2.2-14b/animate/replace
 *
 * Secondary mode: "animation"
 *   Animates the character image to follow the motion in the driving video.
 *   Endpoint: fal-ai/wan/v2.2-14b/animate/move
 *
 * FAL_KEY is validated lazily — safe to instantiate at build time.
 */
export class WanAnimateProvider implements AIProvider {
  readonly name = 'wan-animate' as const

  private getClient(): ReturnType<typeof createFalClient> {
    const apiKey = process.env.FAL_KEY
    if (!apiKey) {
      throw new Error(
        '[WanAnimateProvider] Missing FAL_KEY.\n' +
        'Set FAL_KEY in .env.local, or set MOCK_AI=true to use the mock provider.'
      )
    }
    return createFalClient({ credentials: apiKey })
  }

  async generateCharacterReplacementVideo(
    input: CharacterReplacementInput
  ): Promise<CharacterReplacementOutput> {
    const client = this.getClient()
    const mode   = (input.mode ?? 'replacement') as WanMode
    const endpoint = ENDPOINTS[mode] ?? ENDPOINTS.replacement
    const payload  = buildWanParams(input, mode)

    console.log('[WanAnimateProvider] Submitting to:', endpoint)
    console.log('[WanAnimateProvider] mode:', mode, '| quality:', input.quality)
    console.log('[WanAnimateProvider] resolution:', payload.resolution, '| turbo:', payload.use_turbo)

    const { request_id } = await client.queue.submit(endpoint, {
      input: payload,
    })

    if (!request_id) {
      throw new Error('[WanAnimateProvider] No request_id returned from fal.ai')
    }

    return { provider: 'wan-animate', jobId: request_id, status: 'pending', endpoint }
  }

  async checkStatus(jobId: string, endpoint?: string): Promise<CharacterReplacementOutput> {
    const client = this.getClient()
    // Default to replace endpoint for status checks
    const ep = endpoint ?? ENDPOINTS.replacement

    const statusRes = await client.queue.status(ep, {
      requestId: jobId,
      logs: false,
    }) as FalStatusResponse

    if (statusRes.status === 'COMPLETED') {
      const result = await client.queue.result(ep, {
        requestId: jobId,
      }) as { data: WanAnimateOutput }

      const videoUrl = result.data?.video?.url

      if (!videoUrl) {
        console.error('[WanAnimateProvider] Unexpected result shape:', result)
        return {
          provider: 'wan-animate',
          jobId,
          status: 'failed',
          error: 'No video URL in completed result',
        }
      }

      return { provider: 'wan-animate', jobId, status: 'completed', videoUrl }
    }

    if (statusRes.status === 'FAILED') {
      return {
        provider: 'wan-animate',
        jobId,
        status: 'failed',
        error: statusRes.error ?? 'Generation failed on Wan2.2-Animate',
      }
    }

    return {
      provider: 'wan-animate',
      jobId,
      status: statusRes.status === 'IN_PROGRESS' ? 'processing' : 'pending',
    }
  }
}
