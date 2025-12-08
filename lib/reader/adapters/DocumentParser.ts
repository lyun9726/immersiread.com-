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
export class PDFParser {
  async parse(buffer: Buffer): Promise<ParseResult> {
    const pdfParse = (await import('pdf-parse')).default

    // Parse PDF
    const data = await pdfParse(buffer)

    // Split text into paragraphs
    const paragraphs = data.text
      .split(/\n\n+/)
      .map(p => p.trim().replace(/\s+/g, ' '))
      .filter(p => p.length > 20)  // Filter out very short paragraphs

    // Create blocks
    const blocks: ReaderBlock[] = paragraphs.map((text, i) => ({
      id: `block-${i + 1}`,
      order: i + 1,
      type: 'text',
      content: text,
    }))

    // Detect chapters
    const { blocks: enhancedBlocks, chapters } = ChapterDetector.detectChapters(blocks)

    // Extract title and author with better fallback logic
    let title = this.extractTitle(data, paragraphs)
    let author = this.extractAuthor(data, paragraphs)

    // Try to extract cover image from first page
    let coverImage: string | undefined
    try {
      coverImage = await this.extractCover(buffer, title)
    } catch (error) {
      console.log('[PDFParser] Failed to extract cover:', error)
    }

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
   * Extract title from PDF metadata or content
   */
  private extractTitle(data: any, paragraphs: string[]): string {
    // Try PDF metadata first
    if (data.info?.Title && data.info.Title.trim()) {
      return data.info.Title.trim()
    }

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
   * Extract author from PDF metadata or content
   */
  private extractAuthor(data: any, paragraphs: string[]): string | undefined {
    if (data.info?.Author && data.info.Author.trim()) {
      return data.info.Author.trim()
    }
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

  /**
   * Extract cover image
   */
  private async extractCover(buffer: Buffer, title: string = 'Book'): Promise<string | undefined> {
    try {
      return generatePlaceholderCover(title)
    } catch (error) {
      console.error('[PDFParser] Cover generation error:', error)
      return undefined
    }
  }
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
