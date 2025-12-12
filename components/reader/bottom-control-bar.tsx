"use client"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Play, Pause, SkipBack, SkipForward, Settings2, ScrollText, Layers, Volume2, VolumeX } from "lucide-react"
import { useState } from "react"
import { useBrowserTTS } from "@/lib/reader/hooks/useBrowserTTS"
import { useReaderStore } from "@/lib/reader/stores/readerStore"

export function BottomControlBar() {
  const {
    isSupported,
    isPlaying,
    isPaused,
    voices,
    selectedVoiceId,
    rate,
    currentBlockIndex,
    totalBlocks,
    play,
    pause,
    stop,
    next,
    previous,
    setVoice,
    setRate,
  } = useBrowserTTS()

  // Use global store for autoScroll state to coordinate with ReaderPage
  const autoScroll = useReaderStore((state) => state.autoScroll)
  const setAutoScroll = useReaderStore((state) => state.setAutoScroll)

  const [layoutMode, setLayoutMode] = useState("single")

  const handlePlayPause = () => {
    if (isPlaying && !isPaused) {
      pause()
    } else {
      play()
    }
  }

  // Calculate progress percentage
  const progress = totalBlocks > 0 ? ((currentBlockIndex + 1) / totalBlocks) * 100 : 0

  // Filter voices to show manageable list (prefer Chinese and English)
  const displayVoices = voices.filter(v =>
    v.lang.startsWith("zh") ||
    v.lang.startsWith("en") ||
    v.lang.startsWith("ja")
  ).slice(0, 20)

  if (!isSupported) {
    return (
      <div className="h-20 border-t border-border/40 bg-background/80 backdrop-blur-xl flex items-center justify-center px-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <VolumeX className="h-5 w-5" />
          <span>语音朗读功能在此浏览器不可用</span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-20 border-t border-border/40 bg-background/80 backdrop-blur-xl flex items-center px-6 gap-6 sticky bottom-0 z-40 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
      {/* Playback Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={previous}
          className="h-10 w-10 rounded-xl hover:bg-secondary/80"
          disabled={currentBlockIndex <= 0}
        >
          <SkipBack className="h-5 w-5" />
        </Button>
        <Button
          className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
          onClick={handlePlayPause}
        >
          {isPlaying && !isPaused ? (
            <Pause className="fill-current h-5 w-5" />
          ) : (
            <Play className="fill-current h-5 w-5 ml-0.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={next}
          className="h-10 w-10 rounded-xl hover:bg-secondary/80"
          disabled={currentBlockIndex >= totalBlocks - 1}
        >
          <SkipForward className="h-5 w-5" />
        </Button>
      </div>

      {/* Progress */}
      <div className="flex-1 px-4 flex flex-col justify-center gap-2">
        <div className="flex justify-between text-xs font-medium">
          <span className="text-foreground/70">
            段落 {currentBlockIndex + 1} / {totalBlocks || 1}
          </span>
          <span className="text-muted-foreground">
            {isPlaying ? (isPaused ? "已暂停" : "正在朗读...") : "就绪"}
          </span>
        </div>
        <Slider
          value={[progress]}
          max={100}
          step={1}
          className="w-full [&_[role=slider]]:h-3.5 [&_[role=slider]]:w-3.5 [&_[role=slider]]:shadow-md"
          disabled
        />
      </div>

      {/* Tools */}
      <div className="flex items-center gap-3 border-l border-border/40 pl-6">
        {/* Voice Selector */}
        <Select value={selectedVoiceId} onValueChange={setVoice}>
          <SelectTrigger className="h-9 min-w-[140px] rounded-lg border-border/50 bg-background/50 text-sm font-medium">
            <Volume2 className="h-4 w-4 mr-2" />
            <SelectValue placeholder="选择语音" />
          </SelectTrigger>
          <SelectContent className="rounded-xl max-h-[300px]">
            {displayVoices.length > 0 ? (
              displayVoices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id} className="rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="truncate max-w-[150px]">{voice.name}</span>
                    <span className="text-xs text-muted-foreground">({voice.lang})</span>
                  </div>
                </SelectItem>
              ))
            ) : (
              <SelectItem value="loading" disabled className="rounded-lg">
                加载语音中...
              </SelectItem>
            )}
          </SelectContent>
        </Select>

        {/* Audio Settings */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" title="Speed Settings" className="h-9 w-9 rounded-xl">
              <div className="flex items-center justify-center font-mono text-xs font-bold border-2 border-current rounded-md w-6 h-6">
                {rate}x
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 rounded-xl shadow-xl p-5" align="end">
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-base font-semibold">朗读速度</label>
                  <span className="text-lg font-mono font-bold text-primary">{rate.toFixed(2)}x</span>
                </div>

                <div className="pt-2 pb-6 px-1">
                  <div className="relative">
                    <Slider
                      value={[rate]}
                      onValueChange={(v) => setRate(v[0])}
                      min={0.5}
                      max={3}
                      step={0.25}
                      className="[&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&_[role=slider]]:border-primary/50 relative z-10"
                    />
                    {/* Ruler Scale */}
                    <div className="absolute top-6 left-0 right-0 flex justify-between px-1.5 select-none pointer-events-none">
                      {[0.5, 1, 1.5, 2, 2.5, 3].map((val) => (
                        <div key={val} className="flex flex-col items-center gap-1">
                          <div className="w-0.5 h-2 bg-border/60"></div>
                          <span className="text-[10px] text-muted-foreground font-mono">{val}</span>
                        </div>
                      ))}
                    </div>
                    {/* Minor Ticks */}
                    <div className="absolute top-6 left-0 right-0 flex justify-between px-1.5 select-none pointer-events-none opacity-30">
                      {Array.from({ length: 11 }).map((_, i) => (
                        <div key={i} className="w-px h-1 bg-border" style={{ left: `${i * 10}%`, position: 'absolute' }}></div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Layout Mode - Hidden on mobile */}
        <div className="hidden md:block">
          <Select defaultValue="single" onValueChange={setLayoutMode}>
            <SelectTrigger className="w-[44px] px-0 justify-center h-9 rounded-xl border-border/50">
              <Layers className="h-4 w-4" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="single" className="rounded-lg">
                单面板
              </SelectItem>
              <SelectItem value="split" className="rounded-lg">
                分屏视图
              </SelectItem>
              <SelectItem value="overlay" className="rounded-lg">
                覆盖层
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant={autoScroll ? "secondary" : "ghost"}
          size="icon"
          title="Auto Scroll"
          className="flex h-9 w-9 rounded-xl"
          onClick={() => setAutoScroll(!autoScroll)}
        >
          <ScrollText className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
