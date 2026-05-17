# AvatarMe — Record yourself. Post as any character.

> **user video + any character image = same performance, different visible person**

A SaaS app for creators who want to publish TikTok/Reels/Shorts videos
without showing their real face.

---

## The concept

The user records themselves naturally — talking, gesturing, presenting face-camera.
They upload any character image — AI-generated (ChatGPT, Midjourney, Gemini/Nano Banana), a fictional character, authorized personal photo, or stock image. No avatar library required.

The AI (Seedance 2.0) transfers **all motion** from the user's video to the avatar:
- head movement
- facial expressions
- body posture and gestures
- camera framing
- timing and rhythm
- original audio (optional, kept by default)
- lip-sync when possible

**Result:** the exact same performance, with a completely different visible identity.

This is **not** a simple face swap.
This is **not** a talking head generator.
This is **not** a template-based system.

It is: `user_video + avatar_image = same performance, different face`

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Auth | Supabase Auth |
| Database | Supabase (PostgreSQL + RLS) |
| Storage | Supabase Storage (3 private/public buckets) |
| Payments | Stripe (one-time credit packs) |
| AI | fal.ai → Seedance 2.0 reference-to-video |
| Dev mock | MockProvider (no API key needed) |

---

## Installation

```bash
git clone <repo>
cd motion-avatar
npm install
cp .env.local.example .env.local
# Edit .env.local with your keys
npm run dev
```

---

## Configuration

### Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. **SQL Editor** → paste `supabase-schema.sql` → **Run**
3. **Settings → API Keys** → copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Secret key → `SUPABASE_SERVICE_ROLE_KEY`

**Storage buckets created by the schema:**
- `user-videos` — private (creator's recorded videos)
- `character-images` — private (avatar/character images)
- `output-videos` — public (generated anonymous videos)

### Stripe

1. Create 3 one-time products:
   - Starter: $9 → 10 credits
   - Pro: $19 → 30 credits
   - Studio: $49 → 100 credits
2. Copy Price IDs → `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_STUDIO`
3. Webhook → `/api/webhooks/stripe` for `checkout.session.completed`

### fal.ai + Seedance 2.0

1. Get API key at [fal.ai/dashboard](https://fal.ai/dashboard)
2. Set in `.env.local`:

```env
FAL_KEY=your_fal_key
AI_PROVIDER=seedance
MOCK_AI=false
```

**Endpoints used:**
- Standard: `bytedance/seedance-2.0/reference-to-video`
- Fast: `bytedance/seedance-2.0/fast/reference-to-video`

---

## Development mode (MockProvider)

```env
MOCK_AI=true
```

Simulates the full job lifecycle without any API key:
- 0–5s → `pending`
- 5–20s → `processing`
- 20s+ → `completed` (returns sample video)

Full DB writes, credit deduction, history, and UI polling all work exactly as in production.

---

## Build without real API keys

```bash
npm run build     # ✅ passes with no keys
npm run lint      # ✅ passes
npx tsc --noEmit  # ✅ passes
```

No SDK is initialized at module level. All clients are lazy:

| Client | Initialized when |
|--------|-----------------|
| Supabase (browser) | Inside event handlers via `dynamic import()` |
| Supabase (server) | Inside API route handlers |
| Stripe | Inside `getStripe()`, called by checkout/webhook handlers |
| fal.ai | Inside `generateAvatarReplacementVideo()` method body |

For CI/CD, use placeholder values:
```env
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
SUPABASE_SERVICE_ROLE_KEY=placeholder
MOCK_AI=true
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

---

## AI Provider Limitations

> Seedance 2.0 does not guarantee 100% perfect motion fidelity.

**Best results:**
- Short videos (10–30s)
- Single subject, face-camera, clean background
- Good lighting, no heavy occlusions or fast motion
- Avatar image: front-facing, clear, neutral background

**Output resolution:** 480p–720p natively. 1080p requires post-processing upscale.

**Audio:** Seedance 2.0 lip-sync support depends on the fal.ai endpoint version.
Keep original audio is always preserved in the output when possible.

---

## Project structure

```
src/
├── app/
│   ├── page.tsx                         # Landing page
│   ├── auth/login|signup/               # Auth (lazy Supabase)
│   ├── dashboard/                       # Dashboard (protected)
│   ├── generate/                        # 4-step wizard (protected)
│   ├── history/                         # History (protected)
│   └── api/
│       ├── generate/route.ts            # POST: submit job
│       ├── generate/[id]/status/        # GET: poll status
│       ├── credits/checkout/route.ts    # POST: Stripe checkout
│       └── webhooks/stripe/route.ts     # POST: Stripe webhook
├── components/
│   ├── landing/                         # Hero, HowItWorks, UseCases, Pricing, Footer
│   ├── dashboard/                       # DashboardLogout
│   └── generate/                        # GenerateClient (4-step: video → avatar → settings → generate)
├── lib/
│   ├── ai/
│   │   ├── provider.ts                  # Re-exports AIProvider types
│   │   ├── seedance-provider.ts         # Seedance 2.0 — avatar replacement
│   │   ├── mock-provider.ts             # Dev mock
│   │   └── index.ts                     # Factory: getAIProvider()
│   ├── supabase/client.ts               # Browser client (lazy)
│   ├── supabase/server.ts               # Server clients (lazy)
│   ├── stripe.ts                        # getStripe() lazy
│   ├── env.ts                           # Centralized env access
│   ├── pricing.ts                       # 3 plans
│   └── utils.ts
├── types/index.ts                       # All types incl. AvatarReplacementInput
└── middleware.ts                        # Route protection (graceful without keys)
```

---

## API

```typescript
// POST /api/generate
body: { userVideoUrl, characterImageUrl, keepOriginalAudio, prompt?, aspectRatio, quality }
→    { generationId, jobId, provider, status }

// GET /api/generate/[id]/status
→    { status, videoUrl?, error? }
```

---

## Credit flow

```
Signup      → 3 free credits (auto via DB trigger)
Generate    → check credits → submit AI job → deduct 1 credit
AI fails    → refund 1 credit (automatic on status=failed)
Buy credits → Stripe checkout → webhook → credits added
```

Credits are only deducted **after** the AI job is successfully submitted.

---

## Roadmap

- [ ] In-browser video recording (MediaRecorder API)
- [ ] Avatar library (pre-built characters)
- [ ] Background removal / replacement
- [ ] Multi-language lip-sync
- [ ] Watermark removal toggle
- [ ] API access for power users
- [ ] Runway ML as alternative provider
