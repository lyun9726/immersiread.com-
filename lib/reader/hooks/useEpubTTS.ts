
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
import { buildTTSInput } from '@/lib/tts/polyphone';

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

    // Store Actions
    const ttsPlay = useReaderStore((state) => state.ttsPlay);
    const ttsPause = useReaderStore((state) => state.ttsPause);
    const ttsStop = useReaderStore((state) => state.ttsStop);

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

    // Silent audio for robust Media Session support on iOS/Android
    // A 1-second silent MP3 file (base64 encoded)
    const SILENCE_URL = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGl2Y2FzdCAxLjAuMQAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////wAAAP75AAAAAAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAATGFtZTMuMTAwAAAAAAAAAAAAALgAAAAAAAAAABAAAAAAAAAAZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAQAALgAAAAAAAP75AAAAAAAAAAAAAAQAALgAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAQAALgAAAAAAAP75AAAAAAAAAAAAAAQAALgAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAQAALgAAAAAAAP75AAAAAAAAAAAAAAQAALgAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEAAAAAAQAALgAAAAAAAP75AAAAAAAAAAAAAAQAALgAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Initialize silent audio element
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const audio = new Audio(SILENCE_URL);
            audio.loop = true;
            audioRef.current = audio;

            // Setup action handlers early
            if ('mediaSession' in navigator) {
                // Play/Pause handlers
                navigator.mediaSession.setActionHandler('play', () => {
                    console.log('[MediaSession] Play command');
                    if (synthRef.current && synthRef.current.paused) {
                        synthRef.current.resume();
                        audio.play().catch(() => { });
                        setIsPaused(false);
                        ttsPlay();
                    } else if (!useReaderStore.getState().tts.isPlaying) {
                        ttsPlay();
                    }
                });

                navigator.mediaSession.setActionHandler('pause', () => {
                    console.log('[MediaSession] Pause command');
                    if (synthRef.current && synthRef.current.speaking) {
                        synthRef.current.pause();
                        audio.pause();
                        setIsPaused(true);
                        ttsPause();
                    }
                });

                // Next/Auto-advance handler
                navigator.mediaSession.setActionHandler('nexttrack', () => {
                    // Trigger next command in store
                    useReaderStore.getState().triggerTTSCommand('next');
                });

                // Prev handler
                navigator.mediaSession.setActionHandler('previoustrack', () => {
                    console.log('[MediaSession] Prev command');
                    // Trigger prev command in store
                    useReaderStore.getState().triggerTTSCommand('prev');
                });
            }
        }

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, [ttsPlay, ttsPause]);

    /**
     * Update Media Session Metadata
     */
    const updateMediaSession = useCallback(() => {
        if ('mediaSession' in navigator) {
            // Get book metadata via Controller or Store if possible
            // Currently using generic fallback, ideally should come from current book info
            // Since we don't have direct access to bookMetadata here nicely, we use placeholders
            // In a real app, pass bookTitle/author coverUrl as props or get from store

            // Try to extract title from page text if available or use generic
            const title = "Reading current page...";

            navigator.mediaSession.metadata = new MediaMetadata({
                title: "eBook TTS Reading",
                artist: "ReadAI",
                album: "Audio Book",
                artwork: [
                    { src: '/placeholder.svg?text=Book', sizes: '96x96', type: 'image/png' },
                    { src: '/placeholder.svg?text=Book', sizes: '128x128', type: 'image/png' },
                    { src: '/placeholder.svg?text=Book', sizes: '192x192', type: 'image/png' },
                    { src: '/placeholder.svg?text=Book', sizes: '256x256', type: 'image/png' },
                    { src: '/placeholder.svg?text=Book', sizes: '384x384', type: 'image/png' },
                    { src: '/placeholder.svg?text=Book', sizes: '512x512', type: 'image/png' },
                ]
            });

            // Set playback state
            navigator.mediaSession.playbackState = 'playing';
        }
    }, []);

    // Keep ref synced with state
    useEffect(() => {
        indexRef.current = currentCharIndex;
    }, [currentCharIndex]);

    // Get TTS settings and actions from store
    // Select individually to prevent infinite loops from object identity changes
    const tts = useReaderStore(state => state.tts);

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
            if (audioRef.current) {
                audioRef.current.pause();
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

        // Check if voices are available
        const voices = synthRef.current.getVoices();
        console.log('[useEpubTTS] Available voices:', voices.length);
        if (voices.length === 0) {
            console.warn('[useEpubTTS] No TTS voices available on this browser');
            // Try loading voices after a delay (Android quirk)
            await new Promise(resolve => setTimeout(resolve, 500));
            const retryVoices = synthRef.current?.getVoices() || [];
            if (retryVoices.length === 0) {
                console.error('[useEpubTTS] Still no voices after retry');
                // Continue anyway - some browsers speak without listing voices
            }
        }

        // Start silent audio for mobile support (iOS/Android Lock Screen)
        if (audioRef.current) {
            audioRef.current.play().catch(e => console.warn('Silent audio play failed:', e));
        }

        // Update Media Session
        updateMediaSession();

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

        // If no text on current page (image-only?), try to advance to next page
        if (!text || text.trim().length === 0) {
            console.warn('[useEpubTTS] No text on current page, trying to advance...');
            const result = await epubTTSController.autoAdvanceAndContinue();
            if (result.success && result.text) {
                console.log('[useEpubTTS] Advanced to page with text, continuing playback');
                text = result.text;
                startIndex = 0; // Reset start index for new page
            } else {
                console.warn('[useEpubTTS] Could not find page with text, stopping');
                ttsStop();
                return;
            }
        }

        console.log('[useEpubTTS] Starting playback, length:', text.length, 'Offset:', startIndex);

        // Apply polyphone disambiguation for better Chinese TTS
        const { speakText, decisions, hasPolyphones } = buildTTSInput(text);
        if (hasPolyphones) {
            console.log('[useEpubTTS] Polyphone decisions:', decisions.length, decisions.slice(0, 5));
        }

        const currentTTS = useReaderStore.getState().tts;
        const utterance = new SpeechSynthesisUtterance(speakText);
        utteranceRef.current = utterance;

        utterance.rate = currentTTS.rate || rate;
        utterance.pitch = currentTTS.pitch || pitch;

        const availableVoices = synthRef.current.getVoices();
        const selectedVoiceURI = currentTTS.voiceId || voiceURI;
        if (selectedVoiceURI) {
            const voice = availableVoices.find(v => v.voiceURI === selectedVoiceURI);
            if (voice) utterance.voice = voice;
        }

        utterance.onstart = () => {
            console.log('[useEpubTTS] Playback started');
            setIsPlaying(true);
            setIsPaused(false);
            setCurrentCharIndex(startIndex);
            epubTTSController.highlightSentence(startIndex);

            // Sync Media Session state
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

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

        utterance.onend = async () => {
            console.log('[useEpubTTS] Playback ended');

            // Check if we should auto-advance
            const nearEnd = epubTTSController.isNearEndOfPage();
            console.log('[useEpubTTS] Auto-advance check:', nearEnd);

            if (nearEnd) {
                const rendition = epubTTSController.getRendition();
                if (rendition) {
                    console.log('[useEpubTTS] Auto-advancing to next page (正确时序)...');

                    // 方案A: Use the correct flow - this does:
                    // 1. invalidate → 2. next() → 3. wait rendered → 4. extract → 5. return text
                    const result = await epubTTSController.autoAdvanceAndContinue();

                    if (result.success && result.text) {
                        console.log('[useEpubTTS] Auto-advance success, starting new TTS session');
                        // Start new TTS with the extracted text
                        play(result.text, 0);
                        return; // Don't stop
                    } else {
                        console.log('[useEpubTTS] Auto-advance failed or no text, stopping');
                    }
                }
            }

            // Only stop if NOT auto-advancing or auto-advance failed
            console.log('[useEpubTTS] Stopping playback');
            setIsPlaying(false);
            setIsPaused(false);
            setCurrentCharIndex(-1);
            epubTTSController.clearHighlights();
            ttsStop(); // Sync store

            // Stop silent audio and update media session
            if (audioRef.current) audioRef.current.pause();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
        };

        utterance.onerror = (event) => {
            console.error('[useEpubTTS] Error:', event.error);
            if (event.error !== 'interrupted') {
                setIsPlaying(false);
                setIsPaused(false);
                epubTTSController.clearHighlights();
                ttsStop();
                if (audioRef.current) audioRef.current.pause();
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
            }
        };

        synthRef.current.speak(utterance);

    }, [rate, pitch, voiceURI, ttsPlay, ttsStop, updateMediaSession]);


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
                console.log('[useEpubTTS] Debug: wasPausedRef=', wasPausedRef.current, 'synthRef.paused=', synthRef.current.paused);
                wasPausedRef.current = false;

                // Get saved resume position directly
                const savedCharOffset = useReaderStore.getState().lastCharOffset;
                const savedCfi = useReaderStore.getState().epubLocation;
                const rendition = epubTTSController.getRendition();

                console.log('[useEpubTTS] Debug: savedCharOffset=', savedCharOffset, 'savedCfi=', savedCfi?.substring(0, 40));
                console.log('[useEpubTTS] Debug: indexRef.current=', indexRef.current);

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
                    console.log('[useEpubTTS] Using indexRef.current:', indexRef.current);
                    play(undefined, indexRef.current);
                } else {
                    // No saved position, start from beginning
                    console.log('[useEpubTTS] No saved position, starting from beginning');
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
                console.log('[useEpubTTS] Debug: currentCharIndex=', currentCharIndex, 'indexRef.current=', indexRef.current);
                // Save current position before pausing
                indexRef.current = currentCharIndex;
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
                console.log('[useEpubTTS] Prev sentence not found, trying prev page');
                if (synthRef.current) synthRef.current.cancel();
                // Navigate to previous page
                epubTTSController.prevPage();
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

            // Note: Auto-advance is now handled by autoAdvanceAndContinue in onend
            // This callback is mainly for text selection and resume from saved position
            if (isAutoTurningRef && isAutoTurningRef.current) {
                console.log('[useEpubTTS] Auto-turn flag set, but auto-advance handled elsewhere');
                isAutoTurningRef.current = false;
            } else if (useReaderStore.getState().tts.isPlaying) {
                // If supposed to be playing, use the found index
                console.log('[useEpubTTS] isPlaying true, starting from:', resumeIndex);
                play(undefined, resumeIndex);
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
            if (audioRef.current) audioRef.current.pause(); // Pause silent audio
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';

            setIsPaused(true);
            isAutoTurningRef.current = false;
            ttsPause(); // Store pause
            console.log('[useEpubTTS] Paused');
        }
    }, [isPlaying, ttsPause]);

    const resume = useCallback(() => {
        if (synthRef.current && isPaused) {
            synthRef.current.resume();
            if (audioRef.current) audioRef.current.play().catch(() => { }); // Resume silent audio
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

            setIsPaused(false);
            ttsPlay(); // Store play
            console.log('[useEpubTTS] Resumed');
        }
    }, [isPaused, ttsPlay]);

    const stop = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.cancel();
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';

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
        // Also pause silent audio during navigation to prevent "playing" state while loading
        if (audioRef.current) audioRef.current.pause();

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
