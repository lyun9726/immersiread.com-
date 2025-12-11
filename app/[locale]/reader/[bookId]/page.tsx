"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { BottomControlBar } from "@/components/reader/bottom-control-bar"
import { RightSidePanel } from "@/components/reader/right-side-panel"
import { BlockComponent } from "@/components/reader/block-component"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ChevronRight, ChevronLeft, Languages, Loader2, Menu } from "lucide-react"
import { TranslationOverlay } from "@/components/reader/translation-overlay"
import { useReaderStore } from "@/lib/reader/stores/readerStore"
import { useReaderActions } from "@/lib/reader/hooks/useReaderActions"
import { useBrowserTTS } from "@/lib/reader/hooks/useBrowserTTS"
import { PDFRenderer } from "@/components/reader/pdf-renderer"
import { EpubRenderer } from "@/components/reader/epub-renderer"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

export default function ReaderPage() {
  const params = useParams()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isTranslating, setIsTranslating] = useState(false)

  // Store state - New 3-layer architecture
  const bookTitle = useReaderStore((state) => state.bookTitle)
  const enhancedBlocks = useReaderStore((state) => state.enhancedBlocks)
  const chapters = useReaderStore((state) => state.chapters)
  const currentBlockIndex = useReaderStore((state) => state.currentBlockIndex)
  const setCurrentBlockIndex = useReaderStore((state) => state.setCurrentBlockIndex)
  const readingMode = useReaderStore((state) => state.readingMode)
  const setReadingMode = useReaderStore((state) => state.setReadingMode)
  const enhanceWithTranslation = useReaderStore((state) => state.enhanceWithTranslation)
  const setBlocks = useReaderStore((state) => state.setBlocks)

  // Actions
  const { loadBook } = useReaderActions()
  const { play, stop } = useBrowserTTS()

  // Load book data on mount
  useEffect(() => {
    const bookId = params.bookId as string
    if (bookId && bookId !== "demo") {
      // Try to load book from API
      loadBook(bookId).catch((error) => {
        console.error("Failed to load book:", error)
        // Load mock data as fallback
        loadMockData()
      })
    } else {
      // Load mock data for demo
      loadMockData()
    }
  }, [params.bookId])

  const loadMockData = () => {
    const mockBlocks = [
      {
        id: "1",
        order: 1,
        type: "text" as const,
        content: "In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since.",
      },
      {
        id: "2",
        order: 2,
        type: "text" as const,
        content: '"Whenever you feel like criticizing any one," he told me, "just remember that all the people in this world haven\'t had the advantages that you\'ve had."',
      },
      {
        id: "3",
        order: 3,
        type: "text" as const,
        content: "He didn't say any more, but we've always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that.",
      },
    ]
    setBlocks(mockBlocks)
  }

  const handleTranslateAll = async () => {
    if (enhancedBlocks.length === 0) return

    setIsTranslating(true)
    try {
      await enhanceWithTranslation("zh")
      // Switch to bilingual mode to show translations
      setReadingMode("bilingual")
    } catch (error) {
      console.error("Translation failed:", error)
    } finally {
      setIsTranslating(false)
    }
  }

  const handlePlayBlock = (blockId: string) => {
    const index = enhancedBlocks.findIndex((b) => b.id === blockId)
    if (index !== -1) {
      setCurrentBlockIndex(index)
      play(index)
    }
  }

  const toggleReadingMode = () => {
    // Cycle through modes: original → bilingual → translation → original
    if (readingMode === "original") {
      setReadingMode("bilingual")
    } else if (readingMode === "bilingual") {
      setReadingMode("translation")
    } else {
      setReadingMode("original")
    }
  }

  // Auto-scroll logic
  const autoScroll = useReaderStore((state) => state.autoScroll)

  useEffect(() => {
    if (autoScroll && currentBlockIndex >= 0 && enhancedBlocks[currentBlockIndex]) {
      const blockId = enhancedBlocks[currentBlockIndex].id
      // Use efficient timeout to wait for render if needed, or run immediately if mounted
      // Using direct DOM access for simplicity and performance
      const element = document.getElementById(`block-${blockId}`)
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }
  }, [currentBlockIndex, autoScroll, enhancedBlocks])

  // Check if we have translations
  const hasTranslations = enhancedBlocks.some(b => b.translation)

  if (enhancedBlocks.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex flex-1 overflow-hidden">
        {/* Format Renderers */}
        <div className="flex-1 flex flex-col relative bg-background w-full">
          {/* Top Toolbar */}
          <div className="border-b px-4 md:px-8 py-3 flex items-center justify-between bg-background/95 backdrop-blur">
            <div className="flex items-center gap-3">
              {/* Mobile Menu Trigger */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden -ml-2">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-80">
                  <RightSidePanel className="h-full w-full border-none" />
                </SheetContent>
              </Sheet>

              <h2 className="font-semibold truncate max-w-[200px] md:max-w-md">{bookTitle || "Loading..."}</h2>
            </div>
            <div className="flex gap-2">
              <Button onClick={toggleReadingMode} size="sm" variant="outline" className="h-9">
                <Languages className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">{readingMode}</span>
              </Button>
            </div>
          </div>

          <div className="flex-1 relative overflow-hidden">
            {/* PDF Mode */}
            {useReaderStore.getState().fileType === 'pdf' && useReaderStore.getState().fileUrl ? (
              <PDFRenderer
                url={useReaderStore.getState().fileUrl!}
                scale={useReaderStore.getState().scale}
              />
            ) : useReaderStore.getState().fileType === 'epub' && useReaderStore.getState().fileUrl ? (
              /* EPUB Mode */
              <EpubRenderer
                url={useReaderStore.getState().fileUrl!}
                scale={useReaderStore.getState().scale}
              />
            ) : (
              /* Fallback / Text Mode */
              <ScrollArea className="h-full">
                <div className="max-w-3xl mx-auto px-8 py-12">
                  <div className="space-y-4">
                    {enhancedBlocks.map((block, i) => (
                      <BlockComponent
                        key={block.id}
                        id={block.id}
                        originalText={block.original}
                        type={block.type}
                        headingLevel={block.meta?.level}
                        translation={
                          (readingMode === "bilingual" || readingMode === "translation") && block.translation
                            ? block.translation
                            : undefined
                        }
                        isActive={i === currentBlockIndex}
                        onPlay={handlePlayBlock}
                      />
                    ))}
                  </div>
                </div>
              </ScrollArea>
            )}

            <TranslationOverlay />
          </div>
        </div>

        {/* Sidebar - Desktop Only */}
        <div className={`hidden md:block w-80 shrink-0 h-full border-l`}>
          <RightSidePanel className="h-[calc(100vh-4rem-5rem)] w-full" />
        </div>
      </div>

      <BottomControlBar />
    </div>
  )
}
