import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import type Stripe from 'stripe'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json(
      { error: '[Stripe] Missing STRIPE_WEBHOOK_SECRET. Add it to .env.local.' },
      { status: 500 }
    )
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('[Stripe webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.supabase_user_id
    const credits = parseInt(session.metadata?.credits ?? '0', 10)

    if (!userId || !credits) {
      console.error('[Stripe webhook] Missing metadata:', session.metadata)
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
    }

    const admin = createServiceClient()

    const { data: profileData } = await admin
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single()

    if (profileData) {
      const current = profileData.credits as number
      await admin
        .from('profiles')
        .update({ credits: current + credits })
        .eq('id', userId)

      await admin.from('credit_transactions').insert({
        id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        user_id: userId,
        amount: credits,
        type: 'purchase',
        description: `Purchased ${credits} credits`,
        stripe_payment_intent_id: session.payment_intent as string,
      })

      console.log(`[Stripe webhook] Added ${credits} credits to user ${userId}`)
    }
  }

  return NextResponse.json({ received: true })
}
