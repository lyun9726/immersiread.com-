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
    enableInstantTranslate?: boolean;  // Enable on-the-fly translation for non-bilingual EPUBs
}

export function EpubRenderer({ url, scale = 1.0, readingMode = 'original', enableInstantTranslate = false }: EpubRendererProps) {
    // State for fetched EPUB data
    const [epubData, setEpubData] = useState<ArrayBuffer | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Internal location state for ReactReader (it needs controlled component pattern)
    const [location, setLocation] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);

    // Refs
    const renditionRef = useRef<any>(null);
    const tocRef = useRef<any>(null);
    const readingModeRef = useRef(readingMode);

    // Keep ref in sync with prop
    useEffect(() => {
        readingModeRef.current = readingMode;
    }, [readingMode]);

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

    // Instant translation state
    const [isInstantTranslating, setIsInstantTranslating] = useState(false);
    const translatedChaptersCache = useRef<Map<string, boolean>>(new Map());  // Track which chapters have been translated
    const enableInstantTranslateRef = useRef(enableInstantTranslate);

    useEffect(() => {
        enableInstantTranslateRef.current = enableInstantTranslate;
    }, [enableInstantTranslate]);

    // Fetch EPUB file as ArrayBuffer
    // This is necessary because react-reader/epubjs has issues with URL path resolution
    // When given a URL, it tries to fetch internal files (like container.xml) using incorrect paths
    // By fetching the file ourselves and passing ArrayBuffer, we bypass this issue
    useEffect(() => {
        const fetchEpub = async () => {
            try {
                setIsLoading(true);
                setLoadError(null);
                setEpubData(null); // Reset previous data to avoid stale content
                setLocation(null); // Reset location when loading new EPUB
                setIsReady(false); // Reset ready state

                const absoluteUrl = url.startsWith('/')
                    ? `${window.location.origin}${url}`
                    : url;

                const isBilingualRequest = absoluteUrl.includes('type=bilingual');
                console.log(`[EpubRenderer] Fetching EPUB from: ${absoluteUrl}`);
                console.log(`[EpubRenderer] Is bilingual request: ${isBilingualRequest}, readingMode: ${readingMode}`);

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
    // This both directly modifies the body class AND sends a message to iframe
    // Also triggers instant translation when switching to bilingual/translation mode
    useEffect(() => {
        // Set global reading mode for TTS controller to access
        if (typeof window !== 'undefined') {
            (window as any).__READING_MODE__ = readingMode;
        }

        if (renditionRef.current && isReady) {
            const contents = renditionRef.current.getContents();
            if (contents && contents.length > 0) {
                for (const content of contents) {
                    const doc = content.document;
                    const win = content.window;
                    if (doc && doc.body) {
                        // Remove existing mode classes
                        doc.body.classList.remove('mode-original', 'mode-translation', 'mode-bilingual');
                        // Add new mode class
                        doc.body.classList.add(`mode-${readingMode}`);

                        // Also send postMessage for injected JS
                        if (win) {
                            win.postMessage({ type: 'bbm-mode-change', mode: readingMode }, '*');
                        }

                        // Debug: verify the class was applied
                        console.log(`[EpubRenderer] Applied reading mode: ${readingMode}, body classes: ${doc.body.className}`);

                        // INSTANT TRANSLATION: Trigger when switching to bilingual/translation mode
                        const bbmTranslated = doc.querySelectorAll('.bbm-translated');
                        const pageUrl = doc.location?.href || 'unknown';
                        const pageKey = pageUrl.split('/').pop() || 'unknown';

                        // DEBUG: Log all condition values to understand why instant translate might not trigger
                        const alreadyTranslated = translatedChaptersCache.current.has(pageKey);
                        console.log(`[EpubRenderer] INSTANT_CHECK:`, {
                            enableInstantTranslate,
                            bbmTranslatedCount: bbmTranslated.length,
                            readingMode,
                            pageKey,
                            alreadyTranslated,
                            willTrigger: bbmTranslated.length === 0 &&
                                (readingMode === 'bilingual' || readingMode === 'translation') &&
                                !alreadyTranslated
                        });

                        // FORCE instant translation for testing (removed enableInstantTranslate check)
                        if (bbmTranslated.length === 0 &&
                            (readingMode === 'bilingual' || readingMode === 'translation') &&
                            !alreadyTranslated) {

                            // Mark this page to avoid duplicate requests
                            translatedChaptersCache.current.set(pageKey, true);

                            console.log('[EpubRenderer] Mode changed, triggering instant translation for page:', pageKey);
                            setIsInstantTranslating(true);

                            // Extract text from paragraphs
                            const paragraphs = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
                            const textsToTranslate: string[] = [];
                            const elements: Element[] = [];

                            paragraphs.forEach((el: Element) => {
                                const text = el.textContent?.trim() || '';
                                if (text.length >= 5 && !el.classList.contains('bbm-original') && !el.classList.contains('bbm-translated')) {
                                    textsToTranslate.push(text);
                                    elements.push(el);
                                }
                            });

                            console.log(`[EpubRenderer] Found ${textsToTranslate.length} texts to translate`);

                            if (textsToTranslate.length > 0) {
                                // Call instant translation API
                                fetch('/api/translate/instant', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ texts: textsToTranslate })
                                })
                                    .then(res => {
                                        console.log('[EpubRenderer] Instant translation API response status:', res.status);
                                        return res.json();
                                    })
                                    .then(data => {
                                        console.log('[EpubRenderer] Instant translation API response:', data);

                                        if (data.error) {
                                            console.error('[EpubRenderer] Instant translation error:', data.error);
                                            return;
                                        }

                                        if (data.translations && data.translations.length === elements.length) {
                                            console.log(`[EpubRenderer] Instant translation completed in ${data.duration}ms`);

                                            // Inject translations
                                            elements.forEach((el, i) => {
                                                const translation = data.translations[i];
                                                if (translation && translation !== el.textContent) {
                                                    // Add bbm-original class to original
                                                    el.classList.add('bbm-original');

                                                    // Create translated element
                                                    const translatedEl = doc.createElement(el.tagName.toLowerCase());
                                                    translatedEl.className = 'bbm-translated';
                                                    translatedEl.style.cssText = 'background-color: rgba(59, 130, 246, 0.1); border-left: 3px solid rgba(59, 130, 246, 0.6); padding-left: 0.75em; margin-top: 0.5em;';
                                                    translatedEl.textContent = translation;

                                                    // Insert after original
                                                    el.parentNode?.insertBefore(translatedEl, el.nextSibling);
                                                }
                                            });

                                            // Re-apply mode class
                                            doc.body.classList.remove('mode-original', 'mode-translation', 'mode-bilingual');
                                            doc.body.classList.add(`mode-${readingMode}`);
                                        }
                                    })
                                    .catch(err => {
                                        console.error('[EpubRenderer] Instant translation failed:', err);
                                    })
                                    .finally(() => {
                                        setIsInstantTranslating(false);
                                    });
                            } else {
                                setIsInstantTranslating(false);
                            }
                        }
                    }
                }
            }
        }
    }, [readingMode, isReady, enableInstantTranslate]);

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

        // Inject TTS highlight styles and bilingual mode styles into EPUB
        // This ensures styles are applied even if the theme API fails or is overridden
        rendition.hooks.content.register((contents: any) => {
            const doc = contents.document;
            if (doc && doc.head) {
                // Inject TTS styles
                const ttsStyle = doc.createElement('style');
                ttsStyle.id = 'tts-highlight-styles';
                ttsStyle.innerHTML = `
                    .tts-sentence-highlight {
                        background-color: rgba(255, 235, 59, 0.4) !important;
                        border-radius: 3px !important;
                        transition: background-color 0.2s ease;
                        mix-blend-mode: multiply;
                        display: inline-block;
                    }
                    .tts-word-highlight {
                        background-color: rgba(255, 152, 0, 0.3) !important;
                        border-bottom: 3px solid orange !important;
                        border-radius: 2px !important;
                        transition: all 0.15s ease;
                        mix-blend-mode: multiply;
                    }
                    [data-epubjs-highlight] {
                        fill: transparent;
                    }
                `;
                doc.head.appendChild(ttsStyle);
                console.log('[EpubRenderer] Injected TTS styles via style tag');

                // Inject bilingual mode styles with high specificity
                const bilingualStyle = doc.createElement('style');
                bilingualStyle.id = 'bilingual-mode-styles';
                bilingualStyle.innerHTML = `
                    /* Bilingual Book Maker Styles - High specificity */
                    .bbm-original {
                        display: block !important;
                    }
                    .bbm-translated {
                        display: block !important;
                        background-color: rgba(59, 130, 246, 0.1);
                        border-left: 3px solid rgba(59, 130, 246, 0.6);
                        padding-left: 0.75em;
                        margin-top: 0.5em;
                        margin-bottom: 0.75em;
                    }
                    /* Mode: Original - hide translations */
                    body.mode-original .bbm-translated,
                    html body.mode-original .bbm-translated {
                        display: none !important;
                        visibility: hidden !important;
                        height: 0 !important;
                        overflow: hidden !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        border: none !important;
                    }
                    /* Mode: Translation - hide originals */
                    body.mode-translation .bbm-original,
                    html body.mode-translation .bbm-original {
                        display: none !important;
                        visibility: hidden !important;
                        height: 0 !important;
                        overflow: hidden !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        border: none !important;
                    }
                    /* Mode: Bilingual - show both */
                    body.mode-bilingual .bbm-original,
                    body.mode-bilingual .bbm-translated {
                        display: block !important;
                        visibility: visible !important;
                        height: auto !important;
                    }
                `;
                doc.head.appendChild(bilingualStyle);
                console.log('[EpubRenderer] Injected bilingual styles');
            }

            // Apply current reading mode to body
            if (doc && doc.body) {
                const currentMode = readingModeRef.current;
                doc.body.classList.remove('mode-original', 'mode-translation', 'mode-bilingual');
                doc.body.classList.add(`mode-${currentMode}`);

                // Debug: Check current page and bilingual content
                const pageUrl = doc.location?.href || 'unknown';
                const pageKey = pageUrl.split('/').pop() || 'unknown';
                const bbmOriginals = doc.querySelectorAll('.bbm-original');
                const bbmTranslated = doc.querySelectorAll('.bbm-translated');
                console.log(`[EpubRenderer] Page: ${pageKey}, Mode: ${currentMode}, Bilingual: ${bbmOriginals.length} originals, ${bbmTranslated.length} translated`);

                // INSTANT TRANSLATION: If no bilingual content and instant translate is enabled
                // and reading mode is bilingual/translation, translate the page on-the-fly
                if (enableInstantTranslateRef.current &&
                    bbmTranslated.length === 0 &&
                    (currentMode === 'bilingual' || currentMode === 'translation') &&
                    !translatedChaptersCache.current.has(pageKey)) {

                    // Mark this page as being translated to avoid duplicate requests
                    translatedChaptersCache.current.set(pageKey, true);

                    console.log('[EpubRenderer] No bilingual content found, triggering instant translation...');
                    setIsInstantTranslating(true);

                    // Extract text from paragraphs
                    const paragraphs = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
                    const textsToTranslate: string[] = [];
                    const elements: Element[] = [];

                    paragraphs.forEach((el: Element) => {
                        const text = el.textContent?.trim() || '';
                        if (text.length >= 5 && !el.classList.contains('bbm-original') && !el.classList.contains('bbm-translated')) {
                            textsToTranslate.push(text);
                            elements.push(el);
                        }
                    });

                    if (textsToTranslate.length > 0) {
                        // Call instant translation API
                        fetch('/api/translate/instant', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ texts: textsToTranslate })
                        })
                            .then(res => res.json())
                            .then(data => {
                                if (data.translations && data.translations.length === elements.length) {
                                    console.log(`[EpubRenderer] Instant translation completed in ${data.duration}ms`);

                                    // Inject translations
                                    elements.forEach((el, i) => {
                                        const translation = data.translations[i];
                                        if (translation && translation !== el.textContent) {
                                            // Add bbm-original class to original
                                            el.classList.add('bbm-original');

                                            // Create translated element
                                            const translatedEl = doc.createElement(el.tagName.toLowerCase());
                                            translatedEl.className = 'bbm-translated';
                                            translatedEl.style.cssText = 'background-color: rgba(59, 130, 246, 0.1); border-left: 3px solid rgba(59, 130, 246, 0.6); padding-left: 0.75em; margin-top: 0.5em;';
                                            translatedEl.textContent = translation;

                                            // Insert after original
                                            el.parentNode?.insertBefore(translatedEl, el.nextSibling);
                                        }
                                    });

                                    // Re-apply mode class to hide/show appropriately
                                    doc.body.classList.remove('mode-original', 'mode-translation', 'mode-bilingual');
                                    doc.body.classList.add(`mode-${readingModeRef.current}`);
                                }
                            })
                            .catch(err => {
                                console.error('[EpubRenderer] Instant translation failed:', err);
                            })
                            .finally(() => {
                                setIsInstantTranslating(false);
                            });
                    } else {
                        setIsInstantTranslating(false);
                    }
                }
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
