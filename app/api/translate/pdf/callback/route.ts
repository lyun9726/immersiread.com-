/**
 * POST /api/translate/pdf/callback
 * Callback endpoint for PDFMathTranslate service to report completion
 * 
 * Request body: { bookId: string, status: "completed" | "failed", translatedFileUrl?: string, error?: string }
 */

import { NextRequest, NextResponse } from "next/server"
import { kvDB } from "@/lib/storage/kvDB"

export async function POST(request: NextRequest) {
    try {
        const { bookId, status, translatedFileUrl, error, progress } = await request.json()

        if (!bookId) {
            return NextResponse.json({ error: "bookId is required" }, { status: 400 })
        }

        console.log(`[PDF Translate Callback] Received for book: ${bookId}, status: ${status}`)

        // Get book from database
        const book = await kvDB.getBook(bookId)
        if (!book) {
            return NextResponse.json({ error: "Book not found" }, { status: 404 })
        }

        // Update book based on status
        if (status === "completed" && translatedFileUrl) {
            await kvDB.updateBook(bookId, {
                translationStatus: "completed",
                translatedFileUrl,
                translationProgress: 100,
                translationCompletedAt: new Date(),
                translationError: undefined,
            })
            console.log(`[PDF Translate Callback] Translation completed for book: ${bookId}`)
        } else if (status === "failed") {
            await kvDB.updateBook(bookId, {
                translationStatus: "failed",
                translationError: error || "Unknown error",
            })
            console.log(`[PDF Translate Callback] Translation failed for book: ${bookId}: ${error}`)
        } else if (status === "processing" && typeof progress === "number") {
            await kvDB.updateBook(bookId, {
                translationStatus: "processing",
                translationProgress: progress,
            })
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error("[PDF Translate Callback] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
