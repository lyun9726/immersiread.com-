/**
 * Stub adapter for parsing different file formats
 * This returns mock data for demo purposes
 *
 * In production, swap with real parsers:
 * - PDF: pdf-parse, pdfjs-dist
 * - EPUB: epub.js, epub2txt
 * - Web: @mozilla/readability
 * - DOCX: mammoth
 */

import type { ParseResult, ReaderBlock } from "../../types"

export class ReaderAdapterStub {
  async parseFromUrl(url: string): Promise<ParseResult> {
    console.log(`[ReaderAdapter] Parsing URL: ${url}`)

    // Check for demo path
    if (url.includes("/mnt/data/5321c35c-86d2-43e9-b68d-8963068f3405.png")) {
      return this.getDemoParseResult()
    }

    // Stub implementation
    return {
      blocks: [
        {
          id: "stub-1",
          order: 1,
          text: "This is a stub parser. Implement real parsing logic here.",
        },
        {
          id: "stub-2",
          order: 2,
          text: `Content from: ${url}`,
        },
      ],
      metadata: {
        title: "Stub Document",
        sourceUrl: url,
      },
    }
  }

  async parseFromBuffer(buffer: Buffer, contentType: string): Promise<ParseResult> {
    console.log(`[ReaderAdapter] Parsing buffer of type: ${contentType}`)

    // Stub implementation
    return {
      blocks: [
        {
          id: "stub-buffer-1",
          order: 1,
          text: `Content parsed from ${contentType} buffer`,
        },
      ],
      metadata: {
        title: "Buffer Document",
        contentType,
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
      text,
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
    return {
      blocks: [
        {
          id: "demo-1",
          order: 1,
          text: "Demo paragraph one. This is the first paragraph of our demo article.",
        },
        {
          id: "demo-2",
          order: 2,
          text: "Demo paragraph two. Here we continue with more demonstration content.",
        },
        {
          id: "demo-3",
          order: 3,
          text: "Demo paragraph three. This completes our simple demonstration.",
        },
      ],
      metadata: {
        title: "Demo Article from Local File",
        author: "Demo Author",
        language: "en",
      },
    }
  }
}
