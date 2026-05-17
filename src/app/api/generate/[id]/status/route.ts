import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getAIProvider } from '@/lib/ai'
import type { StatusResponse, DbGeneration, GenerationStatus } from '@/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: generationId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('generations')
      .select('*')
      .eq('id', generationId)
      .eq('user_id', user.id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 })
    }

    const gen = data as DbGeneration

    // Serve cached terminal states immediately
    if (gen.status === 'completed' || gen.status === 'failed') {
      const response: StatusResponse = {
        status: gen.status,
        videoUrl: gen.output_video_url ?? undefined,
        error: gen.error_message ?? undefined,
      }
      return NextResponse.json(response)
    }

    if (!gen.job_id) {
      return NextResponse.json({ status: gen.status as GenerationStatus } satisfies StatusResponse)
    }

    // Poll AI provider
    const aiProvider = getAIProvider()
    const aiResult = await aiProvider.checkStatus(gen.job_id, gen.fal_endpoint ?? undefined)

    // Persist status change to DB
    if (aiResult.status !== gen.status) {
      const admin = createServiceClient()

      const updateData: Record<string, unknown> = {
        status: aiResult.status,
        updated_at: new Date().toISOString(),
      }
      if (aiResult.videoUrl) updateData.output_video_url = aiResult.videoUrl
      if (aiResult.error) updateData.error_message = aiResult.error

      await admin.from('generations').update(updateData).eq('id', generationId)

      // Refund credit on failure
      if (aiResult.status === 'failed') {
        const { data: profileData } = await admin
          .from('profiles')
          .select('credits')
          .eq('id', user.id)
          .single()

        if (profileData) {
          const current = profileData.credits as number
          await admin
            .from('profiles')
            .update({ credits: current + gen.credits_used })
            .eq('id', user.id)

          await admin.from('credit_transactions').insert({
            id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            user_id: user.id,
            amount: gen.credits_used,
            type: 'refund',
            description: `Refund: generation ${generationId} failed`,
          })
        }
      }
    }

    const response: StatusResponse = {
      status: aiResult.status,
      videoUrl: aiResult.videoUrl,
      error: aiResult.error,
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error('[GET /api/generate/status]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
