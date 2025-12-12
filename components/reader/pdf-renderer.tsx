"use client"

import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useResizeObserver } from 'usehooks-ts';
import { Loader2 } from 'lucide-react';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useReaderStore } from '@/lib/reader/stores/readerStore';

// Configure the worker - use local file for reliability
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

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
            // Extract outline (bookmarks)
            const outline = await pdf.getOutline();
            if (outline && outline.length > 0) {
                // Convert PDF outline to our Chapter format
                const chapters = await Promise.all(outline.map(async (item: any, index: number) => {
                    // Get page number for the destination
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
                        blockIds: [], // Not using blocks for PDF nav currently
                        pageNumber: pageNumber // Custom field for PDF
                    };
                }));

                console.log("[PDFRenderer] Extracted chapters:", chapters);
                setChapters(chapters as any); // Type assertion needed or update types
            }
        } catch (error) {
            console.error("[PDFRenderer] Failed to extract outline:", error);
        }
    }

    // Text Selection Handler
    const handleSelection = () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
            // Don't clear immediately to allow clicking buttons in overlay
            // setSelection(null); 
            return;
        }

        const text = selection.toString().trim();
        if (text.length > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Adjust coordinates to be relative to viewport or handled by overlay
            // Overlay uses fixed/absolute positioning based on page coordinates
            // We pass raw client rect and let overlay handle it

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
            className="w-full h-full flex flex-col items-center overflow-y-auto bg-gray-100/50 p-4"
            onMouseUp={handleSelection} // Listen for selection
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

// Sub-component for virtualized rendering
import { useInView } from 'react-intersection-observer';

interface PDFPageWrapperProps {
    pageNumber: number;
    width: number;
    scale: number;
}

function PDFPageWrapper({ pageNumber, width, scale }: PDFPageWrapperProps) {
    const { ref, inView } = useInView({
        rootMargin: '100% 0px', // Pre-render 1 screen above/below
        triggerOnce: false,
    });

    // Subscribing to store for highlight
    const currentBlockIndex = useReaderStore(state => state.currentBlockIndex);
    const enhancedBlocks = useReaderStore(state => state.enhancedBlocks);

    // Determine if we should show highlight
    const activeBlock = enhancedBlocks[currentBlockIndex];
    const isPageActive = activeBlock?.meta?.pageNumber === pageNumber;
    // bbox is { x, y, w, h } in percentages
    const bbox = isPageActive ? activeBlock?.meta?.bbox : null;

    return (
        <div
            ref={ref}
            id={`pdf-page-${pageNumber}`}
            className="shadow-lg relative min-h-[600px] bg-white transition-opacity duration-200"
            style={{
                // Approximate aspect ratio placeholder if possible, else min-height
                minHeight: width * scale * 1.414 // A4 Approx
            }}
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
                    {/* Active Block Highlight Overlay */}
                    {bbox && (
                        <div
                            className="absolute bg-yellow-400/30 border-b-2 border-yellow-500 mix-blend-multiply transition-all duration-300 pointer-events-none z-10"
                            style={{
                                left: `${bbox.x}%`,
                                top: `${bbox.y}%`,
                                width: `${bbox.w}%`,
                                height: `${bbox.h}%`,
                                animation: 'pulse-subtle 2s infinite'
                            }}
                        />
                    )}
                </>
            ) : (
                <div className="w-full h-full absolute inset-0 flex items-center justify-center text-muted-foreground/10 bg-gray-50/50">
                    <span className="text-4xl font-bold opacity-20">{pageNumber}</span>
                </div>
            )}
            {/* Overlay Container would go here */}
        </div>
    );
}
