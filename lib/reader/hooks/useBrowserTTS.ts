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
    const fileType = useReaderStore((state) => state.fileType) // For skipping when EPUB

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

    // NOTE: pendingPlayFromBlock effect is defined after speakBlock to avoid use-before-declaration

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
        const isPdf = fileType === "pdf"
        const hasCjk = /[\u4e00-\u9fff]/.test(originalText)
        const WORD_JOINER = "\u2060"
        const normalizedOriginal = isPdf
            ? (hasCjk
                ? originalText.replace(/[\u4e00-\u9fff]\s+[\u4e00-\u9fff]/g, (match) =>
                    match.replace(/\s/g, WORD_JOINER))
                : originalText.replace(/\r/g, ' ').replace(/\n/g, ' '))
            : originalText
        const translationText = block.translation || ""

        switch (readingMode) {
            case "translation":
                return translationText || normalizedOriginal
            case "bilingual":
                // Speak original then translation? Or just original?
                // For now, let's speak original. Or maybe combine? 
                // Combining might be jarring if different languages.
                // Let's stick to original for consistency unless user wants translation
                return normalizedOriginal
            case "original":
            default:
                return normalizedOriginal
        }
    }, [enhancedBlocks, readingMode, fileType])

    // Core Speak Function - ONLY for PDF/text files, not EPUB
    const speakBlock = useCallback((index: number, startOffset: number = 0) => {
        // Skip for EPUB files - they use useEpubTTS instead
        const currentFileType = useReaderStore.getState().fileType
        if (currentFileType === 'epub') {
            console.log('[useBrowserTTS] Skipping - EPUB uses useEpubTTS')
            return
        }
        if (!synthRef.current || !isSupported) return

        const fullText = getTextToSpeak(index)
        const effectiveOffset = readingMode === "translation" ? 0 : Math.max(0, Math.min(startOffset, fullText.length))
        const text = fullText.slice(effectiveOffset)
        console.log('[TTS speakBlock] Speaking block', index, 'offset:', effectiveOffset, 'text length:', text.length, 'text:', text.substring(0, 100))

        if (!text || text.trim().length === 0) {
            // Find next non-empty block instead of recursive setTimeout
            let nextValidIndex = -1
            for (let i = index + 1; i < enhancedBlocks.length; i++) {
                const nextText = getTextToSpeak(i)
                if (nextText && nextText.trim().length > 0) {
                    nextValidIndex = i
                    break
                }
            }

            if (nextValidIndex >= 0) {
                console.log(`[TTS] Skipping empty blocks ${index} to ${nextValidIndex - 1}, jumping to ${nextValidIndex}`)
                setCurrentBlockIndex(nextValidIndex)
                // Use setTimeout to allow React to update state
                setTimeout(() => speakBlock(nextValidIndex), 100)
            } else {
                console.log('[TTS] No more valid blocks, stopping')
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
        let lastBoundaryIndex = -1

        // Events
        utterance.onstart = () => {
            // Ensure store knows we are playing
            if (!tts.isPlaying) ttsPlay()
            setLocalIsPlaying(true)
            // Reset word index at start of block
            wordIndex = 0
            useReaderStore.getState().setWordIndex(effectiveOffset)
        }

        utterance.onboundary = (event) => {
            // Use charIndex to find the corresponding pdfItem
            // pdfItems have 'offset' field that matches charIndex in the text

            // RELAXED CHECK: Accept ALL boundary events. 
            // Chrome often emits 'sentence' or nothing for Chinese, while Edge emits 'word'.
            // Trust the charIndex regardless of event name.
            const charIndex = event.charIndex

            // Add a delay to sync highlight with actual speech output
            // The Web Speech API fires boundary events slightly BEFORE the audio
            // Delay is inversely related to speech rate (faster speech = less delay)
            // DIRECT UPDATE: Remove delay to fix "Lagging Cursor" issue.
            // User reported cursor is "slow half a beat".
            // Direct processing ensures immediate visual feedback.
            if (charIndex < lastBoundaryIndex) return
            lastBoundaryIndex = charIndex

            useReaderStore.getState().setWordIndex(effectiveOffset + charIndex)

            // Debug log (throttled/simplified)
            // console.log('[TTS onboundary] event:', event.name, 'charIndex:', charIndex)
        }

        utterance.onend = () => {
            // Check if we're still in PDF/text mode (not EPUB)
            const currentFileType = useReaderStore.getState().fileType
            if (currentFileType === 'epub') {
                // Don't interfere with EPUB TTS
                return
            }

            setLocalIsPlaying(false)
            useReaderStore.getState().setWordIndex(-1) // Clear highlight
            // Auto advance
            const nextIndex = index + 1
            if (nextIndex < enhancedBlocks.length) {
                setCurrentBlockIndex(nextIndex)
                // We rely on the recursion here. 
                // Add delay to allow React state to settle and UI to update 
                // BEFORE starting audio (which fires immediate boundary events)
                setTimeout(() => speakBlock(nextIndex, 0), 50)
            } else {
                ttsStop()
            }
        }

        utterance.onerror = (e) => {
            // Check if we're still in PDF/text mode (not EPUB)
            const currentFileType = useReaderStore.getState().fileType
            if (currentFileType === 'epub') {
                // Don't interfere with EPUB TTS - the "interrupted" error is expected
                console.log('[TTS] Ignoring error for EPUB mode:', e.error)
                return
            }
            if (e.error === "interrupted") {
                // Interrupted when switching utterances; avoid stopping playback state.
                console.log('[TTS] Ignoring interrupted error')
                return
            }

            console.error("[TTS] Error:", e)
            setLocalIsPlaying(false)
            useReaderStore.getState().setWordIndex(-1) // Clear highlight
            ttsStop()
        }

        // IMPORTANT: Speak call
        synthRef.current.speak(utterance)

    }, [isSupported, voices, tts.voiceId, tts.rate, tts.pitch, tts.isPlaying, readingMode, getTextToSpeak, enhancedBlocks.length, ttsStop, ttsPlay, setCurrentBlockIndex])

    // Effect: Listen for click-to-read requests (pendingPlayFromBlock)
    // MUST be defined AFTER speakBlock to avoid use-before-declaration
    const pendingPlayFromBlock = useReaderStore((state) => state.pendingPlayFromBlock)
    const pendingPlayFromPosition = useReaderStore((state) => state.pendingPlayFromPosition)
    const clearPendingPlay = useReaderStore((state) => state.clearPendingPlay)

    useEffect(() => {
        if (pendingPlayFromPosition && isSupported) {
            console.log('[useBrowserTTS] Starting play from block with offset:', pendingPlayFromPosition.blockIndex, pendingPlayFromPosition.charOffset)
            // Clear the pending flag first
            clearPendingPlay()
            // Start playing from the requested block
            speakBlock(pendingPlayFromPosition.blockIndex, pendingPlayFromPosition.charOffset)
            ttsPlay()
            return
        }
        if (pendingPlayFromBlock !== null && isSupported) {
            console.log('[useBrowserTTS] Starting play from block:', pendingPlayFromBlock)
            clearPendingPlay()
            speakBlock(pendingPlayFromBlock, 0)
            ttsPlay()
        }
    }, [pendingPlayFromPosition, pendingPlayFromBlock, isSupported, clearPendingPlay, speakBlock, ttsPlay])


    // Public Actions
    const play = useCallback((index?: number) => {
        // Skip for EPUB files - they use useEpubTTS instead
        const currentFileType = useReaderStore.getState().fileType
        if (currentFileType === 'epub') {
            console.log('[useBrowserTTS] play() Skipping - EPUB uses useEpubTTS')
            // Still trigger global state change so EPUB TTS can pick it up
            ttsPlay()
            return
        }

        const targetIndex = index !== undefined ? index : currentBlockIndex

        if (synthRef.current?.paused && index === undefined) {
            // Resume if paused and no specific index requested
            synthRef.current.resume()
            ttsPlay()
            setLocalIsPlaying(true)
        } else {
            // Start fresh
            ttsPlay()
            speakBlock(targetIndex, 0)
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
    const triggerTTSCommand = useReaderStore((state) => state.triggerTTSCommand)

    // Navigation wrappers that also handle TTS
    const next = useCallback(() => {
        const currentFileType = useReaderStore.getState().fileType
        if (currentFileType === 'epub') {
            console.log('[useBrowserTTS] Triggering EPUB next')
            triggerTTSCommand('next')
            return
        }

        const nextIndex = currentBlockIndex + 1
        if (nextIndex < enhancedBlocks.length) {
            console.log('[useBrowserTTS] Next block:', nextIndex)
            setCurrentBlockIndex(nextIndex)
            // Always start playing when navigating to next
            ttsPlay()
            speakBlock(nextIndex, 0)
        } else {
            console.log('[useBrowserTTS] At end of book, no more blocks')
        }
    }, [currentBlockIndex, enhancedBlocks.length, speakBlock, setCurrentBlockIndex, triggerTTSCommand, ttsPlay])

    const previous = useCallback(() => {
        const currentFileType = useReaderStore.getState().fileType
        if (currentFileType === 'epub') {
            console.log('[useBrowserTTS] Triggering EPUB prev')
            triggerTTSCommand('prev')
            return
        }

        const prevIndex = currentBlockIndex - 1
        if (prevIndex >= 0) {
            console.log('[useBrowserTTS] Previous block:', prevIndex)
            setCurrentBlockIndex(prevIndex)
            // Always start playing when navigating to previous
            ttsPlay()
            speakBlock(prevIndex, 0)
        }
    }, [currentBlockIndex, speakBlock, setCurrentBlockIndex, triggerTTSCommand, ttsPlay])


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
