/**
 * Real adapter for parsing different file formats
 * Supports PDF, EPUB, TXT, DOCX, and web content
 */

import type { ParseResult, ReaderBlock, Chapter } from "../../types"
import { DocumentParser } from "./DocumentParser"

export class ReaderAdapterStub {
  private documentParser = new DocumentParser()

  async parseFromUrl(url: string): Promise<ParseResult> {
    console.log(`[ReaderAdapter] Parsing URL: ${url}`)

    // Check for demo path
    if (url.includes("/mnt/data/5321c35c-86d2-43e9-b68d-8963068f3405.png")) {
      return this.getDemoParseResult()
    }

    try {
      // Fetch the file from URL
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const contentType = response.headers.get('content-type') || 'application/octet-stream'

      // Parse with real parser
      return await this.parseFromBuffer(buffer, contentType)
    } catch (error) {
      console.error(`[ReaderAdapter] Error parsing URL: ${error}`)
      // Fallback to stub data
      return this.getStubParseResult(url)
    }
  }

  async parseFromBuffer(buffer: Buffer, contentType: string): Promise<ParseResult> {
    console.log(`[ReaderAdapter] Parsing buffer of type: ${contentType}`)

    try {
      // Use real document parser
      return await this.documentParser.parseFromBuffer(buffer, contentType)
    } catch (error) {
      console.error(`[ReaderAdapter] Error parsing buffer: ${error}`)
      // Fallback to stub data
      return this.getStubParseResult(contentType)
    }
  }

  private getStubParseResult(source: string): ParseResult {
    const blocks: ReaderBlock[] = [
      {
        id: "stub-1",
        order: 1,
        type: "text",
        content: "Failed to parse document. Please try uploading a different file.",
      },
      {
        id: "stub-2",
        order: 2,
        type: "text",
        content: `Source: ${source}`,
      },
    ]

    return {
      blocks,
      metadata: {
        title: undefined, // Let API handle fallback to filename
        sourceUrl: source,
      },
    }
  }

  async parseHTML(html: string, url?: string): Promise<ParseResult> {
    console.log(`[ReaderAdapter] Parsing HTML (${html.length} characters)`)

    // Very basic paragraph extraction (stub)
    // In production, use @mozilla/readability or similar
    const paragraphs = html
      .split(/<\/p>|<br\s*\/?>/)
      .map((p) => p.replace(/<[^>]+>/g, "").trim())
      .filter((p) => p.length > 20)

    const blocks: ReaderBlock[] = paragraphs.slice(0, 50).map((text, i) => ({
      id: `p-${i + 1}`,
      order: i + 1,
      type: "text",
      content: text,
    }))

    return {
      blocks,
      metadata: {
        title: "Web Article",
        sourceUrl: url,
      },
    }
  }

  private getDemoParseResult(): ParseResult {
    const blocks: ReaderBlock[] = [
      {
        id: "demo-h1",
        order: 1,
        type: "heading",
        content: "Demo Article - Chapter One",
        meta: {
          level: 1,
          chapterTitle: "Chapter One",
        },
      },
      {
        id: "demo-1",
        order: 2,
        type: "text",
        content: "Demo paragraph one. This is the first paragraph of our demo article.",
        meta: {
          chapterTitle: "Chapter One",
        },
      },
      {
        id: "demo-2",
        order: 3,
        type: "text",
        content: "Demo paragraph two. Here we continue with more demonstration content.",
        meta: {
          chapterTitle: "Chapter One",
        },
      },
      {
        id: "demo-h2",
        order: 4,
        type: "heading",
        content: "Chapter Two - Continuation",
        meta: {
          level: 1,
          chapterTitle: "Chapter Two",
        },
      },
      {
        id: "demo-3",
        order: 5,
        type: "text",
        content: "Demo paragraph three. This completes our simple demonstration.",
        meta: {
          chapterTitle: "Chapter Two",
        },
      },
    ]

    const chapters: Chapter[] = [
      {
        id: "ch-1",
        title: "Chapter One",
        order: 1,
        blockIds: ["demo-h1", "demo-1", "demo-2"],
      },
      {
        id: "ch-2",
        title: "Chapter Two",
        order: 2,
        blockIds: ["demo-h2", "demo-3"],
      },
    ]

    return {
      blocks,
      chapters,
      metadata: {
        title: "Demo Article from Local File",
        author: "Demo Author",
        language: "en",
      },
    }
  }
}
