"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { BookOpen, Play, X } from "lucide-react"
import { useReaderStore } from "@/lib/reader/stores/readerStore"

/**
 * Global floating indicator that shows when TTS is playing and user navigates away from reader.
 * Allows quick return to current reading position.
 */
export function GlobalReadingIndicator() {
    const pathname = usePathname()
    const router = useRouter()
    const [isDismissed, setIsDismissed] = useState(false)

    const ttsIsPlaying = useReaderStore((state) => state.tts.isPlaying)
    const bookId = useReaderStore((state) => state.bookId)
    const bookTitle = useReaderStore((state) => state.bookTitle)
    const currentBlockIndex = useReaderStore((state) => state.currentBlockIndex)
    const enhancedBlocks = useReaderStore((state) => state.enhancedBlocks)

    const totalBlocks = enhancedBlocks.length
    const progress = totalBlocks > 0 ? Math.round(((currentBlockIndex + 1) / totalBlocks) * 100) : 0

    // Check if we're on the reader page
    const isOnReaderPage = pathname?.includes('/reader')

    // Reset dismissed state when navigating back to reader
    useEffect(() => {
        if (isOnReaderPage) {
            setIsDismissed(false)
        }
    }, [isOnReaderPage])

    // Don't show if:
    // - Not playing
    // - On the reader page already
    // - Dismissed by user
    // - No book loaded
    if (!ttsIsPlaying || isOnReaderPage || isDismissed || !bookId) {
        return null
    }

    const handleReturn = () => {
        router.push(`/reader/${bookId}`)
    }

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsDismissed(true)
    }

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-all cursor-pointer group"
                onClick={handleReturn}
            >
                {/* Pulsing indicator */}
                <div className="relative flex items-center justify-center">
                    <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                        <Play className="h-4 w-4 fill-current" />
                    </div>
                    <div className="absolute inset-0 bg-white/20 rounded-full animate-ping" />
                </div>

                {/* Info */}
                <div className="flex flex-col items-start max-w-[200px]">
                    <span className="text-sm font-medium truncate w-full">
                        {bookTitle || "正在朗读"}
                    </span>
                    <span className="text-xs opacity-80">
                        段落 {currentBlockIndex + 1}/{totalBlocks} · {progress}%
                    </span>
                </div>

                {/* Return button */}
                <Button
                    variant="secondary"
                    size="sm"
                    className="ml-2 rounded-full h-8 px-3 bg-white/20 hover:bg-white/30 text-white border-0"
                >
                    <BookOpen className="h-4 w-4 mr-1" />
                    返回
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
