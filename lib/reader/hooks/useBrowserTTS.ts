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

// Using a ref for the audio element
const audioRef = useRef<HTMLAudioElement | null>(null);

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
                // We need to call our internal next logic
                // Since we can't easily access the 'next' function from closure here without deps issues,
                // we'll trigger it via store or event dispatch if needed, OR just rebuild this effect when next changes.
                // For now, let's use a workaround: dispatch a custom event or use store command if possible,
                // but wait! useBrowserTTS handles 'next' internally.
                // Let's defer binding these handlers until we have the 'next' and 'previous' function refs available?
                // Actually, the useEffect dependency array solution is cleaner.
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

// ... existing effect ...

// Core Speak Function - ONLY for PDF/text files, not EPUB
const speakBlock = useCallback((index: number, startOffset: number = 0) => {
    // ... existing checks ...
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
    // ... existing logic ...
    const maxOffset = Math.max(0, fullText.length - 1)
    const effectiveOffset = readingMode === "translation" ? 0 : Math.max(0, Math.min(startOffset, maxOffset))
    const text = fullText.slice(effectiveOffset)
    // ...

    // ... existing logic ...
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
        // Reset word index at start of block
        wordIndex = 0
        useReaderStore.getState().setWordIndex(effectiveOffset)

        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    }

    utterance.onboundary = (event) => {
        // ... logic ...
        // Copy-paste existing logic here implicitly via tool replacement, but let's be safe
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
        // ... existing error logic ...
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
        useReaderStore.getState().setWordIndex(-1) // Clear highlight
        ttsStop()
        activeSpeakRef.current = null

        if (audioRef.current) audioRef.current.pause();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
    }

    synthRef.current.speak(utterance)

}, [isSupported, voices, tts.voiceId, tts.rate, tts.pitch, tts.isPlaying, readingMode, getTextToSpeak, enhancedBlocks, ttsStop, ttsPlay, setCurrentBlockIndex, jumpToPage, updateMediaSession])

// ... public actions play/pause/stop ...

// NOTE: We need to properly bind 'next' and 'previous' to media session actions.
// The previous implementation inside useEffect was partial.
// We should use a separate useEffect using the 'next' and 'previous' refs or deps.

// Navigation wrappers that also handle TTS
const triggerTTSCommand = useReaderStore((state) => state.triggerTTSCommand)

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

return {
    // ... return items ...
    isSupported,
    isPlaying: tts.isPlaying,
    isPaused: !tts.isPlaying && localIsPlaying,
    voices,
    selectedVoiceId: tts.voiceId,
    rate: tts.rate,
    currentBlockIndex,
    totalBlocks: enhancedBlocks.length,
    play,
    pause,
    stop,
    next,
    previous,
    setVoice: setVoiceId,
    setRate: setRate,
}
