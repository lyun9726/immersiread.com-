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
                loading={
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

        let charOffset = targetItem.offset || 0;
        const itemText = targetItem.str || "";
        const itemWidth = targetItem.bbox?.w || 0;

        if (itemText.length > 1 && itemWidth > 0) {
            const ratio = (xPercent - targetItem.bbox.x) / itemWidth;
            const rawIndex = Math.floor(Math.max(0, Math.min(1, ratio)) * itemText.length);
            let localIndex = Math.min(Math.max(rawIndex, 0), itemText.length - 1);

            if (/\s/.test(itemText[localIndex])) {
                let left = localIndex - 1;
                let right = localIndex + 1;
                let moved = false;
                while (left >= 0 || right < itemText.length) {
                    if (left >= 0 && !/\s/.test(itemText[left])) {
                        localIndex = left;
                        moved = true;
                        break;
                    }
                    if (right < itemText.length && !/\s/.test(itemText[right])) {
                        localIndex = right;
                        moved = true;
                        break;
                    }
                    left--;
                    right++;
                }
                if (!moved) {
                    localIndex = 0;
                }
            }

            while (localIndex > 0 && !/\s/.test(itemText[localIndex - 1])) {
                localIndex--;
            }

            charOffset = (targetItem.offset || 0) + localIndex;
        }

        requestPlayFromPosition(blockIndex, charOffset);
    };

    // SMOOTH AUTO-SCROLL - Only scroll when the BLOCK changes or highlight goes off-screen
    // This prevents jumpy behavior from scrolling on every word
    const lastScrolledBlockRef = useRef<number>(-1);

    useEffect(() => {
        // Only do auto-scroll if this page contains the active block
        if (!isPageActive || currentBlockIndex < 0) return;

        // Check if user is manually scrolling - don't fight with user scroll!
        const scrollContainer = document.querySelector('[data-pdf-scroll-container]');
        if (!scrollContainer) return;

        const isUserScrolling = scrollContainer.getAttribute('data-user-scrolling') === 'true';
        if (isUserScrolling) return;

        // Only scroll when block changes to avoid constant micro-scrolls
        if (lastScrolledBlockRef.current === currentBlockIndex) return;

        // Get the page element itself to scroll into view
        const pageElement = document.getElementById(`pdf-page-${pageNumber}`);
        if (!pageElement) return;

        const pageRect = pageElement.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();

        // Check if the page is mostly visible (at least 30% visible)
        const visibleTop = Math.max(pageRect.top, containerRect.top);
        const visibleBottom = Math.min(pageRect.bottom, containerRect.bottom);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const visibilityRatio = visibleHeight / pageRect.height;

        // If page is less than 30% visible, scroll to show it
        if (visibilityRatio < 0.3) {
            pageElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start', // Align to top for predictable behavior
            });
            lastScrolledBlockRef.current = currentBlockIndex;
            console.log('[PDFPageWrapper] Scrolling to page', pageNumber, 'for block', currentBlockIndex);
        } else {
            // Page is visible, just update the ref
            lastScrolledBlockRef.current = currentBlockIndex;
        }
    }, [currentBlockIndex, isPageActive, pageNumber]);

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

                    {/* Clickable Block Regions - Single-click to start reading */}
                    {/* These overlays are above text layer. Text selection works via browser selection after click */}
                    {blocksOnPage.map(({ block, index }) => {
                        const blockBbox = block.meta?.bbox;
                        if (!blockBbox) return null;

                        const isActive = index === currentBlockIndex;

                        return (
                            <div
                                key={block.id}
                                onClick={(event) => handleBlockClick(event, index, block)}
                                className={`absolute cursor-pointer transition-all duration-200 z-20 ${isActive
                                    ? 'bg-[#ffeb3b]/40 mix-blend-multiply border-l-4 border-orange-500' // Vivid Yellow
                                    : 'hover:bg-blue-100/20'
                                    }`}
                                style={{
                                    left: `${blockBbox.x}%`,
                                    top: `${blockBbox.y}%`,
                                    width: `${blockBbox.w}%`,
                                    height: `${blockBbox.h}%`,
                                }}
                                title="Single click to start reading"
                            />
                        );
                    })}

                    {/* Karaoke Word Highlight - Glowing Orange Underline & Arrow */}
                    {isPageActive && activeBlock?.pdfItems && currentWordIndex >= 0 && (() => {
                        // currentWordIndex is actually charIndex from TTS (start of word)
                        const charIndex = currentWordIndex;
                        const blockText = activeBlock.original || '';

                        // Find word boundary
                        const MAX_WORD_LENGTH = 6;
                        let wordEndIndex = charIndex;
                        const boundaryPattern = /[\s。？！.?!,，、：:；;「」『』（）()【】\[\]"'——–-]/;
                        while (
                            wordEndIndex < blockText.length &&
                            wordEndIndex - charIndex < MAX_WORD_LENGTH &&
                            !boundaryPattern.test(blockText[wordEndIndex])
                        ) {
                            wordEndIndex++;
                        }
                        // If single char or boundary, ensure at least 1 char width
                        if (wordEndIndex === charIndex) wordEndIndex++;

                        // Find all pdfItems within [charIndex, wordEndIndex)
                        const wordItems = activeBlock.pdfItems.filter((item: any) => {
                            const itemStart = item.offset;
                            const itemEnd = item.offset + item.str.length;
                            return itemEnd > charIndex && itemStart < wordEndIndex;
                        });

                        if (wordItems.length === 0) return null;

                        // Calculate PRECISE sub-geometry
                        // (Because PDF spans are often full sentences, taking the whole item bbox is too coarse)
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

                        for (const item of wordItems) {
                            if (!item.bbox) continue;

                            // Intersect item range with word range
                            const itemStart = item.offset;
                            const rangeStart = Math.max(itemStart, charIndex);
                            const rangeEnd = Math.min(itemStart + item.str.length, wordEndIndex);

                            if (rangeEnd <= rangeStart) continue;

                            // Calculate sub-segment relative to item
                            const charWidth = item.bbox.w / item.str.length;

                            // Relative start character in this item
                            const relativeStart = rangeStart - itemStart;
                            const segmentLen = rangeEnd - rangeStart;

                            const subX = item.bbox.x + (relativeStart * charWidth);
                            const subW = segmentLen * charWidth;

                            /* 
                              Refining X/W:
                              For variable width fonts, average char width is imperfect but much better than whole sentence.
                              Ideally we'd use measureText but we don't have the font.
                              This approximation is standard for PDF.js text layer mapping.
                            */

                            const subY = item.bbox.y;
                            const subH = item.bbox.h;

                            if (subX < minX) minX = subX;
                            if (subY < minY) minY = subY;
                            if (subX + subW > maxX) maxX = subX + subW;
                            if (subY + subH > maxY) maxY = subY + subH;
                        }

                        if (minX === Infinity) return null;

                        const x = minX;
                        const y = minY;
                        const w = maxX - minX;
                        const h = maxY - minY;

                        // Position arrow at bottom center of the word, slightly below underline
                        const arrowLeft = x + w / 2;

                        // Underline adjustment:
                        // Move it strictly below the text. Assuming 'h' covers the text height.
                        // We want underline at y + h.
                        const underlineTop = y + h;

                        return (
                            <>
                                {/* Orange Underline - Positioned BELOW text */}
                                <div
                                    ref={wordHighlightRef}
                                    className="absolute pointer-events-none z-20 transition-all duration-100 ease-out"
                                    style={{
                                        left: `${x}%`,
                                        top: `${underlineTop}%`, // Start at bottom of text
                                        width: `${w}%`,
                                        height: '3px', // Fixed thickness
                                        background: '#f97316', // Orange-500
                                        opacity: 0.8,
                                        transform: 'translateY(2px)', // Push down slightly (2px ~ 0.2% usually, but px is safer via transform)
                                    }}
                                />

                                {/* Optional: Very subtle tint over the word itself (removed to avoid "blocking text" complaint) */}
                                {/* If user wants JUST underline, we skip the tint box. */}

                                {/* Glowing Arrow Indicator - Orange */}
                                <div
                                    className="absolute pointer-events-none z-30 transition-all duration-100 ease-out"
                                    style={{
                                        left: `${arrowLeft}%`,
                                        top: `${underlineTop}%`, // Align with underline
                                        transform: 'translateX(-50%) translateY(8px)', // Push below underline
                                    }}
                                >
                                    <div
                                        className="relative animate-pulse"
                                        style={{
                                            width: 0,
                                            height: 0,
                                            borderLeft: '6px solid transparent',
                                            borderRight: '6px solid transparent',
                                            borderBottom: '10px solid #f97316',
                                            filter: 'drop-shadow(0 0 8px rgba(249, 115, 22, 0.8))',
                                            transform: 'rotate(180deg)',
                                        }}
                                    />
                                </div>
                            </>
                        );
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
