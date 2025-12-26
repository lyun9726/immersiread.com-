/**
 * POST /api/translate/epub-bilingual/reset
 * 
 * Reset the bilingual EPUB translation status for a book
 * This clears the bilingualEpubUrl so the book can be re-translated
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/storage/database"

export async function POST(request: NextRequest) {
    try {
        const { bookId } = await request.json()

        if (!bookId) {
            return NextResponse.json({ error: "bookId is required" }, { status: 400 })
        }

        console.log(`[EPUB Bilingual Reset] Resetting translation for book: ${bookId}`)

        // Clear bilingual EPUB data
        await db.updateBook(bookId, {
            bilingualEpubUrl: undefined,
            epubTranslationStatus: 'idle'
        })

        return NextResponse.json({
            success: true,
            message: "Bilingual EPUB reset successfully. You can now re-translate the book."
        })

    } catch (error) {
        console.error("[EPUB Bilingual Reset] Error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to reset" },
            { status: 500 }
        )
    }
}
