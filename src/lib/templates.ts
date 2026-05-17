import type { DemoTemplate } from '@/types'

/**
 * Demo templates — used as inspiration/examples on the landing page.
 * Not the core product flow (which is user video + avatar image).
 */
export const DEMO_TEMPLATES: DemoTemplate[] = [
  {
    id: 'demo_tiktok_creator',
    name: 'TikTok Creator',
    description: 'High-energy casual creator style.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=600&fit=crop&crop=face',
    category: 'social',
    durationSeconds: 15,
    aspectRatio: '9:16',
  },
  {
    id: 'demo_business_coach',
    name: 'Business Coach',
    description: 'Confident, authoritative presence.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=600&fit=crop&crop=face',
    category: 'business',
    durationSeconds: 20,
    aspectRatio: '9:16',
  },
  {
    id: 'demo_teacher',
    name: 'Teacher',
    description: 'Warm, clear classroom style.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=600&fit=crop&crop=face',
    category: 'education',
    durationSeconds: 20,
    aspectRatio: '16:9',
  },
]
