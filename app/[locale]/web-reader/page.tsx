"use client"

import type React from "react"
import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Globe, Loader2, Volume2, Square, Languages, ArrowLeft, ExternalLink, Pause, Play } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type ReadingMode = "original" | "translation"

export default function WebReaderPage() {
  const { toast } = useToast()
  const [url, setUrl] = useState("")
  const [displayUrl, setDisplayUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [readingMode, setReadingMode] = useState<ReadingMode>("original")

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Load URL in iframe via proxy
  const handleLoad = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    // Validate URL
    let targetUrl = url.trim()
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl
    }

    try {
      new URL(targetUrl)
    } catch {
      toast({
        title: "链接格式错误",
        description: "请输入有效的网址",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    // Store original URL for display
    setDisplayUrl(targetUrl)
  }, [url, toast])

  // Get proxy URL for iframe
  const getProxyUrl = useCallback((originalUrl: string) => {
    return `/api/proxy?url=${encodeURIComponent(originalUrl)}`
  }, [])

  // Handle iframe load complete
  const handleIframeLoad = useCallback(() => {
    setIsLoading(false)
  }, [])

  // Handle iframe error
  const handleIframeError = useCallback(() => {
    setIsLoading(false)
    toast({
      title: "无法加载页面",
      description: "该网站可能不允许在框架中显示，请尝试其他链接",
      variant: "destructive",
    })
  }, [toast])

  // TTS: Read visible content or selected text
  const startReading = useCallback(() => {
    if (!window.speechSynthesis) {
      toast({
        title: "不支持语音合成",
        description: "您的浏览器不支持语音合成功能",
        variant: "destructive",
      })
      return
    }

    // Get selected text from iframe if possible, or get page text
    let textToRead = ""

    try {
      // Try to get selected text from iframe
      const iframeWindow = iframeRef.current?.contentWindow
      const selection = iframeWindow?.getSelection?.()
      if (selection && selection.toString().trim()) {
        textToRead = selection.toString()
      } else {
        // Get all visible text from iframe body
        const iframeDoc = iframeRef.current?.contentDocument
        if (iframeDoc?.body) {
          textToRead = iframeDoc.body.innerText || ""
        }
      }
    } catch (e) {
      // Cross-origin restriction: can't access iframe content
      // Use a fallback message
      toast({
        title: "跨域限制",
        description: "无法读取该页面内容。请选择文本后再点击朗读，或尝试其他网站。",
        variant: "destructive",
      })
      return
    }

    if (!textToRead.trim()) {
      toast({
        title: "没有找到内容",
        description: "页面没有可朗读的文本内容",
        variant: "destructive",
      })
      return
    }

    // Stop any current playback
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(textToRead)
    utterance.lang = readingMode === "translation" ? "zh-CN" : "en-US"
    utterance.rate = 1.0

    utterance.onend = () => {
      setIsPlaying(false)
      setIsPaused(false)
    }

    utterance.onerror = () => {
      setIsPlaying(false)
      setIsPaused(false)
    }

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
    setIsPlaying(true)
    setIsPaused(false)
  }, [readingMode, toast])

  // Pause/Resume playback
  const togglePause = useCallback(() => {
    if (isPaused) {
      window.speechSynthesis.resume()
      setIsPaused(false)
    } else {
      window.speechSynthesis.pause()
      setIsPaused(true)
    }
  }, [isPaused])

  // Stop playback
  const stopReading = useCallback(() => {
    window.speechSynthesis?.cancel()
    setIsPlaying(false)
    setIsPaused(false)
  }, [])

  // Go back to input
  const handleBack = useCallback(() => {
    stopReading()
    setDisplayUrl("")
    setUrl("")
  }, [stopReading])

  // Open in new tab
  const openInNewTab = useCallback(() => {
    if (displayUrl) {
      window.open(displayUrl, '_blank')
    }
  }, [displayUrl])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel()
    }
  }, [])

  // Render iframe view with controls
  if (displayUrl) {
    return (
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        {/* Top control bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-background border-b shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              返回
            </Button>
            <span className="text-sm text-muted-foreground truncate max-w-[200px] md:max-w-[400px]">
              {displayUrl}
            </span>
          </div>

          <Button variant="ghost" size="sm" onClick={openInNewTab}>
            <ExternalLink className="h-4 w-4 mr-1" />
            新标签页打开
          </Button>
        </div>

        {/* Iframe container */}
        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={getProxyUrl(displayUrl)}
            className="w-full h-full border-0"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            title="Web Reader Content"
          />
        </div>

        {/* Bottom TTS control bar - fixed at bottom like the competitor */}
        <div className="shrink-0 px-4 py-3 bg-background border-t">
          <div className="flex items-center justify-center gap-3">
            {/* Language toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReadingMode(readingMode === "original" ? "translation" : "original")}
            >
              <Languages className="h-4 w-4 mr-2" />
              {readingMode === "original" ? "英文" : "中文"}
            </Button>

            {/* Main TTS button */}
            {!isPlaying ? (
              <Button
                size="lg"
                className="px-8 gap-2"
                onClick={startReading}
              >
                <Volume2 className="h-5 w-5" />
                开始朗读
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  variant="secondary"
                  className="px-6 gap-2"
                  onClick={togglePause}
                >
                  {isPaused ? (
                    <>
                      <Play className="h-5 w-5" />
                      继续
                    </>
                  ) : (
                    <>
                      <Pause className="h-5 w-5" />
                      暂停
                    </>
                  )}
                </Button>
                <Button
                  size="lg"
                  variant="destructive"
                  className="px-6 gap-2"
                  onClick={stopReading}
                >
                  <Square className="h-4 w-4" />
                  停止
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-center text-muted-foreground mt-2">
            提示：选中页面文本后点击朗读，将只朗读选中内容
          </p>
        </div>
      </div>
    )
  }

  // Render input view
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
          <Globe className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-4xl font-bold mb-4">网页阅读器</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          粘贴任意文章链接，直接查看原网页内容，支持语音朗读。
        </p>
      </div>

      <Card className="mb-12 shadow-lg">
        <CardContent className="pt-6">
          <form onSubmit={handleLoad} className="flex gap-4 flex-col sm:flex-row">
            <Input
              placeholder="https://techcrunch.com/..."
              className="h-12 text-lg"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button type="submit" size="lg" className="h-12 px-8" disabled={!url.trim()}>
              打开网页
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="font-semibold text-lg">功能说明</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Globe className="h-5 w-5 text-primary" />
              <span className="font-medium">原始内容</span>
            </div>
            <p className="text-sm text-muted-foreground">直接显示原网页，保留完整内容和排版</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Volume2 className="h-5 w-5 text-primary" />
              <span className="font-medium">语音朗读</span>
            </div>
            <p className="text-sm text-muted-foreground">选中文本或整页朗读，支持暂停/继续</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Languages className="h-5 w-5 text-primary" />
              <span className="font-medium">多语言</span>
            </div>
            <p className="text-sm text-muted-foreground">切换中英文语音，适配不同内容</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
