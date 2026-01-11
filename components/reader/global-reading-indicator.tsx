"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { BookOpen, Play, Pause, X } from "lucide-react"

// ⚠️ LAZY STORE ACCESS: We DO NOT import useReaderStore at module level
// This prevents ReaderStore from being initialized on non-reader pages (e.g., Library)

/**
 * Global floating indicator that shows when user has an active reading session
 * and navigates away from reader.
 * 
 * ⚠️ PERFORMANCE FIX:
 * - Uses localStorage to detect active session first
 * - Only accesses ReaderStore when needed (lazy)
 * - Does NOT initialize ReaderStore on Library/Home page
 */

// Session data stored in localStorage
interface ActiveSession {
    bookId: string
    bookTitle: string
    blockIndex: number
    totalBlocks: number
    timestamp: number
}

const SESSION_KEY = 'omniread-active-session'
const SESSION_EXPIRY_MS = 30 * 60 * 1000 // 30 minutes

function getStoredSession(): ActiveSession | null {
    if (typeof window === 'undefined') return null
    try {
        const stored = localStorage.getItem(SESSION_KEY)
        if (!stored) return null
        const session = JSON.parse(stored) as ActiveSession
        // Check if expired
        if (Date.now() - session.timestamp > SESSION_EXPIRY_MS) {
            localStorage.removeItem(SESSION_KEY)
            return null
        }
        return session
    } catch {
        return null
    }
}

function saveSession(session: ActiveSession) {
    if (typeof window === 'undefined') return
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            ...session,
            timestamp: Date.now()
        }))
    } catch {
        // Ignore
    }
}

function clearSession() {
    if (typeof window === 'undefined') return
    try {
        localStorage.removeItem(SESSION_KEY)
    } catch {
        // Ignore
    }
}

export function GlobalReadingIndicator() {
    const pathname = usePathname()
    const router = useRouter()
    const [isDismissed, setIsDismissed] = useState(false)
    const [session, setSession] = useState<ActiveSession | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)

    // Check if we're on the reader page
    const isOnReaderPage = pathname?.includes('/reader')

    // Subscribe to ReaderStore updates ONLY on reader page
    // This avoids initializing the store on Library/Home
    useEffect(() => {
        if (!isOnReaderPage) {
            // On non-reader pages, just load from localStorage
            const stored = getStoredSession()
            if (stored) {
                setSession(stored)
            }
            return
        }

        // On reader page, subscribe to store updates
        // Dynamic import to avoid module-level initialization
        let unsubscribe: (() => void) | undefined

        const setupSubscription = async () => {
            const { useReaderStore } = await import('@/lib/reader/stores/readerStore')

            unsubscribe = useReaderStore.subscribe((state) => {
                const { bookId, bookTitle, currentBlockIndex, enhancedBlocks, tts } = state

                setIsPlaying(tts.isPlaying)

                if (bookId && (tts.isPlaying || enhancedBlocks.length > 0)) {
                    const newSession: ActiveSession = {
                        bookId,
                        bookTitle: bookTitle || 'Reading',
                        blockIndex: currentBlockIndex,
                        totalBlocks: enhancedBlocks.length,
                        timestamp: Date.now()
                    }
                    setSession(newSession)
                    saveSession(newSession)
                }
            })

            // Initial state
            const state = useReaderStore.getState()
            if (state.bookId) {
                setIsPlaying(state.tts.isPlaying)
                const newSession: ActiveSession = {
                    bookId: state.bookId,
                    bookTitle: state.bookTitle || 'Reading',
                    blockIndex: state.currentBlockIndex,
                    totalBlocks: state.enhancedBlocks.length,
                    timestamp: Date.now()
                }
                setSession(newSession)
                saveSession(newSession)
            }
        }

        setupSubscription()

        return () => {
            unsubscribe?.()
        }
    }, [isOnReaderPage])

    // Reset dismissed state when returning to reader
    useEffect(() => {
        if (isOnReaderPage) {
            setIsDismissed(false)
        }
    }, [isOnReaderPage])

    // Show indicator if:
    // - Has active session
    // - Not on reader page
    // - Not dismissed
    const shouldShow = session && !isOnReaderPage && !isDismissed

    if (!shouldShow) {
        return null
    }

    const handleReturn = () => {
        if (session?.bookId) {
            router.push(`/reader/${session.bookId}?block=${session.blockIndex}`)
        }
    }

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsDismissed(true)
        setSession(null)
        clearSession()
    }

    const progress = session?.totalBlocks
        ? Math.round(((session.blockIndex + 1) / session.totalBlocks) * 100)
        : 0

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-all cursor-pointer group"
                onClick={handleReturn}
            >
                {/* Status indicator */}
                <div className="relative flex items-center justify-center">
                    <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                        {isPlaying ? (
                            <Play className="h-4 w-4 fill-current" />
                        ) : (
                            <Pause className="h-4 w-4" />
                        )}
                    </div>
                    {isPlaying && (
                        <div className="absolute inset-0 bg-white/20 rounded-full animate-ping" />
                    )}
                </div>

                {/* Info */}
                <div className="flex flex-col items-start max-w-[200px]">
                    <span className="text-sm font-medium truncate w-full">
                        {session?.bookTitle || 'Reading'}
                    </span>
                    <span className="text-xs opacity-80">
                        {isPlaying ? "正在朗读" : "已暂停"} ·
                        段落 {(session?.blockIndex || 0) + 1}/{session?.totalBlocks || '?'}
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
