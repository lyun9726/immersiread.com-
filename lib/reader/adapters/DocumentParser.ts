/**
 * Real document parser for different file formats
 * Supports: PDF, EPUB, TXT, DOCX
 */

import type { ParseResult, ReaderBlock, Chapter } from "../../types"

// Type declarations for libraries
// @ts-ignore
declare module 'pdf-parse' {
  interface PDFData {
    numpages: number
    numrender: number
    info: {
      PDFFormatVersion?: string
      IsAcroFormPresent?: boolean
      IsXFAPresent?: boolean
      Title?: string
      Author?: string
      Subject?: string
      Creator?: string
      Producer?: string
      CreationDate?: string
      ModDate?: string
    }
    metadata: any
    text: string
    version: string
  }

  function pdfParse(dataBuffer: Buffer, options?: any): Promise<PDFData>
  export default pdfParse
}

declare module 'epub2' {
  export class EPub {
    constructor(epubfile: string | Buffer, imagewebroot?: string, chapterwebroot?: string)
    on(event: 'end', callback: () => void): void
    on(event: 'error', callback: (error: Error) => void): void
    parse(): void
    metadata: {
      title?: string
      creator?: string
      language?: string
      publisher?: string
      description?: string
    }
    flow: Array<{
      id: string
      title?: string
      order?: number
    }>
    getChapter(chapterId: string, callback: (error: Error | null, text: string) => void): void
  }
}

declare module 'mammoth' {
  export function extractRawText(options: { buffer: Buffer }): Promise<{ value: string }>
}

/**
 * Generate a placeholder cover image (SVG data URI)
 */
function generatePlaceholderCover(title: string): string {
  // Generate a consistent color based on title hash
  const colors = [
    ['#FF5F6D', '#FFC371'], // Orange-Pink
    ['#11998e', '#38ef7d'], // Green
    ['#e65c00', '#F9D423'], // Orange-Yellow
    ['#2193b0', '#6dd5ed'], // Blue
    ['#cc2b5e', '#753a88'], // Purple-Pink
    ['#000046', '#1CB5E0'], // Dark Blue
  ]

  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colorIndex = Math.abs(hash % colors.length)
  const [color1, color2] = colors[colorIndex]

  // Create SVG
  const svg = `
    <svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)" />
      <text x="50%" y="40%" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="white" text-anchor="middle" dy=".3em">
        ${title.substring(0, 10)}
      </text>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="24" fill="white" fill-opacity="0.8" text-anchor="middle" dy=".3em">
        ${title.length > 10 ? title.substring(10, 20) + '...' : ''}
      </text>
    </svg>
  `.trim()

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

/**
 * Analyzes text to identify chapter boundaries
 */
export class ChapterDetector {
  private static readonly CHAPTER_PATTERNS = [
    /^第[一二三四五六七八九十百千0-9]+[章节回]/m,  // Chinese chapters
    /^Chapter\s+[0-9IVXLCDM]+/im,  // English chapters with numbers
    /^CHAPTER\s+[0-9IVXLCDM]+/m,  // Uppercase chapters
    /^第\s*\d+\s*章/m,  // 第1章, 第 2 章
    /^\d+\.\s+/m,  // 1. Chapter Title
    /^[A-Z][A-Z\s]{10,}$/m,  // ALL CAPS TITLES (at least 10 chars)
  ]

  /**
   * Detect chapters from blocks
   */
  static detectChapters(blocks: ReaderBlock[]): { blocks: ReaderBlock[], chapters: Chapter[] } {
    const chapters: Chapter[] = []
    const updatedBlocks: ReaderBlock[] = []
    let currentChapter: Chapter | null = null
    let chapterIndex = 0

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      const content = typeof block.content === 'string' ? block.content : ''

      // Check if this block is a chapter heading
      const isChapterHeading = this.isChapterHeading(content)

      if (isChapterHeading) {
        // Close previous chapter
        if (currentChapter) {
          chapters.push(currentChapter)
        }

        // Create new chapter
        chapterIndex++
        const chapterId = `ch-${chapterIndex}`
        const chapterTitle = this.extractChapterTitle(content)

        currentChapter = {
          id: chapterId,
          title: chapterTitle,
          order: chapterIndex,
          blockIds: [],
        }

        // Mark block as heading
        updatedBlocks.push({
          ...block,
          type: 'heading',
          meta: {
            ...block.meta,
            level: 1,
            chapterTitle,
            chapterId,
          },
        })
        currentChapter.blockIds.push(block.id)
      } else {
        // Regular block
        if (currentChapter) {
          updatedBlocks.push({
            ...block,
            meta: {
              ...block.meta,
              chapterTitle: currentChapter.title,
              chapterId: currentChapter.id,
            },
          })
          currentChapter.blockIds.push(block.id)
        } else {
          // No chapter yet, add to blocks without chapter info
          updatedBlocks.push(block)
        }
      }
    }

    // Close last chapter
    if (currentChapter) {
      chapters.push(currentChapter)
    }

    return { blocks: updatedBlocks, chapters }
  }

  private static isChapterHeading(text: string): boolean {
    // Empty or very short text is not a chapter
    if (!text || text.length < 3) return false

    // Check against patterns
    return this.CHAPTER_PATTERNS.some(pattern => pattern.test(text))
  }

  private static extractChapterTitle(text: string): string {
    // Clean up the title
    let title = text.trim()

    // Remove excessive whitespace
    title = title.replace(/\s+/g, ' ')

    // Limit length
    if (title.length > 100) {
      title = title.substring(0, 100) + '...'
    }

    return title || 'Untitled Chapter'
  }
}

/**
 * PDF Parser
 */
/**
 * PDF Parser with Coordinate Support and Fallback
 */
export class PDFParser {
  async parse(buffer: Buffer): Promise<ParseResult> {
    try {
      console.log('[PDFParser] Attempting advanced parsing with pdfjs-dist...')
      // 1. Try Advanced Parsing (pdfjs-dist) first
      return await this.parseWithPDFJS(buffer)
    } catch (error) {
      console.warn('[PDFParser] Advanced parsing failed:', error)
      console.warn('[PDFParser] Falling back to simple text extraction.')
      // 2. Fallback to Simple Parsing (pdf-parse)
      return await this.parseWithSimpleExtractor(buffer)
    }
  }

  private async parseWithPDFJS(buffer: Buffer): Promise<ParseResult> {
    // Dynamic import for pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

    // FIX: Force workerSrc to absolute path in node_modules to bypass bundling issues
    // Use file:// URL for Windows compatibility
    // This is required because Next.js bundling confuses pdfjs worker loading in Node environment
    try {
      const path = await import('path');
      const { pathToFileURL } = await import('url');
      const workerPath = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
      console.log('[PDFParser] Set workerSrc to:', pdfjsLib.GlobalWorkerOptions.workerSrc);
    } catch (e) {
      console.warn('[PDFParser] Failed to set workerSrc, attempting default load:', e);
    }

    // Convert buffer to Uint8Array
    const uint8Array = new Uint8Array(buffer)

    // Load document
    // Note: Removed standardFontDataUrl as it causes issues in some envs
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      disableFontFace: true,
      verbosity: 0,
    })

    const doc = await loadingTask.promise
    console.log(`[PDFParser] Document loaded. Pages: ${doc.numPages}`)

    const blocks: ReaderBlock[] = []
    let blockIdCounter = 0

    const metadataPromise = doc.getMetadata().catch((e) => {
      console.warn('[PDFParser] Metadata extraction warning:', e)
      return { info: null, metadata: null }
    })

    // Iterate through pages
    for (let i = 1; i <= doc.numPages; i++) {
      try {
        const page = await doc.getPage(i)
        const viewport = page.getViewport({ scale: 1.0 })
        const textContent = await page.getTextContent()

        // Group text items into blocks (paragraphs)
        const pageBlocks = this.groupTextItemsToBlocks(textContent.items as any[], viewport, i)

        if (pageBlocks.length > 0) {
          // console.log(`[PDFParser] Page ${i}: Extracted ${pageBlocks.length} blocks`)
        }

        for (const pb of pageBlocks) {
          blockIdCounter++
          blocks.push({
            id: `block-${blockIdCounter}`,
            order: blockIdCounter,
            type: 'text',
            content: pb.text,
            pdfItems: pb.pdfItems, // Include word-level coordinates for karaoke
            meta: {
              pageNumber: i,
              bbox: pb.bbox,
            }
          })
        }
        // Cleanup page
        page.cleanup()
      } catch (pageError) {
        console.error(`[PDFParser] Error parsing page ${i}:`, pageError)
        // Continue to next page
      }
    }

    doc.destroy()

    if (blocks.length === 0) {
      throw new Error("No text blocks extracted with PDFJS (empty result)")
    }

    // Detect chapters based on the new blocks
    const { blocks: enhancedBlocks, chapters } = ChapterDetector.detectChapters(blocks)

    // Extract metadata
    const { info } = await metadataPromise
    let title = info?.Title || 'Untitled'
    let author = info?.Author

    // Clean title/author
    if (typeof title === 'string') title = title.trim()
    if (!title) title = 'Untitled'
    if (typeof author === 'string') author = author.trim()

    const coverImage = generatePlaceholderCover(title)

    return {
      blocks: enhancedBlocks,
      chapters,
      metadata: {
        title,
        author,
        language: 'en', // Detect?
        coverImage,
      },
    }
  }

  private async parseWithSimpleExtractor(buffer: Buffer): Promise<ParseResult> {
    const pdfParse = (await import('pdf-parse')).default
    const data = await pdfParse(buffer)

    const paragraphs = data.text
      .split(/\n\n+/)
      .map(p => p.trim().replace(/\s+/g, ' '))
      .filter(p => p.length > 20)

    const blocks: ReaderBlock[] = paragraphs.map((text, i) => ({
      id: `block-${i + 1}`,
      order: i + 1,
      type: 'text',
      content: text,
    }))

    const { blocks: enhancedBlocks, chapters } = ChapterDetector.detectChapters(blocks)

    return {
      blocks: enhancedBlocks,
      chapters,
      metadata: {
        title: 'Document (Simple View)',
        coverImage: generatePlaceholderCover('Document'),
      }
    }
  }

  private groupTextItemsToBlocks(items: any[], viewport: any, pageNumber: number) {
    // Sort items by Y (descending for PDF coord system, but let's look at visual top-down)
    // PDF coords: (0,0) is bottom-left. Y increases upwards.
    // So top items have higher Y.
    // We want to sort by Y descending (top to bottom), then X ascending.

    // Filter empty items
    const validItems = items.filter(item => item.str.trim().length > 0)

    if (validItems.length === 0) return []

    // Helper to get visual coordinates
    // transform: [scaleX, skewY, skewX, scaleY, x, y]
    const getRect = (item: any) => {
      const x = item.transform[4]
      const y = item.transform[5]
      // This 'y' is the baseline. 
      // Approximate height from item.height usually works or transform[3] which is font height scaling
      const h = item.height || item.transform[3]
      const w = item.width
      // Convert to visual top-left Y: viewport.height - (y + h)? Or just use y as baseline.
      // Let's keep PDF coords for grouping, convert to % at the end.
      return { x, y, w, h }
    }

    validItems.sort((a, b) => {
      const rectA = getRect(a)
      const rectB = getRect(b)
      // Sort by Y descending (top first), with some tolerance for same line
      const yDiff = rectB.y - rectA.y
      if (Math.abs(yDiff) > 5) return yDiff // distinct lines
      return rectA.x - rectB.x // same line, left to right
    })

    const groupedBlocks: { text: string, pdfItems?: any[], bbox: { x: number, y: number, w: number, h: number } }[] = []

    let currentBlockItems: any[] = []
    let lastItemRect: any = null

    for (const item of validItems) {
      const rect = getRect(item)

      if (!lastItemRect) {
        currentBlockItems.push(item)
      } else {
        // Determine if same block
        // 1. Vertical distance check (is it a new paragraph?)
        // In PDF coords, higher Y is higher up.
        // lastItem is "previous" in reading order.
        // If current item Y is significantly LOWER than last item Y, it's a new line/block.

        const verticalGap = lastItemRect.y - rect.y // expected positive

        // If gap is large (e.g. > 2.5 * line height), likely new paragraph
        const lineHeight = lastItemRect.h || 10

        // Check if previous line ended with sentence-ending punctuation
        const lastItemText = currentBlockItems[currentBlockItems.length - 1]?.str || ''
        const endsWithPunctuation = /[。？！.?!]$/.test(lastItemText.trim())

        // Check if previous line ended early (short line heuristic)
        const pageWidth = viewport.width
        const lastItemRight = lastItemRect.x + lastItemRect.w
        // Margin threshold: if blank space on right is > 30% of page width
        const isShortLine = (pageWidth - lastItemRight) > (pageWidth * 0.3)

        // Split conditions:
        // 1. Large vertical gap (new paragraph) = gap > 2.5x line height
        // 2. Short line that ends with punctuation = intentional break
        // 3. Very short line (> 50% margin) + some gap = likely title/heading
        const isLargeGap = verticalGap > lineHeight * 2.5
        const isIntentionalBreak = isShortLine && endsWithPunctuation && verticalGap > lineHeight * 0.3
        const isHeading = (pageWidth - lastItemRight) > (pageWidth * 0.5) && verticalGap > lineHeight * 0.5

        if (isLargeGap || isIntentionalBreak || isHeading) {
          // New block
          this.finalizeBlock(groupedBlocks, currentBlockItems, viewport)
          currentBlockItems = [item]
        } else {
          // Same block (continue paragraph across lines)
          currentBlockItems.push(item)
        }
      }
      lastItemRect = rect
    }

    // Finalize last block
    if (currentBlockItems.length > 0) {
      this.finalizeBlock(groupedBlocks, currentBlockItems, viewport)
    }

    return groupedBlocks
  }

  private finalizeBlock(
    blocks: { text: string, pdfItems?: any[], bbox: any }[],
    items: any[],
    viewport: any
  ) {
    if (items.length === 0) return

    // Join text and build pdfItems map - split into WORDS for karaoke highlighting
    let currentText = ""
    const pdfItems: { str: string; offset: number; bbox: any }[] = []

    // Sort items by Y descending (top first), then X ascending (left to right)
    // This preserves the correct reading order for multi-line blocks
    items.sort((a, b) => {
      const yA = a.transform[5]
      const yB = b.transform[5]
      const yDiff = yB - yA // Higher Y = higher up on page = first
      if (Math.abs(yDiff) > 3) return yDiff // Different lines
      return a.transform[4] - b.transform[4] // Same line, left to right
    })

    for (const item of items) {
      const str = item.str.trim()
      if (str.length === 0) continue

      // Get item position and size
      const itemX = item.transform[4]
      const itemY = item.transform[5]
      const itemW = item.width || 0
      const itemH = item.height || item.transform[3]

      // Calculate average character width for position estimation
      const avgCharWidth = str.length > 0 ? itemW / str.length : 0

      // Check if text contains Chinese characters
      const hasChinese = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(str)

      if (hasChinese) {
        // For Chinese: split into individual characters
        // Each Chinese character becomes a separate pdfItem for precise highlighting
        for (let i = 0; i < str.length; i++) {
          const char = str[i]

          // Skip whitespace
          if (/\s/.test(char)) {
            currentText += char
            continue
          }

          // Calculate char position
          const charX = itemX + (i * avgCharWidth)
          const charW = avgCharWidth

          const offset = currentText.length
          currentText += char

          pdfItems.push({
            str: char,
            offset,
            bbox: { x: charX, y: itemY, w: charW, h: itemH }
          })
        }
      } else {
        // For English/other: split by whitespace into words
        const words = str.split(/(\s+)/)
        let charPos = 0

        for (const word of words) {
          if (word.trim().length === 0) {
            currentText += word
            charPos += word.length
            continue
          }

          const wordX = itemX + (charPos * avgCharWidth)
          const wordW = word.length * avgCharWidth

          const offset = currentText.length
          currentText += word

          pdfItems.push({
            str: word,
            offset,
            bbox: { x: wordX, y: itemY, w: wordW, h: itemH }
          })

          charPos += word.length
        }
      }
    }

    const text = currentText


    if (text.length < 5) return // Ignore artifacts/page numbers usually

    // Compute bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const item of items) {
      const x = item.transform[4]
      const y = item.transform[5] // baseline
      const w = item.width
      const h = item.height || item.transform[3]

      // PDF Coords: (0,0) bottom-left
      // For logic:
      // x, x+w is horizontal range
      // y, y+h is vertical range (y is usually bottom, so y+h is top)

      if (x < minX) minX = x
      if (x + w > maxX) maxX = x + w
      if (y < minY) minY = y
      if (y + h > maxY) maxY = y + h
    }

    // Convert to normalized coordinates (0-100%)
    // Viewport origin is (0,0) at top-left?
    // No, PDF raw coords are bottom-left.
    // We want to output standard top-left percent coords for HTML/CSS use.
    // HTML X = PDF X
    // HTML Y = Viewport Height - PDF Max Y (top of elements)

    const vW = viewport.width
    const vH = viewport.height

    // Visual BBox Top-Left based on PDF (Bottom-Left) coords
    // The "Top" of the block in PDF coords is maxY
    // The "Bottom" of the block in PDF coords is minY

    // CSS Top = vH - maxY
    // CSS Bottom = vH - minY
    // CSS Height = CSS Bottom - CSS Top = maxY - minY

    const cssX = (minX / vW) * 100
    const cssY = ((vH - maxY) / vH) * 100
    const cssW = ((maxX - minX) / vW) * 100
    const cssH = ((maxY - minY) / vH) * 100

    // Normalize pdfItems to CSS % coordinates relative to PAGE, just like the block bbox
    const formattedPdfItems = pdfItems.map(item => {
      // Current item coords
      const iminX = item.bbox.x
      const imaxY = item.bbox.y + item.bbox.h
      const imaxX = item.bbox.x + item.bbox.w
      const iminY = item.bbox.y

      // CSS conversion (same as block)
      const icssX = (iminX / vW) * 100
      const icssY = ((vH - imaxY) / vH) * 100
      const icssW = ((imaxX - iminX) / vW) * 100
      const icssH = ((imaxY - iminY) / vH) * 100

      return {
        str: item.str,
        offset: item.offset,
        bbox: {
          x: Math.max(0, icssX),
          y: Math.max(0, icssY),
          w: Math.min(100, icssW),
          h: Math.min(100, icssH)
        }
      }
    })

    blocks.push({
      text,
      pdfItems: formattedPdfItems,
      bbox: {
        x: Math.max(0, cssX),
        y: Math.max(0, cssY),
        w: Math.min(100, cssW),
        h: Math.min(100, cssH)
      }
    })
  }

  // .. helpers deprecated ...
  private extractTitle(d: any, p: any) { return '' }
  private extractAuthor(d: any, p: any) { return '' }
  private extractCover(b: any, t: any) { return Promise.resolve('') }
}

/**
 * EPUB Parser
 */
export class EPUBParser {
  async parse(buffer: Buffer): Promise<ParseResult> {
    const { EPub } = await import('epub2')
    const { parse: parseHTML } = await import('node-html-parser')

    return new Promise((resolve, reject) => {
      const epub = new EPub(buffer)

      epub.on('error', reject)

      epub.on('end', async () => {
        try {
          const blocks: ReaderBlock[] = []
          const chapters: Chapter[] = []
          let blockId = 0

          // Process each chapter
          for (let i = 0; i < epub.flow.length; i++) {
            const flowItem = epub.flow[i]

            // Get chapter content
            const chapterText = await new Promise<string>((res, rej) => {
              epub.getChapter(flowItem.id, (err, text) => {
                if (err) rej(err)
                else res(text)
              })
            })

            // Parse HTML to extract text
            const root = parseHTML(chapterText)
            const paragraphs = root.querySelectorAll('p, h1, h2, h3, h4, h5, h6')

            const chapterId = `ch-${i + 1}`
            const chapterTitle = flowItem.title || `Chapter ${i + 1}`
            const chapterBlockIds: string[] = []

            for (const p of paragraphs) {
              const text = p.text.trim()
              if (text.length < 10) continue  // Skip very short texts

              blockId++
              const id = `block-${blockId}`
              const tagName = p.tagName.toLowerCase()
              const isHeading = tagName.startsWith('h')

              blocks.push({
                id,
                order: blockId,
                type: isHeading ? 'heading' : 'text',
                content: text,
                meta: {
                  level: isHeading ? parseInt(tagName[1]) : undefined,
                  chapterId,
                  chapterTitle,
                },
              })

              chapterBlockIds.push(id)
            }

            if (chapterBlockIds.length > 0) {
              chapters.push({
                id: chapterId,
                title: chapterTitle,
                order: i + 1,
                blockIds: chapterBlockIds,
              })
            }
          }

          // Try to extract cover image
          let coverImage: string | undefined
          try {
            // epub2 stores cover reference in metadata
            if ((epub as any).metadata.cover) {
              const coverId = (epub as any).metadata.cover
              // getImage returns base64 encoded image
              const coverData = await new Promise<string>((res, rej) => {
                (epub as any).getImage(coverId, (err: Error | null, data: Buffer, mimeType: string) => {
                  if (err) rej(err)
                  else res(`data:${mimeType};base64,${data.toString('base64')}`)
                })
              })
              coverImage = coverData
            } else {
              // Fallback to placeholder if no cover found
              coverImage = generatePlaceholderCover(epub.metadata.title || 'Book')
            }
          } catch (error) {
            console.log('[EPUBParser] Failed to extract cover:', error)
            coverImage = generatePlaceholderCover(epub.metadata.title || 'Book')
          }

          resolve({
            blocks,
            chapters,
            metadata: {
              title: epub.metadata.title || 'Untitled',
              author: epub.metadata.creator,
              language: epub.metadata.language,
              coverImage,
            },
          })
        } catch (error) {
          reject(error)
        }
      })

      epub.parse()
    })
  }
}

/**
 * TXT Parser
 */
export class TXTParser {
  async parse(buffer: Buffer): Promise<ParseResult> {
    const text = buffer.toString('utf-8')

    // Split by double newlines (paragraphs)
    const paragraphs = text
      .split(/\n\n+/)
      .map(p => p.trim().replace(/\s+/g, ' '))
      .filter(p => p.length > 20)

    // Create blocks
    const blocks: ReaderBlock[] = paragraphs.map((content, i) => ({
      id: `block-${i + 1}`,
      order: i + 1,
      type: 'text',
      content,
    }))

    // Detect chapters
    const { blocks: enhancedBlocks, chapters } = ChapterDetector.detectChapters(blocks)

    // Extract title and author with better fallback logic
    let title = this.extractTitle(null, paragraphs)
    let author = this.extractAuthor(null, paragraphs)

    // Try to extract cover image (generate placeholder)
    let coverImage = generatePlaceholderCover(title)

    return {
      blocks: enhancedBlocks,
      chapters,
      metadata: {
        title,
        author,
        language: 'en',
        coverImage,
      },
    }
  }

  /**
   * Extract title from text content
   */
  private extractTitle(data: any | null, paragraphs: string[]): string {
    // Try to find title from first few paragraphs
    for (let i = 0; i < Math.min(3, paragraphs.length); i++) {
      const para = paragraphs[i]
      if (para.length > 5 && para.length < 200) {
        const commonWords = / (the|a|an|and|or|but|in|on|at|to|for|of|with|by) /gi
        const commonWordCount = (para.match(commonWords) || []).length
        const wordCount = para.split(/\s+/).length
        if (wordCount > 0 && commonWordCount / wordCount < 0.4) {
          return para.length > 100 ? para.substring(0, 100) + '...' : para
        }
      }
    }
    return 'Untitled'
  }

  /**
   * Extract author from text content
   */
  private extractAuthor(data: any | null, paragraphs: string[]): string | undefined {
    const authorPatterns = [
      /^(?:by|author|written by|作者):[\s]+(.+)/i,
      /^(.+?)\s+著$/,
    ]
    for (let i = 0; i < Math.min(5, paragraphs.length); i++) {
      const para = paragraphs[i]
      for (const pattern of authorPatterns) {
        const match = para.match(pattern)
        if (match && match[1]) {
          const author = match[1].trim()
          if (author.length < 100) {
            return author
          }
        }
      }
    }
    return undefined
  }
}

/**
 * DOCX Parser
 */
export class DOCXParser {
  async parse(buffer: Buffer): Promise<ParseResult> {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    const text = result.value

    // Split into paragraphs
    const paragraphs = text
      .split(/\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 20)

    // Create blocks
    const blocks: ReaderBlock[] = paragraphs.map((content, i) => ({
      id: `block-${i + 1}`,
      order: i + 1,
      type: 'text',
      content,
    }))

    // Detect chapters
    const { blocks: enhancedBlocks, chapters } = ChapterDetector.detectChapters(blocks)

    // Extract title and author with better fallback logic
    let title = this.extractTitle(null, paragraphs)
    let author = this.extractAuthor(null, paragraphs)

    // Try to extract cover image
    let coverImage = generatePlaceholderCover(title)

    return {
      blocks: enhancedBlocks,
      chapters,
      metadata: {
        title,
        author,
        language: 'en',
        coverImage,
      },
    }
  }

  /**
   * Extract title from text content
   */
  private extractTitle(data: any | null, paragraphs: string[]): string {
    // Try to find title from first few paragraphs
    for (let i = 0; i < Math.min(3, paragraphs.length); i++) {
      const para = paragraphs[i]
      if (para.length > 5 && para.length < 200) {
        const commonWords = / (the|a|an|and|or|but|in|on|at|to|for|of|with|by) /gi
        const commonWordCount = (para.match(commonWords) || []).length
        const wordCount = para.split(/\s+/).length
        if (wordCount > 0 && commonWordCount / wordCount < 0.4) {
          return para.length > 100 ? para.substring(0, 100) + '...' : para
        }
      }
    }
    return 'Untitled'
  }

  /**
   * Extract author from text content
   */
  private extractAuthor(data: any | null, paragraphs: string[]): string | undefined {
    const authorPatterns = [
      /^(?:by|author|written by|作者):[\s]+(.+)/i,
      /^(.+?)\s+著$/,
    ]
    for (let i = 0; i < Math.min(5, paragraphs.length); i++) {
      const para = paragraphs[i]
      for (const pattern of authorPatterns) {
        const match = para.match(pattern)
        if (match && match[1]) {
          const author = match[1].trim()
          if (author.length < 100) {
            return author
          }
        }
      }
    }
    return undefined
  }
}

/**
 * Main Document Parser - routes to appropriate parser
 */
export class DocumentParser {
  private pdfParser = new PDFParser()
  private epubParser = new EPUBParser()
  private txtParser = new TXTParser()
  private docxParser = new DOCXParser()

  async parseFromBuffer(buffer: Buffer, contentType: string): Promise<ParseResult> {
    const type = this.detectFileType(contentType, buffer)

    console.log(`[DocumentParser] Parsing file of type: ${type}`)

    switch (type) {
      case 'pdf':
        return this.pdfParser.parse(buffer)
      case 'epub':
        return this.epubParser.parse(buffer)
      case 'txt':
        return this.txtParser.parse(buffer)
      case 'docx':
        return this.docxParser.parse(buffer)
      default:
        throw new Error(`Unsupported file type: ${type}`)
    }
  }

  private detectFileType(contentType: string, buffer: Buffer): string {
    // Check content type
    if (contentType.includes('pdf')) return 'pdf'
    if (contentType.includes('epub')) return 'epub'
    if (contentType.includes('plain')) return 'txt'
    if (contentType.includes('wordprocessingml') || contentType.includes('msword')) return 'docx'

    // Check magic bytes
    const magic = buffer.slice(0, 4).toString('hex')
    if (magic === '25504446') return 'pdf'  // %PDF
    if (magic.startsWith('504b0304')) return 'epub'  // PK (ZIP)

    // Default to txt
    return 'txt'
  }
}
