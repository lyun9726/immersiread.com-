/**
 * Zustand store for Reader state management
 * Supports 3-layer architecture: Parse → Translation → TTS
 */

import { create } from "zustand"
import type {
    ReaderBlock,
    EnhancedBlock,
    Chapter,
    ReadingMode,
    TTSMode,
    TTSOptions,
    SelectionState
} from "@/lib/types"
import { translationEngine } from "@/lib/translation/TranslationEngine"

interface TTSState {
    isPlaying: boolean
    mode: TTSMode  // "original" | "translation" | "alternating"
    rate: number
    pitch: number
    voiceId?: string
    originalVoiceId?: string  // For alternating mode
    translationVoiceId?: string  // For alternating mode
}

interface ReaderState {
    // Layer 1: Parse Layer - Raw blocks from ReaderEngine
    bookId: string | null
    bookTitle: string | null
    blocks: ReaderBlock[]  // Original parsed blocks
    chapters: Chapter[]  // Chapter structure

    // Reader 2.0 State
    fileType: 'pdf' | 'epub' | 'text'
    viewMode: 'paged' | 'scroll'
    scale: number
    fileUrl: string | null
    epubLocation: string | null // CFI or href for EPUB navigation

    // Layer 2: Translation Layer - Enhanced blocks
    enhancedBlocks: EnhancedBlock[]  // Blocks with optional translations
    readingMode: ReadingMode  // "original" | "translation" | "bilingual"

    // Layer 3: TTS Layer
    tts: TTSState

    // Navigation
    currentBlockIndex: number
    currentChapterId: string | null
    currentPage: number // For PDF page navigation

    // Selection for Overlay
    selection: SelectionState | null
    setSelection: (selection: SelectionState | null) => void
    setSelectionTranslation: (translation: string) => void

    // Layer 1 Actions - Loading and parsing
    setBlocks: (blocks: ReaderBlock[], chapters?: Chapter[]) => void
    setChapters: (chapters: Chapter[]) => void
    loadBook: (bookId: string) => Promise<void>

    // Layer 2 Actions - Translation and enhancement
    enhanceWithTranslation: (targetLang?: string) => Promise<void>
    setReadingMode: (mode: ReadingMode) => void

    // Layer 3 Actions - TTS
    ttsPlay: () => void
    ttsPause: () => void
    ttsStop: () => void
    setTTSMode: (mode: TTSMode) => void
    setRate: (rate: number) => void
    setPitch: (pitch: number) => void
    setVoiceId: (voiceId: string) => void
    setOriginalVoiceId: (voiceId: string) => void
    setTranslationVoiceId: (voiceId: string) => void

    // Navigation Actions
    setCurrentBlockIndex: (idx: number) => void
    jumpToChapter: (chapterId: string) => void
    jumpToPage: (pageNumber: number) => void
    nextBlock: () => void
    previousBlock: () => void

    // Utility
    getCurrentBlock: () => EnhancedBlock | null
    getDisplayText: () => string
    getTTSOptions: () => TTSOptions
}

export const useReaderStore = create<ReaderState>((set, get) => ({
    // Initial state
    // Initial state
    bookId: null,
    bookTitle: null,
    blocks: [],
    chapters: [],
    enhancedBlocks: [],
    readingMode: "original",
    currentBlockIndex: 0,
    currentChapterId: null,

    fileType: 'text',
    viewMode: 'paged',
    scale: 1.0,
    fileUrl: null,
    currentPage: 1, // For PDF page navigation
    epubLocation: null, // For EPUB CFI navigation

    tts: {
        isPlaying: false,
        mode: "original",  // Default to original mode
        rate: 1.0,
        pitch: 1.0,
        voiceId: "default",
        originalVoiceId: "default",
        translationVoiceId: "default",
    },

    selection: null,
    setSelection: (selection) => set({ selection }),
    setSelectionTranslation: (translation) => set(state => ({
        selection: state.selection ? { ...state.selection, translation } : null
    })),

    // Layer 1: Set raw blocks from parser
    setBlocks: (blocks, chapters = []) => {
        // Convert blocks to enhanced blocks without translation
        const enhancedBlocks: EnhancedBlock[] = blocks.map(block => ({
            id: block.id,
            original: typeof block.content === "string" ? block.content : "",
            translation: undefined,
            type: block.type,
            meta: block.meta,
        }))

        set({
            blocks,
            chapters,
            enhancedBlocks,
            currentBlockIndex: 0,
            currentChapterId: chapters[0]?.id || null,
        })
    },

    setChapters: (chapters) => {
        set({ chapters })
    },

    // Load book from database
    loadBook: async (bookId) => {
        try {
            const response = await fetch(`/api/library/books/${bookId}`)
            if (!response.ok) {
                throw new Error("Failed to load book")
            }

            const data = await response.json()
            const { book, blocks = [], chapters = [] } = data

            console.log(`[readerStore] Loaded book ${bookId}: ${blocks.length} blocks, ${chapters.length} chapters`)

            const sourceUrl = book.sourceUrl || book.metadata?.fileUrl || null
            let fileType: 'pdf' | 'epub' | 'text' = 'text'

            if (sourceUrl) {
                // Remove query params for extension check
                const cleanUrl = sourceUrl.split('?')[0].toLowerCase()
                if (cleanUrl.endsWith('.pdf')) {
                    fileType = 'pdf'
                } else if (cleanUrl.endsWith('.epub')) {
                    fileType = 'epub'
                }
            }

            console.log(`[readerStore] Determined fileType: ${fileType}, URL: ${sourceUrl}`)

            get().setBlocks(blocks, chapters)
            set({
                bookId,
                bookTitle: book?.title || book?.metadata?.title || "Untitled",
                fileUrl: sourceUrl,
                fileType: fileType
            })
        } catch (error) {
            console.error("[readerStore] Failed to load book:", error)
            throw error
        }
    },

    // Layer 2: Enhance blocks with translation
    enhanceWithTranslation: async (targetLang = "zh") => {
        const { blocks } = get()

        if (blocks.length === 0) {
            console.warn("[readerStore] No blocks to translate")
            return
        }

        try {
            // Use TranslationEngine to enhance blocks
            const enhanced = await translationEngine.enhanceBlocks(blocks, targetLang, {
                batchSize: 32,
                concurrency: 3,
                useCache: true,
            })

            set({ enhancedBlocks: enhanced })
        } catch (error) {
            console.error("[readerStore] Translation enhancement failed:", error)
            throw error
        }
    },

    setReadingMode: (mode) => {
        set({ readingMode: mode })

        // Auto-translate if switching to translation/bilingual mode
        const { enhancedBlocks, blocks } = get()
        const hasTranslations = enhancedBlocks.some(b => b.translation)

        if ((mode === "translation" || mode === "bilingual") && !hasTranslations && blocks.length > 0) {
            // Trigger translation in background
            get().enhanceWithTranslation().catch(err => {
                console.error("[readerStore] Auto-translation failed:", err)
            })
        }
    },

    // Layer 3: TTS Actions
    ttsPlay: () => {
        set((state) => ({
            tts: {
                ...state.tts,
                isPlaying: true,
            },
        }))
    },

    ttsPause: () => {
        set((state) => ({
            tts: {
                ...state.tts,
                isPlaying: false,
            },
        }))
    },

    ttsStop: () => {
        set((state) => ({
            tts: {
                ...state.tts,
                isPlaying: false,
            },
        }))
    },

    setTTSMode: (mode) => {
        set((state) => ({
            tts: {
                ...state.tts,
                mode,
            },
        }))

        // Auto-translate if switching to translation/alternating mode
        const { enhancedBlocks, blocks } = get()
        const hasTranslations = enhancedBlocks.some(b => b.translation)

        if ((mode === "translation" || mode === "alternating") && !hasTranslations && blocks.length > 0) {
            get().enhanceWithTranslation().catch(err => {
                console.error("[readerStore] Auto-translation for TTS failed:", err)
            })
        }
    },

    setRate: (rate) => {
        set((state) => ({
            tts: {
                ...state.tts,
                rate,
            },
        }))
    },

    setPitch: (pitch) => {
        set((state) => ({
            tts: {
                ...state.tts,
                pitch,
            },
        }))
    },

    setVoiceId: (voiceId) => {
        set((state) => ({
            tts: {
                ...state.tts,
                voiceId,
            },
        }))
    },

    setOriginalVoiceId: (voiceId) => {
        set((state) => ({
            tts: {
                ...state.tts,
                originalVoiceId: voiceId,
            },
        }))
    },

    setTranslationVoiceId: (voiceId) => {
        set((state) => ({
            tts: {
                ...state.tts,
                translationVoiceId: voiceId,
            },
        }))
    },

    // Navigation Actions
    setCurrentBlockIndex: (idx) => {
        const { enhancedBlocks, chapters } = get()

        if (idx < 0 || idx >= enhancedBlocks.length) {
            return
        }

        // Find chapter for this block
        const block = enhancedBlocks[idx]
        const chapter = chapters.find(ch => ch.blockIds.includes(block.id))

        set({
            currentBlockIndex: idx,
            currentChapterId: chapter?.id || null,
        })
    },

    jumpToChapter: (chapterId) => {
        const { chapters, enhancedBlocks, fileType } = get()
        const chapter = chapters.find(ch => ch.id === chapterId)

        if (!chapter) return

        // PDF Mode: Jump to page
        if (fileType === 'pdf' && chapter.pageNumber) {
            get().jumpToPage(chapter.pageNumber)
            return
        }

        // EPUB Mode: Jump to href/CFI
        if (fileType === 'epub') {
            // For EPUB, chapters should have an href property
            const href = (chapter as any).href
            if (href) {
                console.log(`[readerStore] Jumping to EPUB location: ${href}`)
                set({
                    epubLocation: href,
                    currentChapterId: chapterId,
                })
            }
            return
        }

        // Text Mode: Jump to block
        if (chapter.blockIds.length > 0) {
            const firstBlockId = chapter.blockIds[0]
            const blockIndex = enhancedBlocks.findIndex(b => b.id === firstBlockId)

            if (blockIndex >= 0) {
                set({
                    currentBlockIndex: blockIndex,
                    currentChapterId: chapterId,
                })
            }
        }
    },

    jumpToPage: (pageNumber) => {
        console.log(`[readerStore] Jumping to page ${pageNumber}`)
        set({ currentPage: pageNumber })
    },

    nextBlock: () => {
        const { currentBlockIndex, enhancedBlocks } = get()
        if (currentBlockIndex < enhancedBlocks.length - 1) {
            get().setCurrentBlockIndex(currentBlockIndex + 1)
        }
    },

    previousBlock: () => {
        const { currentBlockIndex } = get()
        if (currentBlockIndex > 0) {
            get().setCurrentBlockIndex(currentBlockIndex - 1)
        }
    },

    // Utility Methods
    getCurrentBlock: () => {
        const { enhancedBlocks, currentBlockIndex } = get()
        return enhancedBlocks[currentBlockIndex] || null
    },

    getDisplayText: () => {
        const { readingMode } = get()
        const currentBlock = get().getCurrentBlock()

        if (!currentBlock) {
            return ""
        }

        return translationEngine.getDisplayText(currentBlock, readingMode)
    },

    getTTSOptions: () => {
        const { tts } = get()
        return {
            mode: tts.mode,
            rate: tts.rate,
            pitch: tts.pitch,
            voiceId: tts.voiceId,
            originalVoiceId: tts.originalVoiceId,
            translationVoiceId: tts.translationVoiceId,
        }
    },

    // Reader 2.0 Actions
    setScale: (scale: number) => set({ scale }),
    setViewMode: (viewMode: 'paged' | 'scroll') => set({ viewMode }),
    setFileType: (fileType: 'pdf' | 'epub' | 'text') => set({ fileType }),
    setFileUrl: (fileUrl: string | null) => set({ fileUrl }),
}))
