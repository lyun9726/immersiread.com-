/**
 * GET /api/library/books/:bookId
 * Get a single book with its blocks and chapters
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/storage/database"
import { getPresignedDownloadUrl } from "@/lib/storage/s3Client"
import { revalidatePath } from "next/cache"

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
        console.error("Failed to presign source URL:", err)
      }
    }

    // Generate presigned URL for translated PDF if it's an S3 URL
    let translatedFileUrl = book.translatedFileUrl
    if (translatedFileUrl && (translatedFileUrl.includes('.s3.') || translatedFileUrl.includes('s3.amazonaws.com'))) {
      try {
        // Extract key from URL
        const urlParts = translatedFileUrl.split('amazonaws.com/')
        if (urlParts.length > 1) {
          const key = urlParts[1]
          translatedFileUrl = await getPresignedDownloadUrl(key)
        }
      } catch (err) {
        console.error("Failed to presign translated URL:", err)
      }
    }

    // Return book with presigned URLs
    const bookWithUrl = {
      ...book,
      sourceUrl,
      translatedFileUrl
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

    // Sync reading progress between original and translated book versions
    if (updates.progress) {
      let linkedBookId: string | undefined

      if (book.isTranslation && book.parentBookId) {
        // This is a translated book, sync progress to original
        linkedBookId = book.parentBookId
      } else if (book.translatedBookId) {
        // This is the original book, sync progress to translated version
        linkedBookId = book.translatedBookId
      }

      if (linkedBookId) {
        try {
          await db.updateBook(linkedBookId, { progress: updates.progress })
          console.log(`[Library Update Book] Synced progress to linked book: ${linkedBookId}`)
        } catch (syncError) {
          console.warn(`[Library Update Book] Failed to sync progress to ${linkedBookId}:`, syncError)
          // Don't fail the main request if sync fails
        }
      }
    }

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

    // Revalidate library page to show updated list
    revalidatePath("/library")
    revalidatePath("/[locale]/library")

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
