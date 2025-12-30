
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/storage/database"
import { readerEngine } from "@/lib/reader/ReaderEngine"
import { getPresignedDownloadUrl } from "@/lib/storage/s3Client"

export const dynamic = 'force-dynamic'
// Increase timeout for PDF parsing (Vercel Pro: 60s, Hobby: 10s max)
export const maxDuration = 60

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ bookId: string }> }
) {
    try {
        const { bookId } = await params
        console.log(`[Book Parse] Request to parse book: ${bookId}`)

        // 1. Get book from DB (async)
        const book = await db.getBook(bookId)
        if (!book) {
            console.log(`[Book Parse] Book not found: ${bookId}`)
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

        // 4. Update DB (async)
        await db.setBlocks(bookId, parseResult.blocks)
        if (parseResult.chapters && parseResult.chapters.length > 0) {
            await db.setChapters(bookId, parseResult.chapters)
        }

        // Update metadata if needed
        const updates: any = {
            totalBlocks: parseResult.blocks.length
        }

        // Ensure format is set
        if (!book.format) {
            const ext = book.sourceUrl.split('.').pop()?.toLowerCase() || 'text'
            updates.format = ext === 'pdf' ? 'pdf' : ext === 'epub' ? 'epub' : 'text'
        }

        if (parseResult.metadata) {
            if (!book.author && parseResult.metadata.author) updates.author = parseResult.metadata.author
            // Also update title if it's currently "Untitled" or default
            if ((!book.title || book.title === 'Untitled' || book.title.startsWith('http')) && parseResult.metadata.title) {
                updates.title = parseResult.metadata.title
            }
            if (parseResult.metadata.coverImage && (!book.cover || book.cover.startsWith('data:image/svg'))) {
                updates.cover = parseResult.metadata.coverImage
            }
        }

        await db.updateBook(bookId, updates)

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
