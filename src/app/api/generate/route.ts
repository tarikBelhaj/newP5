import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAIProvider } from '@/lib/ai'
import type { GenerateRequest, GenerateResponse } from '@/types'

const CREDITS_PER_GENERATION = 1

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as GenerateRequest
    const {
      userVideoUrl,
      characterImageUrl,
      keepOriginalAudio,
      prompt,
      aspectRatio,
      quality = 'standard',
    } = body

    if (!userVideoUrl || !characterImageUrl || !aspectRatio) {
      return NextResponse.json(
        { error: 'Missing required fields: userVideoUrl, characterImageUrl, aspectRatio' },
        { status: 400 }
      )
    }

    if (prompt && prompt.length > 500) {
      return NextResponse.json({ error: 'Prompt too long (max 500 chars)' }, { status: 400 })
    }

    // Check credits before doing anything
    const { data: profileData } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single()

    const currentCredits = (profileData?.credits as number | null) ?? 0
    if (currentCredits < CREDITS_PER_GENERATION) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
    }

    // Submit AI job — credit deducted only on success
    const aiProvider = getAIProvider()
    let aiResult
    try {
      aiResult = await aiProvider.generateCharacterReplacementVideo({
        userVideoUrl,
        characterImageUrl,
        keepOriginalAudio: keepOriginalAudio ?? true,
        prompt: prompt ?? '',
        aspectRatio,
        durationSeconds: 30,
        quality,
        mode: (body.mode ?? 'replacement') as 'replacement' | 'animation',
      })
    } catch (aiError) {
      const message = aiError instanceof Error ? aiError.message : 'AI provider error'
      return NextResponse.json({ error: message }, { status: 502 })
    }

    // Deduct credit only after successful job submission
    await supabase
      .from('profiles')
      .update({ credits: currentCredits - CREDITS_PER_GENERATION })
      .eq('id', user.id)

    const txnId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await supabase.from('credit_transactions').insert({
      id: txnId,
      user_id: user.id,
      amount: -CREDITS_PER_GENERATION,
      type: 'usage',
      description: 'Character replacement generation',
    })

    const generationId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await supabase.from('generations').insert({
      id: generationId,
      user_id: user.id,
      user_video_url: userVideoUrl,
      character_image_url: characterImageUrl,
      keep_original_audio: keepOriginalAudio ?? true,
      prompt: prompt ?? '',
      aspect_ratio: aspectRatio,
      quality,
      mode: (body.mode ?? 'replacement'),
      provider: aiResult.provider,
      job_id: aiResult.jobId,
      fal_endpoint: aiResult.endpoint ?? null,
      status: aiResult.status,
      credits_used: CREDITS_PER_GENERATION,
    })

    const response: GenerateResponse = {
      generationId,
      jobId: aiResult.jobId,
      provider: aiResult.provider,
      status: aiResult.status,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[POST /api/generate]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
