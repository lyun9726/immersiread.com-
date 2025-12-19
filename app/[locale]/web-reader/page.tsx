"use client"

import type React from "react"
import { useState, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Globe, Loader2, Play, Pause, Square, Volume2, Languages, ArrowLeft } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ContentBlock {
  id: string
  order: number
  content: string  // API returns 'content' not 'text'
  type?: string
  translation?: string
}

interface ExtractedContent {
  title: string
  blocks: ContentBlock[]
}

type ReadingMode = "original" | "translation" | "bilingual"

export default function WebReaderPage() {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [url, setUrl] = useState("")
  const [content, setContent] = useState<ExtractedContent | null>(null)
  const [readingMode, setReadingMode] = useState<ReadingMode>("original")
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentBlockIndex, setCurrentBlockIndex] = useState(-1)
  const [isTranslating, setIsTranslating] = useState(false)

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Extract content from URL
  const handleExtract = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setIsLoading(true)
    setContent(null)

    try {
      const response = await fetch("/api/ingest/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "提取内容失败")
      }

      if (!data.blocks || data.blocks.length === 0) {
        throw new Error("未能提取到有效内容")
      }

      setContent({
        title: data.title || "无标题",
        blocks: data.blocks,
      })

      toast({
        title: "提取成功",
        description: `已提取 ${data.blocks.length} 个段落`,
      })
    } catch (err) {
      console.error("Extract error:", err)
      toast({
        title: "提取失败",
        description: (err as Error).message,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [url, toast])

  // Translate content
  const handleTranslate = useCallback(async () => {
    if (!content || isTranslating) return

    // Check if already translated
    if (content.blocks.some(b => b.translation)) {
      return
    }

    setIsTranslating(true)

    try {
      // Translate each block
      const translatedBlocks = await Promise.all(
        content.blocks.map(async (block) => {
          try {
            const response = await fetch("/api/translate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: block.content,
                targetLang: "zh",
              }),
            })

            if (response.ok) {
              const data = await response.json()
              return { ...block, translation: data.translation }
            }
          } catch {
            // Ignore individual block errors
          }
          return block
        })
      )

      setContent({
        ...content,
        blocks: translatedBlocks,
      })

      toast({
        title: "翻译完成",
        description: "内容已翻译为中文",
      })
    } catch (err) {
      console.error("Translation error:", err)
      toast({
        title: "翻译失败",
        description: "请稍后重试",
        variant: "destructive",
      })
    } finally {
      setIsTranslating(false)
    }
  }, [content, isTranslating, toast])

  // TTS playback
  const playFromBlock = useCallback((startIndex: number) => {
    if (!content || !window.speechSynthesis) return

    // Stop any current playback
    window.speechSynthesis.cancel()

    const playBlock = (index: number) => {
      if (index >= content.blocks.length) {
        setIsPlaying(false)
        setCurrentBlockIndex(-1)
        return
      }

      const block = content.blocks[index]
      const textToSpeak = readingMode === "translation" && block.translation
        ? block.translation
        : block.content

      const utterance = new SpeechSynthesisUtterance(textToSpeak)
      utterance.lang = readingMode === "translation" ? "zh-CN" : "en-US"
      utterance.rate = 1.0

      utterance.onstart = () => {
        setCurrentBlockIndex(index)
      }

      utterance.onend = () => {
        playBlock(index + 1)
      }

      utterance.onerror = () => {
        setIsPlaying(false)
        setCurrentBlockIndex(-1)
      }

      utteranceRef.current = utterance
      window.speechSynthesis.speak(utterance)
    }

    setIsPlaying(true)
    playBlock(startIndex)
  }, [content, readingMode])

  const stopPlayback = useCallback(() => {
    window.speechSynthesis?.cancel()
    setIsPlaying(false)
    setCurrentBlockIndex(-1)
  }, [])

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopPlayback()
    } else {
      playFromBlock(0)
    }
  }, [isPlaying, stopPlayback, playFromBlock])

  // Toggle reading mode
  const toggleReadingMode = useCallback(() => {
    const modes: ReadingMode[] = ["original", "translation", "bilingual"]
    const currentIdx = modes.indexOf(readingMode)
    const nextMode = modes[(currentIdx + 1) % modes.length]

    // Trigger translation if switching to translation/bilingual mode
    if ((nextMode === "translation" || nextMode === "bilingual") && content) {
      if (!content.blocks.some(b => b.translation)) {
        handleTranslate()
      }
    }

    setReadingMode(nextMode)
  }, [readingMode, content, handleTranslate])

  // Go back to input view
  const handleBack = useCallback(() => {
    stopPlayback()
    setContent(null)
    setCurrentBlockIndex(-1)
  }, [stopPlayback])

  // Render content view
  if (content) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Header with controls */}
        <div className="flex items-center justify-between mb-6 sticky top-0 bg-background/95 backdrop-blur py-4 -mx-4 px-4 border-b z-10">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>

          <div className="flex items-center gap-2">
            {/* Reading mode toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleReadingMode}
              disabled={isTranslating}
            >
              <Languages className="h-4 w-4 mr-2" />
              {readingMode === "original" ? "原文" : readingMode === "translation" ? "译文" : "双语"}
              {isTranslating && <Loader2 className="h-3 w-3 ml-2 animate-spin" />}
            </Button>

            {/* TTS controls */}
            <Button
              variant={isPlaying ? "destructive" : "default"}
              size="sm"
              onClick={togglePlayback}
            >
              {isPlaying ? (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  停止
                </>
              ) : (
                <>
                  <Volume2 className="h-4 w-4 mr-2" />
                  朗读
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Article title */}
        <h1 className="text-3xl font-bold mb-8">{content.title}</h1>

        {/* Article content */}
        <article className="prose prose-lg dark:prose-invert max-w-none">
          {content.blocks.map((block, idx) => (
            <div
              key={block.id}
              className={`mb-6 p-3 rounded-lg transition-colors cursor-pointer ${currentBlockIndex === idx
                ? "bg-yellow-100 dark:bg-yellow-900/30"
                : "hover:bg-muted/50"
                }`}
              onClick={() => playFromBlock(idx)}
            >
              {/* Original text */}
              {(readingMode === "original" || readingMode === "bilingual") && (
                <p className="mb-2">{block.content}</p>
              )}

              {/* Translation */}
              {(readingMode === "translation" || readingMode === "bilingual") && (
                <p className={`${readingMode === "bilingual" ? "text-muted-foreground text-sm mt-2 border-l-2 border-primary/30 pl-3" : ""}`}>
                  {block.translation || (isTranslating ? "翻译中..." : block.content)}
                </p>
              )}
            </div>
          ))}
        </article>
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
          粘贴任意文章链接，即可无干扰阅读，支持 AI 翻译和语音朗读。
        </p>
      </div>

      <Card className="mb-12 shadow-lg">
        <CardContent className="pt-6">
          <form onSubmit={handleExtract} className="flex gap-4 flex-col sm:flex-row">
            <Input
              placeholder="https://medium.com/..."
              className="h-12 text-lg"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
            />
            <Button type="submit" size="lg" className="h-12 px-8" disabled={isLoading || !url.trim()}>
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              {isLoading ? "提取中..." : "开始阅读"}
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
              <span className="font-medium">智能提取</span>
            </div>
            <p className="text-sm text-muted-foreground">自动提取文章正文，去除广告和干扰元素</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Languages className="h-5 w-5 text-primary" />
              <span className="font-medium">AI 翻译</span>
            </div>
            <p className="text-sm text-muted-foreground">一键翻译为中文，支持原文/译文/双语模式</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Volume2 className="h-5 w-5 text-primary" />
              <span className="font-medium">语音朗读</span>
            </div>
            <p className="text-sm text-muted-foreground">点击任意段落开始朗读，高亮当前内容</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
