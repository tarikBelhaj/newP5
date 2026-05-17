import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { PRICING_PLANS } from '@/lib/pricing'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as { planId: string }
    const plan = PRICING_PLANS.find(p => p.id === body.planId)

    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const stripe = getStripe()

    const { data: profileData } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single()

    let customerId = (profileData?.stripe_customer_id as string | null) ?? undefined

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: (profileData?.email as string | null) ?? user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Motion Avatar — ${plan.name} (${plan.credits} credits)`,
              description: `${plan.credits} video generation credits`,
            },
            unit_amount: plan.price * 100,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${appUrl}/dashboard?payment=success&credits=${plan.credits}`,
      cancel_url: `${appUrl}/dashboard?payment=cancelled`,
      metadata: {
        supabase_user_id: user.id,
        plan_id: body.planId,
        credits: plan.credits.toString(),
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checkout failed'
    console.error('[POST /api/credits/checkout]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
