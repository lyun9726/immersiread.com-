/**
 * Core types for the Reader Engine - 3 Layer Architecture
 */

// ========================================
// Layer 1: Parse Layer (ReaderEngine)
// Pure parsing - no translation, no TTS
// ========================================

export type BlockType = "text" | "image" | "heading" | "code" | "quote" | "list-item" | "blockquote"

export interface ReaderBlock {
  id: string
  order: number
  type: BlockType
  content: string | Uint8Array  // text content or binary data for images
  meta?: {
    level?: number  // for headings (h1=1, h2=2, etc.)
    language?: string  // code block language
    chapterTitle?: string  // chapter this block belongs to
    [key: string]: any
  }
  // For Karaoke highlighting (PDF only)
  pdfItems?: {
    str: string
    offset: number // character offset from start of block content
    bbox: { x: number; y: number; w: number; h: number }
  }[]
}

export interface Chapter {
  id: string
  title: string
  order: number
  blockIds: string[]  // IDs of blocks in this chapter
  pageNumber?: number // For PDF page navigation
  href?: string       // For EPUB navigation (chapter URL/CFI)
}

export interface ParseResult {
  blocks: ReaderBlock[]
  chapters?: Chapter[]
  metadata?: {
    title?: string
    author?: string
    language?: string
    coverImage?: string
    [key: string]: any
  }
}

// ========================================
// Layer 2: Translation Layer (Enhancer)
// Enhances blocks with translations
// ========================================

export interface EnhancedBlock {
  id: string
  original: string
  translation?: string  // Optional - only present if translated
  type: BlockType
  type: BlockType
  meta?: ReaderBlock["meta"]
  pdfItems?: ReaderBlock["pdfItems"]
}

export type ReadingMode = "original" | "translation" | "bilingual"

export interface Book {
  id: string
  title?: string
  author?: string
  cover?: string
  sourceUrl?: string
  blocks?: ReaderBlock[]
  metadata?: ParseResult["metadata"]
  createdAt?: Date
  updatedAt?: Date
  progress?: {
    chapterId?: string
    blockIndex?: number
    pageNumber?: number // For PDF
    epubCfi?: string    // For EPUB
    updatedAt: string | Date
  }
}

// ========================================
// Layer 3: TTS Layer
// 3 modes: original, translation, alternating
// ========================================

export type TTSMode = "original" | "translation" | "alternating"

export interface TTSOptions {
  mode: TTSMode
  voiceId?: string
  rate?: number
  pitch?: number
  originalVoiceId?: string  // For alternating mode
  translationVoiceId?: string  // For alternating mode
}

export interface TTSItem {
  id: string
  text: string
  type?: "original" | "translation"  // For alternating mode
}

export interface TTSResult {
  audioUrl: string
  metadata?: {
    rate?: number
    pitch?: number
    voiceId?: string
    duration?: number
  }
}

// Translation API types
export interface TranslationItem {
  id: string
  text: string
}

export interface TranslationResult {
  id: string
  translated: string
}

export interface IngestURLRequest {
  url: string
  previewOnly?: boolean
  previewTranslated?: boolean
  targetLang?: string
}

export interface IngestURLResponse {
  title?: string
  blocks: ReaderBlock[]
  jobId?: string
}

export interface ParseRequest {
  url?: string
  fileUrl?: string
  originalFilename?: string
  coverImage?: string
  source?: "web" | "file" | "upload"
}

export interface ParseResponse {
  bookId: string
  jobId?: string
}

export interface TranslateBatchRequest {
  items: TranslationItem[]
  targetLang: string
}

export interface TranslateBatchResponse {
  results: TranslationResult[]
}

export interface TTSSynthesizeRequest {
  items: TTSItem[]
  voiceId?: string
  rate?: number
  pitch?: number
}

export interface TTSSynthesizeResponse {
  audioUrl: string
  metadata?: {
    rate?: number
    pitch?: number
    voiceId?: string
  }
}

export interface SelectionState {
  text: string
  translation?: string | null
  position: {
    x: number
    y: number
    width?: number
    height?: number
  }
}
