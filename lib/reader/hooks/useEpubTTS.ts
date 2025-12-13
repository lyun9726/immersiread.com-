/**
 * useEpubTTS - React hook for EPUB TTS with sync highlighting
 * 
 * Integrates SpeechSynthesis API with EpubTTSController for:
 * - Text extraction from current EPUB page
 * - Word/sentence highlighting during playback
 * - Auto-page-turn when reaching end of content
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
}

export function useEpubTTS(options: UseEpubTTSOptions = {}): UseEpubTTSReturn {
    const { rate = 1.0, pitch = 1.0, voiceURI } = options;

    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [currentCharIndex, setCurrentCharIndex] = useState(-1);

    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const synthRef = useRef<SpeechSynthesis | null>(null);
    const renditionRef = useRef<any>(null);

    // Get TTS settings from store
    const tts = useReaderStore(state => state.tts);

    // Initialize speech synthesis
    useEffect(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            synthRef.current = window.speechSynthesis;
        }

        return () => {
            // Cleanup on unmount
            if (synthRef.current) {
                synthRef.current.cancel();
            }
            epubTTSController.clearHighlights();
        };
    }, []);

    /**
     * Set the epub.js rendition for TTS controller
     */
    const setRendition = useCallback((rendition: any) => {
        renditionRef.current = rendition;
        epubTTSController.setRendition(rendition);
    }, []);

    /**
     * Start TTS playback from current page
     */
    const play = useCallback(async () => {
        if (!synthRef.current) {
            console.error('[useEpubTTS] SpeechSynthesis not available');
            return;
        }

        // Cancel any existing speech
        synthRef.current.cancel();

        // Extract text from current page
        const text = await epubTTSController.extractCurrentPageText();
        if (!text) {
            console.warn('[useEpubTTS] No text extracted from current page');
            return;
        }

        console.log('[useEpubTTS] Starting playback, text length:', text.length);

        // Create utterance
        const utterance = new SpeechSynthesisUtterance(text);
        utteranceRef.current = utterance;

        // Apply settings
        utterance.rate = tts.rate || rate;
        utterance.pitch = tts.pitch || pitch;

        // Find and set voice
        const voices = synthRef.current.getVoices();
        const selectedVoiceURI = tts.voiceURI || voiceURI;
        if (selectedVoiceURI) {
            const voice = voices.find(v => v.voiceURI === selectedVoiceURI);
            if (voice) {
                utterance.voice = voice;
            }
        }

        // Event handlers
        utterance.onstart = () => {
            console.log('[useEpubTTS] Playback started');
            setIsPlaying(true);
            setIsPaused(false);
            setCurrentCharIndex(0);

            // Initial sentence highlight
            epubTTSController.highlightSentence(0);
        };

        utterance.onboundary = (event) => {
            if (event.name === 'word') {
                const charIndex = event.charIndex;

                // Add sync delay (like we did for PDF)
                const currentRate = tts.rate || rate;
                const syncDelay = Math.max(50, 150 / currentRate);

                setTimeout(() => {
                    setCurrentCharIndex(charIndex);

                    // Update word highlight
                    epubTTSController.highlightWord(charIndex);

                    // Check for sentence boundary and update sentence highlight
                    const fullText = epubTTSController.getFullText();
                    if (charIndex > 0 && /[。？！.?!]/.test(fullText[charIndex - 1])) {
                        epubTTSController.highlightSentence(charIndex);
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

            // Auto-advance to next page if there's more content
            if (renditionRef.current) {
                // Check if we should go to next page
                epubTTSController.nextPage().then(() => {
                    // Re-extract and continue reading after a short delay
                    setTimeout(() => {
                        play();
                    }, 500);
                }).catch(() => {
                    // End of book or error
                    console.log('[useEpubTTS] Reached end of book');
                });
            }
        };

        utterance.onerror = (event) => {
            console.error('[useEpubTTS] Error:', event.error);
            setIsPlaying(false);
            setIsPaused(false);
            epubTTSController.clearHighlights();
        };

        // Start speaking
        synthRef.current.speak(utterance);

    }, [rate, pitch, voiceURI, tts]);

    /**
     * Pause TTS playback
     */
    const pause = useCallback(() => {
        if (synthRef.current && isPlaying) {
            synthRef.current.pause();
            setIsPaused(true);
            console.log('[useEpubTTS] Paused');
        }
    }, [isPlaying]);

    /**
     * Resume TTS playback
     */
    const resume = useCallback(() => {
        if (synthRef.current && isPaused) {
            synthRef.current.resume();
            setIsPaused(false);
            console.log('[useEpubTTS] Resumed');
        }
    }, [isPaused]);

    /**
     * Stop TTS playback
     */
    const stop = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.cancel();
            setIsPlaying(false);
            setIsPaused(false);
            setCurrentCharIndex(-1);
            epubTTSController.clearHighlights();
            console.log('[useEpubTTS] Stopped');
        }
    }, []);

    return {
        isPlaying,
        isPaused,
        currentCharIndex,
        play,
        pause,
        resume,
        stop,
        setRendition,
    };
}
