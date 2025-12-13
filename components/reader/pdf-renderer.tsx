"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2 } from 'lucide-react';
import { useInView } from 'react-intersection-observer';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useReaderStore } from '@/lib/reader/stores/readerStore';

// Configure the worker - use CDN for reliability
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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

        try {
            const outline = await pdf.getOutline();
            if (outline && outline.length > 0) {
                const chapters = await Promise.all(outline.map(async (item: any, index: number) => {
                    let pageNumber = 1;
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
            console.error("[PDFRenderer] Failed to extract outline:", error);
        }
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

    // Get requestPlayFromBlock action to trigger TTS when clicking
    const requestPlayFromBlock = useReaderStore(state => state.requestPlayFromBlock);

    // Handler for clicking a block to start reading from there
    const handleBlockClick = (blockIndex: number) => {
        console.log('[PDFPageWrapper] Click to read from block:', blockIndex);
        // This will set currentBlockIndex AND trigger TTS playback
        requestPlayFromBlock(blockIndex);
    };

    // VIEWPORT-BASED SCROLL SYNC
    // Only scroll when the highlighted word leaves the visible area
    // AND user is not manually scrolling
    useEffect(() => {
        if (!wordHighlightRef.current || currentWordIndex < 0) return;

        // Get the scroll container
        const scrollContainer = document.querySelector('[data-pdf-scroll-container]');
        if (!scrollContainer) return;

        // Check if user is manually scrolling - don't fight with user scroll!
        const isUserScrolling = scrollContainer.getAttribute('data-user-scrolling') === 'true';
        if (isUserScrolling) {
            console.log('[PDFPageWrapper] User is scrolling, skipping auto-scroll');
            return;
        }

        const highlightEl = wordHighlightRef.current;
        const highlightRect = highlightEl.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();

        // Check if highlight is outside visible area
        const isBelow = highlightRect.bottom > containerRect.bottom - 100; // 100px buffer
        const isAbove = highlightRect.top < containerRect.top + 100;

        if (isBelow || isAbove) {
            highlightEl.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
            console.log('[PDFPageWrapper] Scrolling highlight into view:', isBelow ? 'below' : 'above');
        }
    }, [currentWordIndex]);

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

                    {/* Clickable Block Regions - Click to start reading from any block */}
                    {blocksOnPage.map(({ block, index }) => {
                        const blockBbox = block.meta?.bbox;
                        if (!blockBbox) return null;

                        const isActive = index === currentBlockIndex;

                        return (
                            <div
                                key={block.id}
                                onClick={() => handleBlockClick(index)}
                                className={`absolute cursor-pointer transition-all duration-200 z-5 ${isActive
                                    ? 'bg-yellow-400/20 border-b-2 border-yellow-500/50'
                                    : 'hover:bg-blue-100/30 hover:border hover:border-blue-300/50'
                                    }`}
                                style={{
                                    left: `${blockBbox.x}%`,
                                    top: `${blockBbox.y}%`,
                                    width: `${blockBbox.w}%`,
                                    height: `${blockBbox.h}%`,
                                }}
                                title={`点击从这里开始朗读`}
                            />
                        );
                    })}

                    {/* Karaoke Word Highlight - Glowing Arrow Indicator */}
                    {isPageActive && activeBlock?.pdfItems && currentWordIndex >= 0 && (() => {
                        // currentWordIndex is actually charIndex from TTS
                        // Find the pdfItem whose offset range contains this charIndex
                        const charIndex = currentWordIndex;

                        // Find item where charIndex falls within [offset, offset + str.length)
                        const activeItem = activeBlock.pdfItems.find((item: any) => {
                            const start = item.offset;
                            const end = item.offset + item.str.length;
                            return charIndex >= start && charIndex < end;
                        });

                        if (!activeItem || !activeItem.bbox) return null;

                        const { x, y, w, h } = activeItem.bbox;

                        // Position arrow at bottom center of the word, slightly below
                        const arrowLeft = x + w / 2;
                        const arrowTop = y + h + 1; // 1% below the word

                        return (
                            <>
                                {/* Subtle word background highlight */}
                                <div
                                    ref={wordHighlightRef}
                                    className="absolute pointer-events-none z-20 rounded-sm"
                                    style={{
                                        left: `${x - 0.5}%`,
                                        top: `${y}%`,
                                        width: `${w + 1}%`,
                                        height: `${h}%`,
                                        background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.05) 0%, rgba(59, 130, 246, 0.15) 100%)',
                                    }}
                                />
                                {/* Glowing Arrow Indicator - positioned below text */}
                                <div
                                    className="absolute pointer-events-none z-30"
                                    style={{
                                        left: `${arrowLeft}%`,
                                        top: `${arrowTop}%`,
                                        transform: 'translateX(-50%)',
                                    }}
                                >
                                    {/* Arrow shape using CSS triangle + glow */}
                                    <div
                                        className="relative animate-pulse"
                                        style={{
                                            width: 0,
                                            height: 0,
                                            borderLeft: '6px solid transparent',
                                            borderRight: '6px solid transparent',
                                            borderBottom: '10px solid #3b82f6',
                                            filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.8)) drop-shadow(0 0 16px rgba(59, 130, 246, 0.5))',
                                            transform: 'rotate(180deg)', // Point upward
                                        }}
                                    />
                                    {/* Trailing glow effect - like a shooting arrow */}
                                    <div
                                        className="absolute"
                                        style={{
                                            left: '50%',
                                            top: '-12px',
                                            transform: 'translateX(-50%)',
                                            width: '2px',
                                            height: '20px',
                                            background: 'linear-gradient(to bottom, transparent, rgba(59, 130, 246, 0.8), rgba(59, 130, 246, 0.3))',
                                            filter: 'blur(2px)',
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
