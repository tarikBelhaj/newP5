import { createServerClient, type CookieOptions } from '@supabase/ssr'
import * as supabaseJs from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Server-side Supabase client (uses anon key + RLS).
 * Lazy — only call inside server components / API routes, never at module level.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      '[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.\n' +
      'Add them to .env.local to enable authentication and database access.'
    )
  }

  const cookieStore = await cookies()

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from a Server Component — middleware handles cookie refresh
        }
      },
    },
  })
}

/**
 * Admin Supabase client (bypasses RLS).
 * Only for server-side trusted operations (webhooks, status updates).
 */
export async function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      '[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Add them to .env.local for admin operations.'
    )
  }

  const cookieStore = await cookies()

  return createServerClient(url, serviceKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch { /* server component */ }
      },
    },
  })
}

/**
 * Standalone admin client (no cookie context needed — for webhooks, status updates).
 * Uses @supabase/supabase-js directly (no SSR cookie layer needed here).
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      '[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Add them to .env.local for admin operations (webhooks, status updates).'
    )
  }

  // Import at the top of the file is fine — we just defer the instantiation
  return supabaseJs.createClient(url, serviceKey)
}
