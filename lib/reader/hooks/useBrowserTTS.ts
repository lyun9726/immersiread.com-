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

// Silent audio for robust Media Session support on iOS/Android
// A 1-second silent MP3 file (base64 encoded)
const SILENCE_URL = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGl2Y2FzdCAxLjAuMQAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////wAAAP75AAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAATGFtZTMuMTAwAAAAAAAAAAAAALgAAAAAAAAAABAAAAAAAAAAZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAQAALgAAAAAAAP75AAAAAAAAAAAAAAQAALgAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAQAALgAAAAAAAP75AAAAAAAAAAAAAAQAALgAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAQAALgAAAAAAAP75AAAAAAAAAAAAAAQAALgAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAQAALgAAAAAAAP75AAAAAAAAAAAAAAQAALgAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export function useBrowserTTS() {
    // --------------------------------------------------------
    // State & Refs
    // --------------------------------------------------------
    const [voices, setVoices] = useState<Voice[]>([])
    const [isSupported, setIsSupported] = useState(false)
    const [localIsPlaying, setLocalIsPlaying] = useState(false) // Local state for immediate UI feedback

    // Refs for TTS objects
    const synthRef = useRef<SpeechSynthesis | null>(null)
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
    const activeSpeakRef = useRef<{ key: string; startedAt: number } | null>(null)
    // Audio ref (moved inside function)
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Store State
    const tts = useReaderStore((state) => state.tts)
    const enhancedBlocks = useReaderStore((state) => state.enhancedBlocks)
    const currentBlockIndex = useReaderStore((state) => state.currentBlockIndex)
    const readingMode = useReaderStore((state) => state.readingMode)
    const fileType = useReaderStore((state) => state.fileType) // For skipping when EPUB

    // Store Actions
    const setCurrentBlockIndex = useReaderStore((state) => state.setCurrentBlockIndex)
    const jumpToPage = useReaderStore((state) => state.jumpToPage)
    const ttsPlay = useReaderStore((state) => state.ttsPlay)
    const ttsPause = useReaderStore((state) => state.ttsPause)
    const ttsStop = useReaderStore((state) => state.ttsStop)
    const setVoiceId = useReaderStore((state) => state.setVoiceId)
    const setRate = useReaderStore((state) => state.setRate)

    // --------------------------------------------------------
    // Effects & Helpers
    // --------------------------------------------------------

    // Initialize silent audio and Media Session handlers
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const audio = new Audio(SILENCE_URL);
            audio.loop = true;
            audioRef.current = audio;

            // Setup action handlers early
            if ('mediaSession' in navigator) {
                // Play/Pause handlers
                navigator.mediaSession.setActionHandler('play', () => {
                    console.log('[MediaSession] PDF/Text Play command');
                    if (synthRef.current && synthRef.current.paused) {
                        synthRef.current.resume();
                        audio.play().catch(() => { });
                        setLocalIsPlaying(true);
                        ttsPlay();
                    } else if (!useReaderStore.getState().tts.isPlaying) {
                        ttsPlay();
                    }
                });

                navigator.mediaSession.setActionHandler('pause', () => {
                    console.log('[MediaSession] PDF/Text Pause command');
                    if (synthRef.current && synthRef.current.speaking) {
                        synthRef.current.pause();
                        audio.pause();
                        setLocalIsPlaying(false);
                        ttsPause();
                    }
                });

                // Next/Auto-advance handler
                navigator.mediaSession.setActionHandler('nexttrack', () => {
                    console.log('[MediaSession] PDF/Text Next command');
                    // Note: This static handler might capture stale closures if not careful,
                    // but we rely on the dynamic update below or store actions.
                });

                // Prev handler
                navigator.mediaSession.setActionHandler('previoustrack', () => {
                    console.log('[MediaSession] PDF/Text Prev command');
                });
            }
        }

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []); // Run once on mount to setup audio

    // Update Media Session Metadata
    const updateMediaSession = useCallback(() => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "Document Reading",
                artist: "ReadAI",
                album: "PDF/Text Reader",
                artwork: [
                    { src: '/placeholder.svg?text=Doc', sizes: '96x96', type: 'image/png' },
                    { src: '/placeholder.svg?text=Doc', sizes: '128x128', type: 'image/png' },
                    { src: '/placeholder.svg?text=Doc', sizes: '192x192', type: 'image/png' },
                    { src: '/placeholder.svg?text=Doc', sizes: '256x256', type: 'image/png' },
                    { src: '/placeholder.svg?text=Doc', sizes: '384x384', type: 'image/png' },
                    { src: '/placeholder.svg?text=Doc', sizes: '512x512', type: 'image/png' },
                ]
            });
            navigator.mediaSession.playbackState = 'playing';
        }
    }, []);

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
            if (audioRef.current) {
                audioRef.current.pause();
            }
        }
    }, [])

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

        const mergedText = normalizedOriginal
        const translationText = block.translation || ""

        switch (readingMode) {
            case "translation":
                return translationText || mergedText
            case "bilingual":
                // Speak original then translation with a pause separator
                if (translationText) {
                    return mergedText + "。。。" + translationText
                }
                return mergedText
            case "original":
            default:
                return mergedText
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

        // Start silent audio
        if (audioRef.current) {
            audioRef.current.play().catch(e => console.warn('Silent audio play failed:', e));
        }
        updateMediaSession();

        const fullText = getTextToSpeak(index)
        // Ensure offset doesn't result in empty text (would cause block skip)
        const maxOffset = Math.max(0, fullText.length - 1)
        const effectiveOffset = readingMode === "translation" ? 0 : Math.max(0, Math.min(startOffset, maxOffset))
        const text = fullText.slice(effectiveOffset)
        console.log('[TTS speakBlock] Speaking block', index, 'offset:', effectiveOffset, 'text length:', text.length, 'text:', text.substring(0, 100))

        const speakKey = `${index}:${effectiveOffset}`
        const now = Date.now()
        const active = activeSpeakRef.current
        if (active && active.key === speakKey) {
            if ((synthRef.current?.speaking || synthRef.current?.paused) && (now - active.startedAt) < 2000) {
                return
            }
        }
        activeSpeakRef.current = { key: speakKey, startedAt: now }

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
        let wordIndex = 0
        let lastBoundaryIndex = -1
        let lastHighlightOffset = -1
        let repeatBoundaryCount = 0

        // Events
        utterance.onstart = () => {
            // Ensure store knows we are playing
            if (!tts.isPlaying) ttsPlay()
            setLocalIsPlaying(true)
            wordIndex = 0
            useReaderStore.getState().setWordIndex(effectiveOffset)

            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        }

        utterance.onboundary = (event) => {
            const charIndex = event.charIndex
            if (charIndex < lastBoundaryIndex) return
            if (charIndex === lastBoundaryIndex) {
                repeatBoundaryCount += 1
                if (repeatBoundaryCount < 2) {
                    return
                }
            } else {
                repeatBoundaryCount = 0
            }

            lastBoundaryIndex = charIndex
            const actualCharInOriginal = effectiveOffset + charIndex
            let mappedOffset = actualCharInOriginal
            const currentBlock = enhancedBlocks[index]
            if (currentBlock?.pdfItems && currentBlock.pdfItems.length > 0) {
                const containingItem = currentBlock.pdfItems.find((item) =>
                    item.offset <= actualCharInOriginal &&
                    item.offset + (item.str?.length || 1) > actualCharInOriginal
                )
                if (containingItem) {
                    mappedOffset = containingItem.offset
                } else {
                    const candidates = currentBlock.pdfItems.filter((item) => item.offset <= actualCharInOriginal)
                    if (candidates.length > 0) {
                        mappedOffset = candidates[candidates.length - 1].offset
                    }
                }
            }

            if (mappedOffset < lastHighlightOffset) {
                return
            }
            lastHighlightOffset = mappedOffset
            useReaderStore.getState().setWordIndex(mappedOffset)
        }

        utterance.onend = () => {
            const currentFileType = useReaderStore.getState().fileType
            if (currentFileType === 'epub') return // Don't interfere

            setLocalIsPlaying(false)
            useReaderStore.getState().setWordIndex(-1)
            const nextIndex = index + 1
            if (nextIndex < enhancedBlocks.length) {
                setCurrentBlockIndex(nextIndex)
                setTimeout(() => {
                    speakBlock(nextIndex, 0)
                }, 100)
            } else {
                ttsStop()
                if (audioRef.current) audioRef.current.pause();
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
            }
            activeSpeakRef.current = null
        }

        utterance.onerror = (e) => {
            const currentFileType = useReaderStore.getState().fileType
            if (currentFileType === 'epub') {
                console.log('[TTS] Ignoring error for EPUB mode:', e.error)
                return
            }
            if (e.error === "interrupted") {
                console.log('[TTS] Ignoring interrupted error')
                return
            }

            console.error("[TTS] Error:", e)
            setLocalIsPlaying(false)
            useReaderStore.getState().setWordIndex(-1)
            ttsStop()
            activeSpeakRef.current = null

            if (audioRef.current) audioRef.current.pause();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
        }

        // IMPORTANT: Speak call
        synthRef.current.speak(utterance)

    }, [isSupported, voices, tts.voiceId, tts.rate, tts.pitch, tts.isPlaying, readingMode, getTextToSpeak, enhancedBlocks, ttsStop, ttsPlay, setCurrentBlockIndex, jumpToPage, updateMediaSession])

    // Effect: Handle Dynamic Rate Change
    useEffect(() => {
        if (tts.isPlaying && synthRef.current && isSupported) {
            synthRef.current.cancel()
            const timer = setTimeout(() => {
                if (tts.isPlaying) {
                    speakBlock(currentBlockIndex)
                }
            }, 10)
            return () => clearTimeout(timer)
        }
    }, [tts.rate]) // Depend ONLY on rate change (and stable refs)

    // Effect: Listen for click-to-read requests (pendingPlayFromBlock)
    const pendingPlayFromBlock = useReaderStore((state) => state.pendingPlayFromBlock)
    const pendingPlayFromPosition = useReaderStore((state) => state.pendingPlayFromPosition)
    const clearPendingPlay = useReaderStore((state) => state.clearPendingPlay)

    useEffect(() => {
        if (pendingPlayFromPosition && isSupported) {
            console.log('[useBrowserTTS] Starting play from block with offset:', pendingPlayFromPosition.blockIndex, pendingPlayFromPosition.charOffset)
            clearPendingPlay()
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
        const currentFileType = useReaderStore.getState().fileType
        if (currentFileType === 'epub') {
            triggerTTSCommand('next') // Maybe not correct 'next', but triggers state change
            // Actually play just sets playing state
            ttsPlay()
            return
        }

        const targetIndex = index !== undefined ? index : currentBlockIndex

        if (currentFileType === 'pdf') {
            const targetBlock = enhancedBlocks[targetIndex]
            const targetPage = targetBlock?.meta?.pageNumber
            if (targetPage) {
                jumpToPage(targetPage)
            }
        }

        if (synthRef.current?.paused && index === undefined) {
            synthRef.current.resume()
            ttsPlay()
            setLocalIsPlaying(true)
        } else {
            ttsPlay()
            speakBlock(targetIndex, 0)
        }
    }, [currentBlockIndex, enhancedBlocks, speakBlock, ttsPlay, jumpToPage])

    const pause = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.pause()

            if (audioRef.current) audioRef.current.pause();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';

            ttsPause()
            setLocalIsPlaying(false)
        }
    }, [ttsPause])

    const stop = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.cancel()

            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';

            ttsStop()
            setLocalIsPlaying(false)
        }
    }, [ttsStop])

    // Navigation wrappers that also handle TTS
    const triggerTTSCommand = useReaderStore((state) => state.triggerTTSCommand)

    const next = useCallback(() => {
        const currentFileType = useReaderStore.getState().fileType
        if (currentFileType === 'epub') {
            triggerTTSCommand('next')
            return
        }

        const nextIndex = currentBlockIndex + 1
        if (nextIndex < enhancedBlocks.length) {
            setCurrentBlockIndex(nextIndex)
            ttsPlay()
            speakBlock(nextIndex, 0)
        }
    }, [currentBlockIndex, enhancedBlocks.length, speakBlock, setCurrentBlockIndex, triggerTTSCommand, ttsPlay])

    const previous = useCallback(() => {
        const currentFileType = useReaderStore.getState().fileType
        if (currentFileType === 'epub') {
            triggerTTSCommand('prev')
            return
        }

        const prevIndex = currentBlockIndex - 1
        if (prevIndex >= 0) {
            setCurrentBlockIndex(prevIndex)
            ttsPlay()
            speakBlock(prevIndex, 0)
        }
    }, [currentBlockIndex, speakBlock, setCurrentBlockIndex, triggerTTSCommand, ttsPlay])

    // Update Media Session Action Handlers whenever 'next' or 'previous' changes
    useEffect(() => {
        if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                console.log('[MediaSession] PDF/Text Next command (dynamic)');
                next();
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                console.log('[MediaSession] PDF/Text Prev command (dynamic)');
                previous();
            });
        }
    }, [next, previous]);

    return {
        // State
        isSupported,
        isPlaying: tts.isPlaying,
        isPaused: !tts.isPlaying && localIsPlaying,
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
        setVoice: setVoiceId,
        setRate: setRate
    };
}
