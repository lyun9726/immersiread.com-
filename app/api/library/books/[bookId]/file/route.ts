/**
 * GET /api/library/books/:bookId/file
 * Proxy book file download to avoid browser CORS issues.
 * 
 * Query params:
 * - type=bilingual: fetch the bilingual version instead of original
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/storage/database"
import { getPresignedDownloadUrl } from "@/lib/storage/s3Client"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params
    const { searchParams } = new URL(request.url)
    const fileType = searchParams.get('type') // 'bilingual' for bilingual version

    const book = await db.getBook(bookId)

    // Determine which URL to use
    let sourceUrl: string | undefined
    if (fileType === 'bilingual' && book?.bilingualEpubUrl) {
      sourceUrl = book.bilingualEpubUrl
      console.log(`[Library File Proxy] Serving bilingual EPUB for book: ${bookId}`)
    } else {
      sourceUrl = book?.sourceUrl
    }

    if (!sourceUrl) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    let downloadUrl = sourceUrl
    if (downloadUrl.includes(".s3.") || downloadUrl.includes("s3.amazonaws.com")) {
      const urlParts = downloadUrl.split("amazonaws.com/")
      if (urlParts.length > 1) {
        downloadUrl = await getPresignedDownloadUrl(urlParts[1])
      }
    }

    const rangeHeader = request.headers.get("range")
    const upstream = await fetch(downloadUrl, {
      headers: rangeHeader ? { range: rangeHeader } : undefined,
    })
    if (!upstream.ok || !upstream.body) {
      console.error(`[Library File Proxy] Failed to fetch: ${upstream.status}`)
      return NextResponse.json(
        { error: "Failed to fetch file" },
        { status: upstream.status || 502 }
      )
    }

    const headers = new Headers()

    // Force correct Content-Type based on file extension
    // This is critical for EPUB files - epubjs needs application/epub+zip
    // to know it should treat the file as a ZIP archive
    const lowerUrl = sourceUrl.toLowerCase()
    let contentType = upstream.headers.get("content-type")

    if (lowerUrl.endsWith('.epub')) {
      contentType = 'application/epub+zip'
    } else if (lowerUrl.endsWith('.pdf')) {
      contentType = 'application/pdf'
    }

    if (contentType) headers.set("content-type", contentType)
    const contentLength = upstream.headers.get("content-length")
    if (contentLength) headers.set("content-length", contentLength)
    const contentRange = upstream.headers.get("content-range")
    if (contentRange) headers.set("content-range", contentRange)
    const acceptRanges = upstream.headers.get("accept-ranges")
    headers.set("accept-ranges", acceptRanges || "bytes")
    const etag = upstream.headers.get("etag")
    if (etag) headers.set("etag", etag)
    const lastModified = upstream.headers.get("last-modified")
    if (lastModified) headers.set("last-modified", lastModified)
    headers.set("cache-control", "private, max-age=300")

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch (error) {
    console.error("[Library File Proxy] Error:", error)
    return NextResponse.json({ error: "Failed to proxy file" }, { status: 500 })
  }
}
