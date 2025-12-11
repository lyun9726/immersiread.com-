"use client"

import { useState, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, AlertCircle } from 'lucide-react';

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
    const [error, setError] = useState<Error | null>(null);
    const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set());

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
    const containerRef = useCallback((node: HTMLDivElement | null) => {
        if (node) {
            setWidth(node.getBoundingClientRect().width);
        }
    }, []);

    async function onDocumentLoadSuccess(pdf: any) {
        try {
            setNumPages(pdf.numPages);
            console.log(`[PDFRenderer] Loaded PDF with ${pdf.numPages} pages`);

            // Extract outline (bookmarks) with full error handling
            try {
                const outline = await pdf.getOutline();
                if (outline && outline.length > 0) {
                    const chapters = [];
                    for (let index = 0; index < outline.length; index++) {
                        const item = outline[index];
                        try {
                            let pageNumber = 1;
                            if (typeof item.dest === 'string') {
                                const dest = await pdf.getDestination(item.dest);
                                if (dest && dest[0]) {
                                    const pageIndex = await pdf.getPageIndex(dest[0]);
                                    pageNumber = pageIndex + 1;
                                }
                            } else if (Array.isArray(item.dest) && item.dest[0]) {
                                const pageIndex = await pdf.getPageIndex(item.dest[0]);
                                pageNumber = pageIndex + 1;
                            }

                            chapters.push({
                                id: `pdf-toc-${index}`,
                                title: item.title || `Chapter ${index + 1}`,
                                order: index,
                                blockIds: [],
                                pageNumber: pageNumber
                            });
                        } catch (destError) {
                            // Skip this chapter if destination parsing fails
                            console.warn(`[PDFRenderer] Skipping chapter ${index}:`, destError);
                            chapters.push({
                                id: `pdf-toc-${index}`,
                                title: item.title || `Chapter ${index + 1}`,
                                order: index,
                                blockIds: [],
                                pageNumber: 1
                            });
                        }
                    }

                    console.log("[PDFRenderer] Extracted chapters:", chapters.length);
                    setChapters(chapters as any);
                }
            } catch (outlineError) {
                console.warn("[PDFRenderer] Failed to extract outline:", outlineError);
                // Continue without chapters - not fatal
            }
        } catch (loadError) {
            console.error("[PDFRenderer] Error in onDocumentLoadSuccess:", loadError);
            setError(loadError as Error);
        }
    }

    // Text Selection Handler
    const handleSelection = useCallback(() => {
        try {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) {
                return;
            }

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
        } catch (selectionError) {
            console.warn("[PDFRenderer] Selection error:", selectionError);
        }
    }, []);

    function onDocumentLoadError(err: Error) {
        console.error("[PDFRenderer] Document load error:", err);
        setError(err);
    }

    // Handle page load errors gracefully
    const onPageLoadError = useCallback((pageNumber: number) => (err: Error) => {
        console.warn(`[PDFRenderer] Page ${pageNumber} load error:`, err);
        // Don't crash the whole app for a single page error
    }, []);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-destructive h-full">
                <AlertCircle className="h-10 w-10 mb-4" />
                <h3 className="text-lg font-semibold mb-2">无法加载 PDF 文件</h3>
                <p className="text-sm text-center max-w-md opacity-80 mb-4">{error.message}</p>
                <div className="p-4 bg-muted/50 rounded-lg text-xs font-mono break-all max-w-full overflow-auto">
                    Source: {url}
                </div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="w-full h-full flex flex-col items-center overflow-y-auto bg-gray-100/50 p-4"
            onMouseUp={handleSelection}
        >
            <Document
                file={url}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                }
                error={
                    <div className="flex flex-col items-center justify-center text-destructive p-8">
                        <AlertCircle className="h-8 w-8 mb-2" />
                        <p>PDF 加载失败</p>
                    </div>
                }
                className="flex flex-col gap-4"
            >
                {numPages > 0 && Array.from({ length: numPages }, (_, index) => (
                    <div
                        key={`page_${index + 1}`}
                        id={`pdf-page-${index + 1}`}
                        className="shadow-lg relative"
                    >
                        <Page
                            pageNumber={index + 1}
                            width={Math.min(width ? width - 48 : 600, 800) * scale}
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                            className="bg-white"
                            loading={
                                <div className="flex items-center justify-center min-h-[400px] bg-white">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            }
                            error={
                                <div className="flex items-center justify-center min-h-[200px] bg-white text-muted-foreground">
                                    <p>页面 {index + 1} 加载失败</p>
                                </div>
                            }
                            onLoadError={onPageLoadError(index + 1)}
                        />
                    </div>
                ))}
            </Document>
        </div>
    );
}
