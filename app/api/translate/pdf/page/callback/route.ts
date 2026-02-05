/**
 * POST /api/translate/pdf/page/callback
 * Callback endpoint for BabelDOC service to report page translation completion
 * 
 * Note: This endpoint should work even if the book doesn't exist in the database,
 * as the frontend will poll for the result based on the translated URL.
 */

import { NextRequest, NextResponse } from "next/server"
import { kvDB } from "@/lib/storage/kvDB"

// In-memory cache for page translation results (temporary storage for frontend polling)
// This allows the callback to work even when books don't exist in the database
const pageTranslationCache = new Map<string, {
    url?: string;
    status: string;
    error?: string;
    timestamp: number;
}>()

// Cache key generator
function getCacheKey(bookId: string, pageNumber: number): string {
    return `${bookId}:page_${pageNumber}`
}

// Cleanup old cache entries (older than 1 hour)
function cleanupCache() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    for (const [key, value] of pageTranslationCache.entries()) {
        if (value.timestamp < oneHourAgo) {
            pageTranslationCache.delete(key)
        }
    }
}

export async function POST(request: NextRequest) {
    try {
        const data = await request.json()
        const { bookId, pageNumber, status, translatedUrl, translatedFileUrl, error, progress } = data

        console.log(`[PDF Page Callback] Received: bookId=${bookId}, page=${pageNumber}, status=${status}`)

        if (!bookId) {
            return NextResponse.json({ error: "bookId is required" }, { status: 400 })
        }

        const cacheKey = getCacheKey(bookId, pageNumber)
        const url = translatedUrl || translatedFileUrl

        // Store in memory cache for frontend polling (regardless of database)
        if (status === "completed" && url) {
            pageTranslationCache.set(cacheKey, {
                url,
                status: "completed",
                timestamp: Date.now()
            })
            console.log(`[PDF Page Callback] ✓ Cached page ${pageNumber}: ${url}`)
        } else if (status === "failed") {
            pageTranslationCache.set(cacheKey, {
                status: "failed",
                error: error || "Unknown error",
                timestamp: Date.now()
            })
            console.log(`[PDF Page Callback] ✗ Page ${pageNumber} failed: ${error}`)
        }

        // Try to update book in database (optional, may not exist)
        try {
            const book = await kvDB.getBook(bookId)
            if (book) {
                const pageTranslations = book.pageTranslations || {}

                if (status === "completed" && url && pageNumber !== undefined) {
                    pageTranslations[`page_${pageNumber}`] = {
                        url,
                        translatedAt: new Date().toISOString(),
                        status: "completed"
                    }

                    await kvDB.updateBook(bookId, {
                        pageTranslations,
                        translationStatus: book.translationStatus || "partial",
                    })

                    console.log(`[PDF Page Callback] ✓ Book updated: page ${pageNumber}`)
                } else if (status === "failed") {
                    pageTranslations[`page_${pageNumber}`] = {
                        status: "failed",
                        error: error || "Unknown error",
                        failedAt: new Date().toISOString()
                    }

                    await kvDB.updateBook(bookId, { pageTranslations })
                }
            } else {
                console.log(`[PDF Page Callback] Book not in DB, using cache only: ${bookId}`)
            }
        } catch (dbError) {
            console.log(`[PDF Page Callback] DB update failed (cache still valid):`, dbError)
        }

        // Cleanup old cache entries periodically
        cleanupCache()

        return NextResponse.json({
            success: true,
            message: `Page ${pageNumber} callback processed`
        })

    } catch (error) {
        console.error("[PDF Page Callback] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// GET endpoint for frontend to poll translation status
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const bookId = searchParams.get("bookId")
        const pageNumber = searchParams.get("pageNumber")

        if (!bookId || pageNumber === null) {
            return NextResponse.json({ error: "bookId and pageNumber are required" }, { status: 400 })
        }

        const cacheKey = getCacheKey(bookId, parseInt(pageNumber))
        const cached = pageTranslationCache.get(cacheKey)

        if (cached) {
            return NextResponse.json({
                status: cached.status,
                translatedUrl: cached.url,
                error: cached.error
            })
        }

        // Also check database
        try {
            const book = await kvDB.getBook(bookId)
            if (book && book.pageTranslations) {
                const pageData = book.pageTranslations[`page_${pageNumber}`]
                if (pageData) {
                    return NextResponse.json({
                        status: pageData.status || "completed",
                        translatedUrl: pageData.url,
                        error: pageData.error
                    })
                }
            }
        } catch (dbError) {
            console.log(`[PDF Page Callback] DB check failed:`, dbError)
        }

        return NextResponse.json({ status: "unknown" })

    } catch (error) {
        console.error("[PDF Page Callback] GET Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
