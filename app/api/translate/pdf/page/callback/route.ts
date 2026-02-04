/**
 * POST /api/translate/pdf/page/callback
 * Callback endpoint for BabelDOC service to report page translation completion
 */

import { NextRequest, NextResponse } from "next/server"
import { kvDB } from "@/lib/storage/kvDB"

export async function POST(request: NextRequest) {
    try {
        const data = await request.json()
        const { bookId, pageNumber, status, translatedUrl, translatedFileUrl, error, progress } = data

        console.log(`[PDF Page Callback] Received: bookId=${bookId}, page=${pageNumber}, status=${status}`)

        if (!bookId) {
            return NextResponse.json({ error: "bookId is required" }, { status: 400 })
        }

        // Get the book
        const book = await kvDB.getBook(bookId)
        if (!book) {
            console.log(`[PDF Page Callback] Book not found: ${bookId}`)
            return NextResponse.json({ error: "Book not found" }, { status: 404 })
        }

        // Initialize page translations object if not exists
        const pageTranslations = book.pageTranslations || {}

        if (status === "completed") {
            const url = translatedUrl || translatedFileUrl

            if (url && pageNumber !== undefined) {
                // Store the translated page URL
                pageTranslations[`page_${pageNumber}`] = {
                    url,
                    translatedAt: new Date().toISOString(),
                    status: "completed"
                }

                await kvDB.updateBook(bookId, {
                    pageTranslations,
                    // Also update overall translation status if this is the first page
                    translationStatus: book.translationStatus || "partial",
                })

                console.log(`[PDF Page Callback] ✓ Page ${pageNumber} translation saved: ${url}`)
            }
        } else if (status === "failed") {
            console.log(`[PDF Page Callback] ✗ Page ${pageNumber} translation failed: ${error}`)

            pageTranslations[`page_${pageNumber}`] = {
                status: "failed",
                error: error || "Unknown error",
                failedAt: new Date().toISOString()
            }

            await kvDB.updateBook(bookId, { pageTranslations })
        } else if (status === "processing") {
            // Just log progress
            console.log(`[PDF Page Callback] Page ${pageNumber} processing: ${progress}%`)
        }

        return NextResponse.json({
            success: true,
            message: `Page ${pageNumber} callback processed`
        })

    } catch (error) {
        console.error("[PDF Page Callback] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
