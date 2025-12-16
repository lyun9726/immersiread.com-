/**
 * GET /api/library/books/:bookId
 * Get a single book with its blocks and chapters
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

    // Get book metadata (async)
    const book = await db.getBook(bookId)
    if (!book) {
      return NextResponse.json(
        { error: "Book not found" },
        { status: 404 }
      )
    }

    // Get blocks (async)
    const blocks = await db.getBlocks(bookId)

    // Get chapters (async)
    const chapters = await db.getChapters(bookId)

    // Generate presigned URL if it's an S3 URL
    let sourceUrl = book.sourceUrl
    if (sourceUrl && (sourceUrl.includes('.s3.') || sourceUrl.includes('s3.amazonaws.com'))) {
      try {
        // Extract key from URL
        const urlParts = sourceUrl.split('amazonaws.com/')
        if (urlParts.length > 1) {
          const key = urlParts[1]
          sourceUrl = await getPresignedDownloadUrl(key)
        }
      } catch (err) {
        console.error("Failed to presign URL:", err)
      }
    }

    // Return book with presigned URL
    const bookWithUrl = {
      ...book,
      sourceUrl
    }

    return NextResponse.json({
      book: bookWithUrl,
      blocks,
      chapters,
      totalBlocks: blocks.length,
      totalChapters: chapters.length,
    })
  } catch (error) {
    console.error("[Library Book Details] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch book details" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/library/books/:bookId
 * Update a book's metadata or progress
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params
    const updates = await request.json()

    // check if book exists (async)
    const book = await db.getBook(bookId)
    if (!book) {
      return NextResponse.json(
        { error: "Book not found" },
        { status: 404 }
      )
    }

    // Update book in DB (async)
    const updatedBook = await db.updateBook(bookId, updates)

    return NextResponse.json({
      book: updatedBook,
      message: "Book updated successfully"
    })
  } catch (error) {
    console.error("[Library Update Book] Error:", error)
    return NextResponse.json(
      { error: "Failed to update book" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/library/books/:bookId
 * Delete a book from the library
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params

    // Check if book exists (async)
    const book = await db.getBook(bookId)
    if (!book) {
      return NextResponse.json(
        { error: "Book not found" },
        { status: 404 }
      )
    }

    // Delete the book (async)
    const deleted = await db.deleteBook(bookId)

    if (!deleted) {
      return NextResponse.json(
        { error: "Failed to delete book" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: "Book deleted successfully",
      bookId,
    })
  } catch (error) {
    console.error("[Library Delete Book] Error:", error)
    return NextResponse.json(
      { error: "Failed to delete book" },
      { status: 500 }
    )
  }
}
