"use client"

import { LandingHero } from "@/components/landing/hero"
import { LandingFeatures } from "@/components/landing/features"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-primary overflow-x-hidden">
      <LandingHero />
      <LandingFeatures />
    </div>
  )
}
