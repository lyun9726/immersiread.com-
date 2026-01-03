"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { List, Sparkles, Highlighter, ChevronRight, Send, X, Loader2 } from "lucide-react"
import { useReaderStore } from "@/lib/reader/stores/readerStore"
import { useTranslations } from 'next-intl'
import { MindmapViewer } from "./mindmap-viewer"

import { cn } from "@/lib/utils"

interface RightSidePanelProps {
  className?: string
}

export function RightSidePanel({ className }: RightSidePanelProps) {
  const t = useTranslations('Reader.sidebar')
  const chapters = useReaderStore((state) => state.chapters)
  const enhancedBlocks = useReaderStore((state) => state.enhancedBlocks)
  const currentBlockIndex = useReaderStore((state) => state.currentBlockIndex)
  const setCurrentBlockIndex = useReaderStore((state) => state.setCurrentBlockIndex)
  const jumpToChapter = useReaderStore((state) => state.jumpToChapter)

  const currentChapterId = useReaderStore((state) => state.currentChapterId)

  // AI State
  const selectedTextForAI = useReaderStore((state) => state.selectedTextForAI)
  const visibleTextForAI = useReaderStore((state) => state.visibleTextForAI)
  const aiExplanation = useReaderStore((state) => state.aiExplanation)
  const aiLoading = useReaderStore((state) => state.aiLoading)
  const setAIExplanation = useReaderStore((state) => state.setAIExplanation)
  const setAILoading = useReaderStore((state) => state.setAILoading)

  // AI Chat State
  const aiChatMessages = useReaderStore((state) => state.aiChatMessages)
  const addAIChatMessage = useReaderStore((state) => state.addAIChatMessage)
  const clearAIChatMessages = useReaderStore((state) => state.clearAIChatMessages)
  const aiChatOpen = useReaderStore((state) => state.aiChatOpen)
  const setAIChatOpen = useReaderStore((state) => state.setAIChatOpen)

  // AI Summary State
  const aiSummary = useReaderStore((state) => state.aiSummary)
  const setAISummary = useReaderStore((state) => state.setAISummary)

  // AI Mindmap State
  const aiMindmap = useReaderStore((state) => state.aiMindmap)
  const setAIMindmap = useReaderStore((state) => state.setAIMindmap)
  const aiMindmapOpen = useReaderStore((state) => state.aiMindmapOpen)
  const setAIMindmapOpen = useReaderStore((state) => state.setAIMindmapOpen)

  // Local state for chat input
  const [chatInput, setChatInput] = useState('')

  // Find current chapter
  const getCurrentChapter = () => {
    // Priority 1: Direct ID from store (EPUB support)
    if (currentChapterId) {
      return chapters.find(c => c.id === currentChapterId)
    }

    // Priority 2: Inferred from block index (Text mode)
    if (currentBlockIndex < 0 || !enhancedBlocks[currentBlockIndex]) return null
    const currentBlockId = enhancedBlocks[currentBlockIndex].id
    return chapters.find(ch => ch.blockIds.includes(currentBlockId))
  }

  const currentChapter = getCurrentChapter()

  // Jump to chapter
  const handleChapterClick = (chapter: typeof chapters[0]) => {
    jumpToChapter(chapter.id)
  }

  // Handle Explain Terms - uses selected text or prompts user
  const handleExplainTerms = async () => {
    const termToExplain = selectedTextForAI

    if (!termToExplain || termToExplain.trim().length === 0) {
      // No text selected - show a message
      setAIExplanation({
        term: '提示',
        explanation: '请先在文章中选中需要解释的术语或词语，然后再点击"解释术语"按钮。'
      })
      return
    }

    setAILoading(true)
    setAIExplanation(null)

    try {
      const response = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: termToExplain,
          context: {
            visibleText: visibleTextForAI || '',
          }
        })
      })

      const data = await response.json()

      if (data.error) {
        setAIExplanation({
          term: termToExplain,
          explanation: `解释失败: ${data.error}`
        })
      } else {
        setAIExplanation({
          term: data.term,
          explanation: data.explanation
        })
      }
    } catch (error: any) {
      console.error('[RightSidePanel] Explain term error:', error)
      setAIExplanation({
        term: termToExplain,
        explanation: `请求失败: ${error.message}`
      })
    } finally {
      setAILoading(false)
    }
  }

  // Handle Ask Book - send message to AI
  const handleAskBook = async () => {
    const question = chatInput.trim()
    if (!question || aiLoading) return

    // Add user message
    addAIChatMessage({ role: 'user', content: question })
    setChatInput('')
    setAILoading(true)

    try {
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context: {
            visibleText: visibleTextForAI || '',
          }
        })
      })

      const data = await response.json()

      if (data.error) {
        addAIChatMessage({ role: 'assistant', content: `抱歉，回答失败: ${data.error}` })
      } else {
        addAIChatMessage({ role: 'assistant', content: data.answer })
      }
    } catch (error: any) {
      console.error('[RightSidePanel] Ask book error:', error)
      addAIChatMessage({ role: 'assistant', content: `请求失败: ${error.message}` })
    } finally {
      setAILoading(false)
    }
  }

  // Handle Generate Summary
  const handleGenerateSummary = async () => {
    if (!visibleTextForAI || visibleTextForAI.trim().length === 0) {
      setAISummary({
        summary: '无法生成摘要',
        bulletPoints: ['请确保当前页面有可读内容']
      })
      return
    }

    setAILoading(true)
    setAISummary(null)

    try {
      const response = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            visibleText: visibleTextForAI,
          }
        })
      })

      const data = await response.json()

      if (data.error) {
        setAISummary({
          summary: `生成失败: ${data.error}`,
          bulletPoints: []
        })
      } else {
        setAISummary({
          summary: data.summary,
          bulletPoints: data.bulletPoints || []
        })
      }
    } catch (error: any) {
      console.error('[RightSidePanel] Generate summary error:', error)
      setAISummary({
        summary: `请求失败: ${error.message}`,
        bulletPoints: []
      })
    } finally {
      setAILoading(false)
    }
  }

  // Handle Generate Mindmap
  const handleGenerateMindmap = async () => {
    if (!visibleTextForAI || visibleTextForAI.trim().length === 0) {
      setAIMindmap({
        title: '无法生成',
        nodes: [{ id: '1', text: '请确保当前页面有可读内容' }]
      })
      setAIMindmapOpen(true)
      return
    }

    setAILoading(true)

    try {
      const response = await fetch('/api/ai/mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            visibleText: visibleTextForAI,
          }
        })
      })

      const data = await response.json()

      if (data.error && (!data.nodes || data.nodes.length === 0)) {
        setAIMindmap({
          title: `生成失败`,
          nodes: [{ id: '1', text: data.error }]
        })
      } else {
        setAIMindmap({
          title: data.title || '思维导图',
          nodes: data.nodes || []
        })
      }
      setAIMindmapOpen(true)
    } catch (error: any) {
      console.error('[RightSidePanel] Generate mindmap error:', error)
      setAIMindmap({
        title: '请求失败',
        nodes: [{ id: '1', text: error.message }]
      })
      setAIMindmapOpen(true)
    } finally {
      setAILoading(false)
    }
  }

  return (
    <>
      {/* Mindmap Modal */}
      {aiMindmapOpen && aiMindmap && (
        <MindmapViewer
          title={aiMindmap.title}
          nodes={aiMindmap.nodes}
          onClose={() => setAIMindmapOpen(false)}
        />
      )}

      <div className={cn("border-l border-border/40 bg-sidebar/50 backdrop-blur-sm flex flex-col custom-scrollbar", className)}>
        <Tabs defaultValue="toc" className="flex-1 flex flex-col">

          <div className="px-4 pt-5 pb-3 border-b border-border/30">
            <TabsList className="grid w-full grid-cols-3 bg-secondary/60 p-1 rounded-xl">
              <TabsTrigger value="toc" className="rounded-lg data-[state=active]:shadow-sm">
                <List className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="ai" className="rounded-lg data-[state=active]:shadow-sm">
                <Sparkles className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="notes" className="rounded-lg data-[state=active]:shadow-sm">
                <Highlighter className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 custom-scrollbar">
            <div className="p-5">
              <TabsContent value="toc" className="mt-0 space-y-1">
                <h3 className="font-semibold text-sm text-foreground/70 uppercase tracking-wide mb-4">{t('contents')}</h3>
                {chapters.length > 0 ? (
                  <nav className="space-y-0.5">
                    {chapters.map((chapter) => {
                      const isActive = currentChapter?.id === chapter.id
                      return (
                        <Button
                          key={chapter.id}
                          variant="ghost"
                          className={`w-full justify-between text-sm font-normal h-auto py-3 px-3 rounded-xl hover:bg-secondary/80 ${isActive ? "bg-primary/5 text-primary" : ""}`}
                          onClick={() => handleChapterClick(chapter)}
                        >
                          <span className="text-left line-clamp-2">
                            <span className="text-muted-foreground font-medium">{t('chapter', { num: chapter.order })}:</span> {chapter.title}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        </Button>
                      )
                    })}
                  </nav>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {t('noChapters')}
                  </div>
                )}
              </TabsContent>



              <TabsContent value="ai" className="mt-0 space-y-4">
                <h3 className="font-semibold text-sm text-foreground/70 uppercase tracking-wide mb-4">{t('aiTools')}</h3>

                {/* Ask Book - Chat Interface */}
                {aiChatOpen ? (
                  <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl border border-primary/20">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <h4 className="font-semibold text-sm">{t('askBook')}</h4>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          setAIChatOpen(false)
                          clearAIChatMessages()
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Chat Messages */}
                    <div className="max-h-48 overflow-y-auto space-y-2 mb-3 custom-scrollbar">
                      {aiChatMessages.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          基于当前页面内容提问...
                        </p>
                      )}
                      {aiChatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`text-sm p-2 rounded-lg ${msg.role === 'user'
                            ? 'bg-primary/20 text-primary-foreground ml-4'
                            : 'bg-secondary/50 mr-4'
                            }`}
                        >
                          {msg.content}
                        </div>
                      ))}
                      {aiLoading && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          思考中...
                        </div>
                      )}
                    </div>

                    {/* Chat Input */}
                    <div className="flex gap-2">
                      <Input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="输入问题..."
                        className="text-sm h-9"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleAskBook()
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-9 w-9 p-0"
                        onClick={handleAskBook}
                        disabled={aiLoading || !chatInput.trim()}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl border border-primary/20">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-base mb-1">{t('askBook')}</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {t('askBookDesc')}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full rounded-xl shadow-sm"
                      onClick={() => setAIChatOpen(true)}
                    >
                      {t('startConversation')}
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  {/* Generate Summary Button */}
                  <Button
                    variant="outline"
                    className="w-full justify-start text-sm h-auto py-3 rounded-xl bg-background border-border/50 hover:bg-secondary/60"
                    onClick={handleGenerateSummary}
                    disabled={aiLoading}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                        {aiLoading && !aiChatOpen ? <Loader2 className="h-4 w-4 animate-spin" /> : '📝'}
                      </div>
                      <span>{t('generateSummary')}</span>
                    </div>
                  </Button>

                  {/* AI Summary Result */}
                  {aiSummary && (
                    <div className="mt-2 p-4 bg-gradient-to-br from-green-500/10 to-emerald-500/5 rounded-2xl border border-green-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-sm">📝 本页摘要</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => setAISummary(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {aiSummary.bulletPoints.length > 0 ? (
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {aiSummary.bulletPoints.map((point, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="text-green-500">•</span>
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {aiSummary.summary}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Create Mindmap Button */}
                  <Button
                    variant="outline"
                    className="w-full justify-start text-sm h-auto py-3 rounded-xl bg-background border-border/50 hover:bg-secondary/60"
                    onClick={handleGenerateMindmap}
                    disabled={aiLoading}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                        {aiLoading && !aiChatOpen && !aiSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : '🧠'}
                      </div>
                      <span>{t('createMindmap')}</span>
                    </div>
                  </Button>

                  {/* Explain Terms Button */}
                  <Button
                    variant="outline"
                    className="w-full justify-start text-sm h-auto py-3 rounded-xl bg-background border-border/50 hover:bg-secondary/60"
                    onClick={handleExplainTerms}
                    disabled={aiLoading}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
                        {aiLoading && !aiChatOpen && !aiSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : '💡'}
                      </div>
                      <span>{t('explainTerms')}</span>
                      {selectedTextForAI && (
                        <span className="text-xs text-primary ml-auto truncate max-w-[80px]">
                          "{selectedTextForAI.substring(0, 10)}..."
                        </span>
                      )}
                    </div>
                  </Button>

                  {/* AI Explanation Result */}
                  {aiExplanation && (
                    <div className="mt-2 p-4 bg-gradient-to-br from-yellow-500/10 to-orange-500/5 rounded-2xl border border-yellow-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-sm">💡 {aiExplanation.term}</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => setAIExplanation(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {aiExplanation.explanation}
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="notes" className="mt-0">
                <h3 className="font-semibold text-sm text-foreground/70 uppercase tracking-wide mb-4">
                  {t('notesHighlights')}
                </h3>
                <div className="space-y-3">
                  <div className="p-4 bg-[var(--highlight-yellow)] border border-yellow-400/20 rounded-xl">
                    <p className="text-sm mb-2 font-medium italic leading-relaxed">
                      "The green light at the end of Daisy's dock..."
                    </p>
                    <p className="text-xs text-foreground/70">Symbol of Gatsby's hope and the elusive American Dream.</p>
                    <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{t('chapter', { num: 1 })}</span>
                      <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg">
                        {t('jumpTo')}
                      </Button>
                    </div>
                  </div>

                  <div className="p-4 bg-[var(--highlight-blue)] border border-blue-400/20 rounded-xl">
                    <p className="text-sm mb-2 font-medium italic leading-relaxed">
                      "So we beat on, boats against the current..."
                    </p>
                    <p className="text-xs text-foreground/70">
                      Final reflection on the persistent struggle against time.
                    </p>
                    <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{t('chapter', { num: 9 })}</span>
                      <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg">
                        {t('jumpTo')}
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </div>
    </>
  )
}
