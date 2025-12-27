/**
 * POST /api/translate/epub-bilingual/callback
 * 
 * Callback endpoint for Railway EPUB translation service
 * Updates book record when translation is completed
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/storage/database"

export const dynamic = 'force-dynamic'

// Handle CORS preflight
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    })
}

export async function POST(request: NextRequest) {
    try {
        const data = await request.json()

        const { bookId, status, progress, bilingualUrl, error } = data

        console.log(`[EPUB Callback] Received callback for book ${bookId}: ${status}`)

        if (!bookId) {
            return NextResponse.json({ error: "bookId is required" }, { status: 400 })
        }

        // Update book record based on status
        if (status === "completed" && bilingualUrl) {
            console.log(`[EPUB Callback] Translation completed, URL: ${bilingualUrl}`)

            // First check if book exists
            const existingBook = await db.getBook(bookId)
            console.log(`[EPUB Callback] Existing book:`, existingBook ? 'found' : 'NOT FOUND')

            if (!existingBook) {
                console.error(`[EPUB Callback] Book ${bookId} not found in database!`)
                return NextResponse.json({ error: "Book not found" }, { status: 404 })
            }

            const updatedBook = await db.updateBook(bookId, {
                bilingualEpubUrl: bilingualUrl,
                epubTranslationStatus: 'completed'
            })

            console.log(`[EPUB Callback] Update result:`, updatedBook ?
                `bilingualEpubUrl = ${updatedBook.bilingualEpubUrl}` :
                'FAILED')

            return NextResponse.json({
                success: true,
                message: "Book updated with bilingual URL",
                bilingualUrl: updatedBook?.bilingualEpubUrl
            })

        } else if (status === "failed") {
            console.log(`[EPUB Callback] Translation failed: ${error}`)
            await db.updateBook(bookId, {
                epubTranslationStatus: 'failed'
            })

            return NextResponse.json({
                success: true,
                message: "Book marked as failed"
            })

        } else if (status === "processing") {
            console.log(`[EPUB Callback] Translation in progress: ${progress}%`)
            await db.updateBook(bookId, {
                epubTranslationStatus: 'processing'
            })

            return NextResponse.json({
                success: true,
                message: "Progress updated"
            })
        }

        return NextResponse.json({
            success: true,
            message: "Callback received"
        })

    } catch (error) {
        console.error("[EPUB Callback] Error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Callback failed" },
            { status: 500 }
        )
    }
}
