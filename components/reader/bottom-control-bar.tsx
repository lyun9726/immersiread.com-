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
            <Button variant="ghost" size="icon" title="Audio Settings" className="h-9 w-9 rounded-xl">
              <Settings2 className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 rounded-xl shadow-xl" align="end">
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold">朗读速度</label>
                  <span className="text-sm font-mono text-muted-foreground">{rate.toFixed(1)}x</span>
                </div>
                <Slider
                  value={[rate]}
                  onValueChange={(v) => setRate(v[0])}
                  min={0.5}
                  max={2}
                  step={0.1}
                  className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                />
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  提示：速度调整会在下一段落生效
                </p>
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
