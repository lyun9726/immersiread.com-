/**
 * GET /api/library/books/:bookId/file
 * Proxy book file download to handle CORS properly.
 * 
 * Query params:
 * - type=bilingual: fetch the bilingual version instead of original
 * - type=translation-only: generate translation-only version (strips original text)
 * - redirect=true: use redirect mode (for direct download links, saves bandwidth)
 * - download=true: add Content-Disposition header for download
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
    const fileType = searchParams.get('type') // 'bilingual' or 'translation-only'
    const useRedirect = searchParams.get('redirect') === 'true'
    const isDownload = searchParams.get('download') === 'true'

    const book = await db.getBook(bookId)

    console.log(`[Library File] Book ${bookId}: type=${fileType}, redirect=${useRedirect}, download=${isDownload}`)
    console.log(`[Library File] Book data: bilingualEpubUrl=${book?.bilingualEpubUrl?.substring(0, 50)}..., sourceUrl=${book?.sourceUrl?.substring(0, 50)}...`)

    // Determine which URL to use
    let sourceUrl: string | undefined
    let fileName = book?.title || 'book'

    if ((fileType === 'bilingual' || fileType === 'translation-only') && book?.bilingualEpubUrl) {
      sourceUrl = book.bilingualEpubUrl
      fileName = fileType === 'translation-only'
        ? `${book.title || 'book'}_译文.epub`
        : `${book.title || 'book'}_双语.epub`
      console.log(`[Library File] Using BILINGUAL URL: ${sourceUrl.substring(0, 80)}...`)
    } else {
      sourceUrl = book?.sourceUrl
      fileName = `${book?.title || 'book'}.epub`
      console.log(`[Library File] Using ORIGINAL URL (bilingualEpubUrl=${book?.bilingualEpubUrl ? 'exists' : 'MISSING'}): ${sourceUrl?.substring(0, 80)}...`)
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

    // Option 1: Redirect to S3 (only when explicitly requested, for direct downloads)
    if (useRedirect && !isDownload) {
      console.log(`[Library File] Redirecting to S3 for book: ${bookId}`)
      return NextResponse.redirect(downloadUrl, {
        status: 302,
        headers: {
          'Cache-Control': 'private, max-age=300',
        }
      })
    }

    // Option 2: Proxy mode (DEFAULT - handles CORS properly for EPUB.js)
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

    // Add Content-Disposition header for downloads
    if (isDownload) {
      // Encode filename for Content-Disposition header
      const encodedFileName = encodeURIComponent(fileName).replace(/'/g, "%27")
      headers.set("content-disposition", `attachment; filename*=UTF-8''${encodedFileName}`)
    }

    // For translation-only mode, we need to process the EPUB to remove original text
    // For now, we just serve the bilingual version with CSS that hides originals
    // TODO: Implement server-side EPUB processing to create true translation-only version
    if (fileType === 'translation-only') {
      // For now, return the bilingual version with a note
      // The client will need to handle CSS to hide original content
      console.log(`[Library File] Translation-only requested - serving bilingual with CSS hide note`)
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch (error) {
    console.error("[Library File] Error:", error)
    return NextResponse.json({ error: "Failed to get file" }, { status: 500 })
  }
}
