/**
 * POST /api/translate/epub
 * Translate EPUB book blocks using DeepSeek API
 * 
 * This endpoint:
 * 1. Gets the book's blocks from database
 * 2. Translates them using translateBatch (DeepSeek)
 * 3. Saves translations back to database
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/storage/database"
import { translateBatch } from "@/lib/translate/translateBatch"

export const dynamic = 'force-dynamic'
// Increase timeout for translation (can be long for large books)
export const maxDuration = 300

export async function POST(request: NextRequest) {
    try {
        const { bookId } = await request.json()

        if (!bookId) {
            return NextResponse.json({ error: "bookId is required" }, { status: 400 })
        }

        console.log(`[EPUB Translate] Starting translation for book: ${bookId}`)

        // 1. Get book from database
        const book = await db.getBook(bookId)
        if (!book) {
            return NextResponse.json({ error: "Book not found" }, { status: 404 })
        }

        // 2. Get blocks from database
        const blocks = await db.getBlocks(bookId)
        if (!blocks || blocks.length === 0) {
            return NextResponse.json({ error: "No blocks found. Please parse the book first." }, { status: 400 })
        }

        console.log(`[EPUB Translate] Found ${blocks.length} blocks to translate`)

        // 3. Check if already translated
        const alreadyTranslated = blocks.filter(b => b.translation && b.translation.length > 0)
        if (alreadyTranslated.length === blocks.length) {
            console.log(`[EPUB Translate] Book already fully translated`)
            return NextResponse.json({
                success: true,
                message: "Book already translated",
                translatedCount: alreadyTranslated.length
            })
        }

        // 4. Prepare blocks for translation (only non-translated ones)
        const blocksToTranslate = blocks.filter(b => !b.translation || b.translation.length === 0)
        console.log(`[EPUB Translate] Translating ${blocksToTranslate.length} blocks (${alreadyTranslated.length} already done)`)

        // 5. Convert blocks to translation input format
        const inputItems = blocksToTranslate.map(block => ({
            id: block.id,
            text: typeof block.content === 'string' ? block.content : (block.original || ''),
            lang: 'en' // Assume English source, translate to Chinese
        }))

        // 6. Call translation API
        console.log(`[EPUB Translate] Calling translateBatch...`)
        const translatedItems = await translateBatch(inputItems, {
            batchSize: 20,
            concurrency: 2,
            retries: 3
        })

        console.log(`[EPUB Translate] Translation complete. Got ${translatedItems.length} results`)

        // 7. Merge translations back into blocks
        const translationMap = new Map(translatedItems.map(item => [item.id, item.translation]))

        const updatedBlocks = blocks.map(block => {
            const translation = translationMap.get(block.id)
            if (translation) {
                return {
                    ...block,
                    original: typeof block.content === 'string' ? block.content : (block.original || ''),
                    translation
                }
            }
            return block
        })

        // 8. Save updated blocks to database
        await db.setBlocks(bookId, updatedBlocks)
        console.log(`[EPUB Translate] Saved ${updatedBlocks.length} blocks to database`)

        // 9. Update book metadata to indicate translation is complete
        await db.updateBook(bookId, {
            epubTranslationStatus: 'completed'
        })

        return NextResponse.json({
            success: true,
            translatedCount: translatedItems.length,
            totalBlocks: blocks.length
        })

    } catch (error) {
        console.error("[EPUB Translate] Error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Translation failed" },
            { status: 500 }
        )
    }
}
