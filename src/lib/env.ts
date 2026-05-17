/**
 * Centralized environment variable access.
 *
 * Rules:
 * - Never throws at module load / build time.
 * - Throws at call time (runtime) with a clear message when a key is missing.
 * - Public vars (NEXT_PUBLIC_*) are safe to read anywhere.
 * - Private vars are only accessed inside API routes / server actions.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(
      `[env] Missing required environment variable: ${key}\n` +
      `Set it in .env.local before using this feature.`
    )
  }
  return value
}

function optionalEnv(key: string): string | undefined {
  return process.env[key] || undefined
}

// ─── Public (safe at build time) ──────────────────────────────────────────────

export const env = {
  // Supabase — public
  get SUPABASE_URL(): string {
    return requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  },
  get SUPABASE_ANON_KEY(): string {
    return requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  },

  // App
  get APP_URL(): string {
    return optionalEnv('NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3000'
  },

  // Supabase — private (server only)
  get SUPABASE_SERVICE_ROLE_KEY(): string {
    return requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  },

  // Stripe — private (server only)
  get STRIPE_SECRET_KEY(): string {
    return requireEnv('STRIPE_SECRET_KEY')
  },
  get STRIPE_WEBHOOK_SECRET(): string {
    return requireEnv('STRIPE_WEBHOOK_SECRET')
  },

  // AI
  get FAL_KEY(): string {
    return requireEnv('FAL_KEY')
  },
  get AI_PROVIDER(): string {
    return optionalEnv('AI_PROVIDER') ?? 'seedance'
  },
  get MOCK_AI(): boolean {
    return optionalEnv('MOCK_AI') === 'true'
  },

  // Check helpers (for conditional logic, no throw)
  hasSupabase(): boolean {
    return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  },
  hasFalKey(): boolean {
    return !!process.env.FAL_KEY
  },
  hasStripe(): boolean {
    return !!process.env.STRIPE_SECRET_KEY
  },
}
