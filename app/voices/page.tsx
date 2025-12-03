"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { VoiceCard } from "@/components/voice/voice-card"
import { CloneVoiceModal } from "@/components/voice/clone-voice-modal"
import { ttsPresets } from "@/data/languages"

export default function VoicesPage() {
  const [showCloneModal, setShowCloneModal] = useState(false)

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Voice Center</h1>
          <p className="text-muted-foreground">Manage your AI voices and create custom clones.</p>
        </div>
        <Button onClick={() => setShowCloneModal(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Voice Clone
        </Button>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-4">My Cloned Voices</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <VoiceCard name="My Voice Clone 1" lang="en" gender="male" isCloned />

            {/* Empty State / Placeholder */}
            <div
              className="border border-dashed rounded-lg flex flex-col items-center justify-center p-6 text-muted-foreground bg-muted/10 hover:bg-muted/20 cursor-pointer transition-colors"
              onClick={() => setShowCloneModal(true)}
            >
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
                <Plus className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">Add New</span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">System Presets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {ttsPresets.map((voice) => (
              <VoiceCard key={voice.id} name={voice.name} lang={voice.lang} gender={voice.gender} />
            ))}
          </div>
        </section>
      </div>

      <CloneVoiceModal open={showCloneModal} onOpenChange={setShowCloneModal} />
    </div>
  )
}
