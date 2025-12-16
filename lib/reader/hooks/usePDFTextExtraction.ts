/**
 * Client-side PDF text extraction hook
 * Extracts text blocks with bounding boxes directly from the rendered PDF
 * This bypasses server-side parsing issues on Vercel
 */

import { useCallback, useRef } from 'react';
import { pdfjs } from 'react-pdf';
import { useReaderStore } from '@/lib/reader/stores/readerStore';

interface PDFTextItem {
    str: string;
    transform: number[];
    width: number;
    height: number;
    dir?: string;
}

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
        let blockId = 0;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            try {
                const page = await pdfDocument.getPage(pageNum);
                const viewport = page.getViewport({ scale: 1.0 });
                const textContent = await page.getTextContent();

                // Group text items into blocks (paragraphs)
                const pageBlocks = groupTextItemsToBlocks(
                    textContent.items as PDFTextItem[],
                    viewport,
                    pageNum,
                    blockId
                );

                allBlocks.push(...pageBlocks);
                blockId += pageBlocks.length;
            } catch (error) {
                console.error(`[PDFTextExtraction] Error extracting page ${pageNum}:`, error);
            }
        }

        console.log(`[PDFTextExtraction] Extracted ${allBlocks.length} blocks from ${numPages} pages`);

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

/**
 * Group text items into logical blocks (paragraphs)
 */
function groupTextItemsToBlocks(
    items: PDFTextItem[],
    viewport: any,
    pageNum: number,
    startBlockId: number
): ExtractedBlock[] {
    if (!items || items.length === 0) return [];

    const blocks: ExtractedBlock[] = [];
    let currentBlock: {
        text: string;
        items: Array<{ str: string; offset: number; bbox: any }>;
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
        lastY: number;
        lastFontSize: number;
    } | null = null;

    const pageWidth = viewport.width;
    const pageHeight = viewport.height;

    for (const item of items) {
        if (!item.str.trim()) continue;

        // PDF coordinates: origin at bottom-left, need to flip Y
        const x = item.transform[4];
        const y = item.transform[5];
        const fontSize = Math.sqrt(item.transform[0] ** 2 + item.transform[1] ** 2);
        const textWidth = item.width;
        const textHeight = fontSize;

        // Convert to percentages (flip Y axis)
        const pctX = (x / pageWidth) * 100;
        const pctY = ((pageHeight - y - textHeight) / pageHeight) * 100;
        const pctW = (textWidth / pageWidth) * 100;
        const pctH = (textHeight / pageHeight) * 100;

        // Decide if this item belongs to current block or starts a new one
        // New block if: large Y gap, or different font size
        const shouldStartNewBlock = !currentBlock ||
            Math.abs(y - currentBlock.lastY) > fontSize * 2 ||
            Math.abs(fontSize - currentBlock.lastFontSize) > 2;

        if (shouldStartNewBlock) {
            // Save previous block
            if (currentBlock && currentBlock.text.trim().length > 10) {
                blocks.push(createBlock(currentBlock, pageNum, startBlockId + blocks.length));
            }

            // Start new block
            currentBlock = {
                text: item.str,
                items: [{
                    str: item.str,
                    offset: 0,
                    bbox: { x: pctX, y: pctY, w: pctW, h: pctH }
                }],
                minX: pctX,
                minY: pctY,
                maxX: pctX + pctW,
                maxY: pctY + pctH,
                lastY: y,
                lastFontSize: fontSize,
            };
        } else {
            // Add to current block
            const offset = currentBlock.text.length;
            currentBlock.text += item.str;
            currentBlock.items.push({
                str: item.str,
                offset,
                bbox: { x: pctX, y: pctY, w: pctW, h: pctH }
            });

            // Update bounding box
            if (pctX < currentBlock.minX) currentBlock.minX = pctX;
            if (pctY < currentBlock.minY) currentBlock.minY = pctY;
            if (pctX + pctW > currentBlock.maxX) currentBlock.maxX = pctX + pctW;
            if (pctY + pctH > currentBlock.maxY) currentBlock.maxY = pctY + pctH;
            currentBlock.lastY = y;
        }
    }

    // Don't forget the last block
    if (currentBlock && currentBlock.text.trim().length > 10) {
        blocks.push(createBlock(currentBlock, pageNum, startBlockId + blocks.length));
    }

    return blocks;
}

function createBlock(
    blockData: any,
    pageNum: number,
    blockId: number
): ExtractedBlock {
    return {
        id: `client-block-${blockId}`,
        original: blockData.text,
        type: 'text',
        meta: {
            pageNumber: pageNum,
            bbox: {
                x: blockData.minX,
                y: blockData.minY,
                w: blockData.maxX - blockData.minX,
                h: blockData.maxY - blockData.minY,
            }
        },
        pdfItems: blockData.items,
    };
}
