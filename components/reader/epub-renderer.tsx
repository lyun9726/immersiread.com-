"use client"

import { useState, useRef, useEffect, useCallback } from 'react';
import { ReactReader, ReactReaderStyle } from 'react-reader';
import { Loader2 } from 'lucide-react';
import { useReaderStore } from '@/lib/reader/stores/readerStore';
import { useEpubTTS } from '@/lib/reader/hooks/useEpubTTS';
import { epubTTSController } from '@/lib/reader/controllers/EpubTTSController';
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
    const targetLanguage = useReaderStore(state => state.targetLanguage);
    const setEpubLocation = (loc: string) => useReaderStore.setState({ epubLocation: loc });

    // Ensure store knows we are in EPUB mode to enable correct controls
    useEffect(() => {
        useReaderStore.setState({ fileType: 'epub' });
        return () => {
            useReaderStore.setState({ fileType: 'text' });
        };
    }, []);

    // EPUB TTS hook
    const epubTTS = useEpubTTS();
    const epubTTSController = epubTTS.epubTTSController; // Access controller for debug info

    // Instant translation state
    const [isInstantTranslating, setIsInstantTranslating] = useState(false);
    // Cache actual translations so they can be re-applied when returning to a page
    // Key: pageKey, Value: array of {original: string, translated: string} pairs
    const translatedChaptersCache = useRef<Map<string, Array<{ original: string, translated: string }>>>(new Map());
    const enableInstantTranslateRef = useRef(enableInstantTranslate);

    useEffect(() => {
        enableInstantTranslateRef.current = enableInstantTranslate;
    }, [enableInstantTranslate]);

    useEffect(() => {
        enableInstantTranslateRef.current = enableInstantTranslate;
    }, [enableInstantTranslate]);

    // Swipe & Wheel handling
    const touchStartX = useRef(0);
    const touchStartY = useRef(0);
    const lastWheelTime = useRef(0); // Debounce for wheel

    const handleTouchStart = useCallback((e: any) => {
        touchStartX.current = e.changedTouches[0].clientX;
        touchStartY.current = e.changedTouches[0].clientY;
    }, []);

    const handleTouchEnd = useCallback((e: any) => {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const deltaX = touchEndX - touchStartX.current;
        const deltaY = touchEndY - touchStartY.current;

        // Horizontal swipe detection (more horizontal than vertical, and significant distance)
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
            if (deltaX > 0) {
                // Swipe Right -> Prev Page
                renditionRef.current?.prev();
            } else {
                // Swipe Left -> Next Page
                renditionRef.current?.next();
            }
        }
    }, []);

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

                        // Get unique page identifier - use cfiBase or sectionIndex instead of URL
                        // because URL is 'about:srcdoc' for all pages when loaded from ArrayBuffer
                        const cfiBase = content.cfiBase || '';
                        const sectionIndex = content.sectionIndex ?? -1;
                        const pageKey = cfiBase || `section-${sectionIndex}` || 'unknown';

                        // Check if we're in bilingual/translation mode
                        if (readingMode === 'bilingual' || readingMode === 'translation') {
                            const cachedTranslations = translatedChaptersCache.current.get(pageKey);

                            if (cachedTranslations && bbmTranslated.length === 0) {
                                // RE-INJECT cached translations
                                console.log(`[EpubRenderer] Mode change: Re-injecting ${cachedTranslations.length} cached translations`);
                                const paragraphs = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
                                let injected = 0;

                                paragraphs.forEach((el: Element) => {
                                    const text = el.textContent?.trim() || '';
                                    const match = cachedTranslations.find(t => t.original === text);
                                    if (match && !el.classList.contains('bbm-original')) {
                                        el.classList.add('bbm-original');
                                        const translatedEl = doc.createElement(el.tagName.toLowerCase());
                                        translatedEl.className = 'bbm-translated';
                                        translatedEl.style.cssText = 'background-color: rgba(59, 130, 246, 0.1); border-left: 3px solid rgba(59, 130, 246, 0.6); padding-left: 0.75em; margin-top: 0.5em;';
                                        translatedEl.textContent = match.translated;
                                        el.parentNode?.insertBefore(translatedEl, el.nextSibling);
                                        injected++;
                                    }
                                });

                                console.log(`[EpubRenderer] Re-injected ${injected} translations from cache`);

                            } else if (!cachedTranslations && bbmTranslated.length === 0) {
                                // NEW TRANSLATION needed
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
                                        body: JSON.stringify({ texts: textsToTranslate, targetLang: targetLanguage })
                                    })
                                        .then(res => {
                                            if (!res.ok) {
                                                console.warn(`[EpubRenderer] Translation API returned ${res.status}, continuing without translation`);
                                            }
                                            return res.json();
                                        })
                                        .then(data => {
                                            // Handle empty or error responses gracefully
                                            if (data.error) {
                                                console.warn('[EpubRenderer] Translation API error (non-blocking):', data.error);
                                                return; // Continue without translation
                                            }

                                            if (data.translations && data.translations.length > 0) {
                                                console.log(`[EpubRenderer] Instant translation completed in ${data.duration}ms, got ${data.translations.length} translations`);

                                                // Build translation pairs for caching
                                                const translationPairs: Array<{ original: string, translated: string }> = [];

                                                // Inject translations
                                                elements.forEach((el, i) => {
                                                    const originalText = el.textContent?.trim() || '';
                                                    const translation = data.translations[i];
                                                    if (translation && translation !== originalText) {
                                                        // Add to cache
                                                        translationPairs.push({ original: originalText, translated: translation });

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

                                                // Cache the translations
                                                if (translationPairs.length > 0) {
                                                    translatedChaptersCache.current.set(pageKey, translationPairs);
                                                    console.log(`[EpubRenderer] Cached ${translationPairs.length} translations for page: ${pageKey}`);

                                                    // Notify TTS controller to re-extract text (content has changed)
                                                    epubTTSController.forceReExtract(true);
                                                }

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
        }
    }, [readingMode, isReady, enableInstantTranslate]);

    // Custom styles to inject into the EPUB iframe
    const ownStyles = {
        ...ReactReaderStyle,
        container: {
            ...ReactReaderStyle.container,
            backgroundColor: 'transparent', // Fix white background
        },
        readerArea: {
            ...ReactReaderStyle.readerArea,
            backgroundColor: 'transparent', // Fix white background
            marginBottom: '0', // Reduce bottom margin
            marginTop: '0',
            width: '100%',
            height: '100%',
            padding: '0', // Remove padding to maximize space
        },
        arrow: {
            ...ReactReaderStyle.arrow,
            color: 'hsl(var(--foreground))',
            display: 'none', // Hide arrows as requested for swipe navigation
        },
        titleArea: {
            ...ReactReaderStyle.titleArea,
            display: 'none',
        },
        // Hide the built-in TOC since we have our own in the right sidebar
        tocArea: {
            ...ReactReaderStyle.tocArea,
            display: 'none',
        },
        tocButton: {
            ...ReactReaderStyle.tocButton,
            display: 'none',
        },
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

        // Attach swipe listeners
        rendition.on('touchstart', handleTouchStart);
        rendition.on('touchend', handleTouchEnd);

        // Attach Mouse Wheel Listener (via hooks to access iframe content)
        rendition.hooks.content.register((contents: any) => {
            const win = contents.window;
            if (win) {
                win.addEventListener('wheel', (e: WheelEvent) => {
                    const now = Date.now();
                    // Debounce: 500ms cooldown
                    if (now - lastWheelTime.current < 500) return;

                    if (Math.abs(e.deltaY) > 30) {
                        if (e.deltaY > 0) {
                            lastWheelTime.current = now;
                            rendition.next();
                        } else {
                            lastWheelTime.current = now;
                            rendition.prev();
                        }
                    }
                });
            }
        });

        // Inject TTS highlight styles, layout overrides, and bilingual mode styles into EPUB
        rendition.hooks.content.register((contents: any) => {
            const doc = contents.document;
            if (doc && doc.head) {
                const style = doc.createElement('style');
                style.textContent = `
                    /* Maximize text area & Dark Mode Fixes */
                    body {
                        margin: 0 !important;
                        padding: 0 1px !important; /* Edge-to-edge as requested */
                        max-width: 100% !important;
                        box-sizing: border-box !important;
                        background-color: transparent !important;
                        color: inherit;
                    }
                    p {
                        max-width: 100% !important;
                        margin-left: 0 !important;
                        margin-right: 0 !important;
                    }
                    
                    /* TTS Highlights */
                    .tts-highlight-word {
                         background-color: rgba(255, 165, 0, 0.4) !important;
                         border-bottom: 2px solid orange !important;
                         transition: all 0.2s;
                    }
                    .tts-highlight-sentence {
                         background-color: rgba(255, 235, 59, 0.2) !important; 
                         transition: all 0.2s;
                    }

                    /* Bilingual Styles */
                    .bbm-translated {
                        color: #666;
                        font-size: 0.9em;
                        display: block;
                        margin-top: 0.5em;
                        margin-bottom: 1em;
                        padding-left: 1em;
                        border-left: 2px solid #ddd;
                        background-color: rgba(59, 130, 246, 0.1);
                    }
                    .dark .bbm-translated {
                        color: #aaa;
                        border-left-color: #444;
                    }
                    .bbm-original {
                        display: block;
                    }
                    
                    /* Mode Visibility Control */
                    body.mode-original .bbm-translated { display: none !important; }
                    body.mode-translation .bbm-original { display: none !important; }
                    body.mode-bilingual .bbm-translated, body.mode-bilingual .bbm-original { display: block !important; }
                `;
                doc.head.appendChild(style);
                console.log('[EpubRenderer] Injected layout & bilingual styles');
            }

            // Apply current reading mode to body
            if (doc && doc.body) {
                const currentMode = readingModeRef.current;
                doc.body.classList.remove('mode-original', 'mode-translation', 'mode-bilingual');
                doc.body.classList.add(`mode - ${currentMode} `);

                // Get unique page identifier - use cfiBase or sectionIndex instead of URL
                // because URL is 'about:srcdoc' for all pages when loaded from ArrayBuffer
                const cfiBase = contents.cfiBase || '';
                const sectionIndex = contents.sectionIndex ?? -1;
                const pageKey = cfiBase || `section - ${sectionIndex} ` || 'unknown';

                const bbmOriginals = doc.querySelectorAll('.bbm-original');
                const bbmTranslated = doc.querySelectorAll('.bbm-translated');
                console.log(`[EpubRenderer] Page: ${pageKey}, Mode: ${currentMode}, Bilingual: ${bbmOriginals.length} originals, ${bbmTranslated.length} translated`);

                // Helper function to inject translations into the DOM
                const injectTranslations = (translations: Array<{ original: string, translated: string }>) => {
                    const paragraphs = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
                    let injectedCount = 0;

                    paragraphs.forEach((el: Element) => {
                        const text = el.textContent?.trim() || '';
                        // Find matching translation
                        const match = translations.find(t => t.original === text);
                        if (match && !el.classList.contains('bbm-original') && !el.classList.contains('bbm-translated')) {
                            // Add bbm-original class to original
                            el.classList.add('bbm-original');

                            // Create translated element
                            const translatedEl = doc.createElement(el.tagName.toLowerCase());
                            translatedEl.className = 'bbm-translated';
                            translatedEl.style.cssText = 'background-color: rgba(59, 130, 246, 0.1); border-left: 3px solid rgba(59, 130, 246, 0.6); padding-left: 0.75em; margin-top: 0.5em;';
                            translatedEl.textContent = match.translated;

                            // Insert after original
                            el.parentNode?.insertBefore(translatedEl, el.nextSibling);
                            injectedCount++;
                        }
                    });

                    // Re-apply mode class
                    doc.body.classList.remove('mode-original', 'mode-translation', 'mode-bilingual');
                    doc.body.classList.add(`mode - ${readingModeRef.current} `);

                    return injectedCount;
                };

                // Check if we're in bilingual/translation mode
                if (currentMode === 'bilingual' || currentMode === 'translation') {
                    // Check if page was already translated (has cached translations)
                    const cachedTranslations = translatedChaptersCache.current.get(pageKey);

                    if (cachedTranslations && bbmTranslated.length === 0) {
                        // RE-INJECT cached translations when returning to a previously translated page
                        console.log(`[EpubRenderer] Re - injecting ${cachedTranslations.length} cached translations for page: ${pageKey} `);
                        const injected = injectTranslations(cachedTranslations);
                        console.log(`[EpubRenderer] Re - injected ${injected} translations from cache`);

                    } else if (!cachedTranslations && bbmTranslated.length === 0) {
                        // NEW PAGE: Need to fetch translations
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

                        console.log(`[EpubRenderer] Found ${textsToTranslate.length} texts to translate for page: ${pageKey} `);

                        if (textsToTranslate.length > 0) {
                            // Call instant translation API
                            fetch('/api/translate/instant', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ texts: textsToTranslate, targetLang: targetLanguage })
                            })
                                .then(res => {
                                    if (!res.ok) {
                                        console.warn(`[EpubRenderer] Translation API returned ${res.status}, continuing without translation`);
                                    }
                                    return res.json();
                                })
                                .then(data => {
                                    // Handle empty or error responses gracefully
                                    if (data.error) {
                                        console.warn('[EpubRenderer] Translation API error (non-blocking):', data.error);
                                        return; // Continue without translation
                                    }

                                    if (data.translations && data.translations.length > 0) {
                                        console.log(`[EpubRenderer] Instant translation completed in ${data.duration} ms, got ${data.translations.length} translations`);

                                        // Build translation pairs for caching
                                        const translationPairs: Array<{ original: string, translated: string }> = [];

                                        // Inject translations
                                        elements.forEach((el, i) => {
                                            const originalText = el.textContent?.trim() || '';
                                            const translation = data.translations[i];

                                            if (translation && translation !== originalText) {
                                                // Add to cache
                                                translationPairs.push({ original: originalText, translated: translation });

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

                                        // Cache the translations for this page
                                        if (translationPairs.length > 0) {
                                            translatedChaptersCache.current.set(pageKey, translationPairs);
                                            console.log(`[EpubRenderer] Cached ${translationPairs.length} translations for page: ${pageKey} `);

                                            // Notify TTS controller to re-extract text (content has changed)
                                            epubTTSController.forceReExtract(true);
                                        }

                                        // Re-apply mode class
                                        doc.body.classList.remove('mode-original', 'mode-translation', 'mode-bilingual');
                                        doc.body.classList.add(`mode - ${readingModeRef.current} `);
                                    } else if (data.error) {
                                        console.error('[EpubRenderer] Translation API error:', data.error);
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
        <div className="h-full w-full flex flex-col relative bg-background box-border md:pb-20 pb-0">
            <ReactReader
                url={epubData}
                location={location}
                epubOptions={{
                    flow: "paginated",
                    manager: "default",
                    spread: "none" // Strict single page
                }}
                locationChanged={(loc: string) => {
                    // 方案A: locationChanged only updates React state
                    // Invalidation is handled by controller's relocated handler
                    console.log('[EpubRenderer] locationChanged:', loc?.substring(0, 40));
                    setLocation(loc);
                    setEpubLocation(loc);
                }}
                tocChanged={(toc: any) => {
                    tocRef.current = toc;
                    // Convert ReactReader TOC to our chapter format
                    if (toc && toc.length > 0) {
                        const chapters = toc.map((item: any, index: number) => ({
                            id: `epub - toc - ${index} `,
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


        </div>
    );
}
