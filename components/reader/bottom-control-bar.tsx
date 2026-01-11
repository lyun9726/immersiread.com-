"use client"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Play, Pause, SkipBack, SkipForward, Settings2, ScrollText, Layers, Volume2, VolumeX, Sun, Moon, Maximize, Minimize, Plus, Minus, Type, Cloud, Loader2 } from "lucide-react"
import { useState, useEffect } from "react"
import { useBrowserTTS } from "@/lib/reader/hooks/useBrowserTTS"
import { useReaderStore } from "@/lib/reader/stores/readerStore"
import { useBookLanguageStore } from "@/lib/stores/bookLanguageStore"


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

  // Use global store for states
  const autoScroll = useReaderStore((state) => state.autoScroll)
  const setAutoScroll = useReaderStore((state) => state.setAutoScroll)
  const fileType = useReaderStore((state) => state.fileType)

  // EPUB chapter tracking
  const chapters = useReaderStore((state) => state.chapters)
  const currentChapterId = useReaderStore((state) => state.currentChapterId)

  // Reader enhancement features
  const isDarkMode = useReaderStore((state) => state.isDarkMode)
  const toggleDarkMode = useReaderStore((state) => state.toggleDarkMode)
  const isFullscreen = useReaderStore((state) => state.isFullscreen)
  const toggleFullscreen = useReaderStore((state) => state.toggleFullscreen)
  const fontSize = useReaderStore((state) => state.fontSize)
  const increaseFontSize = useReaderStore((state) => state.increaseFontSize)
  const decreaseFontSize = useReaderStore((state) => state.decreaseFontSize)

  // Language settings for voice filtering
  // Use book-level target language (isolated per book)
  const bookId = useReaderStore((state) => state.bookId)
  const bookLanguageStore = useBookLanguageStore()
  const targetLanguage = bookId ? bookLanguageStore.getBookState(bookId).targetLanguage : 'zh'
  const readingMode = useReaderStore((state) => state.readingMode)

  const [layoutMode, setLayoutMode] = useState("single")
  const [serverTTSAvailable, setServerTTSAvailable] = useState<boolean | null>(null)

  // Check server TTS availability
  useEffect(() => {
    const checkServerTTS = async () => {
      try {
        const response = await fetch('/api/tts/google')
        const data = await response.json()
        setServerTTSAvailable(data.available)
      } catch {
        setServerTTSAvailable(false)
      }
    }
    checkServerTTS()
  }, [])


  const handlePlayPause = () => {
    if (isPlaying && !isPaused) {
      pause()
    } else {
      play()
    }
  }

  // Calculate progress percentage
  const progress = totalBlocks > 0 ? ((currentBlockIndex + 1) / totalBlocks) * 100 : 0

  // Helper: Get language prefix for voice matching
  const getVoiceLangPrefixes = (langCode: string): string[] => {
    const langMap: Record<string, string[]> = {
      'zh': ['zh-CN', 'zh', 'cmn'],
      'zh-TW': ['zh-TW', 'zh-HK', 'yue', 'zh'],
      'en': ['en-US', 'en-GB', 'en'],
      'ja': ['ja-JP', 'ja'],
      'ko': ['ko-KR', 'ko'],
      'es': ['es-ES', 'es-MX', 'es'],
      'fr': ['fr-FR', 'fr-CA', 'fr'],
      'de': ['de-DE', 'de'],
      'it': ['it-IT', 'it'],
      'pt': ['pt-PT', 'pt-BR', 'pt'],
      'ru': ['ru-RU', 'ru'],
      'ar': ['ar-SA', 'ar'],
      'hi': ['hi-IN', 'hi'],
      'th': ['th-TH', 'th'],
      'vi': ['vi-VN', 'vi'],
    };
    return langMap[langCode] || [langCode];
  };

  // Filter voices based on current reading mode and target language
  const displayVoices = (() => {
    // Determine which language to prioritize
    const priorityLang = (readingMode === 'translation' || readingMode === 'bilingual')
      ? targetLanguage
      : null;

    if (priorityLang) {
      // Get prefixes for the target language
      const prefixes = getVoiceLangPrefixes(priorityLang);

      // Filter voices matching the target language
      const matchingVoices = voices.filter(v =>
        prefixes.some(prefix =>
          v.lang.toLowerCase().startsWith(prefix.toLowerCase().split('-')[0])
        )
      );

      // If we have matching voices, show them first, then add some common ones
      if (matchingVoices.length > 0) {
        const otherVoices = voices.filter(v =>
          !matchingVoices.includes(v) &&
          (v.lang.startsWith("en") || v.lang.startsWith("zh"))
        ).slice(0, 5);

        return [...matchingVoices.slice(0, 15), ...otherVoices];
      }
    }

    // Default: show Chinese, English, and Japanese voices
    return voices.filter(v =>
      v.lang.startsWith("zh") ||
      v.lang.startsWith("en") ||
      v.lang.startsWith("ja")
    ).slice(0, 20);
  })();

  // For EPUB, we use useEpubTTS which has its own TTS support
  // Only show unsupported message for PDF/text files when NO TTS is available
  if (!isSupported && fileType !== 'epub') {
    // Server TTS is available as fallback
    if (serverTTSAvailable) {
      return (
        <div className={`border-t border-border/40 bg-background/80 backdrop-blur-xl flex items-center justify-center px-4 ${isFullscreen ? 'h-14 md:h-16' : 'h-16 md:h-20'}`}>
          <div className="flex items-center gap-3 text-muted-foreground">
            <Cloud className="h-5 w-5 text-primary" />
            <span className="text-sm">使用云端语音朗读</span>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              开始朗读
            </Button>
          </div>
        </div>
      )
    }

    // No TTS available at all
    return (
      <div className={`border-t border-border/40 bg-background/80 backdrop-blur-xl flex items-center justify-center px-4 ${isFullscreen ? 'h-14 md:h-16' : 'h-16 md:h-20'}`}>
        <div className="flex flex-col items-center gap-1 text-muted-foreground text-center">
          <div className="flex items-center gap-2">
            <VolumeX className="h-5 w-5" />
            <span className="text-sm">语音朗读在此浏览器不可用</span>
          </div>
          <span className="text-xs opacity-70">
            请使用 Chrome、Edge 或 Safari 浏览器访问
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={`border-t border-border/40 bg-background/80 backdrop-blur-xl flex items-center gap-4 md:gap-6 sticky bottom-0 z-40 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] ${isFullscreen ? 'h-14 md:h-16 px-3 md:px-6' : 'h-16 md:h-20 px-4 md:px-6'}`}>
      {/* Playback Controls */}
      <div className="flex items-center gap-1 md:gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={previous}
          className={`rounded-xl hover:bg-secondary/80 ${isFullscreen ? 'h-8 w-8 md:h-10 md:w-10' : 'h-9 w-9 md:h-10 md:w-10'}`}
          disabled={(fileType === 'text' || fileType === 'pdf') && currentBlockIndex <= 0}
        >
          <SkipBack className={isFullscreen ? 'h-4 w-4 md:h-5 md:w-5' : 'h-5 w-5'} />
        </Button>
        <Button
          className={`rounded-full shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 ${isFullscreen ? 'h-11 w-11 md:h-14 md:w-14' : 'h-12 w-12 md:h-14 md:w-14'}`}
          onClick={handlePlayPause}
        >
          {isPlaying && !isPaused ? (
            <Pause className={`fill-current ${isFullscreen ? 'h-4 w-4 md:h-5 md:w-5' : 'h-5 w-5'}`} />
          ) : (
            <Play className={`fill-current ml-0.5 ${isFullscreen ? 'h-4 w-4 md:h-5 md:w-5' : 'h-5 w-5'}`} />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={next}
          className={`rounded-xl hover:bg-secondary/80 ${isFullscreen ? 'h-8 w-8 md:h-10 md:w-10' : 'h-9 w-9 md:h-10 md:w-10'}`}
          disabled={(fileType === 'text' || fileType === 'pdf') && currentBlockIndex >= totalBlocks - 1}
        >
          <SkipForward className={isFullscreen ? 'h-4 w-4 md:h-5 md:w-5' : 'h-5 w-5'} />
        </Button>
      </div>

      {/* Progress - Hide on mobile, show on desktop */}
      <div className="hidden md:flex flex-1 px-4 flex-col justify-center gap-2 min-w-0">
        <div className="flex justify-between text-xs font-medium">
          <span className="text-foreground/70 truncate">
            {fileType === 'epub' ? (
              // For EPUB: show current chapter name
              currentChapterId && chapters.length > 0 ? (
                (() => {
                  const currentChapter = chapters.find(c => c.id === currentChapterId);
                  const chapterIndex = chapters.findIndex(c => c.id === currentChapterId);
                  return currentChapter
                    ? `${chapterIndex + 1}/${chapters.length} ${currentChapter.title?.slice(0, 30)}${(currentChapter.title?.length || 0) > 30 ? '...' : ''}`
                    : '正在阅读...';
                })()
              ) : `共 ${chapters.length || 0} 章`
            ) : (
              // For PDF/TXT: show paragraph count
              `段落 ${currentBlockIndex + 1} / ${totalBlocks || 1}`
            )}
          </span>
          <span className="text-muted-foreground truncate ml-2">
            {isPlaying ? (isPaused ? "已暂停" : "正在朗读...") : "就绪"}
          </span>
        </div>
        <Slider
          value={[fileType === 'epub'
            ? (chapters.length > 0
              ? ((chapters.findIndex(c => c.id === currentChapterId) + 1) / chapters.length) * 100
              : 0)
            : progress
          ]}
          max={100}
          step={1}
          className="w-full [&_[role=slider]]:h-3.5 [&_[role=slider]]:w-3.5 [&_[role=slider]]:shadow-md"
          disabled
        />
      </div>

      {/* Tools */}
      <div className="flex items-center gap-1 md:gap-3 border-l border-border/40 pl-2 md:pl-6 shrink-0">
        {/* Voice Selector */}
        <Select value={selectedVoiceId} onValueChange={setVoice}>
          <SelectTrigger className="h-9 w-[40px] md:w-auto md:min-w-[140px] px-0 md:px-3 justify-center md:justify-between rounded-lg border-border/50 bg-background/50 text-sm font-medium">
            {/* Mobile: Icon only, Desktop: Icon + Text */}
            <div className="flex items-center">
              <Volume2 className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline border-none outline-none text-left">
                <SelectValue placeholder="选择语音" />
              </span>
            </div>
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

        {/* Auto Scroll - Hidden on mobile */}
        <Button
          variant={autoScroll ? "secondary" : "ghost"}
          size="icon"
          title="Auto Scroll"
          className="hidden md:flex h-9 w-9 rounded-xl"
          onClick={() => setAutoScroll(!autoScroll)}
        >
          <ScrollText className="h-5 w-5" />
        </Button>

        {/* Font Size Control - Hidden on mobile */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" title="字体大小" className="hidden md:flex h-9 w-9 rounded-xl">
              <Type className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 rounded-xl shadow-xl p-4" align="end">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">字体大小</span>
                <span className="text-sm font-mono">{Math.round(fontSize * 100)}%</span>
              </div>
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={decreaseFontSize}
                  disabled={fontSize <= 0.8}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="w-12 text-center font-mono text-lg">
                  {Math.round(fontSize * 100)}%
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={increaseFontSize}
                  disabled={fontSize >= 2.0}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Dark Mode Toggle */}
        <Button
          variant={isDarkMode ? "secondary" : "ghost"}
          size="icon"
          title={isDarkMode ? "日间模式" : "夜间模式"}
          className={`rounded-xl ${isFullscreen ? 'h-8 w-8 md:h-9 md:w-9' : 'h-9 w-9'}`}
          onClick={toggleDarkMode}
        >
          {isDarkMode ? <Sun className={isFullscreen ? 'h-4 w-4 md:h-5 md:w-5' : 'h-5 w-5'} /> : <Moon className={isFullscreen ? 'h-4 w-4 md:h-5 md:w-5' : 'h-5 w-5'} />}
        </Button>

        {/* Fullscreen Toggle */}
        <Button
          variant={isFullscreen ? "secondary" : "ghost"}
          size="icon"
          title={isFullscreen ? "退出全屏" : "全屏模式"}
          className={`rounded-xl ${isFullscreen ? 'h-8 w-8 md:h-9 md:w-9' : 'h-9 w-9'}`}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <Minimize className={isFullscreen ? 'h-4 w-4 md:h-5 md:w-5' : 'h-5 w-5'} /> : <Maximize className={isFullscreen ? 'h-4 w-4 md:h-5 md:w-5' : 'h-5 w-5'} />}
        </Button>
      </div>
    </div>
  )
}
