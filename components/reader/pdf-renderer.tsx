"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2 } from 'lucide-react';
import { useInView } from 'react-intersection-observer';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useReaderStore } from '@/lib/reader/stores/readerStore';
import { usePDFTextExtraction } from '@/lib/reader/hooks/usePDFTextExtraction';

// Use the worker from public directory for Vercel compatibility
// The import.meta.url pattern doesn't work reliably on Vercel deployments
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface PDFRendererProps {
    url: string;
    scale?: number;
}

export function PDFRenderer({ url, scale = 1.0 }: PDFRendererProps) {
    const [numPages, setNumPages] = useState<number>(0);
    const [width, setWidth] = useState<number>(600);
    const [userScrolling, setUserScrolling] = useState(false); // Track if user is manually scrolling
    const [loadError, setLoadError] = useState<string | null>(null);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const setChapters = useReaderStore(state => state.setChapters);
    const currentPage = useReaderStore(state => state.currentPage);

    // Client-side text extraction hook (bypass server parsing)
    const { extractFromRenderedPages, resetExtraction } = usePDFTextExtraction();
    const pdfDocRef = useRef<any>(null);

    // Handle user scroll - pause auto-scroll for 3 seconds
    const handleUserScroll = useCallback(() => {
        setUserScrolling(true);

        // Clear existing timeout
        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
        }

        // Resume auto-scroll after 3 seconds of no scrolling
        scrollTimeoutRef.current = setTimeout(() => {
            setUserScrolling(false);
            console.log('[PDFRenderer] Resuming auto-scroll');
        }, 3000);
    }, []);

    // Scroll to page effect - triggered by chapter navigation
    useEffect(() => {
        if (currentPage > 0) {
            const pageElement = document.getElementById(`pdf-page-${currentPage}`);
            if (pageElement) {
                console.log(`[PDFRenderer] Scrolling to page ${currentPage}`);
                pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [currentPage]);

    // Resize observer logic
    const containerRef = (node: HTMLDivElement | null) => {
        if (node) {
            setWidth(node.getBoundingClientRect().width);
        }
    };

    async function onDocumentLoadSuccess(pdf: any) {
        setNumPages(pdf.numPages);
        pdfDocRef.current = pdf;
        setLoadError(null);

        // Reset extraction state for new document
        resetExtraction();

        // CLIENT-SIDE TEXT EXTRACTION - ONLY if server didn't provide any blocks
        // Important: Never overwrite server blocks - they contain the full book text for TTS
        setTimeout(() => {
            const existingBlocks = useReaderStore.getState().enhancedBlocks;

            // If server loaded blocks, keep them for TTS (don't overwrite with partial DOM extraction)
            if (existingBlocks.length > 0) {
                console.log(`[PDFRenderer] Using ${existingBlocks.length} server blocks for TTS - skipping DOM extraction`);
                return;
            }

            // Only extract from DOM if server provided no blocks (e.g., failed parsing)
            console.log('[PDFRenderer] No server blocks, starting DOM-based text extraction...');
            extractFromRenderedPages(pdf.numPages);
        }, 2500);

        // Delay outline extraction to let worker fully initialize
        // This prevents the "sendWithPromise null" error
        setTimeout(async () => {
            try {
                const outline = await pdf.getOutline();
                if (outline && outline.length > 0) {
                    const chapters = await Promise.all(outline.map(async (item: any, index: number) => {
                        let pageNumber = 1;
                        try {
                            if (typeof item.dest === 'string') {
                                const dest = await pdf.getDestination(item.dest);
                                if (dest) {
                                    const pageIndex = await pdf.getPageIndex(dest[0]);
                                    pageNumber = pageIndex + 1;
                                }
                            } else if (Array.isArray(item.dest)) {
                                const pageIndex = await pdf.getPageIndex(item.dest[0]);
                                pageNumber = pageIndex + 1;
                            }
                        } catch (destError) {
                            console.warn("[PDFRenderer] Could not get page for chapter:", item.title);
                        }
                        return {
                            id: `pdf-toc-${index}`,
                            title: item.title,
                            order: index,
                            blockIds: [],
                            pageNumber: pageNumber
                        };
                    }));
                    console.log("[PDFRenderer] Extracted chapters:", chapters);
                    setChapters(chapters as any);
                }
            } catch (error) {
                // Silently ignore outline extraction errors - PDF will still work
                console.warn("[PDFRenderer] Outline extraction skipped (non-critical):", error);
            }
        }, 500); // Wait 500ms for worker to be fully ready
    }

    const handleSelection = () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;

        const text = selection.toString().trim();
        if (text.length > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            useReaderStore.getState().setSelection({
                text,
                position: {
                    x: rect.left,
                    y: rect.top,
                    width: rect.width,
                    height: rect.height
                }
            });
        }
    };

    const handleLoadError = (error: Error) => {
        console.error("[PDFRenderer] Failed to load PDF:", error);
        setLoadError(error.message || "Failed to load PDF file.");
    };



    return (
        <div
            ref={containerRef}
            data-pdf-scroll-container
            data-user-scrolling={userScrolling ? 'true' : 'false'}
            className="w-full h-full flex flex-col items-center overflow-y-auto bg-gray-100/50 p-4"
            onMouseUp={handleSelection}
            onWheel={handleUserScroll}
            onTouchMove={handleUserScroll}
        >
            <Document
                file={url}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={handleLoadError}
                onSourceError={handleLoadError}
                loading={
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                }
                error={
                    <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                        {loadError || "Failed to load PDF file."}
                    </div>
                }
                className="flex flex-col gap-4"
            >
                {Array.from(new Array(numPages), (el, index) => (
                    <PDFPageWrapper
                        key={`page_${index + 1}`}
                        pageNumber={index + 1}
                        width={width}
                        scale={scale}
                    />
                ))}
            </Document>
        </div>
    );
}

// Sub-component for virtualized rendering with viewport-based scroll sync
interface PDFPageWrapperProps {
    pageNumber: number;
    width: number;
    scale: number;
}

function PDFPageWrapper({ pageNumber, width, scale }: PDFPageWrapperProps) {
    const { ref, inView } = useInView({
        rootMargin: '100% 0px',
        triggerOnce: false,
    });

    const currentBlockIndex = useReaderStore(state => state.currentBlockIndex);
    const setCurrentBlockIndex = useReaderStore(state => state.setCurrentBlockIndex);
    const enhancedBlocks = useReaderStore(state => state.enhancedBlocks);
    const readingMode = useReaderStore(state => state.readingMode);
    // STABLE WORD INDEX - replaces unreliable charIndex-based range
    const currentWordIndex = useReaderStore(state => state.currentWordIndex);

    // Ref for word highlight element - used for viewport visibility detection
    const wordHighlightRef = React.useRef<HTMLDivElement>(null);

    const activeBlock = enhancedBlocks[currentBlockIndex];
    const isPageActive = activeBlock?.meta?.pageNumber === pageNumber;
    const bbox = isPageActive ? activeBlock?.meta?.bbox : null;

    // Get all blocks on this page for click-to-read feature
    const blocksOnPage = enhancedBlocks
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => block.meta?.pageNumber === pageNumber);

    // Debug: log blocks on this page (only for visible pages)
    if (inView && blocksOnPage.length === 0 && enhancedBlocks.length > 0) {
        console.log(`[PDFPage ${pageNumber}] No blocks found. Total blocks: ${enhancedBlocks.length}`);
    }

    // Get requestPlayFromBlock action to trigger TTS when clicking
    const requestPlayFromBlock = useReaderStore(state => state.requestPlayFromBlock);
    const requestPlayFromPosition = useReaderStore(state => state.requestPlayFromPosition);

    // Get the incremental extraction function
    const { extractPageIfNeeded } = usePDFTextExtraction();

    // Trigger incremental extraction when page becomes visible
    // Safe to run even with server blocks because extractPageIfNeeded now MERGES coordinates
    useEffect(() => {
        if (inView) {
            // Small delay to ensure TextLayer is rendered
            const timer = setTimeout(() => {
                extractPageIfNeeded(pageNumber);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [inView, pageNumber, extractPageIfNeeded]);

    // Handler for clicking a block to start reading from there
    const handleBlockClick = (
        event: React.MouseEvent<HTMLDivElement>,
        blockIndex: number,
        block: typeof enhancedBlocks[number]
    ) => {
        console.log('[PDFPageWrapper] Click to read from block:', blockIndex);

        // Cancel any ongoing speech to prevent state conflicts
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }


        const pageElement = document.getElementById(`pdf-page-${pageNumber}`);
        const pdfItems = block.pdfItems || [];

        if (!pageElement || pdfItems.length === 0) {
            requestPlayFromBlock(blockIndex);
            return;
        }

        const pageRect = pageElement.getBoundingClientRect();
        const xPercent = ((event.clientX - pageRect.left) / pageRect.width) * 100;
        const yPercent = ((event.clientY - pageRect.top) / pageRect.height) * 100;

        const itemsAtPoint = pdfItems.filter((item: any) => {
            const bbox = item.bbox;
            if (!bbox) return false;
            return (
                xPercent >= bbox.x &&
                xPercent <= bbox.x + bbox.w &&
                yPercent >= bbox.y &&
                yPercent <= bbox.y + bbox.h
            );
        });

        let targetItem = itemsAtPoint[0];

        if (!targetItem) {
            let nearestItem = null;
            let nearestDistance = Infinity;

            for (const item of pdfItems) {
                const bbox = item.bbox;
                if (!bbox) continue;
                const centerX = bbox.x + bbox.w / 2;
                const centerY = bbox.y + bbox.h / 2;
                const dx = centerX - xPercent;
                const dy = centerY - yPercent;
                const distance = Math.hypot(dx, dy);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestItem = item;
                }
            }

            targetItem = nearestItem;
        }

        if (!targetItem) {
            requestPlayFromBlock(blockIndex);
            return;
        }

        // Get the character offset from the clicked item
        // SIMPLIFIED: Just use the clicked item offset directly
        const charOffset = targetItem.offset || 0;
        
        // Use the clicked position directly - no more complex sentence finding
        console.log('[PDFPageWrapper] Starting from charOffset:', charOffset);
        requestPlayFromPosition(blockIndex, charOffset);
    };

    // AUTO-SCROLL DISABLED
    // The auto-scroll feature has been disabled because:
    // 1. Block pageNumber metadata is often incorrect/mismatched with actual PDF pages
    // 2. This causes "jumping to page 7" when user is on page 97
    // 3. Better UX: Let user control scroll, TTS continues in background
    // The highlight will still appear on the correct block when user scrolls there.
    const lastScrolledBlockRef = useRef<number>(-1);
    // Keep ref to avoid breaking other code, but don't scroll automatically

    return (
        <div
            ref={ref}
            id={`pdf-page-${pageNumber}`}
            className="shadow-lg relative bg-white transition-opacity duration-200"
        >
            {inView ? (
                <>
                    <Page
                        pageNumber={pageNumber}
                        width={Math.min(width ? width - 48 : 600, 800) * scale}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        className="bg-white"
                        loading={
                            <div className="flex items-center justify-center h-full w-full min-h-[600px] text-muted-foreground/30">
                                <Loader2 className="h-8 w-8 animate-spin" />
                            </div>
                        }
                    />

                    {/* Debug: log translation status */}
                    {pageNumber === 1 && blocksOnPage.length > 0 && console.log('[PDF Debug] Page 1 blocks:', blocksOnPage.length, 'readingMode:', readingMode, 'first block translation:', blocksOnPage[0]?.block?.translation?.slice(0, 50))}

                    {/* Clickable Block Regions - Single-click to start reading */}
                    {/* These overlays are above text layer. Text selection works via browser selection after click */}
                    {blocksOnPage.map(({ block, index }) => {
                        const blockBbox = block.meta?.bbox;
                        if (!blockBbox) return null;

                        const isActive = index === currentBlockIndex;
                        const showTranslation = (readingMode === 'bilingual' || readingMode === 'translation') && block.translation;

                        return (
                            <React.Fragment key={block.id}>
                                <div
                                    onClick={(event) => handleBlockClick(event, index, block)}
                                    className={`absolute cursor-pointer transition-all duration-200 z-20 ${isActive
                                        ? '' // Remove border - will use highlight instead
                                        : 'hover:bg-blue-100/20'
                                        }`}
                                    style={{
                                        left: `${blockBbox.x}%`,
                                        top: `${blockBbox.y}%`,
                                        width: `${blockBbox.w}%`,
                                        height: `${blockBbox.h}%`,
                                    }}
                                    title={showTranslation ? block.translation : "Single click to start reading"}
                                />
                                {/* Translation Overlay - shown below the block in bilingual mode */}
                                {showTranslation && (
                                    <div
                                        className="absolute z-30 bg-blue-50/95 dark:bg-blue-900/80 px-2 py-1 rounded shadow-sm text-xs text-blue-700 dark:text-blue-200 max-w-full overflow-hidden pointer-events-none"
                                        style={{
                                            left: `${blockBbox.x}%`,
                                            top: `${blockBbox.y + blockBbox.h + 0.5}%`,
                                            width: `${Math.min(blockBbox.w * 1.2, 90)}%`,
                                            maxHeight: '3em',
                                            lineHeight: '1.3',
                                        }}
                                    >
                                        {block.translation}
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}

                    {/* Dual-Layer Karaoke Highlight System */}
                    {isPageActive && activeBlock?.pdfItems && currentWordIndex >= 0 && (() => {
                        const charIndex = currentWordIndex;
                        const blockText = activeBlock.original || '';

                        // === LAYER 1: Yellow Sentence Background ===
                        // Find sentence boundaries
                        let sentenceStart = charIndex;
                        const sentenceBreaks = /[。？！.?!;；]/;
                        while (sentenceStart > 0 && !sentenceBreaks.test(blockText[sentenceStart - 1])) {
                            sentenceStart--;
                        }

                        let sentenceEnd = charIndex;
                        while (sentenceEnd < blockText.length && !sentenceBreaks.test(blockText[sentenceEnd])) {
                            sentenceEnd++;
                        }
                        if (sentenceEnd < blockText.length && sentenceBreaks.test(blockText[sentenceEnd])) {
                            sentenceEnd++;
                        }

                        // === LAYER 2: Orange Current Word ===
                        // Find current word boundaries
                        const MAX_WORD_LENGTH = 8;
                        let wordEnd = charIndex;
                        const wordBreaks = /[\s。？！.?!,，、：:；;「」『』（）()【】\[\]"'——–\-\n\r]/;
                        while (
                            wordEnd < blockText.length &&
                            wordEnd - charIndex < MAX_WORD_LENGTH &&
                            !wordBreaks.test(blockText[wordEnd])
                        ) {
                            wordEnd++;
                        }
                        if (wordEnd === charIndex) wordEnd++;

                        // Find pdfItems for sentence (yellow)
                        const sentenceItems = activeBlock.pdfItems.filter((item: any) => {
                            const itemStart = item.offset;
                            const itemEnd = item.offset + item.str.length;
                            return itemEnd > sentenceStart && itemStart < sentenceEnd;
                        });

                        // Find pdfItems for current word (orange)
                        const wordItems = activeBlock.pdfItems.filter((item: any) => {
                            const itemStart = item.offset;
                            const itemEnd = item.offset + item.str.length;
                            return itemEnd > charIndex && itemStart < wordEnd;
                        });

                        const elements: JSX.Element[] = [];

                        // Group sentence items by line for yellow background
                        const lineGroups = new Map<number, any[]>();
                        for (const item of sentenceItems) {
                            if (!item.bbox) continue;
                            const lineY = Math.round(item.bbox.y * 10) / 10;
                            if (!lineGroups.has(lineY)) {
                                lineGroups.set(lineY, []);
                            }
                            lineGroups.get(lineY)!.push(item);
                        }

                        // Create yellow sentence highlights
                        let lineIndex = 0;
                        for (const [lineY, items] of lineGroups) {
                            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

                            for (const item of items) {
                                if (!item.bbox) continue;
                                const itemStart = item.offset;
                                const itemEnd = item.offset + item.str.length;
                                const rangeStart = Math.max(itemStart, sentenceStart);
                                const rangeEnd = Math.min(itemEnd, sentenceEnd);

                                if (rangeEnd <= rangeStart) continue;

                                const charWidth = item.bbox.w / Math.max(1, item.str.length);
                                const relativeStart = rangeStart - itemStart;
                                const segmentLen = rangeEnd - rangeStart;

                                const subX = item.bbox.x + (relativeStart * charWidth);
                                const subW = segmentLen * charWidth;

                                if (subX < minX) minX = subX;
                                if (item.bbox.y < minY) minY = item.bbox.y;
                                if (subX + subW > maxX) maxX = subX + subW;
                                if (item.bbox.y + item.bbox.h > maxY) maxY = item.bbox.y + item.bbox.h;
                            }

                            if (minX !== Infinity) {
                                elements.push(
                                    <div
                                        key={`sentence-${lineIndex}`}
                                        className="absolute pointer-events-none z-10"
                                        style={{
                                            left: `${minX}%`,
                                            top: `${minY}%`,
                                            width: `${maxX - minX}%`,
                                            height: `${maxY - minY}%`,
                                            background: 'rgba(255, 237, 86, 0.5)', // Yellow
                                        }}
                                    />
                                );
                            }
                            lineIndex++;
                        }

                        // Create orange current word highlight
                        if (wordItems.length > 0) {
                            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

                            for (const item of wordItems) {
                                if (!item.bbox) continue;
                                const itemStart = item.offset;
                                const rangeStart = Math.max(itemStart, charIndex);
                                const rangeEnd = Math.min(itemStart + item.str.length, wordEnd);

                                if (rangeEnd <= rangeStart) continue;

                                const charWidth = item.bbox.w / Math.max(1, item.str.length);
                                const relativeStart = rangeStart - itemStart;
                                const segmentLen = rangeEnd - rangeStart;

                                const subX = item.bbox.x + (relativeStart * charWidth);
                                const subW = segmentLen * charWidth;

                                if (subX < minX) minX = subX;
                                if (item.bbox.y < minY) minY = item.bbox.y;
                                if (subX + subW > maxX) maxX = subX + subW;
                                if (item.bbox.y + item.bbox.h > maxY) maxY = item.bbox.y + item.bbox.h;
                            }

                            if (minX !== Infinity) {
                                elements.push(
                                    <div
                                        key="word-highlight"
                                        ref={wordHighlightRef}
                                        className="absolute pointer-events-none z-15 transition-all duration-75 ease-out"
                                        style={{
                                            left: `${minX}%`,
                                            top: `${minY}%`,
                                            width: `${maxX - minX}%`,
                                            height: `${maxY - minY}%`,
                                            background: 'rgba(249, 115, 22, 0.6)', // Orange
                                        }}
                                    />
                                );
                            }
                        }

                        return <>{elements}</>;
                    })()}
                </>
            ) : (
                <div className="w-full h-full absolute inset-0 flex items-center justify-center text-muted-foreground/10 bg-gray-50/50">
                    <span className="text-4xl font-bold opacity-20">{pageNumber}</span>
                </div>
            )}
        </div>
    );
}
