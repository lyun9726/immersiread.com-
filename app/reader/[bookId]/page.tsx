"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { BottomControlBar } from "@/components/reader/bottom-control-bar"
import { RightSidePanel } from "@/components/reader/right-side-panel"
import { BlockComponent } from "@/components/reader/block-component"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ChevronRight, ChevronLeft, Languages, Loader2 } from "lucide-react"
import { useReaderStore } from "@/app/reader/stores/readerStore"
import { useReaderActions } from "@/app/reader/hooks/useReaderActions"
import { useTTS } from "@/app/reader/hooks/useTTS"

export default function ReaderPage() {
  const params = useParams()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isTranslating, setIsTranslating] = useState(false)

  // Store state
  const blocks = useReaderStore((state) => state.blocks)
  const currentIndex = useReaderStore((state) => state.currentIndex)
  const setCurrentIndex = useReaderStore((state) => state.setCurrentIndex)
  const translationEnabled = useReaderStore((state) => state.translation.enabled)
  const translatedMap = useReaderStore((state) => state.translation.translatedMap)
  const translateBlocks = useReaderStore((state) => state.translateBlocks)
  const setTranslationEnabled = useReaderStore((state) => state.setTranslationEnabled)

  // Actions
  const { loadBook } = useReaderActions()
  const { play } = useTTS()

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
        text: "In my younger and more vulnerable years my father gave me some advice that I've been turning over in my mind ever since.",
      },
      {
        id: "2",
        order: 2,
        text: '"Whenever you feel like criticizing any one," he told me, "just remember that all the people in this world haven\'t had the advantages that you\'ve had."',
      },
      {
        id: "3",
        order: 3,
        text: "He didn't say any more, but we've always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that.",
      },
    ]
    useReaderStore.getState().loadPreview(mockBlocks)
  }

  const handleTranslateAll = async () => {
    if (blocks.length === 0) return

    setIsTranslating(true)
    try {
      const items = blocks.map((b) => ({ id: b.id, text: b.text }))
      await translateBlocks(items, "zh")
      setTranslationEnabled(true)
    } catch (error) {
      console.error("Translation failed:", error)
    } finally {
      setIsTranslating(false)
    }
  }

  const handlePlayBlock = (blockId: string) => {
    const index = blocks.findIndex((b) => b.id === blockId)
    if (index !== -1) {
      setCurrentIndex(index)
      play()
    }
  }

  if (blocks.length === 0) {
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
              <h2 className="font-semibold">The Great Gatsby</h2>
              <p className="text-sm text-muted-foreground">Chapter 1 · {blocks.length} blocks</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={translationEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => setTranslationEnabled(!translationEnabled)}
                disabled={isTranslating || Object.keys(translatedMap).length === 0}
              >
                <Languages className="h-4 w-4 mr-2" />
                {translationEnabled ? "Hide Translation" : "Show Translation"}
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
                {blocks.map((block, i) => (
                  <BlockComponent
                    key={block.id}
                    id={block.id}
                    originalText={block.text}
                    translation={
                      translationEnabled && translatedMap[block.id]
                        ? translatedMap[block.id]
                        : undefined
                    }
                    isActive={i === currentIndex}
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
