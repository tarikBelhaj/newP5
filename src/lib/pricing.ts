import { PricingPlan } from '@/types'

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    credits: 10,
    price: 9,
    priceId: process.env.STRIPE_PRICE_STARTER || 'price_starter',
    features: [
      '10 video generations',
      'All 10 templates',
      '9:16 & 1:1 formats',
      'HD quality output',
      'Download videos',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    credits: 30,
    price: 19,
    priceId: process.env.STRIPE_PRICE_PRO || 'price_pro',
    popular: true,
    features: [
      '30 video generations',
      'All 10 templates',
      'All formats incl. 16:9',
      'HD quality output',
      'Priority processing',
      'Download videos',
    ],
  },
  {
    id: 'studio',
    name: 'Studio',
    credits: 100,
    price: 49,
    priceId: process.env.STRIPE_PRICE_STUDIO || 'price_studio',
    features: [
      '100 video generations',
      'All 10 templates',
      'All formats',
      'Ultra HD quality',
      'Priority processing',
      'Download videos',
      'API access (coming soon)',
    ],
  },
]
