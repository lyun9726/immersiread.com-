/**
 * POST /api/translate/pdf/reset
 * Force reset the translation status for a book
 */

import { NextRequest, NextResponse } from "next/server"
import { kvDB } from "@/lib/storage/kvDB"

export async function POST(request: NextRequest) {
    try {
        const { bookId } = await request.json()

        if (!bookId) {
            return NextResponse.json({ error: "bookId is required" }, { status: 400 })
        }

        const book = await kvDB.getBook(bookId)
        if (!book) {
            return NextResponse.json({ error: "Book not found" }, { status: 404 })
        }

        // Force reset translation status
        await kvDB.updateBook(bookId, {
            translationStatus: "idle",
            translationProgress: 0,
            translationError: undefined,
            translatedFileUrl: undefined,
            translationRequestedAt: undefined,
        })

        console.log(`[PDF Translate] Force reset translation status for book: ${bookId}`)

        return NextResponse.json({
            success: true,
            message: "Translation status reset successfully",
            previousStatus: book.translationStatus
        })

    } catch (error) {
        console.error("[PDF Translate] Reset error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
