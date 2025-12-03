"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Mic, Upload } from "lucide-react"
import { useState } from "react"

interface CloneModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CloneVoiceModal({ open, onOpenChange }: CloneModalProps) {
  const [step, setStep] = useState(1)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Clone New Voice</DialogTitle>
          <DialogDescription>Create a custom AI voice from audio samples.</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Voice Name</label>
            <Input placeholder="e.g., My Narrator Voice" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button variant="outline" className="h-24 flex flex-col gap-2 border-dashed bg-transparent">
              <Mic className="h-6 w-6" />
              Record Sample
            </Button>
            <Button variant="outline" className="h-24 flex flex-col gap-2 border-dashed bg-transparent">
              <Upload className="h-6 w-6" />
              Upload Audio
            </Button>
          </div>

          <div className="flex items-start gap-2 p-3 bg-muted rounded-md text-sm text-muted-foreground">
            <Checkbox id="consent" className="mt-0.5" />
            <label htmlFor="consent" className="cursor-pointer">
              I confirm that I have the rights to use this voice and it does not violate any copyright or privacy laws.
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button>Create Voice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
