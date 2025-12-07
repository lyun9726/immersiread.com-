/**
 * GET /api/library/books/:bookId
 * Get a single book with its blocks and chapters
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/storage/inMemoryDB"
import { getPresignedDownloadUrl } from "@/lib/storage/s3Client"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params

    // Get book metadata
    const book = db.getBook(bookId)
    if (!book) {
      return NextResponse.json(
        { error: "Book not found" },
        { status: 404 }
      )
    }

    // Get blocks
    const blocks = db.getBlocks(bookId)

    // Get chapters
    const chapters = db.getChapters(bookId)

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
 * DELETE /api/library/books/:bookId
 * Delete a book from the library
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params

    // Check if book exists
    const book = db.getBook(bookId)
    if (!book) {
      return NextResponse.json(
        { error: "Book not found" },
        { status: 404 }
      )
    }

    // Delete the book (this will also delete associated blocks and chapters)
    const deleted = db.deleteBook(bookId)

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
