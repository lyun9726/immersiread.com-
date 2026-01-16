"use client"

import { useState, useRef, useEffect, useCallback } from 'react';
import { ReactReader, ReactReaderStyle } from 'react-reader';
import { Loader2 } from 'lucide-react';
import { useReaderStore } from '@/lib/reader/stores/readerStore';
import { useReadingMemoryStore } from '@/lib/reader/stores/readingMemoryStore';
import { useEpubTTS } from '@/lib/reader/hooks/useEpubTTS';
import { epubTTSController } from '@/lib/reader/controllers/EpubTTSController';
import { injectSpeakableMarkers } from '@/lib/tts/injectSpeakableMarkers';
import type { ReadingMode } from '@/lib/types';

interface EpubRendererProps {
    url: string;
    scale?: number;
    readingMode?: ReadingMode;
    enableInstantTranslate?: boolean;  // Enable on-the-fly translation for non-bilingual EPUBs
}

export function EpubRenderer({ url, scale = 1.0, readingMode = 'original', enableInstantTranslate = false }: EpubRendererProps) {
    // State for fetched EPUB data
    const [epubData, setEpubData] = useState<string | ArrayBuffer | null>(null);
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
    const isFullscreen = useReaderStore(state => state.isFullscreen);
    const bookTitle = useReaderStore(state => state.bookTitle);
    const bookId = useReaderStore(state => state.bookId);
    const setEpubLocation = (loc: string) => useReaderStore.setState({ epubLocation: loc });

    // Target language from readerStore (synced by reader page)
    const targetLanguage = useReaderStore(state => state.targetLanguage);

    // Reading Memory - for tracking reading progress
    const startReadingSession = useReadingMemoryStore(state => state.startReadingSession);
    const appendReadContent = useReadingMemoryStore(state => state.appendReadContent);
    const endReadingSession = useReadingMemoryStore(state => state.endReadingSession);

    // Ensure store knows we are in EPUB mode to enable correct controls
    useEffect(() => {
        useReaderStore.setState({ fileType: 'epub' });

        // Start reading session when book is loaded
        if (bookId && bookTitle) {
            startReadingSession(bookId, bookTitle);
        }

        // Handle browser close/refresh - save reading progress
        const handleBeforeUnload = () => {
            // Sync call to save current state (can't await in beforeunload)
            const track = useReadingMemoryStore.getState().currentTrack;
            if (track && track.readContent.length > 0) {
                // Store for later summary generation (when user returns)
                try {
                    localStorage.setItem('readai-pending-summary', JSON.stringify({
                        bookId: track.bookId,
                        bookTitle: track.bookTitle,
                        content: track.readContent.slice(-10).join('\n\n'), // Last 10 pages
                        chaptersRead: track.chaptersRead,
                        totalWords: track.totalWords,
                        timestamp: new Date().toISOString()
                    }));
                } catch (e) {
                    console.error('[EpubRenderer] Failed to save pending summary:', e);
                }
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            useReaderStore.setState({ fileType: 'text' });
            // End reading session and generate daily summary when leaving
            endReadingSession();
        };
    }, [bookId, bookTitle, startReadingSession, endReadingSession]);

    // Check for pending summary from previous session (browser was closed)
    useEffect(() => {
        const checkPendingSummary = async () => {
            try {
                const pending = localStorage.getItem('readai-pending-summary');
                if (pending) {
                    const data = JSON.parse(pending);
                    // Only process if it was saved within the last 24 hours
                    const savedTime = new Date(data.timestamp).getTime();
                    const now = Date.now();
                    if (now - savedTime < 24 * 60 * 60 * 1000) {
                        console.log('[EpubRenderer] Found pending summary from previous session');

                        // Generate summary via API
                        const response = await fetch('/api/ai/daily-summary', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                bookTitle: data.bookTitle,
                                content: data.content,
                                chaptersRead: data.chaptersRead,
                                totalWords: data.totalWords,
                            })
                        });

                        const result = await response.json();
                        if (!result.error) {
                            // Save to Reading Memory
                            useReadingMemoryStore.getState().addMemory({
                                bookId: data.bookId,
                                type: 'daily_review',
                                title: `${data.bookTitle} - 上次阅读`,
                                content: result.summary,
                                bulletPoints: result.bulletPoints,
                            });
                            console.log('[EpubRenderer] Generated summary from previous session');
                        }
                    }
                    // Clear pending summary
                    localStorage.removeItem('readai-pending-summary');
                }
            } catch (e) {
                console.error('[EpubRenderer] Failed to process pending summary:', e);
                localStorage.removeItem('readai-pending-summary');
            }
        };

        checkPendingSummary();
    }, []);

    // EPUB TTS hook
    const epubTTS = useEpubTTS();
    const epubTTSController = epubTTS.epubTTSController; // Access controller for debug info

    // Instant translation state
    const [isInstantTranslating, setIsInstantTranslating] = useState(false);
    const [translationError, setTranslationError] = useState<string | null>(null);
    // Track if user has navigated away from TTS playback position
    const [showReturnToPlayback, setShowReturnToPlayback] = useState(false);

    // Cache actual translations so they can be re-applied when returning to a page
    // Key: pageKey, Value: array of {original: string, translated: string} pairs
    const translatedChaptersCache = useRef<Map<string, Array<{ original: string, translated: string }>>>(new Map());
    const enableInstantTranslateRef = useRef(enableInstantTranslate);

    // 🆕 Pre-translation tracking
    // Track chapters that are currently being pre-translated (to avoid duplicate requests)
    const chaptersBeingTranslated = useRef<Set<number>>(new Set());
    // Track chapters that have been fully translated
    const chaptersFullyTranslated = useRef<Set<number>>(new Set());
    // Promise resolvers for TTS to wait on translation completion
    const translationPromises = useRef<Map<number, { resolve: () => void; promise: Promise<void> }>>(new Map());

    useEffect(() => {
        enableInstantTranslateRef.current = enableInstantTranslate;
    }, [enableInstantTranslate]);

    // 🆕 Sync translation state to TTS controller - TTS is blocked while translating
    useEffect(() => {
        epubTTSController.setTranslating(isInstantTranslating);
    }, [isInstantTranslating]);

    /**
     * 🆕 Pre-translate a chapter by spine index
     * Called when progress > 70% to pre-load next chapter translation
     */
    const preTranslateChapter = useCallback(async (spineIndex: number) => {
        // Skip if already translated or being translated
        if (chaptersFullyTranslated.current.has(spineIndex) ||
            chaptersBeingTranslated.current.has(spineIndex)) {
            console.log(`[EpubRenderer] Skipping pre-translation for spine ${spineIndex}: already translated or in progress`);
            return;
        }

        // Skip if not in translation mode
        const currentMode = readingModeRef.current;
        if (currentMode !== 'bilingual' && currentMode !== 'translation') {
            return;
        }

        if (!renditionRef.current) return;

        const rendition = renditionRef.current;
        const spine = rendition.book?.spine;
        if (!spine || spineIndex >= spine.length) {
            console.log(`[EpubRenderer] Invalid spine index ${spineIndex} for pre-translation`);
            return;
        }

        // Mark as being translated
        chaptersBeingTranslated.current.add(spineIndex);
        console.log(`[EpubRenderer] 🚀 Pre-translating chapter at spine index ${spineIndex}`);

        // Create a promise that can be awaited by TTS
        let resolver: () => void = () => { };
        const promise = new Promise<void>((resolve) => { resolver = resolve; });
        translationPromises.current.set(spineIndex, { resolve: resolver, promise });

        try {
            // Get the spine item and load its content
            const spineItem = spine.get(spineIndex);
            if (!spineItem) {
                console.warn(`[EpubRenderer] Could not get spine item ${spineIndex}`);
                return;
            }

            // Load the section to get its content
            await spineItem.load(rendition.book.load.bind(rendition.book));
            const doc = spineItem.document;

            if (!doc || !doc.body) {
                console.warn(`[EpubRenderer] Could not load document for spine ${spineIndex}`);
                return;
            }

            // Extract text from paragraphs
            const paragraphs = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, figcaption, caption');
            const textsToTranslate: string[] = [];

            paragraphs.forEach((el: Element) => {
                const text = el.textContent?.trim() || '';
                if (text.length >= 5 && !el.classList.contains('bbm-original') && !el.classList.contains('bbm-translated')) {
                    textsToTranslate.push(text);
                }
            });

            console.log(`[EpubRenderer] Pre-translate: Found ${textsToTranslate.length} texts for spine ${spineIndex}`);

            if (textsToTranslate.length === 0) {
                chaptersFullyTranslated.current.add(spineIndex);
                return;
            }

            // Call translation API
            const response = await fetch('/api/translate/instant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texts: textsToTranslate, targetLang: targetLanguage })
            });

            const data = await response.json();

            if (data.translations && data.translations.length > 0) {
                // Build translation pairs for caching
                const translationPairs: Array<{ original: string, translated: string }> = [];
                textsToTranslate.forEach((originalText, i) => {
                    const translation = data.translations[i];
                    if (translation && translation !== originalText) {
                        translationPairs.push({ original: originalText, translated: translation });
                    }
                });

                // Cache the translations using spine index as key
                const pageKey = `spine-${spineIndex}`;
                translatedChaptersCache.current.set(pageKey, translationPairs);
                chaptersFullyTranslated.current.add(spineIndex);

                console.log(`[EpubRenderer] ✅ Pre-translated spine ${spineIndex}: ${translationPairs.length} pairs cached`);
            }
        } catch (err) {
            console.error(`[EpubRenderer] Pre-translation failed for spine ${spineIndex}:`, err);
        } finally {
            chaptersBeingTranslated.current.delete(spineIndex);
            // Resolve the promise so any waiting TTS can continue
            const promiseEntry = translationPromises.current.get(spineIndex);
            if (promiseEntry) {
                promiseEntry.resolve();
                translationPromises.current.delete(spineIndex);
            }
        }
    }, [targetLanguage]);

    /**
     * 🆕 Wait for a chapter to be translated (for TTS to call)
     */
    const waitForChapterTranslation = useCallback(async (spineIndex: number, timeoutMs: number = 30000): Promise<boolean> => {
        // If already translated, return immediately
        if (chaptersFullyTranslated.current.has(spineIndex)) {
            return true;
        }

        // If being translated, wait for it
        const promiseEntry = translationPromises.current.get(spineIndex);
        if (promiseEntry) {
            console.log(`[EpubRenderer] TTS waiting for chapter ${spineIndex} translation...`);
            await Promise.race([
                promiseEntry.promise,
                new Promise(resolve => setTimeout(resolve, timeoutMs))
            ]);
            return chaptersFullyTranslated.current.has(spineIndex);
        }

        // If not being translated, trigger it and wait
        console.log(`[EpubRenderer] TTS triggering translation for chapter ${spineIndex}`);
        preTranslateChapter(spineIndex);

        const newPromiseEntry = translationPromises.current.get(spineIndex);
        if (newPromiseEntry) {
            await Promise.race([
                newPromiseEntry.promise,
                new Promise(resolve => setTimeout(resolve, timeoutMs))
            ]);
        }

        return chaptersFullyTranslated.current.has(spineIndex);
    }, [preTranslateChapter]);

    // Expose waitForChapterTranslation and preTranslateChapter to TTS controller and window
    useEffect(() => {
        (epubTTSController as any).waitForChapterTranslation = waitForChapterTranslation;
        // Expose preTranslateChapter to window for relocated handler access
        (window as any).__preTranslateChapter = preTranslateChapter;

        return () => {
            delete (window as any).__preTranslateChapter;
        };
    }, [waitForChapterTranslation, preTranslateChapter]);


    /**
     * Helper function to create a translated element that inherits styling from the original element
     * This ensures translations maintain the same formatting as the original text
     */
    const createTranslatedElement = useCallback((doc: Document, originalEl: Element, translatedText: string): HTMLElement => {
        const translatedEl = doc.createElement(originalEl.tagName.toLowerCase());

        // Inherit all classes from original element, then add our marker class
        const originalClasses = Array.from(originalEl.classList).filter(c => c !== 'bbm-original');
        translatedEl.className = [...originalClasses, 'bbm-translated'].join(' ');

        // Copy computed styles that affect text appearance and LAYOUT
        if (typeof window !== 'undefined' && originalEl instanceof HTMLElement) {
            try {
                const computedStyle = doc.defaultView?.getComputedStyle(originalEl);
                if (computedStyle) {
                    // Copy important text and layout properties
                    // NOTE: Do NOT copy 'color' or 'font-style' - let CSS control them
                    const stylesToCopy = [
                        // Text formatting (excluding font-style - we want normal text)
                        'font-weight', 'font-size', 'font-family',
                        'line-height', 'letter-spacing', 'word-spacing',
                        // Layout - CRITICAL for maintaining alignment
                        'text-align', 'text-indent', 'text-transform',
                        // Display and positioning
                        'display', 'width', 'max-width',
                        // Margins and padding from original
                        'margin-left', 'margin-right', 'padding-left', 'padding-right'
                        // 'color' - intentionally NOT copied, controlled by CSS per mode
                        // 'font-style' - intentionally NOT copied, translations should be normal text
                    ];

                    const inheritedStyles: string[] = [];
                    stylesToCopy.forEach(prop => {
                        const value = computedStyle.getPropertyValue(prop);
                        if (value && value !== 'normal' && value !== 'none' && value !== 'auto') {
                            inheritedStyles.push(`${prop}: ${value}`);
                        }
                    });

                    // Minimal styling - translations use normal font style
                    translatedEl.style.cssText = `
                        margin-top: 0.3em;
                        font-style: normal;
                        ${inheritedStyles.join('; ')}
                    `;
                }
            } catch (e) {
                // Fallback: minimal styling that doesn't break layout
                translatedEl.style.cssText = 'margin-top: 0.3em; font-style: normal;';
            }
        } else {
            translatedEl.style.cssText = 'margin-top: 0.3em; font-style: normal;';
        }

        translatedEl.textContent = translatedText;
        return translatedEl;
    }, []);

    // Manual translation trigger - can be called when automatic translation fails
    const triggerManualTranslation = useCallback(async () => {
        if (!renditionRef.current || !isReady) {
            console.log('[EpubRenderer] Cannot trigger manual translation - not ready');
            return;
        }

        const rendition = renditionRef.current;
        const contents = rendition.getContents();
        if (!contents || contents.length === 0) {
            console.log('[EpubRenderer] No contents available');
            return;
        }

        for (const content of contents) {
            const doc = content.document;
            if (!doc || !doc.body) continue;

            const cfiBase = content.cfiBase || '';
            const sectionIndex = content.sectionIndex ?? -1;
            const pageKey = cfiBase || `section-${sectionIndex}` || 'unknown';

            // Force clear existing translations first
            const existingTranslated = doc.querySelectorAll('.bbm-translated');
            existingTranslated.forEach((el: Element) => el.remove());

            const existingOriginals = doc.querySelectorAll('.bbm-original');
            existingOriginals.forEach((el: Element) => el.classList.remove('bbm-original'));

            // Clear cache for this page
            translatedChaptersCache.current.delete(pageKey);

            console.log(`[EpubRenderer] Manual translation triggered for page: ${pageKey}`);
            setIsInstantTranslating(true);
            setTranslationError(null);

            // Extract text from paragraphs and table cells
            const paragraphs = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, figcaption, caption');
            const textsToTranslate: string[] = [];
            const elements: Element[] = [];

            paragraphs.forEach((el: Element) => {
                const text = el.textContent?.trim() || '';
                if (text.length >= 5) {
                    textsToTranslate.push(text);
                    elements.push(el);
                }
            });

            console.log(`[EpubRenderer] Manual: Found ${textsToTranslate.length} texts to translate`);

            if (textsToTranslate.length === 0) {
                setIsInstantTranslating(false);
                return;
            }

            try {
                const response = await fetch('/api/translate/instant', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ texts: textsToTranslate, targetLang: targetLanguage })
                });

                const data = await response.json();

                if (data.error) {
                    console.error('[EpubRenderer] Manual translation API error:', data.error);
                    setTranslationError(data.error);
                    return;
                }

                if (data.translations && data.translations.length > 0) {
                    console.log(`[EpubRenderer] Manual translation completed: ${data.translations.length} translations`);

                    const translationPairs: Array<{ original: string, translated: string }> = [];

                    elements.forEach((el, i) => {
                        const originalText = el.textContent?.trim() || '';
                        const translation = data.translations[i];

                        if (translation && translation !== originalText) {
                            translationPairs.push({ original: originalText, translated: translation });

                            el.classList.add('bbm-original');

                            // Create translated element with inherited styling
                            const translatedEl = createTranslatedElement(doc, el, translation);
                            el.parentNode?.insertBefore(translatedEl, el.nextSibling);
                        }
                    });

                    // Cache the translations
                    if (translationPairs.length > 0) {
                        translatedChaptersCache.current.set(pageKey, translationPairs);
                        console.log(`[EpubRenderer] Manual: Cached ${translationPairs.length} translations`);
                    }

                    // Re-apply mode class
                    doc.body.classList.remove('mode-original', 'mode-translation', 'mode-bilingual');
                    doc.body.classList.add(`mode-${readingModeRef.current}`);
                }
            } catch (err) {
                console.error('[EpubRenderer] Manual translation failed:', err);
                setTranslationError(err instanceof Error ? err.message : 'Translation failed');
            } finally {
                setIsInstantTranslating(false);
            }
        }
    }, [isReady, targetLanguage]);

    useEffect(() => {
        enableInstantTranslateRef.current = enableInstantTranslate;
    }, [enableInstantTranslate]);

    // Hide return-to-playback button when TTS stops
    useEffect(() => {
        if (!epubTTS.isPlaying) {
            setShowReturnToPlayback(false);
        }
    }, [epubTTS.isPlaying]);

    // Wheel handling debounce
    const lastWheelTime = useRef(0);

    // Ref for iframe events to trigger showReturnToPlayback
    const ttsPlayingRef = useRef(false);
    useEffect(() => {
        ttsPlayingRef.current = epubTTS.isPlaying;
    }, [epubTTS.isPlaying]);

    const showReturnButtonRef = useRef<() => void>(() => { });
    showReturnButtonRef.current = () => {
        if (ttsPlayingRef.current) {
            setShowReturnToPlayback(true);
        }
    };

    // Swipe overlay state for mobile full-screen swipe navigation
    const [swipeState, setSwipeState] = useState<{
        startX: number;
        startY: number;
        startTime: number;
    } | null>(null);

    const handleSwipeStart = useCallback((e: React.TouchEvent) => {
        const touch = e.touches[0];
        setSwipeState({
            startX: touch.clientX,
            startY: touch.clientY,
            startTime: Date.now()
        });
    }, []);

    const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
        if (!swipeState) return;

        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - swipeState.startX;
        const deltaY = touch.clientY - swipeState.startY;
        const deltaTime = Date.now() - swipeState.startTime;

        const isTap = Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && deltaTime < 300;
        const isSwipe = Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50 && deltaTime < 500;

        if (isSwipe) {
            // Handle horizontal swipe for page navigation
            console.log('[EpubRenderer] Swipe detected:', deltaX > 0 ? 'RIGHT->PREV' : 'LEFT->NEXT');

            // Notify TTS that user manually navigated - don't override for 3 seconds
            epubTTSController.notifyUserNavigation();

            // Show "return to playback" button if TTS is playing
            if (epubTTS.isPlaying) {
                setShowReturnToPlayback(true);
            }

            if (deltaX > 0) {
                renditionRef.current?.prev();
            } else {
                renditionRef.current?.next();
            }
        } else if (isTap) {
            // For taps, find the element and trigger TTS via epub.js click event
            console.log('[EpubRenderer] Tap detected at:', touch.clientX, touch.clientY);

            // Try to find the iframe and get the clicked element
            const iframe = document.querySelector('iframe');
            if (iframe && iframe.contentDocument && renditionRef.current) {
                const iframeRect = iframe.getBoundingClientRect();
                const x = touch.clientX - iframeRect.left;
                const y = touch.clientY - iframeRect.top;

                const targetElement = iframe.contentDocument.elementFromPoint(x, y);
                if (targetElement) {
                    console.log('[EpubRenderer] Triggering epub.js click on:', targetElement.tagName);

                    // Create a fake event object that mimics epub.js click event
                    const fakeEvent = {
                        type: 'click',
                        target: targetElement,
                        clientX: x,
                        clientY: y
                    };

                    // Emit the click event through rendition
                    // This should trigger the TTS controller's click handler
                    renditionRef.current.emit('click', fakeEvent, iframe.contentDocument);
                }
            }
        }

        setSwipeState(null);
    }, [swipeState]);

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

                // Use ArrayBuffer directly - Blob URL causes "Error loading book" in react-reader
                // Image path resolution will be handled separately
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
        } else if (ttsIsPlaying && tts.isPaused) {
            // 🆕 从暂停状态恢复
            console.log('[EpubRenderer] Resuming EPUB TTS from paused state');
            isTransitioningRef.current = true;
            tts.resume();
            setTimeout(() => {
                isTransitioningRef.current = false;
            }, 100);
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

                        // Notify TTS controller to re-extract text based on new mode
                        epubTTSController.forceReExtract(true);

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
                                const paragraphs = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, figcaption, caption');
                                let injected = 0;

                                paragraphs.forEach((el: Element) => {
                                    const text = el.textContent?.trim() || '';
                                    const match = cachedTranslations.find(t => t.original === text);
                                    if (match && !el.classList.contains('bbm-original')) {
                                        el.classList.add('bbm-original');
                                        // Create translated element with inherited styling
                                        const translatedEl = createTranslatedElement(doc, el, match.translated);
                                        el.parentNode?.insertBefore(translatedEl, el.nextSibling);
                                        injected++;
                                    }
                                });

                                console.log(`[EpubRenderer] Re-injected ${injected} translations from cache`);

                                // Notify TTS controller to re-extract text with new translations
                                if (injected > 0) {
                                    epubTTSController.forceReExtract(true);
                                }

                            } else if (!cachedTranslations && bbmTranslated.length === 0) {
                                // NEW TRANSLATION needed
                                console.log('[EpubRenderer] Mode changed, triggering instant translation for page:', pageKey);
                                setIsInstantTranslating(true);

                                // Extract text from paragraphs
                                const paragraphs = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, figcaption, caption');
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

                                                        // Create translated element with inherited styling
                                                        const translatedEl = createTranslatedElement(doc, el, translation);

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
    // Optimized for mobile fullscreen immersive reading
    const ownStyles = {
        ...ReactReaderStyle,
        container: {
            ...ReactReaderStyle.container,
            backgroundColor: 'transparent',
            overflow: 'hidden',
        },
        readerArea: {
            ...ReactReaderStyle.readerArea,
            backgroundColor: 'transparent',
            marginBottom: '0',
            marginTop: '0',
            width: '100%',
            height: '100%',
            padding: '0',
            // Minimize left/right margins on mobile for near-fullscreen effect
            paddingLeft: isFullscreen ? '8px' : '16px',
            paddingRight: isFullscreen ? '8px' : '16px',
        },
        arrow: {
            ...ReactReaderStyle.arrow,
            color: 'hsl(var(--foreground))',
            display: 'none',
        },
        titleArea: {
            ...ReactReaderStyle.titleArea,
            display: 'none',
        },
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

        // Attach swipe listeners via hooks to ensure they work inside iframe
        rendition.hooks.content.register((contents: any) => {
            const win = contents.window;
            if (win) {
                console.log('[EpubRenderer] Registering touch handlers in iframe');
                let touchStartX = 0;
                let touchStartY = 0;

                win.addEventListener('touchstart', (e: TouchEvent) => {
                    touchStartX = e.changedTouches[0].clientX;
                    touchStartY = e.changedTouches[0].clientY;
                    console.log('[EpubRenderer] Touch start:', touchStartX, touchStartY);
                }, { passive: true });

                win.addEventListener('touchend', (e: TouchEvent) => {
                    const touchEndX = e.changedTouches[0].clientX;
                    const touchEndY = e.changedTouches[0].clientY;

                    const deltaX = touchEndX - touchStartX;
                    const deltaY = touchEndY - touchStartY;

                    console.log('[EpubRenderer] Touch end, delta:', deltaX, deltaY);

                    // Horizontal swipe detection (more horizontal than vertical, and significant distance)
                    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
                        console.log('[EpubRenderer] Swipe detected:', deltaX > 0 ? 'RIGHT (prev)' : 'LEFT (next)');

                        // Notify TTS that user manually navigated
                        epubTTSController.notifyUserNavigation();

                        // Show return button if TTS is playing
                        showReturnButtonRef.current();

                        if (deltaX > 0) {
                            // Swipe Right -> Prev Page
                            rendition.prev();
                        } else {
                            // Swipe Left -> Next Page
                            rendition.next();
                        }
                    }
                }, { passive: true });

                // Mouse wheel handler
                win.addEventListener('wheel', (e: WheelEvent) => {
                    const now = Date.now();
                    // Debounce: 500ms cooldown
                    if (now - lastWheelTime.current < 500) return;

                    if (Math.abs(e.deltaY) > 30) {
                        // Notify TTS that user manually navigated
                        epubTTSController.notifyUserNavigation();

                        // Show return button if TTS is playing
                        showReturnButtonRef.current();

                        if (e.deltaY > 0) {
                            lastWheelTime.current = now;
                            rendition.next();
                        } else {
                            lastWheelTime.current = now;
                            rendition.prev();
                        }
                    }
                });

                // Text selection listener for AI features
                win.addEventListener('mouseup', () => {
                    setTimeout(() => {
                        const selection = win.getSelection();
                        const selectedText = selection?.toString().trim();
                        if (selectedText && selectedText.length > 0) {
                            console.log('[EpubRenderer] Text selected:', selectedText.substring(0, 50));
                            useReaderStore.setState({ selectedTextForAI: selectedText });
                        }
                    }, 10);
                });

                // Also listen for touchend for mobile text selection
                win.addEventListener('touchend', () => {
                    setTimeout(() => {
                        const selection = win.getSelection();
                        const selectedText = selection?.toString().trim();
                        if (selectedText && selectedText.length > 0) {
                            console.log('[EpubRenderer] Text selected (touch):', selectedText.substring(0, 50));
                            useReaderStore.setState({ selectedTextForAI: selectedText });
                        }
                    }, 100); // Longer delay for touch selection
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

                    /* Bilingual Styles - designed to NOT override inherited layout */
                    .bbm-translated {
                        display: block;
                        /* text-align is inherited from original element via inline styles */
                    }
                    
                    /* Bilingual mode: clean professional styling - normal text, no italic */
                    body.mode-bilingual .bbm-translated {
                        color: inherit;
                        font-style: normal !important;
                        margin-top: 0.3em;
                    }
                    body.mode-bilingual.dark .bbm-translated,
                    .dark body.mode-bilingual .bbm-translated {
                        color: inherit;
                    }
                    
                    .bbm-original {
                        display: block;
                    }
                    
                    /* Mode Visibility Control */
                    body.mode-original .bbm-translated { display: none !important; }
                    body.mode-translation .bbm-original { display: none !important; }
                    body.mode-bilingual .bbm-translated, body.mode-bilingual .bbm-original { display: block !important; }
                    
                    /* Translation-only mode: looks EXACTLY like original text - no modifications */
                    body.mode-translation .bbm-translated {
                        display: block !important;
                        /* No color change, no italic - exactly like original */
                        color: inherit !important;
                        font-style: inherit !important;
                        margin-top: 0 !important;
                        margin-bottom: inherit !important;
                    }
                `;
                doc.head.appendChild(style);
                console.log('[EpubRenderer] Injected layout & bilingual styles');

                // 🆕 Inject speakable markers for TTS SpeakTargetResolver
                // This adds data-block-id and data-sentence-id attributes
                injectSpeakableMarkers(doc);
            }

            // Fix broken images when EPUB is loaded from ArrayBuffer
            // The relative paths don't work, so we need to extract images from the archive
            if (doc && doc.body) {
                const images = doc.querySelectorAll('img');
                if (images.length > 0) {
                    console.log(`[EpubRenderer] Found ${images.length} images, attempting to fix paths...`);

                    const book = renditionRef.current?.book;
                    if (book && book.archive) {
                        images.forEach(async (img: HTMLImageElement, index: number) => {
                            const originalSrc = img.getAttribute('src') || '';

                            // Skip if already a blob or data URL
                            if (originalSrc.startsWith('blob:') || originalSrc.startsWith('data:')) {
                                return;
                            }

                            // Get section path to resolve relative URLs
                            const section = contents.section;
                            const sectionHref = section?.href || '';
                            const basePath = sectionHref.substring(0, sectionHref.lastIndexOf('/') + 1);

                            // Resolve the image path
                            let imagePath = originalSrc;
                            if (originalSrc.startsWith('../')) {
                                // Handle parent directory references
                                const parts = basePath.split('/').filter(Boolean);
                                const upCount = (originalSrc.match(/\.\.\//g) || []).length;
                                const remainingPath = originalSrc.replace(/\.\.\//g, '');
                                parts.splice(-upCount);
                                imagePath = parts.join('/') + (parts.length ? '/' : '') + remainingPath;
                            } else if (originalSrc.startsWith('./')) {
                                imagePath = basePath + originalSrc.substring(2);
                            } else if (!originalSrc.startsWith('/') && !originalSrc.startsWith('http')) {
                                imagePath = basePath + originalSrc;
                            }

                            try {
                                // Try to get the image from the archive
                                const blob = await book.archive.getBlob(imagePath);
                                if (blob && blob.size > 0) {
                                    const blobUrl = URL.createObjectURL(blob);
                                    img.src = blobUrl;
                                    console.log(`[EpubRenderer] Fixed image ${index}: ${originalSrc} -> blob`);
                                }
                            } catch (e) {
                                // Try common EPUB structures
                                const altPaths = [
                                    imagePath,
                                    'OEBPS/' + imagePath,
                                    'OPS/' + imagePath,
                                    originalSrc.replace(/^\.\.\//, ''),
                                ];

                                for (const path of altPaths) {
                                    try {
                                        const blob = await book.archive.getBlob(path);
                                        if (blob && blob.size > 0) {
                                            const blobUrl = URL.createObjectURL(blob);
                                            img.src = blobUrl;
                                            console.log(`[EpubRenderer] Fixed image ${index} via alt path: ${path}`);
                                            break;
                                        }
                                    } catch (err) {
                                        // Continue to next path
                                    }
                                }
                            }

                            // Ensure proper sizing
                            if (!img.style.maxWidth) {
                                img.style.maxWidth = '100%';
                                img.style.height = 'auto';
                            }
                        });
                    }
                }
            }

            // Apply current reading mode to body
            if (doc && doc.body) {
                const currentMode = readingModeRef.current;
                doc.body.classList.remove('mode-original', 'mode-translation', 'mode-bilingual');
                doc.body.classList.add(`mode-${currentMode}`);

                // Get unique page identifier - use cfiBase or sectionIndex instead of URL
                // because URL is 'about:srcdoc' for all pages when loaded from ArrayBuffer
                const cfiBase = contents.cfiBase || '';
                const sectionIndex = contents.sectionIndex ?? -1;
                const pageKey = cfiBase || `section - ${sectionIndex} ` || 'unknown';

                const bbmOriginals = doc.querySelectorAll('.bbm-original');
                const bbmTranslated = doc.querySelectorAll('.bbm-translated');
                console.log(`[EpubRenderer] Page: ${pageKey}, Mode: ${currentMode}, Bilingual: ${bbmOriginals.length} originals, ${bbmTranslated.length} translated`);

                // Update visible text for AI context
                const visibleText = doc.body?.innerText || '';
                if (visibleText.length > 0) {
                    useReaderStore.setState({ visibleTextForAI: visibleText.substring(0, 3000) });

                    // Record reading content for daily summary
                    // Get chapter title from TOC if available
                    const currentChapterTitle = tocRef.current?.find((toc: any) =>
                        toc.href && contents.cfiBase?.includes(toc.href)
                    )?.label || `Section ${sectionIndex}`;

                    useReadingMemoryStore.getState().appendReadContent(
                        visibleText.substring(0, 1500),
                        currentChapterTitle
                    );
                }

                // Helper function to inject translations into the DOM
                const injectTranslations = (translations: Array<{ original: string, translated: string }>) => {
                    const paragraphs = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, figcaption, caption');
                    let injectedCount = 0;

                    paragraphs.forEach((el: Element) => {
                        const text = el.textContent?.trim() || '';
                        // Find matching translation
                        const match = translations.find(t => t.original === text);
                        if (match && !el.classList.contains('bbm-original') && !el.classList.contains('bbm-translated')) {
                            // Add bbm-original class to original
                            el.classList.add('bbm-original');

                            // Create translated element with inherited layout
                            const translatedEl = createTranslatedElement(doc, el, match.translated);

                            // Insert after original
                            el.parentNode?.insertBefore(translatedEl, el.nextSibling);
                            injectedCount++;
                        }
                    });

                    // Re-apply mode class
                    doc.body.classList.remove('mode-original', 'mode-translation', 'mode-bilingual');
                    doc.body.classList.add(`mode-${readingModeRef.current}`);

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
                        const paragraphs = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, figcaption, caption');
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

                                                // Create translated element with inherited layout
                                                const translatedEl = createTranslatedElement(doc, el, translation);

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
                                        doc.body.classList.add(`mode-${readingModeRef.current}`);
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
        // Also trigger pre-translation when progress > 70%
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

                // 🆕 Pre-translation: Check progress and trigger pre-translation if > 70%
                if (location.start.displayed) {
                    const { page, total } = location.start.displayed;
                    const progress = total > 0 ? page / total : 0;
                    const currentSpineIndex = location.start.index;

                    console.log(`[EpubRenderer] Chapter progress: ${page}/${total} (${Math.round(progress * 100)}%), spine: ${currentSpineIndex}`);

                    // If progress > 70%, pre-translate next chapter
                    if (progress >= 0.7 && currentSpineIndex !== undefined) {
                        const nextSpineIndex = currentSpineIndex + 1;
                        const spine = rendition.book?.spine;
                        if (spine && nextSpineIndex < spine.length) {
                            console.log(`[EpubRenderer] Progress > 70%, pre-translating spine ${nextSpineIndex}`);
                            // Use setTimeout to avoid blocking the current navigation
                            setTimeout(() => {
                                // Access preTranslateChapter from the ref or closure
                                if (typeof (window as any).__preTranslateChapter === 'function') {
                                    (window as any).__preTranslateChapter(nextSpineIndex);
                                }
                            }, 100);
                        }
                    }
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
        <div className={`h-full w-full flex flex-col relative bg-background box-border ${isFullscreen ? 'pb-0' : 'md:pb-20 pb-0'}`}>
            {/* Mobile Swipe Overlay - Captures swipes and forwards taps to iframe */}
            <div
                className="absolute inset-0 z-20 md:hidden"
                onTouchStart={handleSwipeStart}
                onTouchEnd={handleSwipeEnd}
                onTouchCancel={() => setSwipeState(null)}
            />
            <ReactReader
                url={epubData}
                location={location}
                epubOptions={{
                    flow: "paginated",
                    manager: "default",
                    spread: "none", // Strict single page
                    allowScriptedContent: true, // 🆕 允许脚本执行，用于 injectSpeakableMarkers 和点击监听
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

            {/* Return to Playback Position Button */}
            {epubTTS.isPlaying && showReturnToPlayback && (
                <button
                    onClick={async () => {
                        const success = await epubTTSController.jumpToPlaybackPosition();
                        if (success) {
                            setShowReturnToPlayback(false);
                        }
                    }}
                    className="absolute bottom-20 right-4 w-12 h-12 bg-primary hover:bg-primary/80 text-primary-foreground rounded-full shadow-lg z-[9999] flex items-center justify-center transition-all hover:scale-110 animate-bounce"
                    title="返回朗读位置"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                </button>
            )}

            {/* Translation Status & Retry Button */}
            {(readingMode === 'bilingual' || readingMode === 'translation') && (
                <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-[9999]">
                    {/* Translating indicator */}
                    {isInstantTranslating && (
                        <div className="bg-blue-500/90 text-white px-3 py-1.5 rounded-full text-xs flex items-center gap-2 shadow-lg">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            翻译中...
                        </div>
                    )}

                    {/* Error indicator with retry */}
                    {translationError && (
                        <div className="bg-red-500/90 text-white px-3 py-1.5 rounded-lg text-xs shadow-lg">
                            翻译失败
                        </div>
                    )}

                    {/* Manual translate button - always show in translation mode when not translating */}
                    {!isInstantTranslating && (
                        <button
                            onClick={triggerManualTranslation}
                            className="bg-primary/80 hover:bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 shadow-lg transition-all hover:scale-105"
                            title="重新翻译当前页面"
                        >
                            🔄 重新翻译
                        </button>
                    )}
                </div>
            )}


        </div>
    );
}
