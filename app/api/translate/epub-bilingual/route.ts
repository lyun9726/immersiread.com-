/**
 * POST /api/translate/epub-bilingual
 * 
 * Generate a bilingual EPUB file from an original EPUB
 * 
 * This endpoint:
 * 1. Downloads the original EPUB from storage
 * 2. Parses and translates all text content
 * 3. Injects translations into the EPUB structure
 * 4. Uploads the bilingual EPUB to storage
 * 5. Updates the book record with the new file URL
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/storage/database"
import { createBilingualEpub } from "@/lib/epub/epubProcessor"
import { getFileUrl, uploadToS3 } from "@/lib/storage/s3Client"

export const dynamic = 'force-dynamic'
// Allow up to 5 minutes for translation (large books)
export const maxDuration = 300

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

        // 2. Get source URL and download EPUB
        const sourceUrl = book.sourceUrl
        if (!sourceUrl) {
            return NextResponse.json({ error: "Book has no source file" }, { status: 400 })
        }

        // Check if it's an EPUB
        const cleanUrl = sourceUrl.split('?')[0].toLowerCase()
        if (!cleanUrl.endsWith('.epub')) {
            return NextResponse.json({ error: "Book is not an EPUB file" }, { status: 400 })
        }

        console.log(`[EPUB Bilingual] Downloading original EPUB...`)

        // Download the EPUB file
        let downloadUrl = sourceUrl

        // If it's an S3 URL, we need to use the proxy endpoint
        if (sourceUrl.includes('s3.') || sourceUrl.includes('amazonaws.com') || sourceUrl.includes('r2.cloudflarestorage')) {
            downloadUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/library/books/${bookId}/file`
        }

        const response = await fetch(downloadUrl)
        if (!response.ok) {
            throw new Error(`Failed to download EPUB: ${response.status}`)
        }

        const originalBuffer = await response.arrayBuffer()
        console.log(`[EPUB Bilingual] Downloaded ${originalBuffer.byteLength} bytes`)

        // 3. Update book status to processing
        await db.updateBook(bookId, {
            epubTranslationStatus: 'processing'
        })

        // 4. Create bilingual EPUB
        console.log(`[EPUB Bilingual] Processing and translating...`)

        const bilingualBuffer = await createBilingualEpub(originalBuffer, (progress) => {
            console.log(`[EPUB Bilingual] ${progress.stage}: ${progress.message} (${progress.current}/${progress.total})`)
        })

        console.log(`[EPUB Bilingual] Generated bilingual EPUB: ${bilingualBuffer.byteLength} bytes`)

        // 5. Upload bilingual EPUB to S3
        const timestamp = Date.now()
        const originalName = cleanUrl.split('/').pop()?.replace('.epub', '') || 'book'
        const bilingualKey = `books/${bookId}/${originalName}_bilingual_${timestamp}.epub`

        console.log(`[EPUB Bilingual] Uploading to S3: ${bilingualKey}`)

        await uploadToS3(bilingualKey, Buffer.from(bilingualBuffer), 'application/epub+zip')

        // Generate URL for the uploaded file
        const bilingualUrl = getFileUrl(bilingualKey)

        // 6. Update book record
        await db.updateBook(bookId, {
            bilingualEpubUrl: bilingualUrl,
            epubTranslationStatus: 'completed'
        })

        console.log(`[EPUB Bilingual] Complete! URL: ${bilingualUrl}`)

        return NextResponse.json({
            success: true,
            bilingualUrl,
            message: "Bilingual EPUB created successfully"
        })

    } catch (error) {
        console.error("[EPUB Bilingual] Error:", error)

        // Try to update status to failed
        try {
            const body = await request.clone().json()
            if (body.bookId) {
                await db.updateBook(body.bookId, {
                    epubTranslationStatus: 'failed'
                })
            }
        } catch { }

        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to create bilingual EPUB" },
            { status: 500 }
        )
    }
}

/**
 * GET /api/translate/epub-bilingual?bookId=xxx
 * 
 * Get translation status for a book
 */
export async function GET(request: NextRequest) {
    const bookId = request.nextUrl.searchParams.get('bookId')

    if (!bookId) {
        return NextResponse.json({ error: "bookId is required" }, { status: 400 })
    }

    try {
        const book = await db.getBook(bookId)
        if (!book) {
            return NextResponse.json({ error: "Book not found" }, { status: 404 })
        }

        return NextResponse.json({
            status: book.epubTranslationStatus || 'idle',
            bilingualUrl: book.bilingualEpubUrl || null,
            hasTranslation: !!book.bilingualEpubUrl
        })
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to get status" },
            { status: 500 }
        )
    }
}
