import type { AIProvider } from '@/types'
import { WanAnimateRunPodProvider } from './runpod-wan-provider'
import { VastWanProvider }          from './vast-wan-provider'
import { WanAnimateProvider }       from './wan-animate-provider'
import { SeedanceProvider }         from './seedance-provider'
import { MockProvider }             from './mock-provider'

export type {
  AIProvider,
  CharacterReplacementInput,
  CharacterReplacementOutput,
  GenerationStatus,
  AspectRatio,
  AIQuality,
  ProviderName,
  GenerationMode,
} from '@/types'

export { WanAnimateRunPodProvider } from './runpod-wan-provider'
export { VastWanProvider }          from './vast-wan-provider'
export { WanAnimateProvider }       from './wan-animate-provider'
export { SeedanceProvider }         from './seedance-provider'
export { MockProvider }             from './mock-provider'

/**
 * Provider factory — never throws at build time.
 *
 * AI_PROVIDER selection:
 *   MOCK_AI=true          → MockProvider
 *   wan-runpod            → WanAnimateRunPodProvider  (RunPod Serverless, recommended for production)
 *   wan-vast              → VastWanProvider            (Vast.ai Pod, recommended for validation)
 *   wan-animate           → WanAnimateProvider         (fal.ai, experimental)
 *   seedance              → SeedanceProvider           (fal.ai, experimental)
 */
export function getAIProvider(): AIProvider {
  const mockMode    = process.env.MOCK_AI === 'true'
  const providerEnv = process.env.AI_PROVIDER ?? 'wan-runpod'

  if (mockMode) return new MockProvider()

  if (providerEnv === 'wan-runpod') {
    if (process.env.RUNPOD_API_KEY && process.env.RUNPOD_ENDPOINT_ID)
      return new WanAnimateRunPodProvider()
    console.warn('[AI] wan-runpod: missing RUNPOD_API_KEY or RUNPOD_ENDPOINT_ID')
    return new MockProvider()
  }

  if (providerEnv === 'wan-vast') {
    if (process.env.VAST_API_KEY && process.env.VAST_INSTANCE_ID)
      return new VastWanProvider()
    console.warn('[AI] wan-vast: missing VAST_API_KEY or VAST_INSTANCE_ID')
    return new MockProvider()
  }

  if (providerEnv === 'wan-animate' && process.env.FAL_KEY) return new WanAnimateProvider()
  if (providerEnv === 'seedance'    && process.env.FAL_KEY) return new SeedanceProvider()

  console.warn(`[AI] Unknown or unconfigured AI_PROVIDER="${providerEnv}" — MockProvider`)
  return new MockProvider()
}
