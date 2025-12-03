/**
 * POST /api/reader/parse
 * Parse a document and create a book
 */

import { NextRequest, NextResponse } from "next/server"
import type { ParseRequest, ParseResponse } from "@/lib/types"
import { readerEngine } from "@/lib/reader/ReaderEngine"
import { db } from "@/lib/storage/inMemoryDB"
import { getPresignedDownloadUrl } from "@/lib/storage/s3Client"

/**
 * Extract book title from filename
 * Example: "My Book -- Author Name.pdf" -> "My Book"
 */
function extractTitleFromFilename(url: string): string {
  try {
    // Extract filename from URL (after last /)
    const filename = url.split('/').pop() || ''

    // Remove file extension
    let title = filename.replace(/\.(pdf|epub|txt|docx|mobi)$/i, '')

    // Remove UUID pattern (e.g., "1764829120176-e6e83823-2849-495b-b485-894e21cba803")
    title = title.replace(/^\d+-[a-f0-9-]+?-/, '')

    // If title contains " -- ", take the part before it (often the title)
    if (title.includes(' -- ')) {
      title = title.split(' -- ')[0]
    }

    // Clean up
    title = title.trim()

    // Return title or fallback
    return title || 'Untitled'
  } catch (error) {
    return 'Untitled'
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: ParseRequest = await request.json()
    const { url, fileUrl, source = "web" } = body

    console.log(`[Reader Parse] Source=${source}, URL=${url || fileUrl}`)

    // Check for demo path
    if ((url && url.includes("/mnt/data/5321c35c-86d2-43e9-b68d-8963068f3405.png")) ||
        (fileUrl && fileUrl.includes("/mnt/data/5321c35c-86d2-43e9-b68d-8963068f3405.png"))) {
      // Create demo book
      const bookId = "demo-book-1"
      const book = db.createBook({
        id: bookId,
        title: "Demo Article from Local File",
        sourceUrl: url || fileUrl,
      })

      const blocks = [
        { id: "demo-1", order: 1, text: "Demo paragraph one." },
        { id: "demo-2", order: 2, text: "Demo paragraph two." },
        { id: "demo-3", order: 3, text: "Demo paragraph three." },
      ]

      db.setBlocks(bookId, blocks)

      const response: ParseResponse = {
        bookId,
      }

      return NextResponse.json(response)
    }

    // Parse from URL or file
    const targetUrl = url || fileUrl
    if (!targetUrl) {
      return NextResponse.json({ error: "URL or fileUrl is required" }, { status: 400 })
    }

    // If it's an S3 URL, convert to presigned URL for downloading
    let downloadUrl = targetUrl
    if (targetUrl.includes('.s3.') || targetUrl.includes('s3.amazonaws.com')) {
      // Extract S3 key from URL
      const urlParts = targetUrl.split('.amazonaws.com/')
      if (urlParts.length > 1) {
        const key = urlParts[1]
        console.log(`[Reader Parse] Generating presigned URL for S3 key: ${key}`)
        downloadUrl = await getPresignedDownloadUrl(key)
      }
    }

    // Use ReaderEngine to parse
    const parseResult = await readerEngine.parseFromUrl(downloadUrl)

    // Generate bookId
    const bookId = `book-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Extract title from filename as fallback
    const fallbackTitle = extractTitleFromFilename(targetUrl)

    // Create book in database
    const book = db.createBook({
      id: bookId,
      title: parseResult.metadata?.title || fallbackTitle,
      author: parseResult.metadata?.author,
      cover: parseResult.metadata?.coverImage,
      sourceUrl: targetUrl,
      metadata: parseResult.metadata,
    })

    // Save blocks
    db.setBlocks(bookId, parseResult.blocks)

    // Save chapters if available
    if (parseResult.chapters && parseResult.chapters.length > 0) {
      db.setChapters(bookId, parseResult.chapters)
      console.log(`[Reader Parse] Created book ${bookId} with ${parseResult.blocks.length} blocks and ${parseResult.chapters.length} chapters`)
    } else {
      console.log(`[Reader Parse] Created book ${bookId} with ${parseResult.blocks.length} blocks (no chapters detected)`)
    }

    const response: ParseResponse = {
      bookId,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("[Reader Parse] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
