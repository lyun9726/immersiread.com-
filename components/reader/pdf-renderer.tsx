"use client"

import React, { useState, useEffect } from 'react';
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
    const setChapters = useReaderStore(state => state.setChapters);
    const currentPage = useReaderStore(state => state.currentPage);

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
            className="w-full h-full flex flex-col items-center overflow-y-auto bg-gray-100/50 p-4"
            onMouseUp={handleSelection}
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
    const enhancedBlocks = useReaderStore(state => state.enhancedBlocks);
    const currentWordRange = useReaderStore(state => state.currentWordRange);

    // Ref for word highlight element - used for viewport visibility detection
    const wordHighlightRef = React.useRef<HTMLDivElement>(null);

    const activeBlock = enhancedBlocks[currentBlockIndex];
    const isPageActive = activeBlock?.meta?.pageNumber === pageNumber;
    const bbox = isPageActive ? activeBlock?.meta?.bbox : null;

    // VIEWPORT-BASED SCROLL SYNC
    // Only scroll when the highlighted word leaves the visible area
    useEffect(() => {
        if (!wordHighlightRef.current || !currentWordRange) return;

        const highlightEl = wordHighlightRef.current;
        const highlightRect = highlightEl.getBoundingClientRect();

        // Get the scroll container
        const scrollContainer = document.querySelector('[data-pdf-scroll-container]');
        if (!scrollContainer) return;

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
    }, [currentWordRange]);

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

                    {/* Active Block Highlight Overlay (Paragraph Level) */}
                    {bbox && (
                        <div
                            className="absolute bg-yellow-400/20 border-b-2 border-yellow-500/50 mix-blend-multiply transition-all duration-300 pointer-events-none z-10"
                            style={{
                                left: `${bbox.x}%`,
                                top: `${bbox.y}%`,
                                width: `${bbox.w}%`,
                                height: `${bbox.h}%`,
                            }}
                        />
                    )}

                    {/* Karaoke Word Highlight Overlay */}
                    {isPageActive && activeBlock?.pdfItems && currentWordRange && (() => {
                        const rangeStart = currentWordRange.start;
                        const rangeEnd = currentWordRange.start + currentWordRange.length;

                        const activeItems = activeBlock.pdfItems.filter((item: any) => {
                            const itemStart = item.offset;
                            const itemEnd = item.offset + item.str.length;
                            return itemStart < rangeEnd && itemEnd > rangeStart;
                        });

                        if (activeItems.length === 0) return null;

                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        activeItems.forEach((item: any) => {
                            if (item.bbox.x < minX) minX = item.bbox.x;
                            if (item.bbox.y < minY) minY = item.bbox.y;
                            if (item.bbox.x + item.bbox.w > maxX) maxX = item.bbox.x + item.bbox.w;
                            if (item.bbox.y + item.bbox.h > maxY) maxY = item.bbox.y + item.bbox.h;
                        });

                        if (minX === Infinity) return null;

                        return (
                            <div
                                ref={wordHighlightRef}
                                className="absolute bg-blue-400/30 border-b-2 border-blue-600 mix-blend-multiply transition-all duration-75 pointer-events-none z-20 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                style={{
                                    left: `${minX}%`,
                                    top: `${minY}%`,
                                    width: `${maxX - minX}%`,
                                    height: `${maxY - minY}%`,
                                }}
                            />
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
