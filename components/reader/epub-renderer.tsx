"use client"

import { useState, useRef, useEffect, useCallback } from 'react';
import { ReactReader, ReactReaderStyle } from 'react-reader';
import { Loader2 } from 'lucide-react';
import { useReaderStore } from '@/lib/reader/stores/readerStore';
import { useEpubTTS } from '@/lib/reader/hooks/useEpubTTS';

interface EpubRendererProps {
    url: string;
    scale?: number;
}

export function EpubRenderer({ url, scale = 1.0 }: EpubRendererProps) {
    const renditionRef = useRef<any>(null);
    const tocRef = useRef<any>(null);

    // Connect to store
    const epubLocation = useReaderStore(state => state.epubLocation);
    const setChapters = useReaderStore(state => state.setChapters);
    const ttsIsPlaying = useReaderStore(state => state.tts.isPlaying);
    const setEpubLocation = (loc: string) => useReaderStore.setState({ epubLocation: loc });

    // EPUB TTS hook
    const epubTTS = useEpubTTS();

    // Internal location state for ReactReader (it needs controlled component pattern)
    const [location, setLocation] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);

    // Sync external epubLocation changes to internal location
    useEffect(() => {
        if (epubLocation && epubLocation !== location) {
            console.log('[EpubRenderer] Navigating to:', epubLocation);
            setLocation(epubLocation);
        }
    }, [epubLocation]);

    // Register EPUB TTS controls to the global store when ready
    // Store stable references to TTS functions to avoid infinite loops
    const epubTTSRef = useRef(epubTTS);
    epubTTSRef.current = epubTTS;

    // Track if we're handling a state transition to avoid loops
    const isTransitioningRef = useRef(false);

    useEffect(() => {
        if (!isReady) return;

        // Register EPUB-specific TTS methods in the store (only once when ready)
        console.log('[EpubRenderer] EPUB TTS ready, controls available');
    }, [isReady]);

    // Sync TTS state with global ttsIsPlaying - but avoid feedback loops
    useEffect(() => {
        if (!isReady || isTransitioningRef.current) return;

        const tts = epubTTSRef.current;

        if (ttsIsPlaying && !tts.isPlaying && !tts.isPaused) {
            // Global play requested, start EPUB TTS
            console.log('[EpubRenderer] Starting EPUB TTS from global state');
            isTransitioningRef.current = true;
            tts.play().finally(() => {
                isTransitioningRef.current = false;
            });
        } else if (!ttsIsPlaying && tts.isPlaying) {
            // Global stop requested
            console.log('[EpubRenderer] Stopping EPUB TTS from global state');
            isTransitioningRef.current = true;
            tts.stop();
            setTimeout(() => {
                isTransitioningRef.current = false;
            }, 100);
        }
    }, [ttsIsPlaying, isReady]);

    // Custom styles to inject into the EPUB iframe
    const ownStyles = {
        ...ReactReaderStyle,
        arrow: {
            ...ReactReaderStyle.arrow,
            color: 'hsl(var(--foreground))',
        },
        // Hide default arrows if we want custom controls
        // arrowContainer: { display: 'none' },
    }

    const handleRendition = useCallback((rendition: any) => {
        renditionRef.current = rendition;

        // Inject basic style adjustments
        rendition.themes.fontSize(`${100 * scale}%`);

        // Set rendition for TTS controller
        epubTTS.setRendition(rendition);

        // Mark as ready after rendition is loaded
        rendition.on('rendered', () => {
            setIsReady(true);
            console.log('[EpubRenderer] Rendition ready');
        });

        // Inject TTS highlight styles into EPUB
        rendition.themes.default({
            '.tts-sentence-highlight': {
                'background-color': 'rgba(255, 235, 59, 0.25) !important',
                'border-radius': '2px',
                'transition': 'background-color 0.2s ease',
            },
            '.tts-word-highlight': {
                'background-color': 'rgba(255, 152, 0, 0.35) !important',
                'border-bottom': '2px solid orange',
                'border-radius': '2px',
                'transition': 'all 0.15s ease',
            },
            '::selection': {
                'background-color': 'rgba(59, 130, 246, 0.3)',
            }
        });
    }, [scale, epubTTS]);

    return (
        <div className="h-[calc(100vh-140px)] w-full flex flex-col relative bg-background">
            <ReactReader
                url={url}
                location={location}
                locationChanged={(loc: string) => {
                    setLocation(loc);
                    setEpubLocation(loc);
                }}
                tocChanged={(toc: any) => {
                    tocRef.current = toc;
                    // Convert ReactReader TOC to our chapter format
                    if (toc && toc.length > 0) {
                        const chapters = toc.map((item: any, index: number) => ({
                            id: `epub-toc-${index}`,
                            title: item.label,
                            order: index,
                            blockIds: [],
                            href: item.href, // Store the href for navigation
                        }));
                        console.log('[EpubRenderer] Extracted TOC:', chapters.length, 'chapters');
                        setChapters(chapters);
                    }
                }}
                getRendition={handleRendition}
                loadingView={
                    <div className="flex items-center justify-center p-8 w-full h-full">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                }
                readerStyles={ownStyles}
            />

            {/* TTS Status Indicator */}
            {epubTTS.isPlaying && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-primary/90 text-primary-foreground px-4 py-2 rounded-full text-sm flex items-center gap-2 shadow-lg">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    正在朗读...
                </div>
            )}
        </div>
    );
}
