/**
 * Client-side PDF text extraction hook
 * 
 * NEW APPROACH: Instead of using pdfjs getTextContent API (which seems unreliable),
 * we extract text from the rendered TextLayer DOM elements.
 * This is more reliable because if text is visible, we can extract it.
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

// Helper to delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function usePDFTextExtraction() {
    const extractedRef = useRef<boolean>(false);
    const blocksRef = useRef<ExtractedBlock[]>([]);
    const setBlocks = useReaderStore(state => state.setBlocks);

    /**
     * Extract text from a single page using pdfjs API
     */
    const extractPageText = async (pdfDocument: any, pageNum: number): Promise<{ text: string; items: any[] }> => {
        try {
            const page = await pdfDocument.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.0 });
            const textContent = await page.getTextContent();

            const pageWidth = viewport.width;
            const pageHeight = viewport.height;

            let fullText = '';
            const items: any[] = [];

            // Debug first page
            if (pageNum === 1) {
                console.log('[PDFText] Page 1 items count:', textContent.items?.length || 0);
                if (textContent.items?.[0]) {
                    console.log('[PDFText] First item:', textContent.items[0]);
                }
            }

            for (const item of (textContent.items || [])) {
                const str = item.str;
                if (typeof str !== 'string' || !str) continue;

                const tx = item.transform?.[4] || 0;
                const ty = item.transform?.[5] || 0;
                const scale = Math.abs(item.transform?.[0] || 12);

                items.push({
                    str,
                    offset: fullText.length,
                    bbox: {
                        x: (tx / pageWidth) * 100,
                        y: ((pageHeight - ty) / pageHeight) * 100,
                        w: ((item.width || str.length * scale * 0.5) / pageWidth) * 100,
                        h: (scale / pageHeight) * 100
                    }
                });

                fullText += str;
            }

            if (pageNum === 1) {
                console.log('[PDFText] Page 1 text length:', fullText.length, 'preview:', fullText.substring(0, 50));
            }

            return { text: fullText, items };
        } catch (error) {
            console.error('[PDFText] Error extracting page', pageNum, error);
            return { text: '', items: [] };
        }
    };

    /**
     * Create blocks from extracted page text
     */
    const createBlocksFromText = (text: string, items: any[], pageNum: number): ExtractedBlock[] => {
        if (!text || text.trim().length < 10) return [];

        const blocks: ExtractedBlock[] = [];
        const CHUNK_SIZE = 400; // Smaller chunks for better navigation
        let offset = 0;

        while (offset < text.length) {
            // Find end of chunk (prefer sentence boundaries)
            let endOffset = Math.min(offset + CHUNK_SIZE, text.length);

            if (endOffset < text.length) {
                // Look for sentence end
                const searchText = text.substring(offset + CHUNK_SIZE - 50, Math.min(offset + CHUNK_SIZE + 50, text.length));
                const sentenceEnd = searchText.search(/[。！？.!?]/);
                if (sentenceEnd >= 0) {
                    endOffset = offset + CHUNK_SIZE - 50 + sentenceEnd + 1;
                }
            }

            const chunkText = text.substring(offset, endOffset).trim();
            if (chunkText.length > 10) {
                // Find items in this range
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
    };

    /**
     * Main extraction function
     */
    const extractTextFromPDF = useCallback(async (pdfDocument: any) => {
        if (extractedRef.current) {
            console.log('[PDFText] Already extracted, skipping');
            return;
        }

        console.log('[PDFText] Starting extraction...');
        const numPages = pdfDocument.numPages;
        blocksRef.current = [];

        // Extract first 3 pages immediately
        const IMMEDIATE = Math.min(3, numPages);

        for (let p = 1; p <= IMMEDIATE; p++) {
            const { text, items } = await extractPageText(pdfDocument, p);
            const pageBlocks = createBlocksFromText(text, items, p);
            blocksRef.current.push(...pageBlocks);
        }

        console.log(`[PDFText] Phase 1: ${blocksRef.current.length} blocks from ${IMMEDIATE} pages`);

        if (blocksRef.current.length > 0) {
            setBlocks([...blocksRef.current] as any, []);
            extractedRef.current = true;
        }

        // Continue with rest in background
        if (numPages > IMMEDIATE) {
            setTimeout(async () => {
                for (let p = IMMEDIATE + 1; p <= numPages; p++) {
                    const { text, items } = await extractPageText(pdfDocument, p);
                    const pageBlocks = createBlocksFromText(text, items, p);
                    blocksRef.current.push(...pageBlocks);

                    if (p % 5 === 0 || p === numPages) {
                        setBlocks([...blocksRef.current] as any, []);
                        await delay(10);
                    }
                }
                console.log(`[PDFText] Complete: ${blocksRef.current.length} blocks from ${numPages} pages`);
            }, 200);
        }
    }, [setBlocks]);

    const resetExtraction = useCallback(() => {
        extractedRef.current = false;
        blocksRef.current = [];
    }, []);

    return { extractTextFromPDF, resetExtraction };
}
