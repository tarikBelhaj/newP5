export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GenerateClient } from '@/components/generate/GenerateClient'

export default async function GeneratePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .single()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl text-white mb-1">Generate Video</h1>
        <p className="text-white/40 font-body text-sm">
          Choose a template, upload a face, write a script — get a talking AI video.
        </p>
      </div>
      <GenerateClient initialCredits={profile?.credits ?? 0} userId={user.id} />
    </div>
  )
}
