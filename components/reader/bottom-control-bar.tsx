"use client"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Play, Pause, SkipBack, SkipForward, Settings2, ScrollText, Layers } from "lucide-react"
import { ttsPresets } from "@/data/languages"
import { useState } from "react"

export function BottomControlBar() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState([1.0])
  const [layoutMode, setLayoutMode] = useState("single")
  const [autoScroll, setAutoScroll] = useState(false)

  return (
    <div className="h-20 border-t border-border/40 bg-background/80 backdrop-blur-xl flex items-center px-6 gap-6 sticky bottom-0 z-40 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
      {/* Playback Controls */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => {}} className="h-10 w-10 rounded-xl hover:bg-secondary/80">
          <SkipBack className="h-5 w-5" />
        </Button>
        <Button
          className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause className="fill-current h-5 w-5" /> : <Play className="fill-current h-5 w-5 ml-0.5" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => {}} className="h-10 w-10 rounded-xl hover:bg-secondary/80">
          <SkipForward className="h-5 w-5" />
        </Button>
      </div>

      {/* Progress */}
      <div className="flex-1 px-4 flex flex-col justify-center gap-2">
        <div className="flex justify-between text-xs font-medium">
          <span className="text-foreground/70">Block 12 of 150</span>
          <span className="text-muted-foreground">12:45 remaining</span>
        </div>
        <Slider
          defaultValue={[8]}
          max={100}
          step={1}
          className="w-full [&_[role=slider]]:h-3.5 [&_[role=slider]]:w-3.5 [&_[role=slider]]:shadow-md"
        />
      </div>

      {/* Tools */}
      <div className="flex items-center gap-3 border-l border-border/40 pl-6">
        {/* Voice Selector */}
        <Select defaultValue={ttsPresets[0].id}>
          <SelectTrigger className="h-9 min-w-[140px] rounded-lg border-border/50 bg-background/50 text-sm font-medium">
            <SelectValue placeholder="Voice" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {ttsPresets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id} className="rounded-lg">
                <div className="flex items-center gap-2">
                  <span>{preset.name}</span>
                  <span className="text-xs text-muted-foreground">({preset.language})</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Audio Settings */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" title="Audio Settings" className="h-9 w-9 rounded-xl">
              <Settings2 className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 rounded-xl shadow-xl" align="end">
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold">Speed</label>
                  <span className="text-sm font-mono text-muted-foreground">{speed[0].toFixed(1)}x</span>
                </div>
                <Slider
                  value={speed}
                  onValueChange={setSpeed}
                  min={0.5}
                  max={3}
                  step={0.1}
                  className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold">Pitch</label>
                  <span className="text-sm font-mono text-muted-foreground">0 st</span>
                </div>
                <Slider
                  defaultValue={[0]}
                  min={-12}
                  max={12}
                  step={1}
                  className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Layout Mode */}
        <Select defaultValue="single" onValueChange={setLayoutMode}>
          <SelectTrigger className="w-[44px] px-0 justify-center h-9 rounded-xl border-border/50">
            <Layers className="h-4 w-4" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="single" className="rounded-lg">
              Single Pane
            </SelectItem>
            <SelectItem value="split" className="rounded-lg">
              Split View
            </SelectItem>
            <SelectItem value="overlay" className="rounded-lg">
              Overlay
            </SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={autoScroll ? "secondary" : "ghost"}
          size="icon"
          title="Auto Scroll"
          className="hidden sm:flex h-9 w-9 rounded-xl"
          onClick={() => setAutoScroll(!autoScroll)}
        >
          <ScrollText className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
