
import { strict as assert } from 'node:assert';
import fs from 'fs';

async function testPDF() {
    console.log("Testing pdfjs-dist with text...");
    try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        console.log("pdfjs-dist loaded.");

        // Create a simple PDF with text using pdf-lib or just load a known buffer if possible?
        // Since we can't easily generate a valid PDF with text binary by hand, 
        // we will mock the "getTextContent" output to test the heuristics function.

        console.log("Testing Heuristics Logic...");

        const mockViewport = { width: 600, height: 800 };
        // Mock items from pdfjs
        // PDF Coords: (0,0) bottom-left.
        // Text at top: y=750.
        const mockItems = [
            { str: "Hello", transform: [10, 0, 0, 10, 50, 750], width: 30, height: 10 },
            { str: "World", transform: [10, 0, 0, 10, 90, 750], width: 30, height: 10 }, // Same line
            { str: "This", transform: [10, 0, 0, 10, 50, 700], width: 20, height: 10 }, // New line (gap 50)
            { str: "is", transform: [10, 0, 0, 10, 80, 700], width: 10, height: 10 },
            { str: "a", transform: [10, 0, 0, 10, 100, 700], width: 5, height: 10 },
            { str: "paragraph.", transform: [10, 0, 0, 10, 110, 700], width: 50, height: 10 },
        ];

        const blocks = groupTextItemsToBlocks(mockItems, mockViewport, 1);
        console.log("Extracted Blocks:", JSON.stringify(blocks, null, 2));

        if (blocks.length === 2) {
            console.log("SUCCESS: Extracted 2 blocks as expected (Hello World, This is a paragraph.)");
        } else {
            console.error("FAILURE: Heuristics failed to group correctly.");
        }

    } catch (e) {
        console.error("Test failed:", e);
    }
}

// Copied from DocumentParser.ts
function groupTextItemsToBlocks(items, viewport, pageNumber) {
    const validItems = items.filter(item => item.str.trim().length > 0)

    if (validItems.length === 0) return []

    const getRect = (item) => {
        const x = item.transform[4]
        const y = item.transform[5]
        const h = item.height || item.transform[3] || 10
        const w = item.width
        return { x, y, w, h }
    }

    validItems.sort((a, b) => {
        const rectA = getRect(a)
        const rectB = getRect(b)
        const yDiff = rectB.y - rectA.y
        if (Math.abs(yDiff) > 5) return yDiff
        return rectA.x - rectB.x
    })

    const groupedBlocks = []

    let currentBlockItems = []
    let lastItemRect = null

    for (const item of validItems) {
        const rect = getRect(item)

        if (!lastItemRect) {
            currentBlockItems.push(item)
        } else {
            const verticalGap = lastItemRect.y - rect.y
            const lineHeight = lastItemRect.h || 10

            // Threshold check
            if (verticalGap > lineHeight * 2.5) {
                finalizeBlock(groupedBlocks, currentBlockItems, viewport)
                currentBlockItems = [item]
            } else {
                currentBlockItems.push(item)
            }
        }
        lastItemRect = rect
    }

    if (currentBlockItems.length > 0) {
        finalizeBlock(groupedBlocks, currentBlockItems, viewport)
    }

    return groupedBlocks
}

function finalizeBlock(blocks, items, viewport) {
    if (items.length === 0) return

    const text = items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim()

    // Checking length filter
    // if (text.length < 5) return 

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const item of items) {
        const x = item.transform[4]
        const y = item.transform[5]
        const w = item.width
        const h = item.height || item.transform[3] || 10

        if (x < minX) minX = x
        if (x + w > maxX) maxX = x + w
        if (y < minY) minY = y
        if (y + h > maxY) maxY = y + h
    }

    const vW = viewport.width
    const vH = viewport.height

    const cssX = (minX / vW) * 100
    const cssY = ((vH - maxY) / vH) * 100
    const cssW = ((maxX - minX) / vW) * 100
    const cssH = ((maxY - minY) / vH) * 100

    blocks.push({
        text,
        bbox: {
            x: Math.max(0, cssX),
            y: Math.max(0, cssY),
            w: Math.min(100, cssW),
            h: Math.min(100, cssH)
        }
    })
}

testPDF();
