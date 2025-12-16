/**
 * Client-side PDF text extraction hook
 * 
 * DOM-BASED APPROACH: Extract text from react-pdf's rendered TextLayer spans
 * This is more reliable than getTextContent() which returns empty for some PDFs
 */

import { useCallback, useRef } from 'react';
import { useReaderStore } from '@/lib/reader/stores/readerStore';

interface ExtractedBlock {
    id: string;
    original: string;
    type: 'text';
    meta: {
        pageNumber: number;
        bbox: { x: number; y: number; w: number; h: number };
    };
    pdfItems: Array<{
        str: string;
        offset: number;
        bbox: { x: number; y: number; w: number; h: number };
    }>;
}

export function usePDFTextExtraction() {
    const extractedRef = useRef<boolean>(false);
    const blocksRef = useRef<ExtractedBlock[]>([]);
    const setBlocks = useReaderStore(state => state.setBlocks);

    /**
     * Extract text from DOM TextLayer of a specific page
     */
    const extractTextFromDOM = useCallback((pageNumber: number): { text: string; items: any[] } => {
        const pageElement = document.getElementById(`pdf-page-${pageNumber}`);
        if (!pageElement) {
            console.log(`[PDFText] Page ${pageNumber} element not found`);
            return { text: '', items: [] };
        }

        // Find the TextLayer within the page
        const textLayer = pageElement.querySelector('.react-pdf__Page__textContent');
        if (!textLayer) {
            console.log(`[PDFText] TextLayer not found on page ${pageNumber}`);
            return { text: '', items: [] };
        }

        const pageRect = pageElement.getBoundingClientRect();
        const spans = textLayer.querySelectorAll('span');

        let fullText = '';
        const items: any[] = [];

        spans.forEach((span, index) => {
            const text = span.textContent || '';
            if (!text.trim()) return;

            const rect = span.getBoundingClientRect();

            // Calculate position as percentage of page
            const x = ((rect.left - pageRect.left) / pageRect.width) * 100;
            const y = ((rect.top - pageRect.top) / pageRect.height) * 100;
            const w = (rect.width / pageRect.width) * 100;
            const h = (rect.height / pageRect.height) * 100;

            items.push({
                str: text,
                offset: fullText.length,
                bbox: { x, y, w, h }
            });

            fullText += text;
        });

        if (pageNumber === 1) {
            console.log(`[PDFText] Page 1 DOM extraction: ${spans.length} spans, text length: ${fullText.length}`);
            console.log(`[PDFText] Preview: "${fullText.substring(0, 100)}"`);
        }

        return { text: fullText, items };
    }, []);

    /**
     * Create blocks from extracted text
     */
    const createBlocksFromText = useCallback((text: string, items: any[], pageNum: number): ExtractedBlock[] => {
        if (!text || text.trim().length < 5) return [];

        const blocks: ExtractedBlock[] = [];
        const CHUNK_SIZE = 300; // Smaller chunks for better navigation
        let offset = 0;

        while (offset < text.length) {
            let endOffset = Math.min(offset + CHUNK_SIZE, text.length);

            // Find sentence boundary
            if (endOffset < text.length) {
                const searchText = text.substring(offset + Math.max(0, CHUNK_SIZE - 50), Math.min(offset + CHUNK_SIZE + 50, text.length));
                const sentenceEnd = searchText.search(/[。！？.!?\n]/);
                if (sentenceEnd >= 0) {
                    endOffset = offset + Math.max(0, CHUNK_SIZE - 50) + sentenceEnd + 1;
                }
            }

            const chunkText = text.substring(offset, endOffset).trim();
            if (chunkText.length >= 5) {
                // Get items for this chunk
                const chunkItems = items.filter(item =>
                    item.offset >= offset && item.offset < endOffset
                ).map(item => ({
                    ...item,
                    offset: item.offset - offset
                }));

                // Calculate bbox
                let minX = 100, maxX = 0, minY = 100, maxY = 0;
                for (const item of chunkItems) {
                    if (item.bbox.x < minX) minX = item.bbox.x;
                    if (item.bbox.y < minY) minY = item.bbox.y;
                    if (item.bbox.x + item.bbox.w > maxX) maxX = item.bbox.x + item.bbox.w;
                    if (item.bbox.y + item.bbox.h > maxY) maxY = item.bbox.y + item.bbox.h;
                }

                blocks.push({
                    id: `block-${blocksRef.current.length + blocks.length}`,
                    original: chunkText,
                    type: 'text',
                    meta: {
                        pageNumber: pageNum,
                        bbox: {
                            x: minX > 0 && minX < 100 ? minX : 5,
                            y: minY > 0 && minY < 100 ? minY : 5,
                            w: maxX - minX > 0 ? maxX - minX : 90,
                            h: maxY - minY > 0 ? maxY - minY : 10
                        }
                    },
                    pdfItems: chunkItems.length > 0 ? chunkItems : [{
                        str: chunkText,
                        offset: 0,
                        bbox: { x: 5, y: 5, w: 90, h: 10 }
                    }]
                });
            }

            offset = endOffset;
        }

        return blocks;
    }, []);

    /**
     * Extract text from visible pages after they render
     * Call this after PDF pages are rendered
     */
    const extractFromRenderedPages = useCallback((totalPages: number) => {
        if (extractedRef.current) {
            console.log('[PDFText] Already extracted');
            return;
        }

        console.log(`[PDFText] Starting DOM-based extraction for ${totalPages} pages...`);
        blocksRef.current = [];

        let attempts = 0;
        const MAX_ATTEMPTS = 20; // Max 20 attempts = 10 seconds
        const POLL_INTERVAL = 500; // Poll every 500ms

        const tryExtraction = () => {
            attempts++;
            console.log(`[PDFText] Extraction attempt ${attempts}...`);

            // Check if any of first 3 pages have TextLayer with spans
            let foundTextLayer = false;
            for (let p = 1; p <= Math.min(3, totalPages); p++) {
                const pageEl = document.getElementById(`pdf-page-${p}`);
                if (pageEl) {
                    const textLayer = pageEl.querySelector('.react-pdf__Page__textContent');
                    if (textLayer) {
                        const spans = textLayer.querySelectorAll('span');
                        if (spans.length > 0) {
                            console.log(`[PDFText] Found ${spans.length} spans on page ${p}`);
                            foundTextLayer = true;
                            break;
                        }
                    }
                }
            }

            if (!foundTextLayer && attempts < MAX_ATTEMPTS) {
                console.log('[PDFText] TextLayer not ready, retrying...');
                setTimeout(tryExtraction, POLL_INTERVAL);
                return;
            }

            if (!foundTextLayer) {
                console.log('[PDFText] TextLayer never appeared after max attempts');
                return;
            }

            // Now extract from pages that have TextLayer
            let extractedPages = 0;
            for (let p = 1; p <= Math.min(10, totalPages); p++) {
                const { text, items } = extractTextFromDOM(p);
                if (text.length > 0) {
                    const pageBlocks = createBlocksFromText(text, items, p);
                    blocksRef.current.push(...pageBlocks);
                    extractedPages++;
                }
            }

            console.log(`[PDFText] Extracted ${blocksRef.current.length} blocks from ${extractedPages} pages`);

            // Debug: show first block structure
            if (blocksRef.current.length > 0) {
                const firstBlock = blocksRef.current[0];
                console.log('[PDFText] First block:', {
                    id: firstBlock.id,
                    textLength: firstBlock.original?.length,
                    pageNumber: firstBlock.meta?.pageNumber,
                    bbox: firstBlock.meta?.bbox,
                    pdfItemsCount: firstBlock.pdfItems?.length,
                    firstItem: firstBlock.pdfItems?.[0]
                });
            }

            if (blocksRef.current.length > 0) {
                setBlocks([...blocksRef.current] as any, []);
                extractedRef.current = true;
            }
        };

        // Start polling after initial delay
        setTimeout(tryExtraction, 1000);
    }, [extractTextFromDOM, createBlocksFromText, setBlocks]);

    /**
     * Legacy: Extract using pdfjs API (fallback)
     */
    const extractTextFromPDF = useCallback(async (pdfDocument: any) => {
        console.log('[PDFText] Using pdfjs extraction (legacy)...');

        // Try pdfjs first
        try {
            const page = await pdfDocument.getPage(1);
            const textContent = await page.getTextContent();

            console.log('[PDFText] pdfjs items count:', textContent?.items?.length || 0);

            if (textContent?.items?.length > 0) {
                // pdfjs works, use it
                // ... existing pdfjs extraction logic ...
            }
        } catch (e) {
            console.log('[PDFText] pdfjs failed, will use DOM extraction');
        }

        // Fall back to DOM extraction
        extractFromRenderedPages(pdfDocument.numPages);
    }, [extractFromRenderedPages]);

    const resetExtraction = useCallback(() => {
        extractedRef.current = false;
        blocksRef.current = [];
    }, []);

    return {
        extractTextFromPDF,
        extractFromRenderedPages,
        resetExtraction
    };
}
