/**
 * Hook for Browser's built-in TTS (Web Speech API) - 100% FREE
 * No API keys required, works offline
 * Synchronized with readerStore state
 */

import { useRef, useEffect, useState, useCallback } from "react"
import { useReaderStore } from "../stores/readerStore"
import { buildTTSInput } from "@/lib/tts/polyphone"

interface Voice {
    id: string
    name: string
    lang: string
    native: SpeechSynthesisVoice
}

// --------------------------------------------------------
// MODULE-LEVEL SINGLETONS (Fix for iOS/Mobile)
// --------------------------------------------------------

// Silent audio for robust Media Session support
const SILENCE_URL = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGl2Y2FzdCAxLjAuMQAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////wAAAP75AAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAATGFtZTMuMTAwAAAAAAAAAAAAALgAAAAAAAAAABAAAAAAAAAAZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAQAALgAAAAAAAP75AAAAAAAAAAAAAAQAALgAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAQAALgAAAAAAAP75AAAAAAAAAAAAAAQAALgAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAQAALgAAAAAAAP75AAAAAAAAAAAAAAQAALgAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAQAALgAAAAAAAP75AAAAAAAAAAAAAAQAALgAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// Global Audio Instance
let globalAudio: HTMLAudioElement | null = null;
let isMediaSessionInitialized = false;

// Initialize Global Audio
const getGlobalAudio = () => {
    if (typeof window === 'undefined') return null;
    if (!globalAudio) {
        globalAudio = new Audio(SILENCE_URL);
        globalAudio.loop = true;
    }
    return globalAudio;
};

// Setup Media Session Handlers (Global)
// These handlers dispatch actions to the Store, decoupling them from any specific React component closure.
const setupGlobalMediaSession = () => {
    if (typeof window === 'undefined') return;
    if (isMediaSessionInitialized) return;
    if (!('mediaSession' in navigator)) return;

    // Play
    navigator.mediaSession.setActionHandler('play', () => {
        console.log('[MediaSession] PDF/Text Play command');
        const state = useReaderStore.getState();
        // If not playing, start playing
        if (!state.tts.isPlaying) {
            state.ttsPlay(); // This will trigger the hook to start speaking
        } else {
            // Already playing, maybe resume speech synthesis if paused at system level
            if (window.speechSynthesis && window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }
            if (globalAudio) globalAudio.play().catch(() => { });
        }
    });

    // Pause
    navigator.mediaSession.setActionHandler('pause', () => {
        console.log('[MediaSession] PDF/Text Pause command');
        const state = useReaderStore.getState();
        if (state.tts.isPlaying) {
            state.ttsPause(); // This will trigger the hook to pause
        }
        if (window.speechSynthesis) window.speechSynthesis.pause();
        if (globalAudio) globalAudio.pause();
    });

    // Next
    navigator.mediaSession.setActionHandler('nexttrack', () => {
        console.log('[MediaSession] PDF/Text Next command');
        // We trigger a generic command that the active hook will pick up
        // useReaderStore.getState().triggerTTSCommand('next'); 
        // Logic for PDF/Text next is handled inside the component listening to this?
        // Actually, we can just call the store action if we had one for "next block".
        // ReaderStore has `nextBlock()`.
        useReaderStore.getState().nextBlock();
        // Ensure we are playing
        useReaderStore.getState().ttsPlay();
    });

    // Previous
    navigator.mediaSession.setActionHandler('previoustrack', () => {
        console.log('[MediaSession] PDF/Text Prev command');
        useReaderStore.getState().previousBlock();
        useReaderStore.getState().ttsPlay();
    });

    isMediaSessionInitialized = true;
};

// --------------------------------------------------------
// HOOK
// --------------------------------------------------------

export function useBrowserTTS() {
    // State & Refs
    const [voices, setVoices] = useState<Voice[]>([])
    const [isSupported, setIsSupported] = useState(false)
    const [localIsPlaying, setLocalIsPlaying] = useState(false)

    const synthRef = useRef<SpeechSynthesis | null>(null)
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
    const activeSpeakRef = useRef<{ key: string; startedAt: number } | null>(null)

    // Store State
    const tts = useReaderStore((state) => state.tts)
    const enhancedBlocks = useReaderStore((state) => state.enhancedBlocks)
    const currentBlockIndex = useReaderStore((state) => state.currentBlockIndex)
    const readingMode = useReaderStore((state) => state.readingMode)
    const fileType = useReaderStore((state) => state.fileType)
    const targetLanguage = useReaderStore((state) => state.targetLanguage)

    // Store Actions
    const setCurrentBlockIndex = useReaderStore((state) => state.setCurrentBlockIndex)
    const jumpToPage = useReaderStore((state) => state.jumpToPage)
    const ttsPlay = useReaderStore((state) => state.ttsPlay)
    const ttsPause = useReaderStore((state) => state.ttsPause)
    const ttsStop = useReaderStore((state) => state.ttsStop)
    const setVoiceId = useReaderStore((state) => state.setVoiceId)
    const setRate = useReaderStore((state) => state.setRate)

    // Helper: Match translation language code to TTS voice language prefix
    const getVoiceLangPrefix = useCallback((langCode: string): string[] => {
        // Map translation language codes to possible TTS voice language prefixes
        const langMap: Record<string, string[]> = {
            'zh': ['zh-CN', 'zh', 'cmn'],
            'zh-TW': ['zh-TW', 'zh-HK', 'yue'],
            'en': ['en-US', 'en-GB', 'en'],
            'ja': ['ja-JP', 'ja'],
            'ko': ['ko-KR', 'ko'],
            'es': ['es-ES', 'es-MX', 'es'],
            'fr': ['fr-FR', 'fr-CA', 'fr'],
            'de': ['de-DE', 'de'],
            'it': ['it-IT', 'it'],
            'pt': ['pt-PT', 'pt'],
            'pt-BR': ['pt-BR', 'pt'],
            'ru': ['ru-RU', 'ru'],
            'ar': ['ar-SA', 'ar'],
            'hi': ['hi-IN', 'hi'],
            'th': ['th-TH', 'th'],
            'vi': ['vi-VN', 'vi'],
            'id': ['id-ID', 'id'],
            'nl': ['nl-NL', 'nl'],
            'pl': ['pl-PL', 'pl'],
            'tr': ['tr-TR', 'tr'],
            'uk': ['uk-UA', 'uk'],
            'sv': ['sv-SE', 'sv'],
            'da': ['da-DK', 'da'],
            'fi': ['fi-FI', 'fi'],
            'no': ['nb-NO', 'nn-NO', 'no'],
            'cs': ['cs-CZ', 'cs'],
            'el': ['el-GR', 'el'],
            'he': ['he-IL', 'he'],
            'hu': ['hu-HU', 'hu'],
            'ro': ['ro-RO', 'ro'],
            'sk': ['sk-SK', 'sk'],
            'bg': ['bg-BG', 'bg'],
            'hr': ['hr-HR', 'hr'],
            'sl': ['sl-SI', 'sl'],
            'sr': ['sr-RS', 'sr'],
            'lt': ['lt-LT', 'lt'],
            'lv': ['lv-LV', 'lv'],
            'et': ['et-EE', 'et'],
            'ms': ['ms-MY', 'ms'],
            'bn': ['bn-IN', 'bn-BD', 'bn'],
            'ta': ['ta-IN', 'ta'],
            'te': ['te-IN', 'te'],
            'ml': ['ml-IN', 'ml'],
            'kn': ['kn-IN', 'kn'],
            'mr': ['mr-IN', 'mr'],
            'gu': ['gu-IN', 'gu'],
            'ur': ['ur-PK', 'ur'],
            'fa': ['fa-IR', 'fa'],
            'sw': ['sw-KE', 'sw'],
            'ca': ['ca-ES', 'ca'],
        };
        return langMap[langCode] || [langCode];
    }, []);

    // Helper: Find best matching voice for a language
    const findBestVoiceForLanguage = useCallback((langCode: string, availableVoices: Voice[]): Voice | null => {
        const prefixes = getVoiceLangPrefix(langCode);

        // Try each prefix in order of preference
        for (const prefix of prefixes) {
            // First try exact match
            const exactMatch = availableVoices.find(v =>
                v.lang.toLowerCase() === prefix.toLowerCase()
            );
            if (exactMatch) return exactMatch;

            // Then try prefix match
            const prefixMatch = availableVoices.find(v =>
                v.lang.toLowerCase().startsWith(prefix.toLowerCase().split('-')[0])
            );
            if (prefixMatch) return prefixMatch;
        }

        return null;
    }, [getVoiceLangPrefix]);

    // Initialize Global Audio and Media Session on mount
    useEffect(() => {
        getGlobalAudio();
        setupGlobalMediaSession();

        // Cleanup function: Do NOT destroy global audio, just pause it if we are leaving the reader entirely?
        // Actually, for a hook used in BottomBar, we don't want to kill audio on unmount if it's SPA navigation.
        // But if we leave the page, we should stop silence.
        // Since we don't know if we are leaving, let's just leave it be. 
        // The store state determines if we are playing.

        return () => {
            // Optional: cleanup
        };
    }, []);

    // Also update MediaMetadata when component mounts or updates
    useEffect(() => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "Document Reading",
                artist: "ReadAI",
                album: "PDF/Text Reader",
                artwork: [
                    { src: '/placeholder.svg?text=Doc', sizes: '96x96', type: 'image/png' },
                    { src: '/placeholder.svg?text=Doc', sizes: '128x128', type: 'image/png' },
                ]
            });
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

                if (mappedVoices.length > 0 && tts.voiceId === "default") {
                    const zhVoice = mappedVoices.find(v => v.lang.startsWith("zh"))
                    const enVoice = mappedVoices.find(v => v.lang.startsWith("en"))
                    const defaultVoice = zhVoice || enVoice || mappedVoices[0]
                    if (defaultVoice) {
                        setVoiceId(defaultVoice.id)
                    }
                }
            }

            loadVoices()
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = loadVoices
            }
        }

        return () => {
            if (synthRef.current) {
                synthRef.current.cancel()
            }
            // Stop global audio when TTS unmounts (leaving the specific reader page context)
            if (globalAudio) {
                globalAudio.pause();
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
            }
        }
    }, [])

    // Auto-select voice based on targetLanguage and readingMode
    useEffect(() => {
        if (voices.length === 0) return;

        // Determine which language we need a voice for
        let targetLang = 'en'; // default

        if (readingMode === 'translation' || readingMode === 'bilingual') {
            // In translation/bilingual mode, use target language for TTS
            targetLang = targetLanguage || 'zh';
        } else {
            // In original mode, try to detect content language or use English
            // For now, check if current voice matches content, otherwise keep it
            // We'll default to the existing voice selection
            return; // Don't auto-switch in original mode
        }

        // Find the best voice for the target language
        const bestVoice = findBestVoiceForLanguage(targetLang, voices);

        if (bestVoice && bestVoice.id !== tts.voiceId) {
            console.log(`[TTS] Auto-selecting voice for language "${targetLang}":`, bestVoice.name);
            setVoiceId(bestVoice.id);
        }
    }, [voices, targetLanguage, readingMode, findBestVoiceForLanguage, tts.voiceId, setVoiceId]);

    // Helper: Get text to speak
    const getTextToSpeak = useCallback((blockIndex: number): string => {
        const block = enhancedBlocks[blockIndex]
        if (!block) return ""

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
                if (translationText) {
                    return mergedText + "。。。" + translationText
                }
                return mergedText
            case "original":
            default:
                return mergedText
        }
    }, [enhancedBlocks, readingMode, fileType])

    // Core Speak Function
    const speakBlock = useCallback((index: number, startOffset: number = 0) => {
        const currentFileType = useReaderStore.getState().fileType
        if (currentFileType === 'epub') {
            console.log('[useBrowserTTS] Skipping - EPUB uses useEpubTTS')
            return
        }
        if (!synthRef.current || !isSupported) return

        // --- CRITICAL FIX: Ensure GLOBAL audio is playing ---
        const audio = getGlobalAudio();
        if (audio) {
            audio.play().catch(e => console.warn('Silent audio play failed:', e));
        }
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        // ----------------------------------------------------

        const fullText = getTextToSpeak(index)
        const maxOffset = Math.max(0, fullText.length - 1)
        const effectiveOffset = readingMode === "translation" ? 0 : Math.max(0, Math.min(startOffset, maxOffset))
        const text = fullText.slice(effectiveOffset)

        console.log('[TTS speakBlock] Speaking block', index)

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
            let nextValidIndex = -1
            for (let i = index + 1; i < enhancedBlocks.length; i++) {
                const nextText = getTextToSpeak(i)
                if (nextText && nextText.trim().length > 0) {
                    nextValidIndex = i
                    break
                }
            }

            if (nextValidIndex >= 0) {
                setCurrentBlockIndex(nextValidIndex)
                setTimeout(() => speakBlock(nextValidIndex), 100)
            } else {
                ttsStop()
            }
            return
        }

        synthRef.current.cancel()

        // Apply polyphone disambiguation for better Chinese TTS
        const { speakText, decisions, hasPolyphones } = buildTTSInput(text)
        if (hasPolyphones) {
            console.log('[BrowserTTS] Polyphone decisions:', decisions.length, decisions.slice(0, 5))
        }

        const utterance = new SpeechSynthesisUtterance(speakText)
        utteranceRef.current = utterance

        const selectedVoice = voices.find(v => v.id === tts.voiceId)
        if (selectedVoice) {
            utterance.voice = selectedVoice.native
        }

        utterance.rate = tts.rate
        utterance.pitch = tts.pitch
        utterance.volume = 1.0

        let lastBoundaryIndex = -1
        let lastHighlightOffset = -1
        let repeatBoundaryCount = 0

        utterance.onstart = () => {
            if (!tts.isPlaying) ttsPlay()
            setLocalIsPlaying(true)
            useReaderStore.getState().setWordIndex(effectiveOffset)
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
            if (currentFileType === 'epub') return

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
                if (globalAudio) globalAudio.pause();
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
            }
            activeSpeakRef.current = null
        }

        utterance.onerror = (e) => {
            const currentFileType = useReaderStore.getState().fileType
            if (currentFileType === 'epub') return
            if (e.error === "interrupted") return

            console.error("[TTS] Error:", e)
            setLocalIsPlaying(false)
            useReaderStore.getState().setWordIndex(-1)
            ttsStop()
            activeSpeakRef.current = null

            if (globalAudio) globalAudio.pause();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
        }

        synthRef.current.speak(utterance)

    }, [isSupported, voices, tts.voiceId, tts.rate, tts.pitch, tts.isPlaying, readingMode, getTextToSpeak, enhancedBlocks, ttsStop, ttsPlay, setCurrentBlockIndex, jumpToPage])

    // Effect: Listen for Store Changes that should trigger playback
    // This connects the global MediaSession actions (which update store) to the local play logic
    useEffect(() => {
        // If store says playing, but we are not speaking (and not paused by system), start speaking
        // But BEWARE: We can't start audio here on iOS.
        // However, if the store update was triggered by MediaSession Next/Prev, we might be OK,
        // because MediaSession actions are considered user gestures?
        // Actually no, MediaSession actions come from the OS -> Browser -> JS.
        // It's a grey area. But usually Next/Prev should just work via store logic if nextBlock() is called.
        // But for Play, we rely on the ActionHandler calling `globalAudio.play()`.

        // What if user clicked "Next" in UI?
        // UI calls next() -> setCurrentBlockIndex -> useEffect here sees index change?
        // We handle that in next() manually calling speakBlock.
    }, [])

    // Effect: Dynamic Rate Change
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
    }, [tts.rate])

    // Effect: Listen for click-to-read requests
    const pendingPlayFromBlock = useReaderStore((state) => state.pendingPlayFromBlock)
    const pendingPlayFromPosition = useReaderStore((state) => state.pendingPlayFromPosition)
    const clearPendingPlay = useReaderStore((state) => state.clearPendingPlay)

    useEffect(() => {
        if (pendingPlayFromPosition && isSupported) {
            clearPendingPlay()
            speakBlock(pendingPlayFromPosition.blockIndex, pendingPlayFromPosition.charOffset)
            ttsPlay()
            return
        }
        if (pendingPlayFromBlock !== null && isSupported) {
            clearPendingPlay()
            speakBlock(pendingPlayFromBlock, 0)
            ttsPlay()
        }
    }, [pendingPlayFromPosition, pendingPlayFromBlock, isSupported, clearPendingPlay, speakBlock, ttsPlay])


    // Public Actions (UI triggers these)
    const play = useCallback((index?: number) => {
        const currentFileType = useReaderStore.getState().fileType
        if (currentFileType === 'epub') {
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
            getGlobalAudio()?.play().catch(() => { }); // Resume audio
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

            const audio = getGlobalAudio();
            if (audio) audio.pause();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';

            ttsPause()
            setLocalIsPlaying(false)
        }
    }, [ttsPause])

    const stop = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.cancel()

            const audio = getGlobalAudio();
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';

            ttsStop()
            setLocalIsPlaying(false)
        }
    }, [ttsStop])

    const next = useCallback(() => {
        const currentFileType = useReaderStore.getState().fileType
        if (currentFileType === 'epub') {
            useReaderStore.getState().triggerTTSCommand('next')
            return
        }
        const nextIndex = currentBlockIndex + 1
        if (nextIndex < enhancedBlocks.length) {
            setCurrentBlockIndex(nextIndex)
            ttsPlay()
            speakBlock(nextIndex, 0)
        }
    }, [currentBlockIndex, enhancedBlocks.length, speakBlock, setCurrentBlockIndex, ttsPlay])

    const previous = useCallback(() => {
        const currentFileType = useReaderStore.getState().fileType
        if (currentFileType === 'epub') {
            useReaderStore.getState().triggerTTSCommand('prev')
            return
        }
        const prevIndex = currentBlockIndex - 1
        if (prevIndex >= 0) {
            setCurrentBlockIndex(prevIndex)
            ttsPlay()
            speakBlock(prevIndex, 0)
        }
    }, [currentBlockIndex, speakBlock, setCurrentBlockIndex, ttsPlay])

    return {
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
        setRate: setRate
    };
}
