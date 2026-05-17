import type {
  AIProvider,
  CharacterReplacementInput,
  CharacterReplacementOutput,
} from '@/types'

/**
 * MockProvider — simulates the full async job lifecycle for development.
 * Activate with MOCK_AI=true. No API key needed.
 *
 * Simulates: pending (0–5s) → processing (5–20s) → completed (20s+)
 */
export class MockProvider implements AIProvider {
  readonly name = 'mock' as const

  async generateCharacterReplacementVideo(
    input: CharacterReplacementInput
  ): Promise<CharacterReplacementOutput> {
    await new Promise<void>(r => setTimeout(r, 400))

    const jobId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    console.log('[MockProvider] Job created:', jobId)
    console.log('[MockProvider] userVideo:', input.userVideoUrl.slice(0, 60))
    console.log('[MockProvider] characterImage:', input.characterImageUrl.slice(0, 60))
    console.log('[MockProvider] keepAudio:', input.keepOriginalAudio, '| quality:', input.quality)

    return { provider: 'mock', jobId, status: 'pending' }
  }

  async checkStatus(jobId: string): Promise<CharacterReplacementOutput> {
    const parts = jobId.split('_')
    const timestamp = parseInt(parts[1] ?? '0', 10)
    const elapsed = Date.now() - timestamp

    if (elapsed < 5000)  return { provider: 'mock', jobId, status: 'pending' }
    if (elapsed < 20000) return { provider: 'mock', jobId, status: 'processing' }

    return {
      provider: 'mock',
      jobId,
      status: 'completed',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    }
  }
}
