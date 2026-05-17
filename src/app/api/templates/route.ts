import { NextResponse } from 'next/server'
import { DEMO_TEMPLATES } from '@/lib/templates'

export async function GET() {
  return NextResponse.json({ templates: DEMO_TEMPLATES })
}
