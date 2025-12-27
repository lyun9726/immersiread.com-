/**
 * GET /api/translate/epub-bilingual/status/[bookId]
 * 
 * Check translation status for a book
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/storage/database"

export const dynamic = 'force-dynamic'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ bookId: string }> }
) {
    try {
        const { bookId } = await params

        if (!bookId) {
            return NextResponse.json({ error: "bookId is required" }, { status: 400 })
        }

        const book = await db.getBook(bookId)
        if (!book) {
            return NextResponse.json({ error: "Book not found" }, { status: 404 })
        }

        return NextResponse.json({
            bookId,
            status: book.epubTranslationStatus || 'none',
            bilingualUrl: book.bilingualEpubUrl || null,
            hasTranslation: !!book.bilingualEpubUrl
        })

    } catch (error) {
        console.error("[EPUB Status] Error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        )
    }
}
