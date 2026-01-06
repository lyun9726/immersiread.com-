/**
 * useServerTTS - React hook for server-side TTS (Google Cloud)
 * 
 * This is a fallback for browsers that don't support Web Speech API.
 * Uses the /api/tts/google endpoint to synthesize speech.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useReaderStore } from '../stores/readerStore';

interface UseServerTTSOptions {
    language?: string;
    rate?: number;
}

interface UseServerTTSReturn {
    isSupported: boolean;
    isLoading: boolean;
    isPlaying: boolean;
    error: string | null;
    play: (text: string) => Promise<void>;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    setRate: (rate: number) => void;
}

export function useServerTTS(options: UseServerTTSOptions = {}): UseServerTTSReturn {
    const { language = 'zh', rate: initialRate = 1.0 } = options;

    const [isSupported, setIsSupported] = useState(true); // Assume supported until proven otherwise
    const [isLoading, setIsLoading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rate, setRate] = useState(initialRate);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioQueueRef = useRef<string[]>([]);
    const currentIndexRef = useRef(0);

    // Store actions
    const ttsPlay = useReaderStore((state) => state.ttsPlay);
    const ttsPause = useReaderStore((state) => state.ttsPause);
    const ttsStop = useReaderStore((state) => state.ttsStop);

    // Check if server TTS is available
    useEffect(() => {
        const checkAvailability = async () => {
            try {
                const response = await fetch('/api/tts/google');
                const data = await response.json();
                setIsSupported(data.available);
            } catch {
                setIsSupported(false);
            }
        };
        checkAvailability();
    }, []);

    // Initialize audio element
    useEffect(() => {
        if (typeof window !== 'undefined') {
            audioRef.current = new Audio();

            audioRef.current.onended = () => {
                // Play next chunk if available
                if (currentIndexRef.current < audioQueueRef.current.length - 1) {
                    currentIndexRef.current++;
                    playCurrentChunk();
                } else {
                    setIsPlaying(false);
                    ttsStop();
                }
            };

            audioRef.current.onerror = () => {
                setError('Audio playback failed');
                setIsPlaying(false);
                ttsStop();
            };
        }

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
            }
        };
    }, [ttsStop]);

    const playCurrentChunk = useCallback(() => {
        if (audioRef.current && audioQueueRef.current[currentIndexRef.current]) {
            audioRef.current.src = audioQueueRef.current[currentIndexRef.current];
            audioRef.current.playbackRate = rate;
            audioRef.current.play().catch((e) => {
                console.error('[ServerTTS] Playback error:', e);
                setError('Failed to play audio');
            });
        }
    }, [rate]);

    // Split text into chunks for better responsiveness
    const splitTextIntoChunks = (text: string, maxLength: number = 500): string[] => {
        const chunks: string[] = [];
        let remaining = text;

        while (remaining.length > 0) {
            if (remaining.length <= maxLength) {
                chunks.push(remaining);
                break;
            }

            // Try to split at sentence boundaries
            let splitIndex = maxLength;
            const sentenceEnders = ['。', '！', '？', '.', '!', '?', '\n'];

            for (let i = maxLength; i > maxLength / 2; i--) {
                if (sentenceEnders.includes(remaining[i])) {
                    splitIndex = i + 1;
                    break;
                }
            }

            chunks.push(remaining.slice(0, splitIndex));
            remaining = remaining.slice(splitIndex);
        }

        return chunks;
    };

    const synthesizeChunk = async (text: string): Promise<string> => {
        const response = await fetch('/api/tts/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                language,
                speakingRate: rate,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'TTS synthesis failed');
        }

        const data = await response.json();
        // Convert base64 to data URL
        return `data:audio/mp3;base64,${data.audioContent}`;
    };

    const play = useCallback(async (text: string) => {
        if (!text || text.trim().length === 0) {
            return;
        }

        setError(null);
        setIsLoading(true);
        ttsPlay();

        try {
            // Split text into chunks
            const chunks = splitTextIntoChunks(text);
            audioQueueRef.current = [];
            currentIndexRef.current = 0;

            console.log(`[ServerTTS] Synthesizing ${chunks.length} chunks...`);

            // Synthesize first chunk immediately for faster start
            const firstAudioUrl = await synthesizeChunk(chunks[0]);
            audioQueueRef.current.push(firstAudioUrl);

            setIsLoading(false);
            setIsPlaying(true);
            playCurrentChunk();

            // Synthesize remaining chunks in background
            for (let i = 1; i < chunks.length; i++) {
                try {
                    const audioUrl = await synthesizeChunk(chunks[i]);
                    audioQueueRef.current.push(audioUrl);
                } catch (e) {
                    console.error(`[ServerTTS] Failed to synthesize chunk ${i}:`, e);
                }
            }

        } catch (e) {
            console.error('[ServerTTS] Error:', e);
            setError(e instanceof Error ? e.message : 'Unknown error');
            setIsLoading(false);
            setIsPlaying(false);
            ttsStop();
        }
    }, [language, rate, playCurrentChunk, ttsPlay, ttsStop]);

    const pause = useCallback(() => {
        if (audioRef.current && isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
            ttsPause();
        }
    }, [isPlaying, ttsPause]);

    const resume = useCallback(() => {
        if (audioRef.current && !isPlaying && audioRef.current.src) {
            audioRef.current.play();
            setIsPlaying(true);
            ttsPlay();
        }
    }, [isPlaying, ttsPlay]);

    const stop = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current.src = '';
        }
        audioQueueRef.current = [];
        currentIndexRef.current = 0;
        setIsPlaying(false);
        setIsLoading(false);
        ttsStop();
    }, [ttsStop]);

    const updateRate = useCallback((newRate: number) => {
        setRate(newRate);
        if (audioRef.current) {
            audioRef.current.playbackRate = newRate;
        }
    }, []);

    return {
        isSupported,
        isLoading,
        isPlaying,
        error,
        play,
        pause,
        resume,
        stop,
        setRate: updateRate,
    };
}
