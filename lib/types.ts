/**
 * Core types for the Reader Engine
 */

export interface ReaderBlock {
  id: string
  order: number
  text: string
  meta?: Record<string, any>
}

export interface ParseResult {
  blocks: ReaderBlock[]
  metadata?: {
    title?: string
    author?: string
    language?: string
    [key: string]: any
  }
}

export interface Book {
  id: string
  title?: string
  sourceUrl?: string
  blocks?: ReaderBlock[]
  metadata?: ParseResult["metadata"]
  createdAt?: Date
  updatedAt?: Date
}

export interface TranslationItem {
  id: string
  text: string
}

export interface TranslationResult {
  id: string
  translated: string
}

export interface TTSItem {
  id: string
  text: string
}

export interface TTSResult {
  audioUrl: string
  metadata?: {
    rate?: number
    pitch?: number
    voiceId?: string
  }
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
  source?: "web" | "file"
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
