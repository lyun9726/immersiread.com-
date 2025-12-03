/**
 * POST /api/ingest/url
 * Fetch and preview content from a URL
 */

import { NextRequest, NextResponse } from "next/server"
import type { IngestURLRequest, IngestURLResponse } from "@/lib/types"
import { readerEngine } from "@/lib/reader/ReaderEngine"

// SSRF Protection: Block private/local IPs
const BLOCKED_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^::ffff:127\./,
  /^fc00:/,
  /^fe80:/,
]

function isBlockedURL(url: string): boolean {
  try {
    const urlObj = new URL(url)

    // Block localhost
    if (urlObj.hostname === "localhost") return true

    // Block private IP ranges
    for (const pattern of BLOCKED_IP_RANGES) {
      if (pattern.test(urlObj.hostname)) return true
    }

    return false
  } catch {
    return true
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: IngestURLRequest = await request.json()
    const { url, previewOnly = false, previewTranslated = false, targetLang = "zh" } = body

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    console.log(`[Ingest URL] Processing: ${url}, preview=${previewOnly}`)

    // Check for demo path
    if (url.includes("/mnt/data/5321c35c-86d2-43e9-b68d-8963068f3405.png")) {
      const response: IngestURLResponse = {
        title: "Demo Article from Local File",
        blocks: [
          { id: "d1", order: 1, text: "Demo paragraph one." },
          { id: "d2", order: 2, text: "Demo paragraph two." },
          { id: "d3", order: 3, text: "Demo paragraph three." },
        ],
      }
      return NextResponse.json(response)
    }

    // SSRF Protection
    if (isBlockedURL(url)) {
      return NextResponse.json(
        { error: "Access to private/local URLs is not allowed" },
        { status: 403 }
      )
    }

    // Fetch URL with timeout and size limit
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

    try {
      const fetchResponse = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ReaderBot/1.0)",
        },
      })

      clearTimeout(timeout)

      if (!fetchResponse.ok) {
        return NextResponse.json(
          { error: `Failed to fetch URL: ${fetchResponse.statusText}` },
          { status: fetchResponse.status }
        )
      }

      const contentType = fetchResponse.headers.get("content-type") || ""

      // Check content type
      if (contentType.includes("text/html")) {
        // Read response with size limit (2MB)
        const reader = fetchResponse.body?.getReader()
        if (!reader) {
          return NextResponse.json({ error: "Failed to read response" }, { status: 500 })
        }

        const chunks: Uint8Array[] = []
        let totalSize = 0
        const maxSize = 2 * 1024 * 1024 // 2MB

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          totalSize += value.length
          if (totalSize > maxSize) {
            reader.cancel()
            return NextResponse.json({ error: "Response too large" }, { status: 413 })
          }

          chunks.push(value)
        }

        const buffer = Buffer.concat(chunks)
        const html = buffer.toString("utf-8")

        // Parse HTML
        const parseResult = await readerEngine.parseHTML(html, url)

        // Return preview if requested
        if (previewOnly) {
          const previewBlocks = parseResult.blocks.slice(0, 5)
          const response: IngestURLResponse = {
            title: parseResult.metadata?.title,
            blocks: previewBlocks,
          }
          return NextResponse.json(response)
        }

        // Return full result
        const response: IngestURLResponse = {
          title: parseResult.metadata?.title,
          blocks: parseResult.blocks,
        }
        return NextResponse.json(response)
      } else if (contentType.includes("application/pdf") || contentType.includes("application/epub")) {
        // For PDF/EPUB, return jobId for async processing
        const response: IngestURLResponse = {
          title: "Document",
          blocks: [],
          jobId: `job-${Date.now()}`,
        }
        return NextResponse.json(response)
      } else {
        return NextResponse.json(
          { error: `Unsupported content type: ${contentType}` },
          { status: 400 }
        )
      }
    } catch (err) {
      clearTimeout(timeout)

      if ((err as Error).name === "AbortError") {
        return NextResponse.json({ error: "Request timeout" }, { status: 408 })
      }

      throw err
    }
  } catch (error) {
    console.error("[Ingest URL] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
