/**
 * Test script: RunPod Wan2.2-Animate endpoint
 *
 * Usage:
 *   npm run test:runpod-wan
 *
 * Required env vars (set in .env.local or environment):
 *   RUNPOD_API_KEY=your_key
 *   RUNPOD_ENDPOINT_ID=your_endpoint_id
 *
 * Optional overrides:
 *   TEST_VIDEO_URL=https://...     (short face-camera video)
 *   TEST_IMAGE_URL=https://...     (character portrait image)
 *   TEST_MODE=replacement          ("replacement" or "animation")
 *   TEST_QUALITY=standard          ("fast" or "standard")
 *   POLL_INTERVAL_MS=5000
 *   TIMEOUT_MS=600000
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const envPath = resolve(__dirname, '../.env.local')
  try {
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      if (key && val && !process.env[key]) process.env[key] = val
    }
    console.log('✓ Loaded .env.local')
  } catch {
    console.log('⚠ No .env.local found — using process environment')
  }
}

loadEnv()

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY
const ENDPOINT_ID    = process.env.RUNPOD_ENDPOINT_ID
const RUNPOD_BASE    = 'https://api.runpod.ai/v2'

const TEST_VIDEO_URL = process.env.TEST_VIDEO_URL
  || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
const TEST_IMAGE_URL = process.env.TEST_IMAGE_URL
  || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=600&fit=crop&crop=face'
const TEST_MODE      = process.env.TEST_MODE    || 'replacement'
const TEST_QUALITY   = process.env.TEST_QUALITY || 'standard'
const POLL_MS        = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10)
const TIMEOUT_MS     = parseInt(process.env.TIMEOUT_MS || '600000', 10)

function validate() {
  const missing = []
  if (!RUNPOD_API_KEY) missing.push('RUNPOD_API_KEY')
  if (!ENDPOINT_ID)    missing.push('RUNPOD_ENDPOINT_ID')
  if (missing.length) {
    console.error('\n❌ Missing required environment variables:')
    missing.forEach(k => console.error(`   • ${k}`))
    console.error('\nAdd them to .env.local or set them in your environment.\n')
    process.exit(1)
  }
}

async function submitJob(input) {
  const res = await fetch(`${RUNPOD_BASE}/${ENDPOINT_ID}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RUNPOD_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      input,
      policy: { executionTimeout: 600000, ttl: 3600000 },
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Submit failed (${res.status}): ${text}`)
  return JSON.parse(text)
}

async function pollStatus(jobId) {
  const res = await fetch(`${RUNPOD_BASE}/${ENDPOINT_ID}/status/${jobId}`, {
    headers: { 'Authorization': `Bearer ${RUNPOD_API_KEY}` },
  })
  if (res.status === 404) return { id: jobId, status: 'FAILED', error: 'Job not found (TTL expired)' }
  if (!res.ok) throw new Error(`Status check failed (${res.status}): ${await res.text()}`)
  return res.json()
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  RunPod Wan2.2-Animate — Integration Test')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  validate()

  console.log(`Endpoint: ${ENDPOINT_ID}`)
  console.log(`Mode:     ${TEST_MODE}  |  Quality: ${TEST_QUALITY}`)
  console.log(`Video:    ${TEST_VIDEO_URL}`)
  console.log(`Image:    ${TEST_IMAGE_URL}\n`)

  console.log('Submitting job to RunPod...')
  let job
  try {
    job = await submitJob({
      user_video_url:      TEST_VIDEO_URL,
      character_image_url: TEST_IMAGE_URL,
      quality:             TEST_QUALITY,
      mode:                TEST_MODE,
      keep_original_audio: true,
    })
  } catch (err) {
    console.error('\n❌ Submit failed:', err.message)
    process.exit(1)
  }

  if (!job.id) {
    console.error('\n❌ No job ID returned:', JSON.stringify(job, null, 2))
    process.exit(1)
  }

  console.log(`\n✓ Job submitted`)
  console.log(`  Job ID: ${job.id}`)
  console.log(`  Status: ${job.status}\n`)
  console.log(`Polling every ${POLL_MS / 1000}s (timeout ${TIMEOUT_MS / 1000}s)...\n`)

  const start = Date.now()
  let prevStatus = job.status

  while (true) {
    if (Date.now() - start > TIMEOUT_MS) {
      console.error(`\n❌ Timeout after ${TIMEOUT_MS / 1000}s`)
      process.exit(1)
    }

    await sleep(POLL_MS)

    let s
    try { s = await pollStatus(job.id) }
    catch (err) { console.error(`  Poll error (retrying): ${err.message}`); continue }

    const elapsed = ((Date.now() - start) / 1000).toFixed(0)
    if (s.status !== prevStatus) {
      console.log(`  [${elapsed}s] ${prevStatus} → ${s.status}`)
      prevStatus = s.status
    } else {
      process.stdout.write(`  [${elapsed}s] ${s.status}...\r`)
    }

    if (s.status === 'COMPLETED') {
      console.log()
      const videoUrl = s.output?.output_video_url
      const workerErr = s.output?.error

      if (workerErr) {
        console.error(`\n❌ Worker error: ${workerErr}`)
        process.exit(1)
      }

      if (!videoUrl) {
        console.error('\n❌ COMPLETED but no output_video_url')
        console.error('   output:', JSON.stringify(s.output, null, 2))
        process.exit(1)
      }

      const totalS = ((Date.now() - start) / 1000).toFixed(1)
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('  ✅ SUCCESS')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(`  Job ID:     ${job.id}`)
      console.log(`  Total time: ${totalS}s`)
      if (s.executionTime) console.log(`  Exec time:  ${s.executionTime}ms`)
      console.log(`  Video URL:  ${videoUrl}`)
      console.log()
      process.exit(0)
    }

    if (['FAILED', 'TIMED_OUT', 'CANCELLED'].includes(s.status)) {
      console.log()
      const err = s.error || s.output?.error || `Job ended: ${s.status}`
      console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.error('  ❌ FAILED')
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.error(`  Status: ${s.status}`)
      console.error(`  Error:  ${err}`)
      if (s.output) console.error('  Output:', JSON.stringify(s.output, null, 2))
      console.error()
      process.exit(1)
    }
  }
}

main().catch(err => {
  console.error('\n❌ Unexpected error:', err.message)
  process.exit(1)
})
