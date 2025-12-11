/**
 * GET /api/library/books - Get all books from library
 * POST /api/library/books - Create a new book instantly (no parsing)
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/storage/inMemoryDB"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const books = db.getAllBooks()

    return NextResponse.json({
      books,
      total: books.length
    })
  } catch (error) {
    console.error("[Library Books] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch books" },
      { status: 500 }
    )
  }
}

/**
 * Create a book record instantly without parsing
 * Parsing will happen lazily when the book is opened
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fileUrl, originalFilename, coverImage, fileType } = body

    if (!fileUrl) {
      return NextResponse.json(
        { error: "fileUrl is required" },
        { status: 400 }
      )
    }

    // Extract basic info from filename
    const filename = originalFilename || fileUrl.split('/').pop() || 'Untitled'
    let title = filename.replace(/\.(pdf|epub|txt|docx|mobi)$/i, '').trim()

    // Remove UUID prefix if present
    title = title.replace(/^\d+-[a-f0-9-]+?-/, '')

    // If title contains " -- ", take the part before it
    if (title.includes(' -- ')) {
      title = title.split(' -- ')[0]
    }

    // Detect file type from extension
    const ext = (originalFilename || fileUrl).split('.').pop()?.toLowerCase() || 'unknown'
    const detectedType = ext === 'pdf' ? 'pdf' : ext === 'epub' ? 'epub' : 'text'

    // Generate placeholder cover if not provided
    const cover = coverImage || generatePlaceholderCover(title)

    // Create book record
    const bookId = crypto.randomUUID()
    const book = {
      id: bookId,
      title: title || 'Untitled',
      author: undefined,
      cover,
      format: detectedType as 'pdf' | 'epub' | 'text',
      fileUrl,
      progress: {
        updatedAt: new Date()
      },
      status: 'ready' as const,
      source: 'upload' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    db.createBook(book)
    console.log(`[Library Books] Created book instantly: ${bookId} - ${title}`)

    return NextResponse.json({
      success: true,
      bookId,
      title
    })
  } catch (error) {
    console.error("[Library Books] POST Error:", error)
    return NextResponse.json(
      { error: "Failed to create book" },
      { status: 500 }
    )
  }
}

function generatePlaceholderCover(title: string): string {
  const colors = [
    ['#FF5F6D', '#FFC371'],
    ['#11998e', '#38ef7d'],
    ['#e65c00', '#F9D423'],
    ['#2193b0', '#6dd5ed'],
    ['#cc2b5e', '#753a88'],
    ['#000046', '#1CB5E0'],
  ]

  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash)
  }
  const [color1, color2] = colors[Math.abs(hash % colors.length)]

  const svg = `
    <svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)" />
      <text x="50%" y="45%" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="white" text-anchor="middle">
        ${title.substring(0, 12)}
      </text>
    </svg>
  `.trim()

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
