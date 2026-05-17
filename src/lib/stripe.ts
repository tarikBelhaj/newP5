import Stripe from 'stripe'

let _stripe: Stripe | null = null

/**
 * Lazy Stripe client.
 * Never instantiated at module level — only when a checkout/webhook action runs.
 * Throws a clear error at runtime if STRIPE_SECRET_KEY is missing.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error(
      '[Stripe] Missing STRIPE_SECRET_KEY.\n' +
      'Add it to .env.local to enable payment features.'
    )
  }

  _stripe = new Stripe(key, {
    apiVersion: '2025-02-24.acacia',
    typescript: true,
  })

  return _stripe
}
