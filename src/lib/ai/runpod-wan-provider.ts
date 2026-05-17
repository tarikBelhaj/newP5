import type {
  AIProvider,
  CharacterReplacementInput,
  CharacterReplacementOutput,
} from '@/types'

/**
 * RunPod Serverless API — exact endpoint URLs
 *
 * POST  https://api.runpod.ai/v2/{endpoint_id}/run        — async submit
 * GET   https://api.runpod.ai/v2/{endpoint_id}/status/{id} — poll status
 *
 * Docs: https://docs.runpod.io/serverless/endpoints/send-requests
 */
const RUNPOD_BASE = 'https://api.runpod.ai/v2'

/**
 * RunPod job statuses (exact strings from their API)
 */
type RunPodStatus =
  | 'IN_QUEUE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMED_OUT'
  | 'CANCELLED'

/**
 * Shape returned by POST /run
 */
interface RunPodSubmitResponse {
  id: string
  status: RunPodStatus
}

/**
 * Shape returned by GET /status/{id}
 * output is defined entirely by the worker's handler function.
 * Our worker (see worker/handler.py) returns:
 *   { output_video_url: string }  on success
 *   { error: string }             on failure
 */
interface RunPodStatusResponse {
  id: string
  status: RunPodStatus
  output?: {
    output_video_url?: string
    error?: string
  }
  error?: string
  delayTime?: number
  executionTime?: number
}

/**
 * Input shape our RunPod worker handler expects.
 * Must match the handler.py input schema exactly.
 */
interface WanWorkerInput {
  user_video_url: string
  character_image_url: string
  quality: 'fast' | 'standard'
  mode: 'replacement' | 'animation'
  keep_original_audio: boolean
}

function getCredentials(): { apiKey: string; endpointId: string } {
  const apiKey    = process.env.RUNPOD_API_KEY
  const endpointId = process.env.RUNPOD_ENDPOINT_ID

  if (!apiKey) {
    throw new Error(
      '[RunPodWanProvider] Missing RUNPOD_API_KEY.\n' +
      'Set RUNPOD_API_KEY in .env.local.'
    )
  }

  if (!endpointId) {
    throw new Error(
      '[RunPodWanProvider] Missing RUNPOD_ENDPOINT_ID.\n' +
      'Set RUNPOD_ENDPOINT_ID in .env.local (found in RunPod console → Serverless → your endpoint).'
    )
  }

  return { apiKey, endpointId }
}

/**
 * WanAnimateRunPodProvider — GPU on demand via RunPod Serverless.
 *
 * Architecture:
 *   Next.js (Vercel) → RunPod Serverless endpoint → GPU worker (ComfyUI + Wan2.2-Animate)
 *                                                  → uploads output to Supabase Storage
 *                                                  → returns output_video_url
 *
 * The GPU worker only runs while processing a job (scale-to-zero).
 * No GPU cost between generations.
 *
 * Worker source: /worker/ directory in this repo.
 *
 * RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID are validated lazily —
 * safe to import at build time, never throws during Next.js build.
 */
export class WanAnimateRunPodProvider implements AIProvider {
  readonly name = 'wan-runpod' as const

  async generateCharacterReplacementVideo(
    input: CharacterReplacementInput
  ): Promise<CharacterReplacementOutput> {
    const { apiKey, endpointId } = getCredentials()

    const workerInput: WanWorkerInput = {
      user_video_url:       input.userVideoUrl,
      character_image_url:  input.characterImageUrl,
      quality:              input.quality,
      mode:                 (input.mode ?? 'replacement') as 'replacement' | 'animation',
      keep_original_audio:  input.keepOriginalAudio,
    }

    console.log('[RunPodWanProvider] Submitting job to endpoint:', endpointId)
    console.log('[RunPodWanProvider] mode:', workerInput.mode, '| quality:', workerInput.quality)

    const response = await fetch(`${RUNPOD_BASE}/${endpointId}/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        input: workerInput,
        policy: {
          executionTimeout: 600000, // 10 minutes max per job
          ttl: 3600000,             // job deleted after 1 hour if not picked up
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `[RunPodWanProvider] Submit failed (${response.status}): ${errorText}`
      )
    }

    const data = await response.json() as RunPodSubmitResponse

    if (!data.id) {
      throw new Error('[RunPodWanProvider] No job ID returned from RunPod')
    }

    console.log('[RunPodWanProvider] Job submitted:', data.id, '| initial status:', data.status)

    return {
      provider: 'wan-runpod',
      jobId: data.id,
      status: 'pending',
    }
  }

  async checkStatus(jobId: string): Promise<CharacterReplacementOutput> {
    const { apiKey, endpointId } = getCredentials()

    const response = await fetch(
      `${RUNPOD_BASE}/${endpointId}/status/${jobId}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` },
      }
    )

    if (!response.ok) {
      // 404 can mean job expired (TTL passed) — treat as failed
      if (response.status === 404) {
        return {
          provider: 'wan-runpod',
          jobId,
          status: 'failed',
          error: 'Job not found — may have expired (TTL) or been cancelled.',
        }
      }
      throw new Error(`[RunPodWanProvider] Status check failed (${response.status})`)
    }

    const data = await response.json() as RunPodStatusResponse

    switch (data.status) {
      case 'COMPLETED': {
        const videoUrl = data.output?.output_video_url
        if (!videoUrl) {
          const workerError = data.output?.error ?? 'No output_video_url in completed job'
          console.error('[RunPodWanProvider] Completed but no video URL:', data.output)
          return { provider: 'wan-runpod', jobId, status: 'failed', error: workerError }
        }
        return { provider: 'wan-runpod', jobId, status: 'completed', videoUrl }
      }

      case 'FAILED':
        return {
          provider: 'wan-runpod',
          jobId,
          status: 'failed',
          error: data.error ?? data.output?.error ?? 'RunPod worker failed',
        }

      case 'TIMED_OUT':
        return {
          provider: 'wan-runpod',
          jobId,
          status: 'failed',
          error: 'Job timed out on RunPod (execution exceeded 10 minutes)',
        }

      case 'CANCELLED':
        return {
          provider: 'wan-runpod',
          jobId,
          status: 'failed',
          error: 'Job was cancelled',
        }

      case 'IN_PROGRESS':
        return { provider: 'wan-runpod', jobId, status: 'processing' }

      case 'IN_QUEUE':
      default:
        return { provider: 'wan-runpod', jobId, status: 'pending' }
    }
  }
}
