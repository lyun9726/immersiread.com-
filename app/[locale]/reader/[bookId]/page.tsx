"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { BottomControlBar } from "@/components/reader/bottom-control-bar"
import { RightSidePanel } from "@/components/reader/right-side-panel"
import { BlockComponent } from "@/components/reader/block-component"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ChevronRight, ChevronLeft, Languages, Loader2, Menu, FileText } from "lucide-react"
import { TranslationOverlay } from "@/components/reader/translation-overlay"
import { BackToReadingButton } from "@/components/reader/back-to-reading-button"
import { useReaderStore } from "@/lib/reader/stores/readerStore"
import { useReaderActions } from "@/lib/reader/hooks/useReaderActions"

import { EpubRenderer } from "@/components/reader/epub-renderer"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Progress } from "@/components/ui/progress"
import { useTranslations } from "next-intl"

// Dynamic import PDFRenderer to avoid SSR issues with react-pdf (DOMMatrix not defined)
const PDFRenderer = dynamic(
  () => import("@/components/reader/pdf-renderer").then(mod => mod.PDFRenderer),
  {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }
)

export default function ReaderPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isTranslating, setIsTranslating] = useState(false)

  // PDF Translation state
  const [pdfTranslationStatus, setPdfTranslationStatus] = useState<"idle" | "pending" | "processing" | "completed" | "failed">("idle")
  const [pdfTranslationProgress, setPdfTranslationProgress] = useState(0)
  const [translatedPdfUrl, setTranslatedPdfUrl] = useState<string | null>(null)
  const [showTranslatedPdf, setShowTranslatedPdf] = useState(false)
  const [translatedBookId, setTranslatedBookId] = useState<string | null>(null)
  const [translatedBlocks, setTranslatedBlocks] = useState<any[]>([])
  const [isTranslation, setIsTranslation] = useState(false)
  const [parentBookId, setParentBookId] = useState<string | null>(null)

  // EPUB Translation state
  const [epubTranslationStatus, setEpubTranslationStatus] = useState<"idle" | "pending" | "processing" | "completed" | "failed">("idle")
  const [epubTranslationProgress, setEpubTranslationProgress] = useState(0)

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
  const fileType = useReaderStore((state) => state.fileType)
  const fileUrl = useReaderStore((state) => state.fileUrl)
  const scale = useReaderStore((state) => state.scale)
  const isDarkMode = useReaderStore((state) => state.isDarkMode)
  const isFullscreen = useReaderStore((state) => state.isFullscreen)

  // Internationalization
  const t = useTranslations("Reader")

  // Actions
  const { loadBook, parseBook } = useReaderActions()


  // Local state for parsing status
  const [isParsing, setIsParsing] = useState(false)

  // Load book data on mount
  useEffect(() => {
    const bookId = params.bookId as string
    if (bookId && bookId !== "demo") {
      // Try to load book from API
      loadBook(bookId)
        .then((book) => {
          // Initialize PDF translation state from book data
          if (book) {
            // Check if this is a translated book
            if (book.isTranslation) {
              setIsTranslation(true)
              if (book.parentBookId) {
                setParentBookId(book.parentBookId)
              }
              console.log("[ReaderPage] This is a translated book, parent:", book.parentBookId)
            }

            if (book.translatedFileUrl) {
              setTranslatedPdfUrl(book.translatedFileUrl)
              console.log("[ReaderPage] Found translated PDF URL:", book.translatedFileUrl)
            }
            if (book.translatedBookId) {
              setTranslatedBookId(book.translatedBookId)
              console.log("[ReaderPage] Found translated book ID:", book.translatedBookId)
            }
            if (book.translationStatus) {
              setPdfTranslationStatus(book.translationStatus)
              console.log("[ReaderPage] Translation status:", book.translationStatus)

              // Auto-switch to translated PDF if completed and load translated blocks
              if (book.translationStatus === "completed" && book.translatedBookId) {
                setShowTranslatedPdf(true)
                // Load translated book's blocks for TTS and interaction
                loadTranslatedBookBlocks(book.translatedBookId)
              }
            }

            // Auto-start polling if translation is in progress
            if (book.translationStatus === "processing" || book.translationStatus === "pending") {
              console.log("[ReaderPage] Translation in progress, starting polling...")
              // Small delay to ensure startPolling is defined
              setTimeout(() => {
                const pollBookStatus = async () => {
                  try {
                    const resp = await fetch(`/api/library/books/${bookId}`)
                    const data = await resp.json()
                    if (data.book?.translationStatus === "completed" && data.book?.translatedFileUrl) {
                      setTranslatedPdfUrl(data.book.translatedFileUrl)
                      setPdfTranslationStatus("completed")
                      setPdfTranslationProgress(100)
                      setShowTranslatedPdf(true)
                      console.log("[ReaderPage] Translation completed!")
                      return true
                    } else if (data.book?.translationStatus === "failed") {
                      setPdfTranslationStatus("failed")
                      return true
                    }
                    setPdfTranslationProgress(data.book?.translationProgress || 0)
                    return false
                  } catch (e) {
                    console.error("[ReaderPage] Poll error:", e)
                    return false
                  }
                }

                const interval = setInterval(async () => {
                  const done = await pollBookStatus()
                  if (done) clearInterval(interval)
                }, 5000)

                // Cleanup after 30 minutes
                setTimeout(() => clearInterval(interval), 30 * 60 * 1000)
              }, 500)
            }
            if (book.translationProgress) {
              setPdfTranslationProgress(book.translationProgress)
            }

            // Initialize EPUB bilingual translation state
            if (book.bilingualEpubUrl) {
              setBilingualEpubUrl(book.bilingualEpubUrl)
              console.log("[ReaderPage] Found bilingual EPUB URL:", book.bilingualEpubUrl)
            }
            if (book.epubTranslationStatus) {
              setEpubTranslationStatus(book.epubTranslationStatus)
              console.log("[ReaderPage] EPUB translation status:", book.epubTranslationStatus)

              // Auto-switch to bilingual mode if translation is completed
              if (book.epubTranslationStatus === "completed" && book.bilingualEpubUrl) {
                // Default to bilingual mode when bilingual EPUB is available
                console.log("[ReaderPage] Bilingual EPUB available, ready for mode switch")
              }

              // Poll for EPUB translation status if pending/processing
              if (book.epubTranslationStatus === "pending" || book.epubTranslationStatus === "processing") {
                console.log("[ReaderPage] Starting EPUB translation status polling...")

                const pollEpubStatus = async () => {
                  try {
                    const statusRes = await fetch(`/api/translate/epub-bilingual/status/${bookId}`)
                    if (statusRes.ok) {
                      const statusData = await statusRes.json()
                      console.log("[ReaderPage] EPUB translation poll result:", statusData)

                      setEpubTranslationStatus(statusData.status)

                      if (statusData.status === "completed" && statusData.bilingualUrl) {
                        setBilingualEpubUrl(statusData.bilingualUrl)
                        console.log("[ReaderPage] EPUB translation completed! URL:", statusData.bilingualUrl)
                        return true // Done polling
                      }
                      if (statusData.status === "failed") {
                        console.log("[ReaderPage] EPUB translation failed")
                        return true // Done polling
                      }
                    }
                    return false // Continue polling
                  } catch (err) {
                    console.error("[ReaderPage] EPUB status poll error:", err)
                    return false
                  }
                }

                // Start polling every 5 seconds
                setTimeout(async () => {
                  const interval = setInterval(async () => {
                    const done = await pollEpubStatus()
                    if (done) clearInterval(interval)
                  }, 5000)

                  // Cleanup after 30 minutes
                  setTimeout(() => clearInterval(interval), 30 * 60 * 1000)
                }, 500)
              }
            }
          }

          // Check if we need to parse (blocks are empty but we have a source URL)
          const state = useReaderStore.getState()
          if (state.enhancedBlocks.length === 0 && state.fileUrl) {
            console.log("Book has no blocks (lazy upload), triggering background parse...")
            setIsParsing(true)

            // Notify user
            // We use a small delay to ensure UI is ready
            setTimeout(() => {
              // You might want to use a toast here
              console.log("Starting analysis...")
            }, 100)

            parseBook(bookId)
              .then(() => {
                console.log("Background parse complete")
              })
              .catch(err => {
                console.error("Background parse failed:", err)
              })
              .finally(() => {
                setIsParsing(false)
              })
          }
        })
        .catch((error) => {
          console.error("Failed to load book:", error)
          // Load mock data as fallback
          loadMockData()
        })
    } else {
      // Load mock data for demo
      loadMockData()
    }
  }, [params.bookId])

  // Handle block query param for returning to reading position
  useEffect(() => {
    const blockParam = searchParams.get('block')
    if (blockParam !== null) {
      const blockIndex = parseInt(blockParam, 10)
      if (!isNaN(blockIndex) && blockIndex >= 0) {
        console.log('[ReaderPage] Restoring position to block:', blockIndex)
        setCurrentBlockIndex(blockIndex)
        // Small delay to ensure content is rendered before scrolling
        setTimeout(() => {
          const blockElement = document.getElementById(`block-${enhancedBlocks[blockIndex]?.id}`)
          if (blockElement) {
            blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 500)
      }
    }
  }, [searchParams, enhancedBlocks.length])

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

  // Load translated book's blocks for TTS and interaction in Translation mode
  const loadTranslatedBookBlocks = async (translatedBookId: string) => {
    try {
      console.log("[ReaderPage] Loading translated book blocks:", translatedBookId)
      const response = await fetch(`/api/library/books/${translatedBookId}`)
      if (!response.ok) {
        console.error("[ReaderPage] Failed to load translated book")
        return
      }
      const data = await response.json()
      if (data.blocks && data.blocks.length > 0) {
        setTranslatedBlocks(data.blocks)
        console.log(`[ReaderPage] Loaded ${data.blocks.length} translated blocks`)
      } else {
        console.log("[ReaderPage] Translated book has no blocks, may need parsing")
      }
    } catch (error) {
      console.error("[ReaderPage] Error loading translated blocks:", error)
    }
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

  // Request PDF translation
  const requestPdfTranslation = useCallback(async () => {
    const bookId = params.bookId as string
    if (!bookId || fileType !== 'pdf') return

    setPdfTranslationStatus("pending")
    setPdfTranslationProgress(0)

    try {
      const response = await fetch('/api/translate/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, targetLang: 'zh' })
      })

      const data = await response.json()

      if (data.status === "completed" && data.translatedFileUrl) {
        setTranslatedPdfUrl(data.translatedFileUrl)
        setPdfTranslationStatus("completed")
        setShowTranslatedPdf(true)
      } else if (data.status === "failed") {
        setPdfTranslationStatus("failed")
      } else {
        setPdfTranslationStatus(data.status || "processing")
        // Start polling for status
        startPolling()
      }
    } catch (error) {
      console.error("[PDF Translation] Request failed:", error)
      setPdfTranslationStatus("failed")
    }
  }, [params.bookId, fileType])

  // Poll for translation status
  const startPolling = useCallback(() => {
    const bookId = params.bookId as string
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/translate/pdf?bookId=${bookId}`)
        const data = await response.json()

        setPdfTranslationProgress(data.progress || 0)

        if (data.status === "completed" && data.translatedFileUrl) {
          setTranslatedPdfUrl(data.translatedFileUrl)
          setPdfTranslationStatus("completed")
          setShowTranslatedPdf(true)
          clearInterval(pollInterval)
        } else if (data.status === "failed") {
          setPdfTranslationStatus("failed")
          clearInterval(pollInterval)
        } else {
          setPdfTranslationStatus(data.status)
        }
      } catch (error) {
        console.error("[PDF Translation] Polling failed:", error)
      }
    }, 3000)

    // Cleanup after 10 minutes
    setTimeout(() => clearInterval(pollInterval), 10 * 60 * 1000)
  }, [params.bookId])

  // Request EPUB bilingual translation
  const [bilingualEpubUrl, setBilingualEpubUrl] = useState<string | null>(null)

  const requestEpubTranslation = useCallback(async (force: boolean = false) => {
    const bookId = params.bookId as string
    if (!bookId || fileType !== 'epub') return

    setEpubTranslationStatus("processing")
    setEpubTranslationProgress(0)

    // Get target language from store
    const targetLang = useReaderStore.getState().targetLanguage || 'zh'

    try {
      console.log("[EPUB Bilingual] Starting bilingual EPUB generation for book:", bookId, "force:", force, "targetLang:", targetLang)

      const response = await fetch('/api/translate/epub-bilingual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, force, targetLang })
      })

      const data = await response.json()

      if (data.success) {
        // Check if translation just started (Railway async) or already has result
        if (data.bilingualUrl) {
          // Already has bilingual URL (maybe from cache)
          console.log("[EPUB Bilingual] Bilingual EPUB already available:", data.bilingualUrl)
          setEpubTranslationStatus("completed")
          setEpubTranslationProgress(100)
          setBilingualEpubUrl(data.bilingualUrl)
          setReadingMode("bilingual")
        } else {
          // Translation started - keep processing status and poll for completion
          console.log("[EPUB Bilingual] Translation started, status:", data.status)
          setEpubTranslationStatus(data.status || "processing")

          // Start polling for status
          const pollForCompletion = async () => {
            try {
              const statusRes = await fetch(`/api/translate/epub-bilingual/status/${bookId}`)
              if (statusRes.ok) {
                const statusData = await statusRes.json()
                console.log("[EPUB Bilingual] Poll status:", statusData)

                if (statusData.status === "completed" && statusData.bilingualUrl) {
                  setBilingualEpubUrl(statusData.bilingualUrl)
                  setEpubTranslationStatus("completed")
                  setEpubTranslationProgress(100)
                  console.log("[EPUB Bilingual] Translation completed! URL:", statusData.bilingualUrl)
                  // Reload book to get updated state
                  await loadBook(bookId)
                  setReadingMode("bilingual")
                  return true // Done
                }
                if (statusData.status === "failed") {
                  setEpubTranslationStatus("failed")
                  return true // Done
                }
                // Still processing
                setEpubTranslationStatus(statusData.status || "processing")
              }
              return false // Continue polling
            } catch (err) {
              console.error("[EPUB Bilingual] Poll error:", err)
              return false
            }
          }

          // Poll every 5 seconds
          const startTime = Date.now()
          const TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes timeout

          const interval = setInterval(async () => {
            // Check for timeout
            if (Date.now() - startTime > TIMEOUT_MS) {
              console.error("[EPUB Bilingual] Translation timed out after 10 minutes")
              setEpubTranslationStatus("failed")
              clearInterval(interval)
              return
            }

            const done = await pollForCompletion()
            if (done) clearInterval(interval)
          }, 5000)

          // Cleanup after 30 minutes (in case interval wasn't cleared)
          setTimeout(() => clearInterval(interval), 30 * 60 * 1000)
        }
      } else {
        console.error("[EPUB Bilingual] Generation failed:", data.error)
        setEpubTranslationStatus("failed")
      }
    } catch (error) {
      console.error("[EPUB Bilingual] Request failed:", error)
      setEpubTranslationStatus("failed")
    }
  }, [params.bookId, fileType, loadBook, setReadingMode])

  // Handle translation mode button click for PDF and EPUB
  const handleTranslationModeClick = useCallback(() => {
    if (fileType === 'pdf') {
      // If currently viewing a translated book, navigate back to original
      if (isTranslation && parentBookId) {
        const currentBlock = currentBlockIndex >= 0 ? currentBlockIndex : 0
        window.location.href = `/reader/${parentBookId}?block=${currentBlock}`
        return
      }

      if (pdfTranslationStatus === "completed" && translatedBookId) {
        // Navigate to the translated book for full sync (TTS, progress, etc.)
        // Include current block position to maintain reading progress
        const currentBlock = currentBlockIndex >= 0 ? currentBlockIndex : 0
        window.location.href = `/reader/${translatedBookId}?block=${currentBlock}`
      } else if (pdfTranslationStatus === "completed" && translatedPdfUrl) {
        // Fallback: Toggle between translated and original PDF view
        setShowTranslatedPdf(!showTranslatedPdf)
      } else if (pdfTranslationStatus === "idle" || pdfTranslationStatus === "failed") {
        // Request translation
        requestPdfTranslation()
      }
      // If pending/processing, do nothing (show progress)
    } else if (fileType === 'epub') {
      // EPUB Translation handling
      // Check if bilingual EPUB exists
      if (bilingualEpubUrl) {
        // Already has bilingual EPUB - toggle between modes
        if (readingMode === 'original') {
          setReadingMode("bilingual")
        } else if (readingMode === 'bilingual') {
          setReadingMode("translation")
        } else {
          setReadingMode("original")
        }
      } else if (epubTranslationStatus === "idle" || epubTranslationStatus === "failed") {
        // No bilingual EPUB yet - FIRST switch to bilingual mode for instant translation
        // Then start background DeepSeek translation for high-quality version
        console.log("[handleTranslationModeClick] Switching to bilingual mode for instant translation...")
        setReadingMode("bilingual")  // This triggers instant Google translation on current page

        // Start background DeepSeek translation for full book (runs in parallel)
        console.log("[handleTranslationModeClick] Starting background DeepSeek translation...")
        requestEpubTranslation()
      } else if (epubTranslationStatus === "processing") {
        // Already translating in background - just switch mode for instant translation
        console.log("[handleTranslationModeClick] Background translation in progress, switching to instant mode...")
        if (readingMode === 'original') {
          setReadingMode("bilingual")
        } else if (readingMode === 'bilingual') {
          setReadingMode("translation")
        } else {
          setReadingMode("original")
        }
      }
    } else {
      // For text files, just toggle reading mode
      setReadingMode(readingMode === "original" ? "translation" : "original")
    }
  }, [fileType, pdfTranslationStatus, translatedBookId, translatedPdfUrl, showTranslatedPdf, requestPdfTranslation, currentBlockIndex, isTranslation, parentBookId, readingMode, bilingualEpubUrl, epubTranslationStatus, requestEpubTranslation, setReadingMode])

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

  // Sync showTranslatedPdf with readingMode for PDF files
  useEffect(() => {
    if (fileType === 'pdf' && translatedPdfUrl && pdfTranslationStatus === 'completed') {
      // When in translation mode and we have a translated PDF, show it
      if (readingMode === 'translation') {
        setShowTranslatedPdf(true)
      } else if (readingMode === 'original') {
        setShowTranslatedPdf(false)
      }
      // bilingual mode handling could be added later
    }
  }, [readingMode, fileType, translatedPdfUrl, pdfTranslationStatus])

  // Check if we have translations
  const hasTranslations = enhancedBlocks.some(b => b.translation)

  // Check if we have enough data to render
  const canRender = enhancedBlocks.length > 0 || (fileUrl && ['pdf', 'epub'].includes(fileType))

  if (!canRender) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className={`flex flex-col bg-background ${isFullscreen ? 'fixed inset-0 z-50' : 'fixed top-16 left-0 right-0 bottom-0 z-0'}`}>
      <div className="flex flex-1 overflow-hidden">
        {/* Format Renderers */}
        <div className="flex-1 flex flex-col relative bg-background w-full">
          {/* Top Toolbar - Hide in fullscreen */}
          {!isFullscreen && (
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

                <div className="flex flex-col justify-center h-full">
                  <h2 className="font-semibold text-sm md:text-base max-w-[200px] md:max-w-md truncate leading-tight">
                    {bookTitle || "Loading..."}
                  </h2>
                  {isParsing && (
                    <span className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1 animate-pulse leading-tight">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Preparing AI features...
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 md:gap-2">
                {/* Reading Mode Buttons - Direct selection */}
                <Button
                  onClick={() => {
                    if (fileType === 'epub' && !bilingualEpubUrl) {
                      // EPUB needs bilingual version - FIRST switch mode for instant translation
                      // Then start background DeepSeek translation
                      if (epubTranslationStatus === "idle" || epubTranslationStatus === "failed") {
                        console.log("[BilingualButton] Switching to bilingual mode for instant translation...")
                        setReadingMode("bilingual")  // This triggers instant Google translation
                        console.log("[BilingualButton] Starting background DeepSeek translation...")
                        requestEpubTranslation()
                      } else {
                        // Already translating or any other state - just switch mode
                        setReadingMode("bilingual")
                      }
                    } else {
                      setReadingMode("bilingual")
                    }
                  }}
                  size="sm"
                  variant={readingMode === "bilingual" ? "default" : "ghost"}
                  className="h-8 md:h-9 px-2 md:px-3 text-xs md:text-sm"
                >
                  <span className="text-blue-500 font-medium">{t("modes.bilingual")}</span>
                </Button>

                {/* PDF Translation button with status */}
                {fileType === 'pdf' ? (
                  <Button
                    onClick={handleTranslationModeClick}
                    size="sm"
                    variant={showTranslatedPdf ? "default" : "ghost"}
                    className="h-8 md:h-9 px-2 md:px-3 text-xs md:text-sm flex items-center gap-1"
                    disabled={pdfTranslationStatus === "pending" || pdfTranslationStatus === "processing"}
                  >
                    {pdfTranslationStatus === "pending" || pdfTranslationStatus === "processing" ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="text-orange-500 font-medium">
                          {pdfTranslationProgress > 0 ? `${pdfTranslationProgress}%` : t("loading")}
                        </span>
                      </>
                    ) : pdfTranslationStatus === "completed" ? (
                      <>
                        <FileText className="h-3 w-3" />
                        <span className="text-orange-500 font-medium">
                          {showTranslatedPdf ? t("modes.translation") : t("modes.translation")}
                        </span>
                      </>
                    ) : (
                      <span className="text-orange-500 font-medium">{t("modes.translation")}</span>
                    )}
                  </Button>
                ) : fileType === 'epub' ? (
                  /* EPUB Translation button with status */
                  <Button
                    onClick={() => {
                      if (bilingualEpubUrl) {
                        // Bilingual EPUB exists - set translation mode
                        setReadingMode("translation")
                      } else {
                        // Switch to translation mode (instant translation will kick in)
                        setReadingMode("translation")
                        // Start background translation if not already running
                        if (epubTranslationStatus === "idle" || epubTranslationStatus === "failed") {
                          console.log("[TranslationButton] Starting background translation...")
                          requestEpubTranslation()
                        }
                      }
                    }}
                    size="sm"
                    variant={readingMode === "translation" ? "default" : "ghost"}
                    className="h-8 md:h-9 px-2 md:px-3 text-xs md:text-sm"
                  >
                    <span className="text-orange-500 font-medium">{t("modes.translation")}</span>
                  </Button>
                ) : (
                  <Button
                    onClick={() => setReadingMode("translation")}
                    size="sm"
                    variant={readingMode === "translation" ? "default" : "ghost"}
                    className="h-8 md:h-9 px-2 md:px-3 text-xs md:text-sm"
                  >
                    <span className="text-orange-500 font-medium">{t("modes.translation")}</span>
                  </Button>
                )}

                <Button
                  onClick={() => {
                    // If viewing a translated book, navigate to the original
                    if (isTranslation && parentBookId) {
                      const currentBlock = currentBlockIndex >= 0 ? currentBlockIndex : 0
                      window.location.href = `/reader/${parentBookId}?block=${currentBlock}`
                      return
                    }
                    setReadingMode("original")
                    if (fileType === 'pdf') setShowTranslatedPdf(false)
                  }}
                  size="sm"
                  variant={readingMode === "original" && !showTranslatedPdf && !isTranslation ? "default" : "ghost"}
                  className="h-8 md:h-9 px-2 md:px-3 text-xs md:text-sm flex items-center gap-1"
                >
                  <span>{isTranslation ? `← ${t("modes.original")}` : t("modes.original")}</span>
                </Button>
              </div>
            </div>
          )}

          <div className={`flex-1 relative overflow-hidden ${isDarkMode ? 'dark-reader-content' : ''}`}>
            {/* PDF Mode */}
            {fileType === 'pdf' && fileUrl ? (
              <div className={isDarkMode ? 'invert hue-rotate-180' : ''} style={{ height: '100%' }}>
                {/* Show translated PDF if available and selected, otherwise show original */}
                <PDFRenderer
                  url={showTranslatedPdf && translatedPdfUrl ? translatedPdfUrl : fileUrl}
                  scale={scale}
                />
                {/* Translation status indicator overlay */}
                {(pdfTranslationStatus === "pending" || pdfTranslationStatus === "processing") && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur rounded-lg shadow-lg px-4 py-3 flex flex-col items-center gap-2 z-50">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                      <span className="text-sm font-medium">正在翻译 PDF...</span>
                    </div>
                    {pdfTranslationProgress > 0 && (
                      <Progress value={pdfTranslationProgress} className="w-32 h-2" />
                    )}
                    <span className="text-xs text-muted-foreground">翻译完成后将自动切换</span>
                  </div>
                )}
              </div>
            ) : fileType === 'epub' && fileUrl ? (
              /* EPUB Mode */
              <>
                {/* Use bilingual EPUB if available and not in original mode, otherwise original */}
                <EpubRenderer
                  url={(bilingualEpubUrl && readingMode !== 'original')
                    ? `/api/library/books/${params.bookId}/file?type=bilingual`
                    : fileUrl}
                  scale={scale}
                  readingMode={readingMode}
                  enableInstantTranslate={!bilingualEpubUrl && readingMode !== 'original'}
                />

                {/* EPUB Translation status indicator - small corner notification */}
                {epubTranslationStatus === "processing" && (
                  <div className="absolute bottom-4 right-4 bg-background/80 backdrop-blur rounded-md shadow-md px-3 py-2 flex items-center gap-2 z-50 text-xs">
                    <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                    <span className="text-muted-foreground">高质量翻译中...</span>
                  </div>
                )}
              </>
            ) : (
              /* Fallback / Text Mode */
              <ScrollArea className="h-full">
                <div className="max-w-3xl mx-auto px-8 py-12 pb-32">
                  <div className="space-y-4">
                    {enhancedBlocks.map((block, i) => (
                      <BlockComponent
                        key={block.id}
                        id={block.id}
                        originalText={block.original}
                        type={block.type}
                        headingLevel={block.meta?.level}
                        translation={block.translation}
                        readingMode={readingMode}
                        isActive={i === currentBlockIndex}
                        onPlay={handlePlayBlock}
                      />
                    ))}
                  </div>
                </div>
              </ScrollArea>
            )}

            <TranslationOverlay />
            <BackToReadingButton />
          </div>
        </div>

        {/* Sidebar - Desktop Only, Hide in fullscreen */}
        {!isFullscreen && (
          <div className={`hidden md:block w-80 shrink-0 h-full border-l`}>
            <RightSidePanel className="h-[calc(100vh-4rem-5rem)] w-full" />
          </div>
        )}
      </div>

      <BottomControlBar />
    </div>
  )
}
