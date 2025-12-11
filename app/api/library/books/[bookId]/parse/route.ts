
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/storage/inMemoryDB"
import { readerEngine } from "@/lib/reader/ReaderEngine"
import { getPresignedDownloadUrl } from "@/lib/storage/s3Client"

export const dynamic = 'force-dynamic'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ bookId: string }> }
) {
    try {
        const { bookId } = await params
        console.log(`[Book Parse] Request to parse book: ${bookId}`)

        // 1. Get book from DB
        const book = db.getBook(bookId)
        if (!book) {
            return NextResponse.json({ error: "Book not found" }, { status: 404 })
        }

        if (!book.sourceUrl) {
            return NextResponse.json({ error: "Book has no source URL" }, { status: 400 })
        }

        // 2. Prepare download URL
        let downloadUrl = book.sourceUrl
        if (downloadUrl.includes('.s3.') || downloadUrl.includes('s3.amazonaws.com')) {
            const urlParts = downloadUrl.split('.amazonaws.com/')
            if (urlParts.length > 1) {
                const key = urlParts[1]
                console.log(`[Book Parse] Generating presigned URL for key: ${key}`)
                downloadUrl = await getPresignedDownloadUrl(key)
            }
        }

        // 3. Parse content
        console.log(`[Book Parse] Parsing content from: ${downloadUrl}`)
        const parseResult = await readerEngine.parseFromUrl(downloadUrl)

        // 4. Update DB
        db.setBlocks(bookId, parseResult.blocks)
        if (parseResult.chapters && parseResult.chapters.length > 0) {
            db.setChapters(bookId, parseResult.chapters)
        }

        // Update metadata if needed (e.g. if we got better metadata from parsing)
        if (parseResult.metadata) {
            const updates: any = {}
            if (!book.author && parseResult.metadata.author) updates.author = parseResult.metadata.author
            // Don't overwrite title if it was custom set, but maybe if it was untitled?
            // For now, let's keep existing title/author unless missing
            if (Object.keys(updates).length > 0) {
                db.updateBook(bookId, updates)
            }
        }

        console.log(`[Book Parse] Successfully parsed book ${bookId}: ${parseResult.blocks.length} blocks`)

        return NextResponse.json({
            success: true,
            blocks: parseResult.blocks,
            chapters: parseResult.chapters
        })

    } catch (error) {
        console.error(`[Book Parse] Error parsing book:`, error)
        return NextResponse.json(
            { error: "Failed to parse book" },
            { status: 500 }
        )
    }
}
