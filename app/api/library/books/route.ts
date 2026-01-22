/**
 * GET /api/library/books - Get user's books from library
 * POST /api/library/books - Create a new book (with user association)
 * 
 * 🆕 User Data Isolation:
 * - Logged-in users: Only see their own books (filtered by userId)
 * - Guest users: Return empty array (they use localStorage on client)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/storage/database"
import { revalidatePath } from "next/cache"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Get current user session
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      // Guest user - return empty array
      // They should use localStorage on the client
      return NextResponse.json({
        books: [],
        total: 0,
        isGuest: true
      })
    }

    const userId = (session.user as any).id
    if (!userId) {
      console.error("[Library Books] User has no ID in session")
      return NextResponse.json({
        books: [],
        total: 0,
        error: "User ID not found"
      })
    }

    // Get all books and filter by userId
    const allBooks = await db.getAllBooks()
    const userBooks = allBooks.filter(book => book.userId === userId)

    // Strip heavy fields (blocks, chapters) to reduce payload size
    const books = userBooks.map(book => {
      const { blocks, ...rest } = book
      return rest
    })

    console.log(`[Library Books] Returning ${books.length} books for user ${userId}`)

    return NextResponse.json({
      books,
      total: books.length,
      userId
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
    // Get current user session
    const session = await getServerSession(authOptions)

    const body = await request.json()
    const { fileUrl, originalFilename, coverImage, fileType, author } = body

    if (!fileUrl) {
      return NextResponse.json(
        { error: "fileUrl is required" },
        { status: 400 }
      )
    }

    // Check if user is logged in
    if (!session?.user) {
      // Guest user - return book data for client-side localStorage
      const bookId = crypto.randomUUID()
      const filename = originalFilename || fileUrl.split('/').pop() || 'Untitled'
      let title = filename.replace(/\.(pdf|epub|txt|docx|mobi)$/i, '').trim()
      title = title.replace(/^\d+-[a-f0-9-]+?-/, '')
      if (title.includes(' -- ')) {
        title = title.split(' -- ')[0]
      }

      const ext = (originalFilename || fileUrl).split('.').pop()?.toLowerCase() || 'unknown'
      const detectedType = ext === 'pdf' ? 'pdf' : ext === 'epub' ? 'epub' : 'text'
      const cover = coverImage || generatePlaceholderCover(title)

      // Return book data for client to store locally
      return NextResponse.json({
        success: true,
        bookId,
        title,
        isLocal: true, // Flag to indicate client should store locally
        book: {
          id: bookId,
          title: title || 'Untitled',
          author: author || undefined,
          cover,
          format: detectedType,
          sourceUrl: fileUrl,
          progress: { updatedAt: new Date().toISOString() },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      })
    }

    // Logged-in user - save to cloud with userId
    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json(
        { error: "User ID not found in session" },
        { status: 401 }
      )
    }

    // Extract basic info from filename
    const filename = originalFilename || fileUrl.split('/').pop() || 'Untitled'
    let title = filename.replace(/\.(pdf|epub|txt|docx|mobi)$/i, '').trim()
    title = title.replace(/^\d+-[a-f0-9-]+?-/, '')
    if (title.includes(' -- ')) {
      title = title.split(' -- ')[0]
    }

    // Detect file type from extension
    const ext = (originalFilename || fileUrl).split('.').pop()?.toLowerCase() || 'unknown'
    const detectedType = ext === 'pdf' ? 'pdf' : ext === 'epub' ? 'epub' : 'text'

    // Generate placeholder cover if not provided
    const cover = coverImage || generatePlaceholderCover(title)

    // Create book record with userId
    const bookId = crypto.randomUUID()
    const book = {
      id: bookId,
      userId, // 🆕 Associate book with user
      title: title || 'Untitled',
      author: author || undefined,
      cover,
      format: detectedType as 'pdf' | 'epub' | 'text',
      sourceUrl: fileUrl,
      progress: {
        updatedAt: new Date()
      },
      status: 'ready' as const,
      source: 'upload' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await db.createBook(book)
    console.log(`[Library Books] Created book for user ${userId}: ${bookId} - ${title}`)

    // Revalidate library page to show new book
    revalidatePath("/library")
    revalidatePath("/[locale]/library")

    return NextResponse.json({
      success: true,
      bookId,
      title,
      userId
    })
  } catch (error) {
    console.error("[Library Books] POST Error:", error)
    return NextResponse.json(
      { error: "Failed to create book" },
      { status: 500 }
    )
  }
}

/**
 * Migrate local books to cloud storage
 * Called when a guest user logs in
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json(
        { error: "Must be logged in to migrate books" },
        { status: 401 }
      )
    }

    const userId = (session.user as any).id
    if (!userId) {
      return NextResponse.json(
        { error: "User ID not found in session" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { books: localBooks } = body

    if (!Array.isArray(localBooks) || localBooks.length === 0) {
      return NextResponse.json({
        success: true,
        migrated: 0
      })
    }

    let migratedCount = 0
    for (const localBook of localBooks) {
      try {
        // Create cloud book with userId
        const cloudBook = {
          ...localBook,
          id: localBook.id || crypto.randomUUID(),
          userId,
          createdAt: localBook.createdAt ? new Date(localBook.createdAt) : new Date(),
          updatedAt: new Date(),
        }

        // Remove local-only fields
        delete (cloudBook as any).isLocal

        await db.createBook(cloudBook)
        migratedCount++
        console.log(`[Library Books] Migrated book to cloud: ${cloudBook.id} - ${cloudBook.title}`)
      } catch (err) {
        console.error(`[Library Books] Failed to migrate book:`, localBook.id, err)
      }
    }

    // Revalidate library
    revalidatePath("/library")
    revalidatePath("/[locale]/library")

    return NextResponse.json({
      success: true,
      migrated: migratedCount,
      total: localBooks.length
    })
  } catch (error) {
    console.error("[Library Books] PUT Error:", error)
    return NextResponse.json(
      { error: "Failed to migrate books" },
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
