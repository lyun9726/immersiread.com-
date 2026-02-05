"use client"

/**
 * PDF Bilingual Renderer
 * Supports three modes: original, translation, bilingual (side-by-side)
 * Desktop: Left-right split for bilingual mode
 * Mobile: Swipe navigation with vertical bilingual layout
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useReaderStore } from '@/lib/reader/stores/readerStore';
import {
    getCachedTranslation,
    requestPageTranslation,
    prefetchTranslations,
    cacheTranslation
} from '@/lib/storage/pdfTranslationCache';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface PDFBilingualRendererProps {
    url: string;
    bookId: string;
    targetLang?: string;
    scale?: number;
    isMobile?: boolean;
}

interface PageTranslationState {
    status: 'idle' | 'loading' | 'loaded' | 'error';
    url?: string;
    error?: string;
}

export function PDFBilingualRenderer({
    url,
    bookId,
    targetLang = 'zh',
    scale = 1.0,
    isMobile = false
}: PDFBilingualRendererProps) {
    const [numPages, setNumPages] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [width, setWidth] = useState<number>(600);
    const [loadError, setLoadError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Translation state per page
    const [pageTranslations, setPageTranslations] = useState<Map<number, PageTranslationState>>(new Map());

    // Get reading mode from store
    const readingMode = useReaderStore(state => state.readingMode);
    const setChapters = useReaderStore(state => state.setChapters);
    const storeCurrentPage = useReaderStore(state => state.currentPage);
    const setCurrentPageStore = useReaderStore(state => state.setCurrentPage);

    // Sync with store's current page
    useEffect(() => {
        if (storeCurrentPage > 0 && storeCurrentPage !== currentPage) {
            setCurrentPage(storeCurrentPage);
        }
    }, [storeCurrentPage]);

    // Resize observer
    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setWidth(entry.contentRect.width);
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Request translation for current page when mode changes
    useEffect(() => {
        if (readingMode !== 'original' && currentPage > 0) {
            translatePage(currentPage);

            // Prefetch next pages
            prefetchTranslations(bookId, currentPage, numPages, targetLang, 2);
        }
    }, [readingMode, currentPage, bookId, numPages, targetLang]);

    // Translate a specific page
    const translatePage = useCallback(async (pageNum: number) => {
        // Skip if already loaded or loading
        const existing = pageTranslations.get(pageNum);
        if (existing?.status === 'loaded' || existing?.status === 'loading') {
            console.log(`[PDFBilingual] Skipping page ${pageNum} - already ${existing.status}`);
            return;
        }

        console.log(`[PDFBilingual] Starting translation for page ${pageNum}...`);

        // Set loading state (this also clears error state for retry)
        setPageTranslations(prev => new Map(prev).set(pageNum, { status: 'loading' }));

        try {
            const result = await requestPageTranslation(bookId, pageNum, targetLang);
            console.log(`[PDFBilingual] Translation result for page ${pageNum}:`, result);

            if (result.status === 'completed' && result.url) {
                setPageTranslations(prev => new Map(prev).set(pageNum, {
                    status: 'loaded',
                    url: result.url!
                }));
            } else if (result.status === 'processing') {
                // Poll for completion
                console.log(`[PDFBilingual] Page ${pageNum} is processing, starting poll...`);
                pollTranslationStatus(pageNum);
            } else {
                console.error(`[PDFBilingual] Translation failed for page ${pageNum}:`, result);
                setPageTranslations(prev => new Map(prev).set(pageNum, {
                    status: 'error',
                    error: 'Translation failed'
                }));
            }
        } catch (error) {
            console.error('[PDFBilingual] Translation error:', error);
            setPageTranslations(prev => new Map(prev).set(pageNum, {
                status: 'error',
                error: String(error)
            }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId, targetLang, pageTranslations]);

    // Poll for translation completion
    const pollTranslationStatus = useCallback(async (pageNum: number) => {
        const maxAttempts = 30; // 30 seconds max
        let attempts = 0;

        const poll = async () => {
            attempts++;

            // Check local cache first
            const cached = await getCachedTranslation(bookId, pageNum, targetLang);
            if (cached) {
                setPageTranslations(prev => new Map(prev).set(pageNum, {
                    status: 'loaded',
                    url: cached.translatedPageUrl
                }));
                return;
            }

            if (attempts < maxAttempts) {
                setTimeout(poll, 1000);
            } else {
                // Retry the translation request
                const result = await requestPageTranslation(bookId, pageNum, targetLang);
                if (result.status === 'completed' && result.url) {
                    setPageTranslations(prev => new Map(prev).set(pageNum, {
                        status: 'loaded',
                        url: result.url!
                    }));
                } else {
                    setPageTranslations(prev => new Map(prev).set(pageNum, {
                        status: 'error',
                        error: 'Translation timeout'
                    }));
                }
            }
        };

        setTimeout(poll, 1000);
    }, [bookId, targetLang]);

    // Document load success
    async function onDocumentLoadSuccess(pdf: any) {
        setNumPages(pdf.numPages);
        setLoadError(null);

        // Extract chapters from outline
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
                    } catch (e) { }
                    return {
                        id: `pdf-toc-${index}`,
                        title: item.title,
                        order: index,
                        blockIds: [],
                        pageNumber
                    };
                }));
                setChapters(chapters as any);
            }
        } catch (e) { }
    }

    // Navigation handlers
    const goToPage = (page: number) => {
        if (page >= 1 && page <= numPages) {
            setCurrentPage(page);
            setCurrentPageStore(page);
        }
    };

    const goToPrevPage = () => goToPage(currentPage - 1);
    const goToNextPage = () => goToPage(currentPage + 1);

    // Touch handling for mobile swipe
    const touchStartX = useRef<number>(0);
    const touchEndX = useRef<number>(0);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        touchEndX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
        const diff = touchStartX.current - touchEndX.current;
        const threshold = 50;

        if (diff > threshold) {
            // Swipe left - next page
            goToNextPage();
        } else if (diff < -threshold) {
            // Swipe right - prev page
            goToPrevPage();
        }
    };

    // Calculate page width based on mode
    const getPageWidth = () => {
        const baseWidth = Math.min(width - 48, 800) * scale;
        if (readingMode === 'bilingual' && !isMobile) {
            // Split width for side-by-side
            return (width - 64) / 2 * scale;
        }
        return baseWidth;
    };

    const pageWidth = getPageWidth();
    const translationState = pageTranslations.get(currentPage);

    // Render loading state
    const renderLoading = () => (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <span className="text-sm">翻译中...</span>
        </div>
    );

    // Render error state
    const renderError = () => (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-red-500">
            <span className="text-sm">翻译失败</span>
            <button
                onClick={() => translatePage(currentPage)}
                className="mt-2 px-4 py-2 bg-primary text-white rounded text-sm"
            >
                重试
            </button>
        </div>
    );

    // Render translated page
    const renderTranslatedPage = () => {
        if (!translationState) {
            return renderLoading();
        }

        switch (translationState.status) {
            case 'loading':
                return renderLoading();
            case 'error':
                return renderError();
            case 'loaded':
                return (
                    <Document
                        file={translationState.url}
                        loading={renderLoading()}
                        error={renderError()}
                    >
                        <Page
                            pageNumber={1}  // Translated page is always page 1 (single page PDF)
                            width={pageWidth}
                            renderTextLayer={true}
                            renderAnnotationLayer={false}
                        />
                    </Document>
                );
            default:
                return null;
        }
    };

    // Mobile layout with swipe
    if (isMobile) {
        return (
            <div
                ref={containerRef}
                className="w-full h-full flex flex-col bg-gray-100"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* Page content */}
                <div className="flex-1 overflow-hidden flex items-center justify-center p-2">
                    <Document
                        file={url}
                        onLoadSuccess={onDocumentLoadSuccess}
                        onLoadError={(error) => setLoadError(error.message)}
                        loading={
                            <div className="flex items-center justify-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        }
                    >
                        {readingMode === 'bilingual' ? (
                            // Vertical bilingual layout for mobile
                            <div className="flex flex-col gap-4">
                                <div className="bg-white shadow rounded overflow-hidden">
                                    <Page
                                        pageNumber={currentPage}
                                        width={Math.min(width - 16, 400)}
                                        renderTextLayer={true}
                                        renderAnnotationLayer={false}
                                    />
                                </div>
                                <div className="bg-blue-50 shadow rounded overflow-hidden border-l-4 border-blue-500">
                                    {renderTranslatedPage()}
                                </div>
                            </div>
                        ) : readingMode === 'translation' ? (
                            // Translation only
                            <div className="bg-white shadow rounded overflow-hidden">
                                {translationState?.status === 'loaded' ? renderTranslatedPage() : (
                                    <>
                                        {translatePage(currentPage)}
                                        {renderLoading()}
                                    </>
                                )}
                            </div>
                        ) : (
                            // Original only
                            <div className="bg-white shadow rounded overflow-hidden">
                                <Page
                                    pageNumber={currentPage}
                                    width={Math.min(width - 16, 400)}
                                    renderTextLayer={true}
                                    renderAnnotationLayer={true}
                                />
                            </div>
                        )}
                    </Document>
                </div>

                {/* Mobile navigation */}
                <div className="flex items-center justify-between px-4 py-3 bg-white border-t">
                    <button
                        onClick={goToPrevPage}
                        disabled={currentPage <= 1}
                        className="p-2 rounded-full bg-gray-100 disabled:opacity-30"
                    >
                        <ChevronLeft className="h-6 w-6" />
                    </button>

                    <span className="text-sm text-muted-foreground">
                        {currentPage} / {numPages}
                    </span>

                    <button
                        onClick={goToNextPage}
                        disabled={currentPage >= numPages}
                        className="p-2 rounded-full bg-gray-100 disabled:opacity-30"
                    >
                        <ChevronRight className="h-6 w-6" />
                    </button>
                </div>
            </div>
        );
    }

    // Desktop layout
    return (
        <div
            ref={containerRef}
            className="w-full h-full flex flex-col items-center overflow-y-auto bg-gray-100/50 p-4"
        >
            <Document
                file={url}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={(error) => setLoadError(error.message)}
                loading={
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                }
                error={
                    <div className="flex items-center justify-center p-8 text-red-500">
                        {loadError || "Failed to load PDF"}
                    </div>
                }
            >
                {readingMode === 'bilingual' ? (
                    // Side-by-side bilingual layout
                    <div className="flex gap-4">
                        {/* Original PDF */}
                        <div className="bg-white shadow-lg rounded overflow-hidden">
                            <div className="bg-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
                                原文
                            </div>
                            <Page
                                pageNumber={currentPage}
                                width={pageWidth}
                                renderTextLayer={true}
                                renderAnnotationLayer={true}
                            />
                        </div>

                        {/* Translated PDF */}
                        <div className="bg-white shadow-lg rounded overflow-hidden border-l-4 border-blue-500">
                            <div className="bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                                译文
                            </div>
                            {renderTranslatedPage()}
                        </div>
                    </div>
                ) : readingMode === 'translation' ? (
                    // Translation only
                    <div className="bg-white shadow-lg rounded overflow-hidden">
                        {translationState?.status === 'loaded' ? renderTranslatedPage() : (
                            <>
                                {translatePage(currentPage)}
                                {renderLoading()}
                            </>
                        )}
                    </div>
                ) : (
                    // Original only - render all pages with virtualization
                    <div className="flex flex-col gap-4">
                        {Array.from({ length: numPages }, (_, i) => (
                            <div key={i + 1} id={`pdf-page-${i + 1}`} className="bg-white shadow-lg">
                                <Page
                                    pageNumber={i + 1}
                                    width={pageWidth}
                                    renderTextLayer={true}
                                    renderAnnotationLayer={true}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </Document>

            {/* Page navigation for non-original mode */}
            {readingMode !== 'original' && numPages > 0 && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg">
                    <button
                        onClick={goToPrevPage}
                        disabled={currentPage <= 1}
                        className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-30"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>

                    <span className="text-sm font-medium min-w-[80px] text-center">
                        {currentPage} / {numPages}
                    </span>

                    <button
                        onClick={goToNextPage}
                        disabled={currentPage >= numPages}
                        className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-30"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </div>
            )}
        </div>
    );
}

export default PDFBilingualRenderer;
