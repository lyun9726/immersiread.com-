/**
 * useHybridTTS - Unified TTS hook that uses browser TTS when available,
 * falls back to server TTS (Google Cloud) otherwise.
 * 
 * Usage:
 * const { play, pause, stop, isSupported, usesServerTTS } = useHybridTTS();
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useReaderStore } from '../stores/readerStore';

interface HybridTTSOptions {
    language?: string;
    rate?: number;
    pitch?: number;
    voiceURI?: string;
}

interface HybridTTSReturn {
    isSupported: boolean;
    usesServerTTS: boolean;
    isLoading: boolean;
    isPlaying: boolean;
    isPaused: boolean;
    error: string | null;
    play: (text: string, startIndex?: number) => Promise<void>;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    setRate: (rate: number) => void;
}

export function useHybridTTS(options: HybridTTSOptions = {}): HybridTTSReturn {
    const { language = 'zh', rate: initialRate = 1.0, pitch = 1.0 } = options;

    // State
    const [browserTTSSupported, setBrowserTTSSupported] = useState<boolean | null>(null);
    const [serverTTSAvailable, setServerTTSAvailable] = useState<boolean | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rate, setRateState] = useState(initialRate);

    // Refs
    const synthRef = useRef<SpeechSynthesis | null>(null);
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Store actions
    const ttsPlay = useReaderStore((state) => state.ttsPlay);
    const ttsPause = useReaderStore((state) => state.ttsPause);
    const ttsStop = useReaderStore((state) => state.ttsStop);

    // Check browser TTS support
    useEffect(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            synthRef.current = window.speechSynthesis;

            // Check if voices are available
            const checkVoices = () => {
                const voices = synthRef.current?.getVoices() || [];
                if (voices.length > 0) {
                    console.log('[HybridTTS] Browser TTS supported with', voices.length, 'voices');
                    setBrowserTTSSupported(true);
                }
            };

            checkVoices();

            // Some browsers load voices asynchronously
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = checkVoices;
            }

            // Retry after delays for mobile browsers
            const timeouts = [100, 500, 1000, 2000].map(delay =>
                setTimeout(() => {
                    const voices = synthRef.current?.getVoices() || [];
                    if (voices.length > 0) {
                        setBrowserTTSSupported(true);
                    }
                }, delay)
            );

            // Final check
            const finalTimeout = setTimeout(() => {
                const voices = synthRef.current?.getVoices() || [];
                setBrowserTTSSupported(voices.length > 0);
            }, 3000);

            return () => {
                timeouts.forEach(clearTimeout);
                clearTimeout(finalTimeout);
            };
        } else {
            setBrowserTTSSupported(false);
        }
    }, []);

    // Check server TTS availability
    useEffect(() => {
        const checkServer = async () => {
            try {
                const response = await fetch('/api/tts/google');
                const data = await response.json();
                setServerTTSAvailable(data.available);
                console.log('[HybridTTS] Server TTS available:', data.available);
            } catch {
                setServerTTSAvailable(false);
            }
        };
        checkServer();
    }, []);

    // Initialize audio element for server TTS
    useEffect(() => {
        if (typeof window !== 'undefined') {
            audioRef.current = new Audio();
            audioRef.current.onended = () => {
                setIsPlaying(false);
                setIsPaused(false);
                ttsStop();
            };
            audioRef.current.onerror = () => {
                setError('Audio playback failed');
                setIsPlaying(false);
                ttsStop();
            };
        }
        return () => {
            audioRef.current?.pause();
        };
    }, [ttsStop]);

    // Determine which TTS to use
    const usesServerTTS = browserTTSSupported === false && serverTTSAvailable === true;
    const isSupported = browserTTSSupported === true || serverTTSAvailable === true;

    // Play with browser TTS
    const playWithBrowserTTS = useCallback(async (text: string) => {
        if (!synthRef.current) return;

        synthRef.current.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utteranceRef.current = utterance;
        utterance.rate = rate;
        utterance.pitch = pitch;

        // Try to find matching voice
        const voices = synthRef.current.getVoices();
        const langPrefixes = language === 'zh' ? ['zh-CN', 'zh', 'cmn'] : [language];
        for (const prefix of langPrefixes) {
            const voice = voices.find(v => v.lang.toLowerCase().startsWith(prefix.toLowerCase()));
            if (voice) {
                utterance.voice = voice;
                break;
            }
        }

        utterance.onstart = () => {
            setIsPlaying(true);
            setIsPaused(false);
            ttsPlay();
        };

        utterance.onend = () => {
            setIsPlaying(false);
            setIsPaused(false);
            ttsStop();
        };

        utterance.onerror = (event) => {
            if (event.error !== 'interrupted') {
                console.error('[HybridTTS] Browser TTS error:', event.error);
                setError(`TTS error: ${event.error}`);
                setIsPlaying(false);
                ttsStop();
            }
        };

        synthRef.current.speak(utterance);
    }, [rate, pitch, language, ttsPlay, ttsStop]);

    // Play with server TTS
    const playWithServerTTS = useCallback(async (text: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/tts/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text.slice(0, 5000), // Limit to 5000 chars
                    language,
                    speakingRate: rate,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'TTS synthesis failed');
            }

            const data = await response.json();
            const audioUrl = `data:audio/mp3;base64,${data.audioContent}`;

            if (audioRef.current) {
                audioRef.current.src = audioUrl;
                audioRef.current.playbackRate = rate;
                await audioRef.current.play();
                setIsPlaying(true);
                ttsPlay();
            }
        } catch (e) {
            console.error('[HybridTTS] Server TTS error:', e);
            setError(e instanceof Error ? e.message : 'Unknown error');
            ttsStop();
        } finally {
            setIsLoading(false);
        }
    }, [language, rate, ttsPlay, ttsStop]);

    // Main play function
    const play = useCallback(async (text: string, _startIndex: number = 0) => {
        if (!text || text.trim().length === 0) return;

        setError(null);

        if (browserTTSSupported) {
            console.log('[HybridTTS] Using browser TTS');
            await playWithBrowserTTS(text);
        } else if (serverTTSAvailable) {
            console.log('[HybridTTS] Using server TTS');
            await playWithServerTTS(text);
        } else {
            setError('No TTS available');
        }
    }, [browserTTSSupported, serverTTSAvailable, playWithBrowserTTS, playWithServerTTS]);

    // Pause
    const pause = useCallback(() => {
        if (browserTTSSupported && synthRef.current?.speaking) {
            synthRef.current.pause();
            setIsPaused(true);
            setIsPlaying(false);
            ttsPause();
        } else if (audioRef.current && isPlaying) {
            audioRef.current.pause();
            setIsPaused(true);
            setIsPlaying(false);
            ttsPause();
        }
    }, [browserTTSSupported, isPlaying, ttsPause]);

    // Resume
    const resume = useCallback(() => {
        if (browserTTSSupported && synthRef.current?.paused) {
            synthRef.current.resume();
            setIsPaused(false);
            setIsPlaying(true);
            ttsPlay();
        } else if (audioRef.current && isPaused) {
            audioRef.current.play();
            setIsPaused(false);
            setIsPlaying(true);
            ttsPlay();
        }
    }, [browserTTSSupported, isPaused, ttsPlay]);

    // Stop
    const stop = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.cancel();
        }
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        setIsPlaying(false);
        setIsPaused(false);
        ttsStop();
    }, [ttsStop]);

    // Set rate
    const setRate = useCallback((newRate: number) => {
        setRateState(newRate);
        if (audioRef.current) {
            audioRef.current.playbackRate = newRate;
        }
    }, []);

    return {
        isSupported,
        usesServerTTS,
        isLoading,
        isPlaying,
        isPaused,
        error,
        play,
        pause,
        resume,
        stop,
        setRate,
    };
}
