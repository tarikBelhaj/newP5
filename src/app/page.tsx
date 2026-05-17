import { Navbar } from '@/components/landing/Navbar'
import { Hero } from '@/components/landing/Hero'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { UseCases } from '@/components/landing/UseCases'
import { PricingSection } from '@/components/landing/PricingSection'
import { FooterSection } from '@/components/landing/FooterSection'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-ink-950 overflow-x-hidden">
      <div className="scanline" />
      <Navbar />
      <Hero />
      <HowItWorks />
      <UseCases />
      <PricingSection />
      <FooterSection />
    </main>
  )
}
