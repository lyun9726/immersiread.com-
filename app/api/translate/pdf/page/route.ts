/**
 * POST /api/translate/pdf/page
 * Request single page PDF translation using BabelDOC backend service
 * 
 * Request body: { bookId: string, pageNumber: number, targetLang?: string }
 * Response: { status: "completed" | "processing" | "failed", translatedPageUrl?: string }
 */

import { NextRequest, NextResponse } from "next/server"
import { kvDB } from "@/lib/storage/kvDB"
import { getPresignedDownloadUrl } from "@/lib/storage/s3Client"

// BabelDOC translation service URL (Railway deployment)
const PDF_TRANSLATE_SERVICE_URL = process.env.PDF_TRANSLATE_SERVICE_URL || ""

export async function POST(request: NextRequest) {
    try {
        const { bookId, pageNumber, targetLang = "zh", pdfUrl: requestPdfUrl } = await request.json()

        if (!bookId) {
            return NextResponse.json({ error: "bookId is required" }, { status: 400 })
        }

        if (pageNumber === undefined || pageNumber === null) {
            return NextResponse.json({ error: "pageNumber is required" }, { status: 400 })
        }

        // Check if translation service is configured
        if (!PDF_TRANSLATE_SERVICE_URL) {
            console.log("[PDF Page Translate] Service URL not configured")
            return NextResponse.json({
                status: "failed",
                error: "PDF translation service is not configured",
                mockMode: true
            }, { status: 503 })
        }

        // Get PDF URL - either from request body or from database
        let sourceUrl = requestPdfUrl

        if (!sourceUrl) {
            // Try to get from database
            const book = await kvDB.getBook(bookId)
            if (book && book.sourceUrl) {
                sourceUrl = book.sourceUrl
            }
        }

        if (!sourceUrl) {
            console.log(`[PDF Page Translate] No PDF URL found for book: ${bookId}`)
            return NextResponse.json({ error: "No PDF file URL provided or found" }, { status: 400 })
        }

        console.log(`[PDF Page Translate] Requesting translation for book: ${bookId}, page: ${pageNumber}`)

        // Generate a FRESH presigned URL for Railway to download the PDF
        // Always regenerate from the S3 key, even if the URL already has query params
        // (the frontend's presigned URL may be short-lived or about to expire)
        let pdfUrl = sourceUrl
        const isS3Url = pdfUrl.includes(".s3.") || pdfUrl.includes("s3.amazonaws.com")

        if (isS3Url) {
            try {
                // Extract the S3 key from the URL (strip any existing query params)
                const urlWithoutParams = pdfUrl.split("?")[0]
                const urlParts = urlWithoutParams.split("amazonaws.com/")
                if (urlParts.length > 1) {
                    const key = decodeURIComponent(urlParts[1])
                    console.log(`[PDF Page Translate] Extracted S3 key: ${key}`)
                    // Generate a fresh presigned URL valid for 2 hours
                    pdfUrl = await getPresignedDownloadUrl(key, 7200)
                    console.log(`[PDF Page Translate] Generated fresh presigned URL for Railway`)
                }
            } catch (err) {
                console.error(`[PDF Page Translate] Failed to presign URL:`, err)
                // Continue with original URL as fallback
            }
        } else {
            console.log(`[PDF Page Translate] Non-S3 URL, using as-is`)
        }

        // Call BabelDOC service for single page translation
        try {
            const callbackUrl = `${process.env.NEXTAUTH_URL || `https://${process.env.VERCEL_URL}`}/api/translate/pdf/page/callback`
            console.log(`[PDF Page Translate] Calling BabelDOC service:`, {
                serviceUrl: PDF_TRANSLATE_SERVICE_URL,
                bookId,
                pageNumber,
                targetLang,
                callbackUrl,
                pdfUrlPrefix: pdfUrl.substring(0, 50) + '...'
            })

            const response = await fetch(`${PDF_TRANSLATE_SERVICE_URL}/translate/page`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    bookId,
                    pdfUrl,
                    pageNumber,
                    targetLang,
                    callbackUrl,
                }),
            })

            console.log(`[PDF Page Translate] BabelDOC response status: ${response.status}`)

            if (!response.ok) {
                const errorText = await response.text()
                console.error(`[PDF Page Translate] BabelDOC error response:`, errorText)
                throw new Error(`BabelDOC service error: ${response.status} ${errorText}`)
            }

            const result = await response.json()

            // If already cached, return immediately
            if (result.cached) {
                return NextResponse.json({
                    status: "completed",
                    pageNumber,
                    translatedPageUrl: result.translatedUrl,
                    cached: true,
                    message: "Page already translated (cached)"
                })
            }

            return NextResponse.json({
                status: result.status || "processing",
                jobId: result.jobId,
                pageNumber,
                message: `Page ${pageNumber} translation started`,
            })

        } catch (serviceError) {
            console.error("[PDF Page Translate] Service call failed:", serviceError)

            return NextResponse.json({
                status: "failed",
                error: "Failed to connect to translation service",
                details: String(serviceError),
            }, { status: 502 })
        }

    } catch (error) {
        console.error("[PDF Page Translate] Error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

// GET: Check page translation status by proxying to Railway service
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const jobId = searchParams.get("jobId")

        if (!jobId) {
            return NextResponse.json({ error: "jobId is required" }, { status: 400 })
        }

        // Check if translation service is configured
        if (!PDF_TRANSLATE_SERVICE_URL) {
            return NextResponse.json({
                status: "failed",
                error: "PDF translation service is not configured"
            }, { status: 503 })
        }

        // Proxy the status check to Railway service
        const response = await fetch(`${PDF_TRANSLATE_SERVICE_URL}/status/${jobId}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        })

        if (!response.ok) {
            if (response.status === 404) {
                return NextResponse.json({ status: "unknown", error: "Job not found" })
            }
            return NextResponse.json({ status: "failed", error: `Service error: ${response.status}` })
        }

        const result = await response.json()
        return NextResponse.json(result)

    } catch (error) {
        console.error("[PDF Page Translate] Status check error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
