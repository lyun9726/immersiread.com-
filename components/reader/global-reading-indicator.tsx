"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { BookOpen, Play, Pause, X } from "lucide-react"
import { useReaderStore } from "@/lib/reader/stores/readerStore"

/**
 * Global floating indicator that shows when user has an active reading session
 * and navigates away from reader. Allows quick return to reading position.
 */
export function GlobalReadingIndicator() {
    const pathname = usePathname()
    const router = useRouter()
    const [isDismissed, setIsDismissed] = useState(false)
    const [hasActiveSession, setHasActiveSession] = useState(false)
    const lastBookIdRef = useRef<string | null>(null)

    const ttsIsPlaying = useReaderStore((state) => state.tts.isPlaying)
    const bookId = useReaderStore((state) => state.bookId)
    const bookTitle = useReaderStore((state) => state.bookTitle)
    const currentBlockIndex = useReaderStore((state) => state.currentBlockIndex)
    const enhancedBlocks = useReaderStore((state) => state.enhancedBlocks)

    const totalBlocks = enhancedBlocks.length
    const progress = totalBlocks > 0 ? Math.round(((currentBlockIndex + 1) / totalBlocks) * 100) : 0

    // Check if we're on the reader page
    const isOnReaderPage = pathname?.includes('/reader')

    // Track active reading session - persist when TTS starts until user explicitly returns
    useEffect(() => {
        // When TTS starts playing and we have a book, mark as active session
        if (ttsIsPlaying && bookId) {
            setHasActiveSession(true)
            lastBookIdRef.current = bookId
        }
    }, [ttsIsPlaying, bookId])

    // Reset when returning to reader
    useEffect(() => {
        if (isOnReaderPage) {
            setIsDismissed(false)
        }
    }, [isOnReaderPage])

    // Clear session when book changes
    useEffect(() => {
        if (bookId && lastBookIdRef.current && bookId !== lastBookIdRef.current) {
            setHasActiveSession(false)
        }
    }, [bookId])

    // Show indicator if:
    // - Has active session OR TTS is currently playing
    // - Not on reader page
    // - Not dismissed
    // - Has a book loaded
    const shouldShow = (hasActiveSession || ttsIsPlaying) && !isOnReaderPage && !isDismissed && bookId

    if (!shouldShow) {
        return null
    }

    const handleReturn = () => {
        const targetBookId = bookId || lastBookIdRef.current
        if (targetBookId) {
            router.push(`/reader/${targetBookId}`)
        }
    }

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsDismissed(true)
        setHasActiveSession(false) // Clear session when dismissed
    }

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-all cursor-pointer group"
                onClick={handleReturn}
            >
                {/* Status indicator */}
                <div className="relative flex items-center justify-center">
                    <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                        {ttsIsPlaying ? (
                            <Play className="h-4 w-4 fill-current" />
                        ) : (
                            <Pause className="h-4 w-4" />
                        )}
                    </div>
                    {ttsIsPlaying && (
                        <div className="absolute inset-0 bg-white/20 rounded-full animate-ping" />
                    )}
                </div>

                {/* Info */}
                <div className="flex flex-col items-start max-w-[200px]">
                    <span className="text-sm font-medium truncate w-full">
                        {bookTitle || "正在阅读"}
                    </span>
                    <span className="text-xs opacity-80">
                        {ttsIsPlaying ? "正在朗读" : "已暂停"} · 段落 {currentBlockIndex + 1}/{totalBlocks || '?'}
                    </span>
                </div>

                {/* Return button */}
                <Button
                    variant="secondary"
                    size="sm"
                    className="ml-2 rounded-full h-8 px-3 bg-white/20 hover:bg-white/30 text-white border-0"
                >
                    <BookOpen className="h-4 w-4 mr-1" />
                    返回阅读
                </Button>

                {/* Dismiss button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full hover:bg-white/20 opacity-60 hover:opacity-100"
                    onClick={handleDismiss}
                >
                    <X className="h-3 w-3" />
                </Button>
            </div>
        </div>
    )
}

