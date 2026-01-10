/**
 * GET /api/library/books/:bookId/file
 * Returns a redirect to S3 presigned URL to avoid bandwidth through Vercel.
 * 
 * Query params:
 * - type=bilingual: fetch the bilingual version instead of original
 * - proxy=true: force proxy mode (for CORS issues, use sparingly)
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
    const forceProxy = searchParams.get('proxy') === 'true'

    const book = await db.getBook(bookId)

    console.log(`[Library File] Book ${bookId}: type=${fileType}, forceProxy=${forceProxy}`)

    // Determine which URL to use
    let sourceUrl: string | undefined
    if (fileType === 'bilingual' && book?.bilingualEpubUrl) {
      sourceUrl = book.bilingualEpubUrl
    } else {
      sourceUrl = book?.sourceUrl
    }

    if (!sourceUrl) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Generate presigned URL for S3 files
    let downloadUrl = sourceUrl
    if (downloadUrl.includes(".s3.") || downloadUrl.includes("s3.amazonaws.com")) {
      const urlParts = downloadUrl.split("amazonaws.com/")
      if (urlParts.length > 1) {
        downloadUrl = await getPresignedDownloadUrl(urlParts[1])
      }
    }

    // Option 1: Redirect to S3 (saves Vercel bandwidth) - DEFAULT
    if (!forceProxy) {
      console.log(`[Library File] Redirecting to S3 for book: ${bookId}`)
      return NextResponse.redirect(downloadUrl, {
        status: 302,
        headers: {
          'Cache-Control': 'private, max-age=300',
        }
      })
    }

    // Option 2: Proxy mode (only when explicitly requested for CORS issues)
    console.log(`[Library File] Proxying file for book: ${bookId} (proxy mode)`)
    const rangeHeader = request.headers.get("range")
    const upstream = await fetch(downloadUrl, {
      headers: rangeHeader ? { range: rangeHeader } : undefined,
    })

    if (!upstream.ok || !upstream.body) {
      console.error(`[Library File] Failed to fetch: ${upstream.status}`)
      return NextResponse.json(
        { error: "Failed to fetch file" },
        { status: upstream.status || 502 }
      )
    }

    const headers = new Headers()
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
    headers.set("accept-ranges", upstream.headers.get("accept-ranges") || "bytes")
    const etag = upstream.headers.get("etag")
    if (etag) headers.set("etag", etag)
    const lastModified = upstream.headers.get("last-modified")
    if (lastModified) headers.set("last-modified", lastModified)
    headers.set("cache-control", "private, max-age=3600")

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch (error) {
    console.error("[Library File] Error:", error)
    return NextResponse.json({ error: "Failed to get file" }, { status: 500 })
  }
}

