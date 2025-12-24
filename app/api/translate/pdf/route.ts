/**
 * POST /api/translate/pdf
 * Request full PDF translation using PDFMathTranslate backend service
 * 
 * Request body: { bookId: string, targetLang?: string }
 * Response: { status: "pending" | "processing" | "completed" | "failed", translatedFileUrl?: string }
 */

import { NextRequest, NextResponse } from "next/server"
import { kvDB } from "@/lib/storage/kvDB"
import { getPresignedDownloadUrl } from "@/lib/storage/s3Client"
import type { Book } from "@/lib/types"

// PDFMathTranslate service URL (Railway deployment)
const PDF_TRANSLATE_SERVICE_URL = process.env.PDF_TRANSLATE_SERVICE_URL || ""

export async function POST(request: NextRequest) {
    try {
        const { bookId, targetLang = "zh", force = false } = await request.json()

        if (!bookId) {
            return NextResponse.json({ error: "bookId is required" }, { status: 400 })
        }

        // Get book from database
        const book = await kvDB.getBook(bookId)
        if (!book) {
            return NextResponse.json({ error: "Book not found" }, { status: 404 })
        }

        // Check if already translated with a valid permanent URL
        if (book.translationStatus === "completed" && book.translatedFileUrl) {
            // Verify the URL is a permanent S3 URL, not a temporary Railway URL
            const isRailwayUrl = book.translatedFileUrl.includes('railway.app')

            if (!isRailwayUrl) {
                // Valid S3 URL, return it
                return NextResponse.json({
                    status: "completed",
                    translatedFileUrl: book.translatedFileUrl,
                    message: "Translation already completed"
                })
            } else {
                // Railway URL is temporary and may have expired, need to retranslate
                console.log(`[PDF Translate] Railway URL detected, will retranslate: ${bookId}`)
                // Continue with new translation request
            }
        }

        // Check if translation is in progress (with timeout detection)
        const requestedAt = book.translationRequestedAt ? new Date(book.translationRequestedAt).getTime() : 0
        const isStuck = Date.now() - requestedAt > 10 * 60 * 1000 // 10 minutes timeout

        if (!force && !isStuck && (book.translationStatus === "processing" || book.translationStatus === "pending")) {
            return NextResponse.json({
                status: book.translationStatus,
                progress: book.translationProgress || 0,
                message: "Translation is in progress"
            })
        }

        // Reset if stuck or forced
        if (isStuck || force) {
            console.log(`[PDF Translate] Resetting stuck/forced translation for book: ${bookId}`)
        }

        // Check if PDF file exists
        if (!book.sourceUrl) {
            return NextResponse.json({ error: "No source PDF file found" }, { status: 400 })
        }

        // Check if PDFMathTranslate service is configured
        if (!PDF_TRANSLATE_SERVICE_URL) {
            console.log("[PDF Translate] Service URL not configured, using mock mode")

            // Update book status to show mock processing
            await kvDB.updateBook(bookId, {
                translationStatus: "pending",
                translationProgress: 0,
                translationRequestedAt: new Date(),
            })

            return NextResponse.json({
                status: "pending",
                message: "PDF translation service is not configured. Please set PDF_TRANSLATE_SERVICE_URL environment variable.",
                mockMode: true
            })
        }

        // Update book status to pending
        await kvDB.updateBook(bookId, {
            translationStatus: "pending",
            translationProgress: 0,
            translationRequestedAt: new Date(),
        })

        console.log(`[PDF Translate] Submitting translation request for book: ${bookId}`)

        // Generate presigned URL for S3 files so Railway can download them
        let pdfUrl = book.sourceUrl
        if (pdfUrl.includes(".s3.") || pdfUrl.includes("s3.amazonaws.com")) {
            try {
                // Extract the S3 key from the URL
                const urlParts = pdfUrl.split("amazonaws.com/")
                if (urlParts.length > 1) {
                    const key = decodeURIComponent(urlParts[1])
                    // Generate a presigned URL valid for 2 hours
                    pdfUrl = await getPresignedDownloadUrl(key, 7200)
                    console.log(`[PDF Translate] Generated presigned URL for S3 file`)
                }
            } catch (err) {
                console.error(`[PDF Translate] Failed to presign URL:`, err)
                // Continue with original URL and hope for the best
            }
        }

        // Call PDFMathTranslate service
        try {
            const response = await fetch(`${PDF_TRANSLATE_SERVICE_URL}/translate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    bookId,
                    pdfUrl,
                    targetLang,
                    // VERCEL_URL doesn't include scheme, so add https://
                    callbackUrl: `${process.env.NEXTAUTH_URL || `https://${process.env.VERCEL_URL}`}/api/translate/pdf/callback`,
                }),
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`PDFMathTranslate service error: ${response.status} ${errorText}`)
            }

            const result = await response.json()

            // Update book status to processing
            await kvDB.updateBook(bookId, {
                translationStatus: "processing",
            })

            return NextResponse.json({
                status: "processing",
                jobId: result.jobId,
                message: "PDF translation started",
            })

        } catch (serviceError) {
            console.error("[PDF Translate] Service call failed:", serviceError)

            // Update book status to failed
            await kvDB.updateBook(bookId, {
                translationStatus: "failed",
                translationError: String(serviceError),
            })

            return NextResponse.json({
                status: "failed",
                error: "Failed to connect to translation service",
                details: String(serviceError),
            }, { status: 502 })
        }

    } catch (error) {
        console.error("[PDF Translate] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// GET: Check translation status
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const bookId = searchParams.get("bookId")

        if (!bookId) {
            return NextResponse.json({ error: "bookId is required" }, { status: 400 })
        }

        const book = await kvDB.getBook(bookId)
        if (!book) {
            return NextResponse.json({ error: "Book not found" }, { status: 404 })
        }

        return NextResponse.json({
            status: book.translationStatus || "idle",
            progress: book.translationProgress || 0,
            translatedFileUrl: book.translatedFileUrl,
            error: book.translationError,
        })

    } catch (error) {
        console.error("[PDF Translate] Status check error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
