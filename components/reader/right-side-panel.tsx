"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

import { List, Sparkles, Highlighter, ChevronRight } from "lucide-react"
import { useReaderStore } from "@/lib/reader/stores/readerStore"
import { useTranslations } from 'next-intl'

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

  return (
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
                <Button size="sm" className="w-full rounded-xl shadow-sm">
                  {t('startConversation')}
                </Button>
              </div>

              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start text-sm h-auto py-3 rounded-xl bg-background border-border/50 hover:bg-secondary/60"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">📝</div>
                    <span>{t('generateSummary')}</span>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-sm h-auto py-3 rounded-xl bg-background border-border/50 hover:bg-secondary/60"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">🧠</div>
                    <span>{t('createMindmap')}</span>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-sm h-auto py-3 rounded-xl bg-background border-border/50 hover:bg-secondary/60"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">💡</div>
                    <span>{t('explainTerms')}</span>
                  </div>
                </Button>
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
  )
}
