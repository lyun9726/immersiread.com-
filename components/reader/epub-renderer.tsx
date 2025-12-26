"use client"

import { useState, useRef, useEffect, useCallback } from 'react';
import { ReactReader, ReactReaderStyle } from 'react-reader';
import { Loader2 } from 'lucide-react';
import { useReaderStore } from '@/lib/reader/stores/readerStore';
import { useEpubTTS } from '@/lib/reader/hooks/useEpubTTS';
import type { ReadingMode } from '@/lib/types';

interface EpubRendererProps {
    url: string;
    scale?: number;
    readingMode?: ReadingMode;
}

export function EpubRenderer({ url, scale = 1.0, readingMode = 'original' }: EpubRendererProps) {
    // State for fetched EPUB data
    const [epubData, setEpubData] = useState<ArrayBuffer | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch EPUB file as ArrayBuffer
    // This is necessary because react-reader/epubjs has issues with URL path resolution
    // When given a URL, it tries to fetch internal files (like container.xml) using incorrect paths
    // By fetching the file ourselves and passing ArrayBuffer, we bypass this issue
    useEffect(() => {
        const fetchEpub = async () => {
            try {
                setIsLoading(true);
                setLoadError(null);

                const absoluteUrl = url.startsWith('/')
                    ? `${window.location.origin}${url}`
                    : url;

                console.log('[EpubRenderer] Fetching EPUB from:', absoluteUrl);

                const response = await fetch(absoluteUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch EPUB: ${response.status} ${response.statusText}`);
                }

                const arrayBuffer = await response.arrayBuffer();
                console.log('[EpubRenderer] EPUB fetched successfully, size:', arrayBuffer.byteLength);

                setEpubData(arrayBuffer);
            } catch (error) {
                console.error('[EpubRenderer] Error fetching EPUB:', error);
                setLoadError(error instanceof Error ? error.message : 'Unknown error');
            } finally {
                setIsLoading(false);
            }
        };

        if (url) {
            fetchEpub();
        }
    }, [url]);

    const renditionRef = useRef<any>(null);
    const tocRef = useRef<any>(null);

    // Connect to store
    const epubLocation = useReaderStore(state => state.epubLocation);
    const setChapters = useReaderStore(state => state.setChapters);
    const ttsIsPlaying = useReaderStore(state => state.tts.isPlaying);
    const fontSize = useReaderStore(state => state.fontSize);
    const isDarkMode = useReaderStore(state => state.isDarkMode);
    const setEpubLocation = (loc: string) => useReaderStore.setState({ epubLocation: loc });

    // EPUB TTS hook
    const epubTTS = useEpubTTS();
    const epubTTSController = epubTTS.epubTTSController; // Access controller for debug info

    // Internal location state for ReactReader (it needs controlled component pattern)
    const [location, setLocation] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);

    // Sync external epubLocation changes to internal location
    // IGNORE updates while TTS is playing to avoid conflicting navigation signals
    // TTS controller handles its own display/scrolling
    useEffect(() => {
        if (epubLocation && epubLocation !== location && !ttsIsPlaying) {
            console.log('[EpubRenderer] Navigating to:', epubLocation);
            setLocation(epubLocation);
        }
    }, [epubLocation, ttsIsPlaying]);

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

    // Dynamically update font size when store changes
    useEffect(() => {
        if (renditionRef.current && isReady) {
            renditionRef.current.themes.fontSize(`${100 * scale * fontSize}%`);
        }
    }, [fontSize, scale, isReady]);

    // Apply dark mode to EPUB content
    useEffect(() => {
        if (renditionRef.current && isReady) {
            if (isDarkMode) {
                renditionRef.current.themes.override('color', '#e0e0e0');
                renditionRef.current.themes.override('background', '#1a1a1a');
            } else {
                renditionRef.current.themes.override('color', '#000000');
                renditionRef.current.themes.override('background', '#ffffff');
            }
        }
    }, [isDarkMode, isReady]);

    // Apply reading mode to bilingual EPUB content
    // This sends a message to the EPUB iframe to switch CSS classes
    // The bilingual EPUB has injected CSS that shows/hides original/translated text based on body class
    useEffect(() => {
        if (renditionRef.current && isReady) {
            // Use postMessage to communicate with EPUB iframe
            const contents = renditionRef.current.getContents();
            if (contents && contents.length > 0) {
                for (const content of contents) {
                    const doc = content.document;
                    if (doc && doc.body) {
                        // Remove existing mode classes
                        doc.body.classList.remove('mode-original', 'mode-translation', 'mode-bilingual');
                        // Add new mode class
                        doc.body.classList.add(`mode-${readingMode}`);
                        console.log(`[EpubRenderer] Applied reading mode: ${readingMode}`);
                    }
                }
            }
        }
    }, [readingMode, isReady]);

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
        rendition.themes.fontSize(`${100 * scale * fontSize}%`);

        // Set rendition for TTS controller
        epubTTS.setRendition(rendition);

        // Mark as ready after rendition is loaded
        rendition.on('rendered', () => {
            setIsReady(true);
            console.log('[EpubRenderer] Rendition ready');
            // Force single page spread as requested for better TTS control
            rendition.spread("none");
        });

        // Inject TTS highlight styles into EPUB using a more direct method
        // This ensures styles are applied even if the theme API fails or is overridden
        rendition.hooks.content.register((contents: any) => {
            const doc = contents.document;
            if (doc && doc.head) {
                const style = doc.createElement('style');
                style.id = 'tts-highlight-styles';
                style.innerHTML = `
                    .tts-sentence-highlight {
                        background-color: rgba(255, 235, 59, 0.4) !important;
                        border-radius: 3px !important;
                        transition: background-color 0.2s ease;
                        mix-blend-mode: multiply;
                        display: inline-block; /* Helps with background visibility */
                    }
                    .tts-word-highlight {
                        background-color: rgba(255, 152, 0, 0.3) !important;
                        border-bottom: 3px solid orange !important;
                        border-radius: 2px !important;
                        transition: all 0.15s ease;
                        mix-blend-mode: multiply;
                    }
                    /* Ensure highlights are visible over other elements */
                    [data-epubjs-highlight] {
                        fill: transparent; /* Reset SVG fill if any */
                    }
                `;
                doc.head.appendChild(style);
                console.log('[EpubRenderer] Injected TTS styles via style tag');
            }
        });

        // Also try standard theme API as backup
        rendition.themes.default({
            '.tts-sentence-highlight': {
                'background-color': 'rgba(255, 235, 59, 0.4) !important',
            },
            '.tts-word-highlight': {
                'border-bottom': '3px solid orange !important',
            }
        });

        // Listen for chapter changes to update global currentChapterId (Reading Mark)
        rendition.on('relocated', (location: any) => {
            if (location && location.start && location.start.href) {
                const href = location.start.href;
                // Find matching chapter
                // Note: we need to access the LATEST chapters from store, but we are in callback.
                // We'll trust that the store provided via hook/props is sufficient or access via getState if needed.
                // But simplified: we saved chapters to store with hrefs.
                // We can't easily access store state here inside callback unless we use a ref or store API.

                // Better: Use the store's action which we can import or current chapters ref
                const chapters = useReaderStore.getState().chapters;
                const chapter = chapters.find(c => c.href === href || href.endsWith(c.href));
                if (chapter) {
                    console.log('[EpubRenderer] Current Chapter Mark:', chapter.title);
                    useReaderStore.setState({ currentChapterId: chapter.id });
                }
            }
        });
    }, [scale, epubTTS]);

    // Debug state for polling
    const [debugState, setDebugState] = useState<any>(null);
    useEffect(() => {
        const timer = setInterval(() => {
            if (epubTTS.isPlaying && epubTTSController) {
                setDebugState(epubTTSController.getDebugState());
            }
        }, 500);
        return () => clearInterval(timer);
    }, [epubTTSController, epubTTS.isPlaying]);

    // Show loading state
    if (isLoading) {
        return (
            <div className="h-[calc(100vh-140px)] w-full flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">加载电子书中...</p>
                </div>
            </div>
        );
    }

    // Show error state
    if (loadError) {
        return (
            <div className="h-[calc(100vh-140px)] w-full flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4 text-center px-4">
                    <p className="text-red-500 font-medium">加载失败</p>
                    <p className="text-muted-foreground text-sm">{loadError}</p>
                </div>
            </div>
        );
    }

    // Don't render until we have the EPUB data
    if (!epubData) {
        return null;
    }

    return (
        <div className="h-[calc(100vh-140px)] w-full flex flex-col relative bg-background box-border">
            <ReactReader
                url={epubData}
                location={location}
                epubOptions={{
                    flow: "paginated",
                    manager: "default",
                    spread: "none" // Strict single page
                }}
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
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-primary/90 text-primary-foreground px-4 py-2 rounded-full text-sm flex items-center gap-2 shadow-lg z-[9999]">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    正在朗读...
                </div>
            )}

            {/* DEBUG OVERLAY - Only visible when playing */}
            {epubTTS.isPlaying && debugState && (
                <div className="absolute bottom-16 left-4 bg-black/70 text-white p-2 rounded text-[10px] z-[50] max-w-xs font-mono overflow-hidden pointer-events-none select-none backdrop-blur-sm">
                    <div className="font-bold border-b border-white/20 mb-1 opacity-70">TTS DEBUG</div>
                    <div>Idx: {debugState.lastCharIndex}</div>
                    <div className={debugState.segmentFound ? "text-green-300" : "text-red-300"}>
                        Found: {debugState.segmentFound ? 'Yes' : 'No'}
                    </div>
                    <div>Annos: {debugState.annotationCount}</div>
                    {debugState.lastRect && (
                        <div>Rect: <span className="text-yellow-200">{debugState.lastRect}</span></div>
                    )}
                    {debugState.lastError && (
                        <div className="text-red-300 break-words mt-1 border-t border-red-500/50 pt-1">
                            Err: {debugState.lastError}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
