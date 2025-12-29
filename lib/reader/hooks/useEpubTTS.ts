/**
 * useEpubTTS - React hook for EPUB TTS with sync highlighting
 * 
 * Integrates SpeechSynthesis API with EpubTTSController for:
 * - Text extraction from current EPUB page
 * - Word/sentence highlighting during playback
 * - Auto-page-turn when reaching end of content
 * - 2-way sync with global ReaderStore for UI controls
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { epubTTSController } from '../controllers/EpubTTSController';
import { useReaderStore } from '../stores/readerStore';

// Simpler approach: use a global flag that can be checked from epub-renderer
// This avoids closure issues with React state
let globalIsAutoTurning = false;
export const isAutoTurningPage = () => globalIsAutoTurning;

interface UseEpubTTSOptions {
    rate?: number;
    pitch?: number;
    voiceURI?: string;
}

interface UseEpubTTSReturn {
    isPlaying: boolean;
    isPaused: boolean;
    currentCharIndex: number;
    play: () => Promise<void>;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    invalidate: (reason: string) => void; // NEW: Invalidate TTS session on navigation
    setRendition: (rendition: any) => void;
    epubTTSController: any;
}

export function useEpubTTS(options: UseEpubTTSOptions = {}): UseEpubTTSReturn {
    const { rate = 1.0, pitch = 1.0, voiceURI } = options;

    // Local state for immediate reactivity, but synced with Store
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [currentCharIndex, setCurrentCharIndex] = useState(-1);

    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const synthRef = useRef<SpeechSynthesis | null>(null);
    const renditionRef = useRef<any>(null);

    const isAutoTurningRef = useRef(false);
    const indexRef = useRef(currentCharIndex);
    const wasPausedRef = useRef(false); // Track if explicitly paused by user
    const pendingResumeRef = useRef(false); // Track if we're waiting for page to load before resuming

    // TTS Session Token - used to invalidate stale callbacks after navigation
    // Each new TTS session gets a unique ID. Callbacks check this to ensure they're still valid.
    const ttsSessionIdRef = useRef(0);

    // Keep ref synced with state
    useEffect(() => {
        indexRef.current = currentCharIndex;
    }, [currentCharIndex]);

    // Get TTS settings and actions from store
    // Select individually to prevent infinite loops from object identity changes
    const tts = useReaderStore(state => state.tts);
    const ttsPlay = useReaderStore(state => state.ttsPlay);
    const ttsPause = useReaderStore(state => state.ttsPause);
    const ttsStop = useReaderStore(state => state.ttsStop);
    const ttsCommand = useReaderStore(state => state.ttsCommand);

    // Command tracking to avoid duplicate execution
    const lastCommandRef = useRef(ttsCommand);

    // Initialize speech synthesis
    useEffect(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            synthRef.current = window.speechSynthesis;
        }

        return () => {
            if (synthRef.current) {
                synthRef.current.cancel();
            }
            epubTTSController.clearHighlights();
            // ttsStop(); // Avoid side effect on unmount
        };
    }, []);

    /**
     * Set the epub.js rendition for TTS controller
     */
    const setRendition = useCallback((rendition: any) => {
        console.log('[useEpubTTS] setRendition called');
        renditionRef.current = rendition;
        epubTTSController.setRendition(rendition);
    }, []);

    /**
     * Start TTS playback
     * Defined BEFORE effects that use it to avoid ReferenceError
     */
    const play = useCallback(async (textToPlay?: string, startIndex: number = 0) => {
        if (!synthRef.current) {
            console.error('[useEpubTTS] SpeechSynthesis not available');
            return;
        }

        // Update Store if not already playing
        if (!useReaderStore.getState().tts.isPlaying) {
            ttsPlay();
        }

        synthRef.current.cancel();

        // NEW: Increment session ID - this invalidates all old onboundary callbacks
        ttsSessionIdRef.current++;
        const currentSession = ttsSessionIdRef.current;
        console.log('[useEpubTTS] Starting new TTS session:', currentSession);

        let text = textToPlay;
        if (!text) {
            const fullText = await epubTTSController.extractCurrentPageText();
            text = fullText.substring(startIndex);
        }

        if (!text) {
            console.warn('[useEpubTTS] No text extracted');
            return;
        }

        console.log('[useEpubTTS] Starting playback, length:', text.length, 'Offset:', startIndex);

        const currentTTS = useReaderStore.getState().tts;
        const utterance = new SpeechSynthesisUtterance(text);
        utteranceRef.current = utterance;

        utterance.rate = currentTTS.rate || rate;
        utterance.pitch = currentTTS.pitch || pitch;

        const voices = synthRef.current.getVoices();
        const selectedVoiceURI = currentTTS.voiceId || voiceURI;
        if (selectedVoiceURI) {
            const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
            if (voice) utterance.voice = voice;
        }

        utterance.onstart = () => {
            console.log('[useEpubTTS] Playback started');
            setIsPlaying(true);
            setIsPaused(false);
            setCurrentCharIndex(startIndex);
            epubTTSController.highlightSentence(startIndex);

            // Sync persistence on start
            const cfi = epubTTSController.getCfiForCharIndex(startIndex);
            const snippet = epubTTSController.getTextForCharIndex(startIndex);
            if (cfi) {
                useReaderStore.setState({ epubLocation: cfi, lastTextSnippet: snippet });
                useReaderStore.getState().saveProgress();
            }
        };

        utterance.onboundary = (event) => {
            // CRITICAL: Check if this callback is from the current session
            // If sessionId has changed (due to page navigation), ignore this callback
            if (currentSession !== ttsSessionIdRef.current) {
                return; // Stale callback - ignore silently
            }

            if (event.name === 'word') {
                const charIndex = event.charIndex + startIndex;
                const charLength = event.charLength;
                const syncDelay = Math.max(50, 150 / (currentTTS.rate || rate));

                setTimeout(() => {
                    // Double-check session is still valid after timeout
                    if (currentSession !== ttsSessionIdRef.current) {
                        return;
                    }

                    setCurrentCharIndex(charIndex);
                    epubTTSController.highlightWord(charIndex, charLength);

                    // Optimization: Check if sentence highlighted recently?
                    // highlightSentence logic inside Controller handles redundancy
                    epubTTSController.highlightSentence(charIndex);

                    // Sync persistence - Save charOffset directly for reliable resume
                    const cfi = epubTTSController.getCfiForCharIndex(charIndex);
                    const snippet = epubTTSController.getTextForCharIndex(charIndex);
                    const spineIndex = epubTTSController.getCurrentSpineIndex();

                    useReaderStore.setState({
                        epubLocation: cfi,
                        lastTextSnippet: snippet,
                        lastCharOffset: charIndex,
                        lastSpineIndex: spineIndex
                    });
                    useReaderStore.getState().saveProgress();
                }, syncDelay);
            }
        };

        utterance.onend = () => {
            console.log('[useEpubTTS] Playback ended');

            // Check if we should auto-advance BEFORE stopping
            const nearEnd = epubTTSController.isNearEndOfPage();
            console.log('[useEpubTTS] Auto-advance check:', nearEnd);

            if (nearEnd) {
                const rendition = epubTTSController.getRendition();
                if (rendition && isAutoTurningRef) {
                    console.log('[useEpubTTS] Auto-advancing to next page...');
                    isAutoTurningRef.current = true;
                    globalIsAutoTurning = true; // Set global flag for epub-renderer
                    // Don't stop playback state yet - let onPageReady restart it
                    epubTTSController.nextPage();
                    // Keep isPlaying true so locationChanged knows not to interfere
                    return; // Don't call stop handlers
                }
            }

            // Only stop if NOT auto-advancing
            console.log('[useEpubTTS] Not auto-advancing, stopping playback');
            setIsPlaying(false);
            setIsPaused(false);
            setCurrentCharIndex(-1);
            epubTTSController.clearHighlights();
            ttsStop(); // Sync store
        };

        utterance.onerror = (event) => {
            console.error('[useEpubTTS] Error:', event.error);
            if (event.error !== 'interrupted') {
                setIsPlaying(false);
                setIsPaused(false);
                epubTTSController.clearHighlights();
                ttsStop();
            }
        };

        synthRef.current.speak(utterance);

    }, [rate, pitch, voiceURI, ttsPlay, ttsStop]);


    // ---------------------------------------------------------------------------
    // SYNC: Store State -> Local Synth (Defined AFTER play)
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (!synthRef.current) return;

        // If Store says PLAYING
        if (tts.isPlaying) {

            // Case 1: We were explicitly paused -> Resume
            if (wasPausedRef.current && synthRef.current.paused) {
                console.log('[useEpubTTS] Store synced: Resume (wasPausedRef)');
                synthRef.current.resume();
                wasPausedRef.current = false;
                setIsPaused(false);
                setIsPlaying(true);
            }
            // Case 2: Synth is not speaking (idle) -> Start
            else if (!synthRef.current.speaking) {
                console.log('[useEpubTTS] Store synced: Start (Synth was idle)');
                wasPausedRef.current = false;

                // Get saved resume position directly
                const savedCharOffset = useReaderStore.getState().lastCharOffset;
                const savedCfi = useReaderStore.getState().epubLocation;
                const rendition = epubTTSController.getRendition();

                // If we have a saved character offset, use it directly
                if (typeof savedCharOffset === 'number' && savedCharOffset > 0) {
                    console.log('[useEpubTTS] Resuming from saved charOffset:', savedCharOffset);

                    // Navigate to CFI first to ensure we're on the right page
                    if (savedCfi && rendition) {
                        pendingResumeRef.current = true;
                        // Store the offset in ref for onPageReady to use
                        indexRef.current = savedCharOffset;

                        rendition.display(savedCfi).catch((e: any) => {
                            console.warn('[useEpubTTS] Failed to navigate to CFI:', e);
                            pendingResumeRef.current = false;
                            // Fallback: try to play from saved offset anyway
                            play(undefined, savedCharOffset);
                        });
                    } else {
                        // No CFI but have offset, just start from offset
                        play(undefined, savedCharOffset);
                    }
                } else if (indexRef.current > 0) {
                    // Use local index if available
                    play(undefined, indexRef.current);
                } else {
                    // No saved position, start from beginning
                    play();
                }
            }
            // Case 3: Synth is already speaking -> Ensure local state aligns
            else {
                if (!isPlaying) setIsPlaying(true);
                if (isPaused) setIsPaused(false);
            }
        }
        // If Store says PAUSED (isPlaying = false)
        else {
            // If synth is speaking, Pause it
            if (synthRef.current.speaking && !synthRef.current.paused) {
                console.log('[useEpubTTS] Store synced: Pause');
                synthRef.current.pause();
                wasPausedRef.current = true; // Mark as explicitly paused
                setIsPaused(true);
                setIsPlaying(false);
            } else if (synthRef.current.paused) {
                // Synth was already paused (by useBrowserTTS or other source)
                console.log('[useEpubTTS] Store synced: Already paused, marking wasPausedRef');
                wasPausedRef.current = true;
                setIsPaused(true);
                setIsPlaying(false);
            } else {
                // Ensure local state aligns
                if (isPlaying) setIsPlaying(false);
            }
        }
    }, [tts.isPlaying, play]);

    // ---------------------------------------------------------------------------
    // COMMANDS: Handle Next/Prev from UI (Defined AFTER play)
    // ---------------------------------------------------------------------------
    useEffect(() => {
        // Skip if same command object (or initial ref)
        if (ttsCommand === lastCommandRef.current) return;
        lastCommandRef.current = ttsCommand;

        if (!ttsCommand.type) return;

        console.log('[useEpubTTS] Command received:', ttsCommand.type);

        if (ttsCommand.type === 'next') {
            const nextIndex = epubTTSController.getNextSentenceStart(currentCharIndex);
            if (nextIndex !== null) {
                console.log('[useEpubTTS] Skipping to next sentence:', nextIndex);
                if (synthRef.current) synthRef.current.cancel();
                play(undefined, nextIndex);
                epubTTSController.jumpToCharIndex(nextIndex); // Force view update
            } else {
                console.log('[useEpubTTS] Next sentence not found, trying next page');
                if (isAutoTurningRef) isAutoTurningRef.current = true;
                epubTTSController.nextPage();
            }
        } else if (ttsCommand.type === 'prev') {
            const prevIndex = epubTTSController.getPrevSentenceStart(currentCharIndex);
            console.log('[useEpubTTS] Skipping to prev sentence:', prevIndex);
            if (prevIndex !== null) {
                if (synthRef.current) synthRef.current.cancel();
                play(undefined, prevIndex);
                epubTTSController.jumpToCharIndex(prevIndex); // Force view update
            } else {
                console.log('[useEpubTTS] Prev sentence not found, restarting page');
                if (synthRef.current) synthRef.current.cancel();
                play(undefined, 0);
            }
        }
    }, [ttsCommand, play, currentCharIndex]);

    // Register selection and page ready handlers
    useEffect(() => {
        epubTTSController.onTextSelected = (index, text) => {
            console.log('[useEpubTTS] Handing Text Selection');
            if (synthRef.current) synthRef.current.cancel();
            isAutoTurningRef.current = false;

            // Trigger store play BEFORE starting
            ttsPlay();

            setCurrentCharIndex(index);
            setIsPlaying(true);
            play(text, index);
        };

        epubTTSController.onPageReady = () => {
            console.log('[useEpubTTS] onPageReady');

            // Get saved resume position - prefer direct charOffset over CFI matching
            const savedCharOffset = useReaderStore.getState().lastCharOffset;
            const savedSpineIndex = useReaderStore.getState().lastSpineIndex;
            const currentSpine = epubTTSController.getCurrentSpineIndex();

            let resumeIndex = 0;

            // Use saved charOffset if we're on the same chapter
            if (typeof savedCharOffset === 'number' && savedCharOffset > 0) {
                // Check if we're on the same chapter (spine) as the saved position
                if (typeof savedSpineIndex === 'number' && savedSpineIndex === currentSpine) {
                    console.log('[useEpubTTS] Using saved charOffset:', savedCharOffset);
                    resumeIndex = savedCharOffset;
                    setCurrentCharIndex(savedCharOffset);
                } else {
                    console.log('[useEpubTTS] Different chapter, starting from 0');
                    // Reset saved offset since we're on a new chapter
                    useReaderStore.setState({ lastCharOffset: null });
                }
            }

            // If we were waiting to resume after CFI navigation
            if (pendingResumeRef.current) {
                // Use indexRef which was set before navigation
                const idx = indexRef.current > 0 ? indexRef.current : resumeIndex;
                console.log('[useEpubTTS] Pending resume, starting from:', idx);
                pendingResumeRef.current = false;
                play(undefined, idx);
                return;
            }

            if (isAutoTurningRef && isAutoTurningRef.current) {
                console.log('[useEpubTTS] Auto-turn continuing');
                isAutoTurningRef.current = false;
                globalIsAutoTurning = false; // Reset global flag
                play();
            } else if (useReaderStore.getState().tts.isPlaying) {
                // If supposed to be playing, use the found index
                console.log('[useEpubTTS] isPlaying true, starting from:', resumeIndex);
                globalIsAutoTurning = false; // Reset global flag just in case
                play(undefined, resumeIndex);
            } else {
                globalIsAutoTurning = false; // Reset global flag
            }
        };

        return () => {
            epubTTSController.onTextSelected = null;
            epubTTSController.onPageReady = null;
        };
    }, [play, ttsPlay]);

    const pause = useCallback(() => {
        if (synthRef.current && isPlaying) {
            synthRef.current.pause(); // Local pause
            setIsPaused(true);
            isAutoTurningRef.current = false;
            ttsPause(); // Store pause (triggers effect loop? checked)
            console.log('[useEpubTTS] Paused');
        }
    }, [isPlaying, ttsPause]);

    const resume = useCallback(() => {
        if (synthRef.current && isPaused) {
            synthRef.current.resume();
            setIsPaused(false);
            ttsPlay(); // Store play
            console.log('[useEpubTTS] Resumed');
        }
    }, [isPaused, ttsPlay]);

    const stop = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.cancel();
            setIsPlaying(false);
            setIsPaused(false);
            setCurrentCharIndex(-1);
            isAutoTurningRef.current = false;
            epubTTSController.clearHighlights();
            ttsStop(); // Store stop
            console.log('[useEpubTTS] Stopped');
        }
    }, [ttsStop]);

    // Invalidate TTS session - call this when page/chapter changes
    // This cancels speech, clears highlights, and invalidates all pending callbacks
    // Unlike stop(), this is meant for page transitions where TTS should restart on new content
    const invalidate = useCallback((reason: string) => {
        console.log('[useEpubTTS] Invalidating TTS session:', reason);
        ttsSessionIdRef.current++; // Invalidate all onboundary callbacks
        if (synthRef.current) {
            synthRef.current.cancel();
        }
        epubTTSController.clearHighlights();
        setCurrentCharIndex(-1);
        // Note: We don't call ttsStop() - let the store state decide if playback should continue
    }, []);

    return {
        isPlaying,
        isPaused,
        currentCharIndex,
        play,
        pause,
        resume,
        stop,
        invalidate, // NEW: For page transitions
        setRendition,
        epubTTSController,
    };
}
