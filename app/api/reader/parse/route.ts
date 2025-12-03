/**
 * POST /api/reader/parse
 * Parse a document and create a book
 */

import { NextRequest, NextResponse } from "next/server"
import type { ParseRequest, ParseResponse } from "@/lib/types"
import { readerEngine } from "@/lib/reader/ReaderEngine"
import { db } from "@/lib/storage/inMemoryDB"

export async function POST(request: NextRequest) {
  try {
    const body: ParseRequest = await request.json()
    const { url, fileUrl, source = "web" } = body

    console.log(`[Reader Parse] Source=${source}, URL=${url || fileUrl}`)

    // Check for demo path
    if ((url && url.includes("/mnt/data/5321c35c-86d2-43e9-b68d-8963068f3405.png")) ||
        (fileUrl && fileUrl.includes("/mnt/data/5321c35c-86d2-43e9-b68d-8963068f3405.png"))) {
      // Create demo book
      const bookId = "demo-book-1"
      const book = db.createBook({
        id: bookId,
        title: "Demo Article from Local File",
        sourceUrl: url || fileUrl,
      })

      const blocks = [
        { id: "demo-1", order: 1, text: "Demo paragraph one." },
        { id: "demo-2", order: 2, text: "Demo paragraph two." },
        { id: "demo-3", order: 3, text: "Demo paragraph three." },
      ]

      db.setBlocks(bookId, blocks)

      const response: ParseResponse = {
        bookId,
      }

      return NextResponse.json(response)
    }

    // Parse from URL or file
    const targetUrl = url || fileUrl
    if (!targetUrl) {
      return NextResponse.json({ error: "URL or fileUrl is required" }, { status: 400 })
    }

    // Use ReaderEngine to parse
    const parseResult = await readerEngine.parseFromUrl(targetUrl)

    // Generate bookId
    const bookId = `book-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Create book in database
    const book = db.createBook({
      id: bookId,
      title: parseResult.metadata?.title || "Untitled",
      sourceUrl: targetUrl,
      metadata: parseResult.metadata,
    })

    // Save blocks
    db.setBlocks(bookId, parseResult.blocks)

    console.log(`[Reader Parse] Created book ${bookId} with ${parseResult.blocks.length} blocks`)

    const response: ParseResponse = {
      bookId,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("[Reader Parse] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
