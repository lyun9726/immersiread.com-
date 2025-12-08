/**
 * GET /api/library/books
 * Get all books from library
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
