/**
 * POST /api/translate/epub-bilingual
 * 
 * Trigger bilingual EPUB generation via Railway service
 * 
 * This endpoint:
 * 1. Validates the book exists and is an EPUB
 * 2. Updates status to "pending"
 * 3. Calls Railway service to process translation in background
 * 4. Railway service will call back when complete
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/storage/database"
import { getPresignedDownloadUrl } from "@/lib/storage/s3Client"

export const dynamic = 'force-dynamic'

// Railway service URL - set via environment variable
const EPUB_TRANSLATE_SERVICE_URL = process.env.EPUB_TRANSLATE_SERVICE_URL || ""

export async function POST(request: NextRequest) {
    try {
        const { bookId } = await request.json()

        if (!bookId) {
            return NextResponse.json({ error: "bookId is required" }, { status: 400 })
        }

        console.log(`[EPUB Bilingual] Starting for book: ${bookId}`)

        // 1. Get book from database
        const book = await db.getBook(bookId)
        if (!book) {
            return NextResponse.json({ error: "Book not found" }, { status: 404 })
        }

        // Check if already has bilingual version
        if (book.bilingualEpubUrl) {
            console.log(`[EPUB Bilingual] Book already has bilingual version`)
            return NextResponse.json({
                success: true,
                message: "Bilingual EPUB already exists",
                bilingualUrl: book.bilingualEpubUrl
            })
        }

        // Check if already processing
        if (book.epubTranslationStatus === 'processing' || book.epubTranslationStatus === 'pending') {
            console.log(`[EPUB Bilingual] Translation already in progress`)
            return NextResponse.json({
                success: true,
                message: "Translation already in progress",
                status: book.epubTranslationStatus
            })
        }

        // 2. Get source URL
        const sourceUrl = book.sourceUrl
        if (!sourceUrl) {
            return NextResponse.json({ error: "Book has no source file" }, { status: 400 })
        }

        // Check if it's an EPUB
        const cleanUrl = sourceUrl.split('?')[0].toLowerCase()
        if (!cleanUrl.endsWith('.epub')) {
            return NextResponse.json({ error: "Book is not an EPUB file" }, { status: 400 })
        }

        // 3. Check Railway service is configured
        if (!EPUB_TRANSLATE_SERVICE_URL) {
            return NextResponse.json({
                error: "EPUB translation service not configured. Please set EPUB_TRANSLATE_SERVICE_URL environment variable."
            }, { status: 503 })
        }

        // 4. Generate presigned URL for the EPUB file
        let epubUrl = sourceUrl
        if (sourceUrl.includes('s3.') || sourceUrl.includes('.s3.') || sourceUrl.includes('amazonaws.com')) {
            // Extract key from S3 URL
            const urlParts = sourceUrl.split('amazonaws.com/')
            if (urlParts.length > 1) {
                epubUrl = await getPresignedDownloadUrl(urlParts[1])
            }
        }

        // 5. Build callback URL
        const requestUrl = new URL(request.url)
        let baseUrl: string
        if (process.env.NEXTAUTH_URL) {
            baseUrl = process.env.NEXTAUTH_URL
        } else if (process.env.VERCEL_URL) {
            baseUrl = `https://${process.env.VERCEL_URL}`
        } else {
            baseUrl = `${requestUrl.protocol}//${requestUrl.host}`
        }
        const callbackUrl = `${baseUrl}/api/translate/epub-bilingual/callback`

        console.log(`[EPUB Bilingual] Calling Railway service: ${EPUB_TRANSLATE_SERVICE_URL}`)
        console.log(`[EPUB Bilingual] Callback URL: ${callbackUrl}`)

        // 6. Update status to pending
        await db.updateBook(bookId, {
            epubTranslationStatus: 'pending'
        })

        // 7. Call Railway service
        const response = await fetch(`${EPUB_TRANSLATE_SERVICE_URL}/translate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bookId,
                epubUrl,
                callbackUrl
            })
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error(`[EPUB Bilingual] Railway service error: ${response.status} - ${errorText}`)

            await db.updateBook(bookId, {
                epubTranslationStatus: 'failed'
            })

            return NextResponse.json({
                error: "Failed to start translation",
                details: errorText
            }, { status: 502 })
        }

        const result = await response.json()
        console.log(`[EPUB Bilingual] Railway job started: ${result.jobId}`)

        return NextResponse.json({
            success: true,
            message: "Translation started",
            jobId: result.jobId,
            status: "pending"
        })

    } catch (error) {
        console.error("[EPUB Bilingual] Error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        )
    }
}
