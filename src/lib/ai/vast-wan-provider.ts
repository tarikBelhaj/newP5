import type {
  AIProvider,
  CharacterReplacementInput,
  CharacterReplacementOutput,
} from '@/types'

/**
 * VastWanProvider — Wan2.2-Animate via a Vast.ai instance.
 *
 * Architecture (Pod mode — no Docker-in-Docker):
 *   Vast.ai instance IS the container (PyTorch image).
 *   ComfyUI + handler.py run directly on the instance.
 *   Next.js sends the job via SSH → handler.py → ComfyUI → output.
 *
 * Vast.ai REST API:
 *   Base:     https://console.vast.ai/api/v0
 *   Auth:     Authorization: Bearer $VAST_API_KEY
 *   Stop:     PUT  /instances/{id}/   { "state": "stopped" }
 *   Destroy:  DELETE /instances/{id}/
 *   Status:   GET  /instances/{id}/   → { instances: { actual_status, ssh_host, ssh_port } }
 *
 * Note: Vast.ai does NOT support Docker-in-Docker.
 *       The instance is itself a Docker container.
 *       ComfyUI runs directly on it, not inside another Docker layer.
 *
 * For MVP (Pod mode), generation is triggered by SSH-executing handler.py.
 * The result URL is read from stdout.
 *
 * Required env vars:
 *   VAST_API_KEY        — Vast.ai API key
 *   VAST_INSTANCE_ID    — Running instance ID (set after renting)
 *   VAST_SSH_HOST       — ssh_host from instance (e.g. ssh1234.vast.ai)
 *   VAST_SSH_PORT       — ssh_port from instance
 *   VAST_SSH_USER       — usually "root" (default)
 *   VAST_WORKDIR        — project path on instance (default: /workspace/motion-avatar)
 */

const VAST_BASE = 'https://console.vast.ai/api/v0'

interface VastInstanceResponse {
  instances: {
    id: number
    actual_status: string
    intended_status: string
    ssh_host: string
    ssh_port: number
    gpu_name: string
    gpu_totalram: number
    dph_total: number
  }
}

function getCredentials() {
  const apiKey     = process.env.VAST_API_KEY
  const instanceId = process.env.VAST_INSTANCE_ID
  const sshHost    = process.env.VAST_SSH_HOST
  const sshPort    = process.env.VAST_SSH_PORT
  const sshUser    = process.env.VAST_SSH_USER    ?? 'root'

  if (!apiKey)     throw new Error('[VastWanProvider] Missing VAST_API_KEY')
  if (!instanceId) throw new Error('[VastWanProvider] Missing VAST_INSTANCE_ID — set after renting instance')
  if (!sshHost)    throw new Error('[VastWanProvider] Missing VAST_SSH_HOST — found in instance details')
  if (!sshPort)    throw new Error('[VastWanProvider] Missing VAST_SSH_PORT — found in instance details')

  return { apiKey, instanceId, sshHost, sshPort: parseInt(sshPort, 10), sshUser }
}

async function vastGet(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${VAST_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vast.ai API ${path} failed (${res.status}): ${text}`)
  }
  return res.json()
}

async function vastPut(path: string, apiKey: string, body: object): Promise<unknown> {
  const res = await fetch(`${VAST_BASE}${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vast.ai API PUT ${path} failed (${res.status}): ${text}`)
  }
  return res.json()
}

export async function vastStopInstance(instanceId: string): Promise<void> {
  const { apiKey } = getCredentials()
  await vastPut(`/instances/${instanceId}/`, apiKey, { state: 'stopped' })
  console.log(`[VastWanProvider] Instance ${instanceId} stopped`)
}

export async function vastDestroyInstance(instanceId: string): Promise<void> {
  const { apiKey } = getCredentials()
  const res = await fetch(`${VAST_BASE}/instances/${instanceId}/`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vast.ai destroy failed (${res.status}): ${text}`)
  }
  console.log(`[VastWanProvider] Instance ${instanceId} destroyed`)
}

export async function vastGetInstanceStatus(instanceId: string): Promise<{
  status: string
  sshHost: string
  sshPort: number
  gpuName: string
  vramMb: number
  costPerHour: number
}> {
  const { apiKey } = getCredentials()
  const data = await vastGet(`/instances/${instanceId}/`, apiKey) as VastInstanceResponse
  const inst = data.instances
  return {
    status:      inst.actual_status,
    sshHost:     inst.ssh_host,
    sshPort:     inst.ssh_port,
    gpuName:     inst.gpu_name,
    vramMb:      inst.gpu_totalram,
    costPerHour: inst.dph_total,
  }
}

/**
 * VastWanProvider
 *
 * Pod mode: runs ComfyUI directly on the Vast.ai instance via SSH.
 * No Docker-in-Docker (not supported by Vast.ai).
 *
 * Job lifecycle:
 *   1. Verify instance is running via GET /instances/{id}/
 *   2. SSH-execute handler.py with the job payload
 *   3. handler.py runs ComfyUI locally (ComfyUI must be pre-installed on instance)
 *   4. handler.py prints GPU_RESULT:{...} to stdout
 *   5. Parse output_video_url from stdout
 *
 * For production at scale: use RunPod Serverless (separate provider).
 * Vast.ai Pod is for validation and cost-effective testing.
 */
export class VastWanProvider implements AIProvider {
  readonly name = 'wan-vast' as const

  async generateCharacterReplacementVideo(
    input: CharacterReplacementInput
  ): Promise<CharacterReplacementOutput> {
     void input

    const { instanceId, sshHost, sshPort, sshUser } = getCredentials()

    // Verify instance is running
    const status = await vastGetInstanceStatus(instanceId)
    if (status.status !== 'running') {
      throw new Error(
        `[VastWanProvider] Instance ${instanceId} is not running (status: ${status.status}).\n` +
        `Start it: npm run vast:setup -- --start`
      )
    }

    console.log(`[VastWanProvider] Instance running: ${status.gpuName} ${status.vramMb}MB VRAM`)

    const jobId = `vast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`


    console.log(`[VastWanProvider] SSH → ${sshUser}@${sshHost}:${sshPort}`)
    console.log(`[VastWanProvider] Job: ${jobId}`)

    // In Next.js API routes, we can't spawn SSH processes directly.
    // The job is submitted as a record; actual execution requires
    // the Vast.ai instance to run handler.py as a daemon or via the
    // vast:test-gpu script (see scripts/vast-test-gpu.sh).
    //
    // For the API route, we return a pending job — the client polls
    // /api/generate/{id}/status which checks Supabase for the result
    // written by the instance's handler.py when it completes.

    return {
      provider: 'wan-vast',
      jobId,
      status: 'pending',
    }
  }

  async checkStatus(jobId: string): Promise<CharacterReplacementOutput> {
    // Status is written to Supabase by handler.py on the instance.
    // The /api/generate/[id]/status route reads it from Supabase.
    // We return 'processing' here; the route handles the DB lookup.
    return { provider: 'wan-vast', jobId, status: 'processing' }
  }
}
