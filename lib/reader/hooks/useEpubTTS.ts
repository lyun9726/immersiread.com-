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
            if (cfi) {
                useReaderStore.setState({ epubLocation: cfi });
                useReaderStore.getState().saveProgress();
            }
        };

        utterance.onboundary = (event) => {
            if (event.name === 'word') {
                const charIndex = event.charIndex + startIndex;
                const charLength = event.charLength;
                const syncDelay = Math.max(50, 150 / (currentTTS.rate || rate));

                setTimeout(() => {
                    setCurrentCharIndex(charIndex);
                    epubTTSController.highlightWord(charIndex, charLength);

                    // Optimization: Check if sentence highlighted recently?
                    // highlightSentence logic inside Controller handles redundancy
                    epubTTSController.highlightSentence(charIndex);

                    // Sync persistence - Update global location so we can resume
                    const cfi = epubTTSController.getCfiForCharIndex(charIndex);
                    if (cfi) {
                        useReaderStore.setState({ epubLocation: cfi });
                        useReaderStore.getState().saveProgress();
                    }
                }, syncDelay);
            }
        };

        utterance.onend = () => {
            console.log('[useEpubTTS] Playback ended');
            setIsPlaying(false);
            setIsPaused(false);
            setCurrentCharIndex(-1);
            epubTTSController.clearHighlights();

            // Auto-advance
            const nearEnd = epubTTSController.isNearEndOfPage();
            console.log('[useEpubTTS] Auto-advance check:', nearEnd);

            if (nearEnd) {
                const rendition = epubTTSController.getRendition();
                if (rendition) {
                    console.log('[useEpubTTS] Auto-advancing...');
                    if (isAutoTurningRef) {
                        isAutoTurningRef.current = true;
                        epubTTSController.nextPage();
                    }
                } else {
                    ttsStop(); // Sync store
                }
            } else {
                ttsStop(); // Sync store
            }
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

            // Case 1: Synth is paused -> Resume
            if (synthRef.current.paused) {
                console.log('[useEpubTTS] Store synced: Resume');
                synthRef.current.resume();
                setIsPaused(false);
                setIsPlaying(true);
            }
            // Case 2: Synth is not speaking (idle) -> Start
            else if (!synthRef.current.speaking) {
                console.log('[useEpubTTS] Store synced: Start (Synth was idle)');
                // If we have a stored index, resume from there
                if (currentCharIndex > 0) {
                    play(undefined, currentCharIndex);
                } else {
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

            // Check if we have a saved location to resume from
            const savedCfi = useReaderStore.getState().epubLocation;
            if (savedCfi) {
                const index = epubTTSController.findCharIndexFromCfi(savedCfi);
                if (index >= 0) {
                    console.log('[useEpubTTS] Resuming from saved CFI:', index);
                    setCurrentCharIndex(index);
                }
            }

            if (isAutoTurningRef && isAutoTurningRef.current) {
                console.log('[useEpubTTS] Auto-turn continuing');
                isAutoTurningRef.current = false;
                play();
            } else if (useReaderStore.getState().tts.isPlaying) {
                // If supposed to be playing (e.g. reload), resume
                play();
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

    return {
        isPlaying,
        isPaused,
        currentCharIndex,
        play,
        pause,
        resume,
        stop,
        setRendition,
        epubTTSController,
    };
}
