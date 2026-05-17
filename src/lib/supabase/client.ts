import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client.
 * Called lazily — only when the user interacts with auth/storage features.
 * Will throw a clear error at runtime if env vars are missing.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      '[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.\n' +
      'Add them to .env.local to enable authentication.'
    )
  }

  return createBrowserClient(url, key)
}
