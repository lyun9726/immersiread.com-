/**
 * Hook for Browser's built-in TTS (Web Speech API) - 100% FREE
 * No API keys required, works offline
 * Synchronized with readerStore state
 */

import { useRef, useEffect, useState, useCallback } from "react"
import { useReaderStore } from "../stores/readerStore"

interface Voice {
    id: string
    name: string
    lang: string
    native: SpeechSynthesisVoice
}

export function useBrowserTTS() {
    const [voices, setVoices] = useState<Voice[]>([])
    const [isSupported, setIsSupported] = useState(false)
    const [localIsPlaying, setLocalIsPlaying] = useState(false) // Local state for immediate UI feedback

    // Refs for TTS objects
    const synthRef = useRef<SpeechSynthesis | null>(null)
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

    // Store State
    const tts = useReaderStore((state) => state.tts)
    const enhancedBlocks = useReaderStore((state) => state.enhancedBlocks)
    const currentBlockIndex = useReaderStore((state) => state.currentBlockIndex)
    const readingMode = useReaderStore((state) => state.readingMode)

    // Store Actions
    const setCurrentBlockIndex = useReaderStore((state) => state.setCurrentBlockIndex)
    const ttsPlay = useReaderStore((state) => state.ttsPlay)
    const ttsPause = useReaderStore((state) => state.ttsPause)
    const ttsStop = useReaderStore((state) => state.ttsStop)
    const setVoiceId = useReaderStore((state) => state.setVoiceId)
    const setRate = useReaderStore((state) => state.setRate)

    // Initialize TTS
    useEffect(() => {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
            synthRef.current = window.speechSynthesis
            setIsSupported(true)

            const loadVoices = () => {
                const availableVoices = synthRef.current?.getVoices() || []
                const mappedVoices: Voice[] = availableVoices.map((v, i) => ({
                    id: v.voiceURI || `voice-${i}`,
                    name: v.name,
                    lang: v.lang,
                    native: v
                }))
                setVoices(mappedVoices)

                // Set default voice if none selected
                if (mappedVoices.length > 0 && tts.voiceId === "default") {
                    // Prefer Chinese -> English -> First available
                    const zhVoice = mappedVoices.find(v => v.lang.startsWith("zh"))
                    const enVoice = mappedVoices.find(v => v.lang.startsWith("en"))
                    const defaultVoice = zhVoice || enVoice || mappedVoices[0]
                    if (defaultVoice) {
                        setVoiceId(defaultVoice.id)
                    }
                }
            }

            loadVoices()
            // Chrome loads voices asynchronously
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = loadVoices
            }
        }

        // Cleanup
        return () => {
            if (synthRef.current) {
                synthRef.current.cancel()
            }
        }
    }, [])

    // Effect: Handle Dynamic Rate Change
    // When rate changes while playing, we need to restart the current block
    // to apply the new speed immediately.
    useEffect(() => {
        if (tts.isPlaying && synthRef.current && isSupported) {
            // Cancel current speech
            synthRef.current.cancel()
            // Re-trigger speak for current block with new rate
            // We use a small timeout to let the cancel take effect and ensure state is clean
            const timer = setTimeout(() => {
                if (tts.isPlaying) { // Check again in case it was stopped
                    speakBlock(currentBlockIndex)
                }
            }, 10)
            return () => clearTimeout(timer)
        }
    }, [tts.rate])

    // Helper: Get text to speak based on reading mode
    const getTextToSpeak = useCallback((blockIndex: number): string => {
        const block = enhancedBlocks[blockIndex]
        if (!block) return ""

        // Use 'original' field from EnhancedBlock as per store definition
        const originalText = block.original || ""
        const translationText = block.translation || ""

        switch (readingMode) {
            case "translation":
                return translationText || originalText
            case "bilingual":
                // Speak original then translation? Or just original?
                // For now, let's speak original. Or maybe combine? 
                // Combining might be jarring if different languages.
                // Let's stick to original for consistency unless user wants translation
                return originalText
            case "original":
            default:
                return originalText
        }
    }, [enhancedBlocks, readingMode])

    // Core Speak Function
    const speakBlock = useCallback((index: number) => {
        if (!synthRef.current || !isSupported) return

        const text = getTextToSpeak(index)
        if (!text || text.trim().length === 0) {
            // Skip empty blocks
            const nextIndex = index + 1
            if (nextIndex < enhancedBlocks.length) {
                setCurrentBlockIndex(nextIndex)
                setTimeout(() => speakBlock(nextIndex), 50)
            } else {
                ttsStop()
            }
            return
        }

        // Cancel previous
        synthRef.current.cancel()

        const utterance = new SpeechSynthesisUtterance(text)
        utteranceRef.current = utterance

        // Configure Voice
        const selectedVoice = voices.find(v => v.id === tts.voiceId)
        if (selectedVoice) {
            utterance.voice = selectedVoice.native
        }

        // Configure Audio
        utterance.rate = tts.rate
        utterance.pitch = tts.pitch
        utterance.volume = 1.0

        // STABLE WORD INDEX COUNTER
        // We don't use charIndex because it resets on sentence boundaries and is unreliable.
        // Instead, we just count 'word' events as a progress signal.
        let wordIndex = 0

        // Events
        utterance.onstart = () => {
            // Ensure store knows we are playing
            if (!tts.isPlaying) ttsPlay()
            setLocalIsPlaying(true)
            // Reset word index at start of block
            wordIndex = 0
            useReaderStore.getState().setWordIndex(0)
        }

        utterance.onboundary = (event) => {
            // Only advance on 'word' events - ignore 'sentence' which causes charIndex resets
            if (event.name === 'word') {
                // Increment word index (ignore charIndex entirely - it's unreliable!)
                useReaderStore.getState().setWordIndex(wordIndex)
                wordIndex++
                console.log('[TTS onboundary] word index:', wordIndex - 1)
            }
            // Ignore 'sentence' events - they cause charIndex to reset
        }

        utterance.onend = () => {
            setLocalIsPlaying(false)
            useReaderStore.getState().setWordIndex(-1) // Clear highlight
            // Auto advance
            const nextIndex = index + 1
            if (nextIndex < enhancedBlocks.length) {
                setCurrentBlockIndex(nextIndex)
                // We rely on the recursion here
                speakBlock(nextIndex)
            } else {
                ttsStop()
            }
        }

        utterance.onerror = (e) => {
            console.error("[TTS] Error:", e)
            setLocalIsPlaying(false)
            useReaderStore.getState().setWordIndex(-1) // Clear highlight
            ttsStop()
        }

        // IMPORTANT: Speak call
        synthRef.current.speak(utterance)

    }, [isSupported, voices, tts.voiceId, tts.rate, tts.pitch, tts.isPlaying, getTextToSpeak, enhancedBlocks.length, ttsStop, ttsPlay, setCurrentBlockIndex])


    // Public Actions
    const play = useCallback((index?: number) => {
        const targetIndex = index !== undefined ? index : currentBlockIndex

        if (synthRef.current?.paused && index === undefined) {
            // Resume if paused and no specific index requested
            synthRef.current.resume()
            ttsPlay()
            setLocalIsPlaying(true)
        } else {
            // Start fresh
            ttsPlay()
            speakBlock(targetIndex)
        }
    }, [currentBlockIndex, speakBlock, ttsPlay])

    const pause = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.pause()
            ttsPause()
            setLocalIsPlaying(false)
        }
    }, [ttsPause])

    const stop = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.cancel()
            ttsStop()
            setLocalIsPlaying(false)
        }
    }, [ttsStop])

    // Navigation wrappers that also handle TTS
    const next = useCallback(() => {
        const nextIndex = currentBlockIndex + 1
        if (nextIndex < enhancedBlocks.length) {
            setCurrentBlockIndex(nextIndex)
            if (tts.isPlaying) {
                speakBlock(nextIndex)
            }
        }
    }, [currentBlockIndex, enhancedBlocks.length, tts.isPlaying, speakBlock, setCurrentBlockIndex])

    const previous = useCallback(() => {
        const prevIndex = currentBlockIndex - 1
        if (prevIndex >= 0) {
            setCurrentBlockIndex(prevIndex)
            if (tts.isPlaying) {
                speakBlock(prevIndex)
            }
        }
    }, [currentBlockIndex, tts.isPlaying, speakBlock, setCurrentBlockIndex])


    return {
        // State
        isSupported,
        isPlaying: tts.isPlaying, // Use store state as source of truth
        isPaused: !tts.isPlaying && localIsPlaying, // Derived state approximation (not perfect but OK)
        voices,
        selectedVoiceId: tts.voiceId,
        rate: tts.rate,
        currentBlockIndex,
        totalBlocks: enhancedBlocks.length,

        // Actions
        play,
        pause,
        stop,
        next,
        previous,
        setVoice: setVoiceId, // Direct map to store action
        setRate: setRate,     // Direct map to store action
    }
}
