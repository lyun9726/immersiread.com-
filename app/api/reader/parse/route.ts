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

/**
 * Extract author from filename
 * Common patterns:
 * - "Title -- Author -- Year.pdf"
 * - "Title -- Author.pdf"  
 * - "Title _ Author.pdf"
 * - "Author - Title.pdf"
 */
function extractAuthorFromFilename(filename: string): string | undefined {
  try {
    // Remove extension
    let name = filename.replace(/\.(pdf|epub|txt|docx|mobi)$/i, '').trim()

    // Remove UUID pattern from start if present
    name = name.replace(/^\d+-[a-f0-9-]+?-/, '')

    // Pattern 1: "Title -- Author -- Year -- Publisher"
    // The second segment after -- is usually the author
    const doubleDashParts = name.split(' -- ')
    if (doubleDashParts.length >= 2) {
      // Check if second part looks like an author name (not a year or publisher)
      const potentialAuthor = doubleDashParts[1].trim()
      // Authors usually don't start with numbers (years like 2024)
      if (potentialAuthor && !/^\d{4}$/.test(potentialAuthor)) {
        return potentialAuthor
      }
    }

    // Pattern 2: "Author - Title" (author comes first)
    const singleDashParts = name.split(' - ')
    if (singleDashParts.length === 2) {
      // If first part is short (likely author name), use it
      const firstPart = singleDashParts[0].trim()
      if (firstPart.length < 50 && !firstPart.includes('_')) {
        return firstPart
      }
    }

    // Pattern 3: "Title _ Author"
    const underscoreParts = name.split('_')
    if (underscoreParts.length >= 2) {
      const lastPart = underscoreParts[underscoreParts.length - 1].trim()
      // If last part looks like a name (short, no special chars)
      if (lastPart.length < 50 && lastPart.length > 3) {
        return lastPart
      }
    }

    return undefined
  } catch (error) {
    return undefined
  }
}

/**
 * Generate a placeholder cover image (SVG data URI)
 * Duplicated from DocumentParser to ensure API route resilience
 */
function generatePlaceholderCover(title: string): string {
  // Generate a consistent color based on title hash
  const colors = [
    ['#FF5F6D', '#FFC371'], // Orange-Pink
    ['#11998e', '#38ef7d'], // Green
    ['#e65c00', '#F9D423'], // Orange-Yellow
    ['#2193b0', '#6dd5ed'], // Blue
    ['#cc2b5e', '#753a88'], // Purple-Pink
    ['#000046', '#1CB5E0'], // Dark Blue
  ]

  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colorIndex = Math.abs(hash % colors.length)
  const [color1, color2] = colors[colorIndex]

  // Create SVG
  const svg = `
    <svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)" />
      <text x="50%" y="40%" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="white" text-anchor="middle" dy=".3em">
        ${title.substring(0, 10)}
      </text>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="24" fill="white" fill-opacity="0.8" text-anchor="middle" dy=".3em">
        ${title.length > 10 ? title.substring(10, 20) + '...' : ''}
      </text>
    </svg>
  `.trim()

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

export async function POST(request: NextRequest) {
  try {
    const body: ParseRequest = await request.json()
    const { url, fileUrl, originalFilename, source = "web" } = body

    console.log(`[Reader Parse] Source=${source}, URL=${url || fileUrl}, Filename=${originalFilename}`)

    // ... (demo check) ...

    // Parse from URL or file
    const targetUrl = url || fileUrl
    if (!targetUrl) {
      return NextResponse.json({ error: "URL or fileUrl is required" }, { status: 400 })
    }

    // Determine fallback title early using originalFilename if available
    let fallbackTitle = 'Untitled'
    if (originalFilename) {
      fallbackTitle = originalFilename.replace(/\.(pdf|epub|txt|docx|mobi)$/i, '').trim()
    } else {
      fallbackTitle = extractTitleFromFilename(targetUrl)
    }

    // If it's an S3 URL, convert to presigned URL for downloading
    // ... (unchanged downloadUrl logic) ...
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

    // Determine final title
    const finalTitle = parseResult.metadata?.title || fallbackTitle

    // Determine final author
    // Priority: 1. From parsed metadata 2. From original filename
    let finalAuthor = parseResult.metadata?.author
    if (!finalAuthor && originalFilename) {
      finalAuthor = extractAuthorFromFilename(originalFilename)
    }

    // Ensure we have a cover image
    // Priority: 1. Client-provided cover (highest quality from browser)
    //           2. Server-extracted cover (from metadata)
    //           3. Placeholder (fallback)
    let coverImage = body.coverImage || parseResult.metadata?.coverImage
    if (!coverImage) {
      coverImage = generatePlaceholderCover(finalTitle)
    }

    // Update metadata if needed
    const metadata = {
      ...parseResult.metadata,
      title: finalTitle,
      author: finalAuthor,
      coverImage,
    }

    // Create book in database
    const book = db.createBook({
      id: bookId,
      title: finalTitle,
      author: finalAuthor,
      cover: coverImage,
      sourceUrl: targetUrl,
      metadata,
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
