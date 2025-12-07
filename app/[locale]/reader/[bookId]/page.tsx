"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { BottomControlBar } from "@/components/reader/bottom-control-bar"
import { RightSidePanel } from "@/components/reader/right-side-panel"
import { BlockComponent } from "@/components/reader/block-component"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ChevronRight, ChevronLeft, Languages, Loader2 } from "lucide-react"
import { useReaderStore } from "@/lib/reader/stores/readerStore"
import { useReaderActions } from "@/lib/reader/hooks/useReaderActions"
import { useBrowserTTS } from "@/lib/reader/hooks/useBrowserTTS"

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
  const { play, stop, isSpeaking } = useBrowserTTS()

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
        {/* Main Content */}
        <div className="flex-1 flex flex-col relative bg-background">
          {/* Top Toolbar */}
          <div className="border-b px-8 py-3 flex items-center justify-between bg-background/95 backdrop-blur">
            <div>
              <h2 className="font-semibold">{bookTitle || "Loading..."}</h2>
              <p className="text-sm text-muted-foreground">
                {chapters.length > 0 ? `${chapters.length} chapters · ` : ""}{enhancedBlocks.length} blocks
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={readingMode !== "original" ? "default" : "outline"}
                size="sm"
                onClick={toggleReadingMode}
                disabled={isTranslating || !hasTranslations}
              >
                <Languages className="h-4 w-4 mr-2" />
                {readingMode === "original" ? "Original" :
                  readingMode === "bilingual" ? "Bilingual" : "Translation"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTranslateAll}
                disabled={isTranslating}
              >
                {isTranslating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Translating...
                  </>
                ) : (
                  "Translate All"
                )}
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="max-w-3xl mx-auto px-8 py-12">
              <div className="space-y-2">
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

          <Button
            variant="secondary"
            size="icon"
            className="absolute right-4 top-16 z-10 shadow-md md:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <ChevronRight /> : <ChevronLeft />}
          </Button>
        </div>

        {/* Sidebar */}
        <div className={`${sidebarOpen ? "block" : "hidden"} md:block border-l`}>
          <RightSidePanel />
        </div>
      </div>

      {/* Bottom Controls */}
      <BottomControlBar />
    </div>
  )
}
