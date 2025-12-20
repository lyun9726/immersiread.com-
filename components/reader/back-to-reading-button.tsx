"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { BookOpen, ArrowUp, Play } from "lucide-react"
import { useReaderStore } from "@/lib/reader/stores/readerStore"

interface BackToReadingButtonProps {
    className?: string
}

/**
 * Floating button that appears when user scrolls away from the current reading position.
 * Shows progress info and allows quick jump back to the reading position.
 */
export function BackToReadingButton({ className }: BackToReadingButtonProps) {
    const [isVisible, setIsVisible] = useState(false)
    const [isScrolledAway, setIsScrolledAway] = useState(false)

    const ttsIsPlaying = useReaderStore((state) => state.tts.isPlaying)
    const currentBlockIndex = useReaderStore((state) => state.currentBlockIndex)
    const enhancedBlocks = useReaderStore((state) => state.enhancedBlocks)
    const fileType = useReaderStore((state) => state.fileType)

    const totalBlocks = enhancedBlocks.length
    const progress = totalBlocks > 0 ? Math.round(((currentBlockIndex + 1) / totalBlocks) * 100) : 0

    // Check if user has scrolled away from current reading position
    useEffect(() => {
        if (!ttsIsPlaying) {
            setIsVisible(false)
            return
        }

        const checkScrollPosition = () => {
            // Find the highlighted element
            const highlightedEl = document.querySelector('.block-highlight, .tts-sentence-highlight, [data-block-index="' + currentBlockIndex + '"]')

            if (highlightedEl) {
                const rect = highlightedEl.getBoundingClientRect()
                const viewportHeight = window.innerHeight

                // Check if element is outside viewport
                const isOutOfView = rect.bottom < 0 || rect.top > viewportHeight
                setIsScrolledAway(isOutOfView)
                setIsVisible(isOutOfView)
            }
        }

        // Check on scroll
        const handleScroll = () => {
            requestAnimationFrame(checkScrollPosition)
        }

        window.addEventListener('scroll', handleScroll, true)
        // Initial check
        checkScrollPosition()

        return () => {
            window.removeEventListener('scroll', handleScroll, true)
        }
    }, [ttsIsPlaying, currentBlockIndex])

    // Scroll back to current reading position
    const handleScrollBack = useCallback(() => {
        const highlightedEl = document.querySelector('.block-highlight, .tts-sentence-highlight, [data-block-index="' + currentBlockIndex + '"]')

        if (highlightedEl) {
            highlightedEl.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            })
            setIsVisible(false)
        }
    }, [currentBlockIndex])

    if (!isVisible) return null

    return (
        <div className={`fixed bottom-24 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300 ${className}`}>
            <Button
                onClick={handleScrollBack}
                className="h-14 px-5 rounded-full shadow-lg hover:shadow-xl transition-all gap-3 bg-primary hover:bg-primary/90"
            >
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <ArrowUp className="h-5 w-5" />
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    </div>
                    <div className="flex flex-col items-start text-left">
                        <span className="text-sm font-medium">回到朗读位置</span>
                        <span className="text-xs opacity-80">段落 {currentBlockIndex + 1}/{totalBlocks} ({progress}%)</span>
                    </div>
                </div>
            </Button>
        </div>
    )
}
