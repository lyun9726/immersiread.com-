/**
 * Client-side PDF text extraction hook
 * Extracts text blocks with bounding boxes directly from the rendered PDF
 * This bypasses server-side parsing issues on Vercel
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
    const setBlocks = useReaderStore(state => state.setBlocks);

    /**
     * Extract text from all pages of a PDF document
     */
    const extractTextFromPDF = useCallback(async (pdfDocument: any) => {
        // Only extract once per document
        if (extractedRef.current) {
            console.log('[PDFTextExtraction] Already extracted, skipping');
            return;
        }

        console.log('[PDFTextExtraction] Starting client-side text extraction...');
        const numPages = pdfDocument.numPages;
        const allBlocks: ExtractedBlock[] = [];

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            try {
                const page = await pdfDocument.getPage(pageNum);
                const viewport = page.getViewport({ scale: 1.0 });
                const textContent = await page.getTextContent();

                const pageWidth = viewport.width;
                const pageHeight = viewport.height;

                // Debug: log first item structure
                if (pageNum === 1 && textContent.items.length > 0) {
                    console.log('[PDFTextExtraction] First item structure:', textContent.items[0]);
                    console.log('[PDFTextExtraction] Total items on page 1:', textContent.items.length);
                }

                // Collect all text items with their coordinates
                const pageItems: Array<{ str: string; offset: number; bbox: any }> = [];
                let fullText = '';
                let minX = 100, maxX = 0, minY = 100, maxY = 0;

                for (const item of textContent.items) {
                    // TextItem has 'str' property for the text
                    const text = item.str || '';
                    if (!text) continue;

                    // Get position from transform matrix [scaleX, skewY, skewX, scaleY, translateX, translateY]
                    const tx = item.transform?.[4] || 0;
                    const ty = item.transform?.[5] || 0;
                    const scaleX = Math.abs(item.transform?.[0] || 12);

                    // Convert to percentages (PDF origin is bottom-left, we flip Y)
                    const pctX = (tx / pageWidth) * 100;
                    const pctY = ((pageHeight - ty) / pageHeight) * 100;
                    const pctW = ((item.width || text.length * scaleX * 0.5) / pageWidth) * 100;
                    const pctH = (scaleX / pageHeight) * 100;

                    // Update bounds
                    if (pctX < minX) minX = pctX;
                    if (pctY < minY) minY = pctY;
                    if (pctX + pctW > maxX) maxX = pctX + pctW;
                    if (pctY + pctH > maxY) maxY = pctY + pctH;

                    // Add item
                    pageItems.push({
                        str: text,
                        offset: fullText.length,
                        bbox: { x: pctX, y: pctY, w: pctW, h: pctH }
                    });

                    fullText += text;
                }

                // Create one block per paragraph (split by double newlines or large gaps)
                // For now, simple approach: split text into chunks of ~500 chars
                if (fullText.trim().length > 0) {
                    const CHUNK_SIZE = 500;
                    let offset = 0;

                    while (offset < fullText.length) {
                        // Find a good break point (sentence end)
                        let endOffset = Math.min(offset + CHUNK_SIZE, fullText.length);
                        if (endOffset < fullText.length) {
                            // Look for sentence end
                            const searchEnd = Math.min(offset + CHUNK_SIZE + 100, fullText.length);
                            const afterChunk = fullText.substring(offset + CHUNK_SIZE, searchEnd);
                            const sentenceEnd = afterChunk.search(/[。！？.!?]/);
                            if (sentenceEnd > 0 && sentenceEnd < 100) {
                                endOffset = offset + CHUNK_SIZE + sentenceEnd + 1;
                            }
                        }

                        const chunkText = fullText.substring(offset, endOffset);
                        if (chunkText.trim().length > 10) {
                            // Find pdfItems that belong to this chunk
                            const chunkItems = pageItems.filter(item =>
                                item.offset >= offset && item.offset < endOffset
                            );

                            // Calculate bbox for this chunk
                            let chunkMinX = 100, chunkMaxX = 0, chunkMinY = 100, chunkMaxY = 0;
                            for (const item of chunkItems) {
                                if (item.bbox.x < chunkMinX) chunkMinX = item.bbox.x;
                                if (item.bbox.y < chunkMinY) chunkMinY = item.bbox.y;
                                if (item.bbox.x + item.bbox.w > chunkMaxX) chunkMaxX = item.bbox.x + item.bbox.w;
                                if (item.bbox.y + item.bbox.h > chunkMaxY) chunkMaxY = item.bbox.y + item.bbox.h;
                            }

                            // Adjust pdfItems offsets to be relative to chunk start
                            const adjustedItems = chunkItems.map(item => ({
                                ...item,
                                offset: item.offset - offset
                            }));

                            allBlocks.push({
                                id: `client-block-${allBlocks.length}`,
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
            } catch (error) {
                console.error(`[PDFTextExtraction] Error extracting page ${pageNum}:`, error);
            }
        }

        // Log extraction results
        console.log(`[PDFTextExtraction] Extracted ${allBlocks.length} blocks from ${numPages} pages`);
        if (allBlocks.length > 0) {
            console.log('[PDFTextExtraction] First block text preview:', allBlocks[0].original.substring(0, 100));
        }

        // Update store with extracted blocks
        if (allBlocks.length > 0) {
            setBlocks(allBlocks as any, []);
            extractedRef.current = true;
        }
    }, [setBlocks]);

    /**
     * Reset extraction state (when loading a new PDF)
     */
    const resetExtraction = useCallback(() => {
        extractedRef.current = false;
    }, []);

    return { extractTextFromPDF, resetExtraction };
}

