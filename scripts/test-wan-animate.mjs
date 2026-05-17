/**
 * Test script: fal.ai Wan2.2-Animate endpoint
 *
 * Usage:
 *   npm run test:wan-animate
 *
 * Required: FAL_KEY in .env.local
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  try {
    const content = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i === -1) continue
      const k = t.slice(0, i).trim(), v = t.slice(i + 1).trim()
      if (k && v && !process.env[k]) process.env[k] = v
    }
  } catch { /* no .env.local */ }
}

loadEnv()

const FAL_KEY = process.env.FAL_KEY
const ENDPOINT = process.env.TEST_MODE === 'animation'
  ? 'fal-ai/wan/v2.2-14b/animate/move'
  : 'fal-ai/wan/v2.2-14b/animate/replace'

const VIDEO_URL = process.env.TEST_VIDEO_URL
  || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
const IMAGE_URL = process.env.TEST_IMAGE_URL
  || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=600&fit=crop&crop=face'

if (!FAL_KEY) {
  console.error('\n❌ Missing FAL_KEY in .env.local\n')
  process.exit(1)
}

const FAL_QUEUE = 'https://queue.fal.run'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  console.log(`\n━━━━ fal.ai Wan2.2-Animate Test ━━━━`)
  console.log(`Endpoint: ${ENDPOINT}`)
  console.log(`Video:    ${VIDEO_URL}`)
  console.log(`Image:    ${IMAGE_URL}\n`)

  const payload = {
    video_url: VIDEO_URL,
    image_url: IMAGE_URL,
    resolution: '480p',
    use_turbo: true,
    num_inference_steps: 6,
    video_quality: 'high',
    enable_safety_checker: false,
    enable_output_safety_checker: false,
  }

  console.log('Submitting to fal.ai queue...')
  const submitRes = await fetch(`${FAL_QUEUE}/${ENDPOINT}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!submitRes.ok) {
    const t = await submitRes.text()
    console.error(`\n❌ Submit failed (${submitRes.status}): ${t}`)
    process.exit(1)
  }

  const { request_id } = await submitRes.json()
  console.log(`✓ Job submitted: ${request_id}\n`)

  const start = Date.now()
  let prev = 'IN_QUEUE'

  while (true) {
    await sleep(5000)
    const res = await fetch(`${FAL_QUEUE}/requests/${request_id}/status`, {
      headers: { 'Authorization': `Key ${FAL_KEY}` },
    })
    const s = await res.json()
    const elapsed = ((Date.now() - start) / 1000).toFixed(0)

    if (s.status !== prev) { console.log(`  [${elapsed}s] ${prev} → ${s.status}`); prev = s.status }
    else process.stdout.write(`  [${elapsed}s] ${s.status}...\r`)

    if (s.status === 'COMPLETED') {
      const resultRes = await fetch(`${FAL_QUEUE}/requests/${request_id}`, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
      })
      const result = await resultRes.json()
      const videoUrl = result.video?.url || result.output?.video_url || result.video_url
      console.log(`\n\n✅ SUCCESS\n  Video: ${videoUrl}\n`)
      process.exit(0)
    }

    if (s.status === 'FAILED') {
      console.error(`\n\n❌ FAILED: ${s.error || 'unknown error'}\n`)
      process.exit(1)
    }

    if ((Date.now() - start) > 600000) {
      console.error('\n\n❌ Timeout\n')
      process.exit(1)
    }
  }
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1) })
