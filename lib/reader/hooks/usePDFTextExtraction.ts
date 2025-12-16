/**
 * Client-side PDF text extraction hook
 * Extracts text blocks with bounding boxes directly from the rendered PDF
 * This bypasses server-side parsing issues on Vercel
 * 
 * PERFORMANCE: Uses progressive extraction - first 3 pages immediately,
 * rest in background batches to prevent UI blocking
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

// Helper to delay between pages
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function usePDFTextExtraction() {
    const extractedRef = useRef<boolean>(false);
    const blocksRef = useRef<ExtractedBlock[]>([]);
    const setBlocks = useReaderStore(state => state.setBlocks);

    /**
     * Extract text from a single page
     */
    const extractPage = async (pdfDocument: any, pageNum: number): Promise<ExtractedBlock[]> => {
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent();

        const pageWidth = viewport.width;
        const pageHeight = viewport.height;
        const pageBlocks: ExtractedBlock[] = [];

        // Collect all text items with their coordinates
        const pageItems: Array<{ str: string; offset: number; bbox: any }> = [];
        let fullText = '';

        for (const item of textContent.items) {
            const text = item.str || '';
            if (!text) continue;

            const tx = item.transform?.[4] || 0;
            const ty = item.transform?.[5] || 0;
            const scaleX = Math.abs(item.transform?.[0] || 12);

            const pctX = (tx / pageWidth) * 100;
            const pctY = ((pageHeight - ty) / pageHeight) * 100;
            const pctW = ((item.width || text.length * scaleX * 0.5) / pageWidth) * 100;
            const pctH = (scaleX / pageHeight) * 100;

            pageItems.push({
                str: text,
                offset: fullText.length,
                bbox: { x: pctX, y: pctY, w: pctW, h: pctH }
            });

            fullText += text;
        }

        // Split into chunks of ~500 chars
        if (fullText.trim().length > 0) {
            const CHUNK_SIZE = 500;
            let offset = 0;

            while (offset < fullText.length) {
                let endOffset = Math.min(offset + CHUNK_SIZE, fullText.length);
                if (endOffset < fullText.length) {
                    const searchEnd = Math.min(offset + CHUNK_SIZE + 100, fullText.length);
                    const afterChunk = fullText.substring(offset + CHUNK_SIZE, searchEnd);
                    const sentenceEnd = afterChunk.search(/[。！？.!?]/);
                    if (sentenceEnd > 0 && sentenceEnd < 100) {
                        endOffset = offset + CHUNK_SIZE + sentenceEnd + 1;
                    }
                }

                const chunkText = fullText.substring(offset, endOffset);
                if (chunkText.trim().length > 10) {
                    const chunkItems = pageItems.filter(item =>
                        item.offset >= offset && item.offset < endOffset
                    );

                    let chunkMinX = 100, chunkMaxX = 0, chunkMinY = 100, chunkMaxY = 0;
                    for (const item of chunkItems) {
                        if (item.bbox.x < chunkMinX) chunkMinX = item.bbox.x;
                        if (item.bbox.y < chunkMinY) chunkMinY = item.bbox.y;
                        if (item.bbox.x + item.bbox.w > chunkMaxX) chunkMaxX = item.bbox.x + item.bbox.w;
                        if (item.bbox.y + item.bbox.h > chunkMaxY) chunkMaxY = item.bbox.y + item.bbox.h;
                    }

                    const adjustedItems = chunkItems.map(item => ({
                        ...item,
                        offset: item.offset - offset
                    }));

                    pageBlocks.push({
                        id: `client-block-${blocksRef.current.length + pageBlocks.length}`,
                        original: chunkText,
                        type: 'text',
                        meta: {
                            pageNumber: pageNum,
                            bbox: {
                                x: chunkMinX > 0 ? chunkMinX : 5,
                                y: chunkMinY > 0 ? chunkMinY : 5,
                                w: chunkMaxX - chunkMinX > 0 ? chunkMaxX - chunkMinX : 90,
                                h: chunkMaxY - chunkMinY > 0 ? chunkMaxY - chunkMinY : 10
                            }
                        },
                        pdfItems: adjustedItems
                    });
                }

                offset = endOffset;
            }
        }

        return pageBlocks;
    };

    /**
     * Extract text progressively - first pages immediately, rest in background
     */
    const extractTextFromPDF = useCallback(async (pdfDocument: any) => {
        if (extractedRef.current) {
            console.log('[PDFTextExtraction] Already extracted, skipping');
            return;
        }

        console.log('[PDFTextExtraction] Starting progressive text extraction...');
        const numPages = pdfDocument.numPages;
        blocksRef.current = [];

        // PHASE 1: Extract first 3 pages immediately for quick start
        const IMMEDIATE_PAGES = Math.min(3, numPages);
        console.log(`[PDFTextExtraction] Phase 1: Extracting first ${IMMEDIATE_PAGES} pages immediately`);

        for (let pageNum = 1; pageNum <= IMMEDIATE_PAGES; pageNum++) {
            try {
                const pageBlocks = await extractPage(pdfDocument, pageNum);
                blocksRef.current.push(...pageBlocks);
            } catch (error) {
                console.error(`[PDFTextExtraction] Error on page ${pageNum}:`, error);
            }
        }

        // Update store with immediate blocks
        if (blocksRef.current.length > 0) {
            console.log(`[PDFTextExtraction] Phase 1 complete: ${blocksRef.current.length} blocks ready`);
            console.log('[PDFTextExtraction] First block preview:', blocksRef.current[0].original.substring(0, 80));
            setBlocks([...blocksRef.current] as any, []);
            extractedRef.current = true;
        }

        // PHASE 2: Extract remaining pages in background batches
        if (numPages > IMMEDIATE_PAGES) {
            console.log(`[PDFTextExtraction] Phase 2: Extracting pages ${IMMEDIATE_PAGES + 1}-${numPages} in background`);

            // Use setTimeout to not block
            setTimeout(async () => {
                const BATCH_SIZE = 5;

                for (let pageNum = IMMEDIATE_PAGES + 1; pageNum <= numPages; pageNum++) {
                    try {
                        const pageBlocks = await extractPage(pdfDocument, pageNum);
                        blocksRef.current.push(...pageBlocks);

                        // Update store every batch
                        if (pageNum % BATCH_SIZE === 0 || pageNum === numPages) {
                            setBlocks([...blocksRef.current] as any, []);
                            // Small delay to let UI breathe
                            await delay(10);
                        }
                    } catch (error) {
                        console.error(`[PDFTextExtraction] Error on page ${pageNum}:`, error);
                    }
                }

                console.log(`[PDFTextExtraction] Complete: ${blocksRef.current.length} total blocks from ${numPages} pages`);
            }, 100);
        }
    }, [setBlocks]);

    const resetExtraction = useCallback(() => {
        extractedRef.current = false;
        blocksRef.current = [];
    }, []);

    return { extractTextFromPDF, resetExtraction };

