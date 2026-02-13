"use client"

/**
 * PDF Bilingual Renderer
 * Supports three modes: original, translation, bilingual (side-by-side)
 * 
 * Translation strategy:
 * 1. Try BabelDOC for full PDF page translation (produces translated PDF)
 * 2. If BabelDOC fails/unavailable, fall back to text-based translation overlay
 *    using the already-working DeepSeek translation engine
 * 
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

    // Translation state per page (BabelDOC)
    const [pageTranslations, setPageTranslations] = useState<Map<number, PageTranslationState>>(new Map());

    // Get state from store
    const readingMode = useReaderStore(state => state.readingMode);
    const setChapters = useReaderStore(state => state.setChapters);
    const storeCurrentPage = useReaderStore(state => state.currentPage);
    const setCurrentPageStore = useReaderStore(state => state.setCurrentPage);

    // Text-based translations (fallback when BabelDOC fails)
    const enhancedBlocks = useReaderStore(state => state.enhancedBlocks);
    const enhanceWithTranslation = useReaderStore(state => state.enhanceWithTranslation);

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
            // Prefetch next page
            if (currentPage < numPages) {
                translatePage(currentPage + 1);
            }
        }
    }, [readingMode, currentPage, bookId, numPages, targetLang]);

    // Keyboard navigation (Left/Right arrow keys)
    useEffect(() => {
        if (readingMode === 'original') return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return; // Don't intercept input fields
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                goToPrevPage();
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                goToNextPage();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [readingMode, currentPage, numPages]);

    // Translate a specific page
    const translatePage = useCallback(async (pageNum: number) => {
        // Skip if already loaded or loading
        const existing = pageTranslations.get(pageNum);
        if (existing?.status === 'loaded' || existing?.status === 'loading') {
            return;
        }

        console.log(`[PDFBilingual] Starting translation for page ${pageNum}...`);
        setPageTranslations(prev => new Map(prev).set(pageNum, { status: 'loading' }));

        try {
            const result = await requestPageTranslation(bookId, pageNum, targetLang, url);
            console.log(`[PDFBilingual] Translation result for page ${pageNum}:`, result);

            if (result.status === 'completed' && result.url) {
                setPageTranslations(prev => new Map(prev).set(pageNum, {
                    status: 'loaded',
                    url: result.url!
                }));
            } else if (result.status === 'processing' && result.jobId) {
                console.log(`[PDFBilingual] Page ${pageNum} is processing (jobId: ${result.jobId}), starting poll...`);
                pollTranslationStatus(pageNum, result.jobId);
            } else {
                // BabelDOC failed - trigger text translation fallback
                console.log(`[PDFBilingual] BabelDOC unavailable for page ${pageNum}, using text translation fallback`);
                triggerTextTranslationFallback();
                setPageTranslations(prev => new Map(prev).set(pageNum, {
                    status: 'error',
                    error: 'Using text translation'
                }));
            }
        } catch (error) {
            console.error('[PDFBilingual] Translation error:', error);
            triggerTextTranslationFallback();
            setPageTranslations(prev => new Map(prev).set(pageNum, {
                status: 'error',
                error: String(error)
            }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId, targetLang, pageTranslations]);

    // Trigger text-based translation as fallback
    const triggerTextTranslationFallback = useCallback(() => {
        const hasTranslations = enhancedBlocks.some(b => b.translation);
        if (!hasTranslations) {
            console.log(`[PDFBilingual] Triggering text-based translation fallback...`);
            enhanceWithTranslation(targetLang).catch(err => {
                console.error("[PDFBilingual] Text translation fallback failed:", err);
            });
        }
    }, [enhancedBlocks, enhanceWithTranslation, targetLang]);

    // Poll Railway service for translation completion via Vercel proxy
    const pollTranslationStatus = useCallback(async (pageNum: number, jobId: string) => {
        const maxAttempts = 90; // 3 minutes max (polling every 2s)
        let attempts = 0;

        const poll = async () => {
            attempts++;

            // 1. Check local cache first
            const cached = await getCachedTranslation(bookId, pageNum, targetLang);
            if (cached) {
                setPageTranslations(prev => new Map(prev).set(pageNum, {
                    status: 'loaded',
                    url: cached.translatedPageUrl
                }));
                console.log(`[PDFBilingual] ✓ Page ${pageNum} found in local cache`);
                return;
            }

            // 2. Poll Railway status via Vercel proxy
            try {
                const response = await fetch(`/api/translate/pdf/page?jobId=${jobId}`);
                if (response.ok) {
                    const result = await response.json();
                    console.log(`[PDFBilingual] Poll #${attempts} page ${pageNum}: ${result.status} ${result.progress || ''}`);

                    if (result.status === 'completed' && result.translatedUrl) {
                        await cacheTranslation(bookId, pageNum, targetLang, result.translatedUrl);
                        setPageTranslations(prev => new Map(prev).set(pageNum, {
                            status: 'loaded',
                            url: result.translatedUrl
                        }));
                        console.log(`[PDFBilingual] ✓ Page ${pageNum} translation complete!`);
                        return;
                    } else if (result.status === 'failed') {
                        console.error(`[PDFBilingual] ✗ Page ${pageNum} failed:`, result.error);
                        triggerTextTranslationFallback();
                        setPageTranslations(prev => new Map(prev).set(pageNum, {
                            status: 'error',
                            error: result.error || 'Translation failed on server'
                        }));
                        return;
                    }
                }
            } catch (e) {
                // Silently continue polling
            }

            // 3. Continue polling or timeout
            if (attempts < maxAttempts) {
                setTimeout(poll, 2000);
            } else {
                console.error(`[PDFBilingual] ✗ Page ${pageNum} timed out`);
                triggerTextTranslationFallback();
                setPageTranslations(prev => new Map(prev).set(pageNum, {
                    status: 'error',
                    error: 'Translation timeout'
                }));
            }
        };

        setTimeout(poll, 3000);
    }, [bookId, targetLang, triggerTextTranslationFallback]);

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
            goToNextPage();
        } else if (diff < -threshold) {
            goToPrevPage();
        }
    };

    // Calculate page width based on mode
    const getPageWidth = () => {
        const baseWidth = Math.min(width - 48, 800) * scale;
        if (readingMode === 'bilingual' && !isMobile) {
            return (width - 64) / 2 * scale;
        }
        return baseWidth;
    };

    const pageWidth = getPageWidth();
    const translationState = pageTranslations.get(currentPage);

    // Get text translations for current page (fallback)
    const getPageTextTranslations = useCallback(() => {
        return enhancedBlocks.filter(block => {
            const pageNum = block.meta?.pageNumber;
            return pageNum === currentPage && block.translation && block.type === 'text';
        });
    }, [enhancedBlocks, currentPage]);

    const pageTextTranslations = getPageTextTranslations();
    const hasTextTranslations = pageTextTranslations.length > 0;

    // Render loading state
    const renderLoading = () => (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <span className="text-sm">翻译中...</span>
        </div>
    );

    // Render text-based translation panel (fallback)
    const renderTextTranslation = () => {
        if (!hasTextTranslations) {
            // No text translations yet, trigger and show loading
            return (
                <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin mb-2" />
                    <span className="text-sm">正在翻译文本...</span>
                </div>
            );
        }

        return (
            <div className="p-6 overflow-y-auto max-h-[800px] bg-white">
                <div className="text-xs text-blue-500 font-medium mb-3 pb-2 border-b border-blue-100">
                    📝 文本翻译
                </div>
                <div className="space-y-3">
                    {pageTextTranslations.map((block, idx) => (
                        <div key={block.id || idx} className="leading-relaxed">
                            <p className="text-sm text-gray-800 leading-relaxed">
                                {block.translation}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Render translated page - BabelDOC PDF or text fallback
    const renderTranslatedPage = () => {
        if (!translationState) {
            return renderLoading();
        }

        switch (translationState.status) {
            case 'loading':
                return renderLoading();
            case 'error':
                // Fallback to text-based translation
                return renderTextTranslation();
            case 'loaded':
                return (
                    <Document
                        file={translationState.url}
                        loading={renderLoading()}
                        error={renderTextTranslation()} // If PDF fails to load, show text translation
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
                            // Translation only - show text translation if BabelDOC failed
                            <div className="bg-white shadow rounded overflow-hidden">
                                {translationState?.status === 'loaded' ? renderTranslatedPage() : (
                                    <>
                                        {renderTranslatedPage()}
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

                        {/* Translated content */}
                        <div className="bg-white shadow-lg rounded overflow-hidden border-l-4 border-blue-500">
                            <div className="bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                                译文
                            </div>
                            {renderTranslatedPage()}
                        </div>
                    </div>
                ) : readingMode === 'translation' ? (
                    // Translation only
                    <div className="bg-white shadow-lg rounded overflow-hidden" style={{ width: pageWidth }}>
                        {renderTranslatedPage()}
                    </div>
                ) : (
                    // Original only - render all pages
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

            {/* Page navigation for non-original mode - INLINE, not fixed */}
            {readingMode !== 'original' && numPages > 0 && (
                <div className="flex items-center justify-center gap-4 py-4 mt-2">
                    <button
                        onClick={goToPrevPage}
                        disabled={currentPage <= 1}
                        className="p-3 rounded-full bg-white shadow hover:bg-gray-100 disabled:opacity-30 transition-colors"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>

                    <div className="flex items-center gap-2 bg-white rounded-full shadow px-4 py-2">
                        <input
                            type="number"
                            value={currentPage}
                            onChange={(e) => {
                                const page = parseInt(e.target.value);
                                if (page >= 1 && page <= numPages) {
                                    goToPage(page);
                                }
                            }}
                            className="w-12 text-center text-sm font-medium bg-transparent outline-none"
                            min={1}
                            max={numPages}
                        />
                        <span className="text-sm text-muted-foreground">/ {numPages}</span>
                    </div>

                    <button
                        onClick={goToNextPage}
                        disabled={currentPage >= numPages}
                        className="p-3 rounded-full bg-white shadow hover:bg-gray-100 disabled:opacity-30 transition-colors"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </div>
            )}

            {/* Spacer to prevent overlap with BottomControlBar */}
            <div className="h-20" />
        </div>
    );
}

export default PDFBilingualRenderer;
