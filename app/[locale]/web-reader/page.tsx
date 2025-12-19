"use client"

import type React from "react"
import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Globe, Loader2, Volume2, Square, Languages, ArrowLeft, ExternalLink, Pause, Play, BookmarkPlus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Paragraph {
  id: string
  text: string
  translation?: string
}

type ReadingMode = "original" | "translation" | "bilingual"

export default function WebReaderPage() {
  const { toast } = useToast()
  const [url, setUrl] = useState("")
  const [displayUrl, setDisplayUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [readingMode, setReadingMode] = useState<ReadingMode>("original")
  const [isTranslating, setIsTranslating] = useState(false)
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([])
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(-1)
  const [isSaving, setIsSaving] = useState(false)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Get proxy URL for iframe
  const getProxyUrl = useCallback((originalUrl: string) => {
    return `/api/proxy?url=${encodeURIComponent(originalUrl)}`
  }, [])

  // Load URL in iframe via proxy
  const handleLoad = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

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
    setParagraphs([])
    setCurrentParagraphIndex(-1)
    setDisplayUrl(targetUrl)
  }, [url, toast])

  // Handle iframe load complete
  const handleIframeLoad = useCallback(() => {
    setIsLoading(false)
    // Request paragraphs from iframe
    iframeRef.current?.contentWindow?.postMessage({ type: 'READAI_GET_PARAGRAPHS' }, '*')
  }, [])

  // Handle iframe error
  const handleIframeError = useCallback(() => {
    setIsLoading(false)
    toast({
      title: "无法加载页面",
      description: "该网站可能有额外的反爬保护",
      variant: "destructive",
    })
  }, [toast])

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'READAI_PARAGRAPHS') {
        setParagraphs(event.data.paragraphs.map((p: { id: string; text: string }) => ({
          id: p.id,
          text: p.text,
          translation: undefined
        })))
      } else if (event.data.type === 'READAI_PARAGRAPH_CLICK') {
        // Find the index of clicked paragraph and start reading from there
        const index = paragraphs.findIndex(p => p.id === event.data.paragraphId)
        if (index !== -1) {
          playFromParagraph(index)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [paragraphs])

  // Send highlight command to iframe
  const highlightParagraph = useCallback((paragraphId: string | null) => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'READAI_HIGHLIGHT',
      paragraphId
    }, '*')
  }, [])

  // Send translation to iframe
  const showTranslation = useCallback((paragraphId: string, translation: string) => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'READAI_SHOW_TRANSLATION',
      paragraphId,
      translation
    }, '*')
  }, [])

  // Clear all translations in iframe
  const clearTranslations = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'READAI_CLEAR_TRANSLATIONS'
    }, '*')
  }, [])

  // Translate a paragraph
  const translateParagraph = useCallback(async (paragraph: Paragraph): Promise<string | undefined> => {
    if (paragraph.translation) return paragraph.translation

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: paragraph.text,
          targetLang: "zh",
        }),
      })

      if (response.ok) {
        const data = await response.json()
        return data.translation
      }
    } catch (err) {
      console.error("Translation error:", err)
    }
    return undefined
  }, [])

  // Translate all paragraphs
  const translateAll = useCallback(async () => {
    if (isTranslating || paragraphs.length === 0) return

    setIsTranslating(true)

    const newParagraphs = [...paragraphs]

    for (let i = 0; i < newParagraphs.length; i++) {
      if (!newParagraphs[i].translation) {
        const translation = await translateParagraph(newParagraphs[i])
        if (translation) {
          newParagraphs[i] = { ...newParagraphs[i], translation }
          // Show translation in iframe immediately
          showTranslation(newParagraphs[i].id, translation)
        }
      } else {
        showTranslation(newParagraphs[i].id, newParagraphs[i].translation!)
      }
    }

    setParagraphs(newParagraphs)
    setIsTranslating(false)

    toast({
      title: "翻译完成",
      description: `已翻译 ${newParagraphs.filter(p => p.translation).length} 个段落`,
    })
  }, [isTranslating, paragraphs, translateParagraph, showTranslation, toast])

  // Play TTS from a specific paragraph
  const playFromParagraph = useCallback((startIndex: number) => {
    if (!window.speechSynthesis || paragraphs.length === 0) return

    // Stop any current playback
    window.speechSynthesis.cancel()
    setIsPlaying(true)
    setIsPaused(false)

    const playNext = async (index: number) => {
      if (index >= paragraphs.length) {
        setIsPlaying(false)
        setCurrentParagraphIndex(-1)
        highlightParagraph(null)
        return
      }

      const paragraph = paragraphs[index]
      setCurrentParagraphIndex(index)
      highlightParagraph(paragraph.id)

      let textToSpeak = paragraph.text

      // If in translation/bilingual mode, use translation
      if ((readingMode === "translation" || readingMode === "bilingual") && paragraph.translation) {
        textToSpeak = paragraph.translation
      } else if (readingMode === "translation" && !paragraph.translation) {
        // Need to translate first
        const translation = await translateParagraph(paragraph)
        if (translation) {
          const newParagraphs = [...paragraphs]
          newParagraphs[index] = { ...paragraph, translation }
          setParagraphs(newParagraphs)
          showTranslation(paragraph.id, translation)
          textToSpeak = translation
        }
      }

      const utterance = new SpeechSynthesisUtterance(textToSpeak)
      utterance.lang = (readingMode === "translation" || (readingMode === "bilingual" && paragraph.translation))
        ? "zh-CN" : "en-US"
      utterance.rate = 1.0

      utterance.onend = () => {
        playNext(index + 1)
      }

      utterance.onerror = () => {
        setIsPlaying(false)
        setCurrentParagraphIndex(-1)
        highlightParagraph(null)
      }

      utteranceRef.current = utterance
      window.speechSynthesis.speak(utterance)
    }

    playNext(startIndex)
  }, [paragraphs, readingMode, highlightParagraph, translateParagraph, showTranslation])

  // Toggle pause/resume
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
    setCurrentParagraphIndex(-1)
    highlightParagraph(null)
  }, [highlightParagraph])

  // Toggle reading mode
  const toggleReadingMode = useCallback(() => {
    const modes: ReadingMode[] = ["original", "translation", "bilingual"]
    const currentIdx = modes.indexOf(readingMode)
    const nextMode = modes[(currentIdx + 1) % modes.length]

    setReadingMode(nextMode)

    if (nextMode === "original") {
      clearTranslations()
    } else if (nextMode === "translation" || nextMode === "bilingual") {
      // Trigger translation if not already done
      if (!paragraphs.some(p => p.translation)) {
        translateAll()
      } else {
        // Show existing translations
        paragraphs.forEach(p => {
          if (p.translation) {
            showTranslation(p.id, p.translation)
          }
        })
      }
    }
  }, [readingMode, paragraphs, clearTranslations, translateAll, showTranslation])

  // Go back
  const handleBack = useCallback(() => {
    stopReading()
    setDisplayUrl("")
    setUrl("")
    setParagraphs([])
  }, [stopReading])

  // Open in new tab
  const openInNewTab = useCallback(() => {
    if (displayUrl) window.open(displayUrl, '_blank')
  }, [displayUrl])

  // Save to library
  const saveToLibrary = useCallback(async () => {
    if (!displayUrl || isSaving) return

    setIsSaving(true)

    try {
      // Call the ingest URL API to save to library
      const response = await fetch("/api/ingest/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: displayUrl }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "保存失败")
      }

      toast({
        title: "已保存到书库",
        description: `"${data.title || "网页文章"}" 已添加到您的书库`,
      })
    } catch (err) {
      console.error("Save error:", err)
      toast({
        title: "保存失败",
        description: (err as Error).message,
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }, [displayUrl, isSaving, toast])

  // Cleanup
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

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {paragraphs.length > 0 ? `${paragraphs.length} 段` : "加载中..."}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={saveToLibrary}
              disabled={isSaving}
              className="gap-1"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BookmarkPlus className="h-4 w-4" />
              )}
              保存到书库
            </Button>
            <Button variant="ghost" size="sm" onClick={openInNewTab}>
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
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

        {/* Bottom TTS control bar */}
        <div className="shrink-0 px-4 py-3 bg-background border-t">
          <div className="flex items-center justify-center gap-3">
            {/* Reading mode toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleReadingMode}
              disabled={isTranslating}
              className="min-w-[80px]"
            >
              <Languages className="h-4 w-4 mr-2" />
              {readingMode === "original" ? "原文" : readingMode === "translation" ? "译文" : "双语"}
              {isTranslating && <Loader2 className="h-3 w-3 ml-1 animate-spin" />}
            </Button>

            {/* Main TTS controls */}
            {!isPlaying ? (
              <Button
                size="lg"
                className="px-8 gap-2"
                onClick={() => playFromParagraph(0)}
                disabled={paragraphs.length === 0}
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
            点击页面任意段落可从该处开始朗读 | 当前段落自动高亮
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
          粘贴任意文章链接，直接查看原网页内容，支持语音朗读和 AI 翻译。
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
              <Volume2 className="h-5 w-5 text-primary" />
              <span className="font-medium">段落朗读</span>
            </div>
            <p className="text-sm text-muted-foreground">点击任意段落开始朗读，自动高亮当前内容</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Languages className="h-5 w-5 text-primary" />
              <span className="font-medium">AI 翻译</span>
            </div>
            <p className="text-sm text-muted-foreground">三种模式：原文 → 译文 → 双语，译文显示在原文下方</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Globe className="h-5 w-5 text-primary" />
              <span className="font-medium">原网页显示</span>
            </div>
            <p className="text-sm text-muted-foreground">直接显示原网页，保留完整内容和排版</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
