/**
 * Re-exports the AIProvider interface and related types from @/types.
 *
 * Concept: user video + any character image = same performance, different face.
 *
 * The user uploads any image source:
 * - AI-generated (ChatGPT, Midjourney, Gemini / Nano Banana, Stable Diffusion…)
 * - Authorized personal photo
 * - Fictional character
 * - Stock photo
 *
 * There is no mandatory avatar library. The character image is always user-supplied.
 */
export type {
  CharacterReplacementInput,
  CharacterReplacementOutput,
  AIProvider,
  GenerationStatus,
  AspectRatio,
  AIQuality,
  ProviderName,
} from '@/types'
