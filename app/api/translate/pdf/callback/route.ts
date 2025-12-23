/**
 * POST /api/translate/pdf/callback
 * Callback endpoint for PDFMathTranslate service to report completion
 * 
 * Request body: { bookId: string, status: "completed" | "failed", translatedFileUrl?: string, error?: string }
 */

import { NextRequest, NextResponse } from "next/server"
import { kvDB } from "@/lib/storage/kvDB"
import { uploadToS3, getFileUrl } from "@/lib/storage/s3Client"
import { v4 as uuidv4 } from "uuid"

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
            // Download the translated PDF from Railway and re-upload to our S3
            // This ensures the file is permanently stored even if Railway container restarts
            let permanentUrl = translatedFileUrl

            try {
                console.log(`[PDF Translate Callback] Downloading translated PDF from: ${translatedFileUrl}`)
                const response = await fetch(translatedFileUrl)

                if (response.ok) {
                    const pdfBuffer = await response.arrayBuffer()
                    const s3Key = `books/${bookId}/translated.pdf`

                    console.log(`[PDF Translate Callback] Uploading to S3: ${s3Key}`)
                    await uploadToS3(s3Key, Buffer.from(pdfBuffer), "application/pdf")

                    permanentUrl = getFileUrl(s3Key)
                    console.log(`[PDF Translate Callback] Uploaded to S3: ${permanentUrl}`)
                } else {
                    console.warn(`[PDF Translate Callback] Failed to download PDF: ${response.status}`)
                    // Keep using the Railway URL as fallback
                }
            } catch (downloadError) {
                console.error(`[PDF Translate Callback] Error downloading/uploading PDF:`, downloadError)
                // Keep using the Railway URL as fallback
            }

            // Create a separate translated book entry in the library
            let translatedBookId = book.translatedBookId
            if (!translatedBookId) {
                translatedBookId = uuidv4()
                const translatedTitle = book.title
                    ? `${book.title} (翻译版)`
                    : "翻译版"

                const translatedBook = {
                    id: translatedBookId,
                    title: translatedTitle,
                    author: book.author,
                    cover: book.cover,
                    sourceUrl: permanentUrl,
                    isTranslation: true,
                    parentBookId: bookId,
                    targetLanguage: "zh",
                    metadata: {
                        ...book.metadata,
                        title: translatedTitle,
                    }
                }

                await kvDB.createBook(translatedBook)
                console.log(`[PDF Translate Callback] Created translated book entry: ${translatedBookId}`)
            } else {
                // Update existing translated book's source URL
                await kvDB.updateBook(translatedBookId, {
                    sourceUrl: permanentUrl,
                })
                console.log(`[PDF Translate Callback] Updated translated book entry: ${translatedBookId}`)
            }

            // Update original book with translation info
            await kvDB.updateBook(bookId, {
                translationStatus: "completed",
                translatedFileUrl: permanentUrl,
                translationProgress: 100,
                translationCompletedAt: new Date(),
                translationError: undefined,
                translatedBookId: translatedBookId,
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
