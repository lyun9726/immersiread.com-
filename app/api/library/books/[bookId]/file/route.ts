/**
 * GET /api/library/books/:bookId/file
 * Proxy book file download to avoid browser CORS issues.
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

    const book = await db.getBook(bookId)
    if (!book?.sourceUrl) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    let downloadUrl = book.sourceUrl
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
      return NextResponse.json(
        { error: "Failed to fetch file" },
        { status: upstream.status || 502 }
      )
    }

    const headers = new Headers()
    const contentType = upstream.headers.get("content-type")
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
