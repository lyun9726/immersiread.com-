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
    lastTextSnippet: string | null // Text fallback
    lastCharOffset: number | null  // Character offset for TTS resume
    lastSpineIndex: number | null  // EPUB chapter index
    setEpubLocation: (location: string | null) => void
    setLastTextSnippet: (snippet: string | null) => void
    setLastCharOffset: (offset: number | null) => void
    setLastSpineIndex: (index: number | null) => void

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
    assignPageCoordinates: (pageNumber: number, pageText: string, pdfItems: any[]) => void // Assigns coordinates to server blocks for a specific page
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

    // Reader 2.0 Actions
    setScale: (scale: number) => void
    setViewMode: (viewMode: 'paged' | 'scroll') => void
    setFileType: (fileType: 'pdf' | 'epub' | 'text') => void
    setFileUrl: (fileUrl: string | null) => void

    // Auto-Scroll
    autoScroll: boolean
    setAutoScroll: (enabled: boolean) => void

    // Persistence
    saveProgress: () => Promise<void>

    // Karaoke Highlighting - uses stable word index instead of unreliable charIndex
    currentWordIndex: number  // -1 means no word highlighted
    setWordIndex: (index: number) => void

    // Click-to-Read: Request TTS to start from a specific block
    pendingPlayFromBlock: number | null  // Block index to start playing from
    requestPlayFromBlock: (blockIndex: number) => void
    clearPendingPlay: () => void

    // TTS Commands (Next/Prev) for decoupled UI
    ttsCommand: { type: 'next' | 'prev' | null, timestamp: number }
    triggerTTSCommand: (type: 'next' | 'prev') => void
}

export const useReaderStore = create<ReaderState>((set, get) => ({
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
    lastTextSnippet: null, // Text fallback
    lastCharOffset: null, // Character offset for TTS resume
    lastSpineIndex: null, // EPUB chapter index

    setEpubLocation: (epubLocation) => set({ epubLocation }),
    setLastTextSnippet: (lastTextSnippet) => set({ lastTextSnippet }),
    setLastCharOffset: (lastCharOffset) => set({ lastCharOffset }),
    setLastSpineIndex: (lastSpineIndex) => set({ lastSpineIndex }),

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
        // Granular Splitting Logic: 
        // Break down large server blocks into smaller sentence-based units for better highlighting
        const granularBlocks: ReaderBlock[] = [];

        blocks.forEach(block => {
            if (block.type !== 'text' || !block.content || block.content.length < 50) {
                granularBlocks.push(block);
                return;
            }

            const text = block.content;
            // Matches sentence endings: period, question mark, exclamation point (English & Chinese)
            // Lookahead ensures we include the punctuation in the current block
            // Split regex needs to be careful not to lose delimiters
            // We'll use a manual split approach similar to createBlocksFromText for robustness

            const MAX_CHUNK_SIZE = 80; // Reduced for clause-level splitting
            const sentences: string[] = [];
            let currentStart = 0;

            while (currentStart < text.length) {
                // Determine a safe search range
                let searchEnd = Math.min(currentStart + MAX_CHUNK_SIZE, text.length);
                let splitPoint = -1;

                // If we are near the end, just take the rest
                if (text.length - currentStart < MAX_CHUNK_SIZE * 1.5) {
                    splitPoint = text.length;
                } else {
                    // Search for punctuation within the window
                    const windowText = text.substring(currentStart, Math.min(text.length, currentStart + MAX_CHUNK_SIZE + 50));
                    // Prioritize split by punctuation
                    // Matches sentence endings AND clause dividers (commas, semicolons)
                    const punctuationMatch = windowText.search(/[。！？.…!?;:?!\n，,、；;]/);

                    if (punctuationMatch !== -1 && punctuationMatch > 10) { // Avoid splitting too early
                        splitPoint = currentStart + punctuationMatch + 1;
                    } else {
                        // If no punctuation, try to split at space or comma if huge
                        if (windowText.length >= MAX_CHUNK_SIZE) {
                            const commaMatch = windowText.search(/[，,]/);
                            if (commaMatch !== -1 && commaMatch > 50) {
                                splitPoint = currentStart + commaMatch + 1;
                            } else {
                                // Force split at space near limit
                                const spaceMatch = windowText.lastIndexOf(' ', MAX_CHUNK_SIZE);
                                if (spaceMatch > 50) {
                                    splitPoint = currentStart + spaceMatch + 1;
                                } else {
                                    // Hard split
                                    splitPoint = Math.min(currentStart + MAX_CHUNK_SIZE, text.length);
                                }
                            }
                        } else {
                            splitPoint = Math.min(currentStart + MAX_CHUNK_SIZE, text.length);
                        }
                    }
                }

                if (splitPoint <= currentStart) splitPoint = currentStart + 1; // Prevent infinite loop

                const chunkContent = text.substring(currentStart, splitPoint).trim();
                if (chunkContent.length > 0) {
                    sentences.push(chunkContent);
                }
                currentStart = splitPoint;
            }

            // Create new ReaderBlocks from sentences
            sentences.forEach((sentence, idx) => {
                granularBlocks.push({
                    ...block,
                    id: `${block.id}-part-${idx}`,
                    content: sentence,
                    original: sentence, // Ensure original is synced
                    // inheriting other meta
                });
            });
        });

        // Convert blocks to enhanced blocks without translation
        const enhancedBlocks: EnhancedBlock[] = granularBlocks.map(block => ({
            id: block.id,
            content: block.content, // Ensure content is preserved
            original: typeof block.content === "string" ? block.content : "",
            translation: undefined,
            type: block.type,
            meta: block.meta,
            pdfItems: block.pdfItems,
        }))

        set({
            blocks: granularBlocks,
            chapters,
            enhancedBlocks,
            currentBlockIndex: 0,
            currentChapterId: chapters[0]?.id || null,
        })
    },

    /**
     * NEW: Assigns coordinates to server blocks using per-page linear matching.
     * Receives DOM extraction data for a SINGLE PAGE and matches server blocks
     * that belong to that page sequentially through the page's text.
     * 
     * @param pageNumber - The page number being processed
     * @param pageText - The full normalized text extracted from the page's DOM
     * @param pdfItems - Array of items with { str, offset, x, y, w, h } from DOM extraction
     */
    assignPageCoordinates: (pageNumber: number, pageText: string, pdfItems: any[]) => {
        set(state => {
            const newEnhancedBlocks = [...state.enhancedBlocks];
            let updateCount = 0;
            let searchCursor = 0; // Linear cursor through pageText

            // Normalize function
            const normalize = (str: string) => str?.replace(/[\s\n\r"''"""`''，。！？：；、.,!?()\[\]{}<>-]+/g, '').toLowerCase() || '';

            const normalizedPageText = normalize(pageText);

            // Build character-to-item map for coordinate lookup
            // Each character position maps to the pdfItem that contains it
            const itemMap: number[] = [];
            let accumulatedText = "";
            pdfItems.forEach((item, idx) => {
                const itemNormalized = normalize(item.str);
                for (let i = 0; i < itemNormalized.length; i++) {
                    itemMap.push(idx);
                }
                accumulatedText += itemNormalized;
            });

            // Helper: Get bounding box and pdfItems for a text range
            const getBboxForRange = (startCharIdx: number, endCharIdx: number): { bbox: any; items: any[] } | null => {
                const startItemIdx = itemMap[startCharIdx];
                const endItemIdx = itemMap[endCharIdx - 1];

                if (startItemIdx === undefined || endItemIdx === undefined) return null;

                const subsetItems = pdfItems.slice(startItemIdx, endItemIdx + 1);
                if (subsetItems.length === 0) return null;

                // Rebase offsets relative to block start for Karaoke
                const baseOffset = subsetItems[0].offset || 0;
                const rebasedItems = subsetItems.map((item: any) => ({
                    ...item,
                    offset: (item.offset || 0) - baseOffset
                }));

                const bbox = {
                    x: Math.min(...rebasedItems.map((i: any) => i.x)),
                    y: Math.min(...rebasedItems.map((i: any) => i.y)),
                    w: 0,
                    h: 0
                };
                const maxX = Math.max(...rebasedItems.map((i: any) => i.x + i.w));
                const maxY = Math.max(...rebasedItems.map((i: any) => i.y + i.h));
                bbox.w = maxX - bbox.x;
                bbox.h = maxY - bbox.y;

                return { bbox, items: rebasedItems };
            };

            // Iterate through ALL server blocks, find ones that need coordinates for this page
            newEnhancedBlocks.forEach((block, idx) => {
                // Skip if already has coordinates
                if (block.meta?.bbox) return;

                // For blocks without page assignments, we try to match them
                const blockText = normalize(block.original);
                if (blockText.length < 2) return;

                // LINEAR SEARCH: Find blockText in normalizedPageText, starting from searchCursor
                const foundIdx = normalizedPageText.indexOf(blockText, searchCursor);

                if (foundIdx !== -1) {
                    // MATCH! Get coordinates
                    const result = getBboxForRange(foundIdx, foundIdx + blockText.length);

                    if (result) {
                        newEnhancedBlocks[idx] = {
                            ...block,
                            meta: {
                                ...block.meta,
                                pageNumber: pageNumber,
                                bbox: result.bbox
                            },
                            pdfItems: result.items
                        };
                        updateCount++;

                        // Advance cursor PAST this match to enforce sequential consumption
                        searchCursor = foundIdx + blockText.length;
                    }
                }
            });

            console.log(`[AssignCoords] Page ${pageNumber}: Assigned ${updateCount} blocks`);
            return { enhancedBlocks: newEnhancedBlocks };
        });
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

            // Restore progress if available
            if (book.progress) {
                console.log("[readerStore] Restoring progress:", book.progress)
                const { blockIndex, pageNumber, epubCfi } = book.progress

                if (fileType === 'text' && typeof blockIndex === 'number') {
                    get().setCurrentBlockIndex(blockIndex)
                } else if (fileType === 'pdf') {
                    if (pageNumber) get().jumpToPage(pageNumber)
                    // Also restore specific block index if available
                    if (typeof blockIndex === 'number') {
                        get().setCurrentBlockIndex(blockIndex)
                    }
                } else if (fileType === 'epub' && epubCfi) {
                    set({ epubLocation: epubCfi })
                }

                if (book.progress.lastTextSnippet) {
                    set({ lastTextSnippet: book.progress.lastTextSnippet })
                }

                // Restore TTS resume position for EPUB
                if (typeof book.progress.lastCharOffset === 'number') {
                    set({ lastCharOffset: book.progress.lastCharOffset })
                }
                if (typeof book.progress.spineIndex === 'number') {
                    set({ lastSpineIndex: book.progress.spineIndex })
                }

                // Restore chapter marker if available
                if (book.progress.chapterId) {
                    set({ currentChapterId: book.progress.chapterId })
                }
            }
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
        const { enhancedBlocks, chapters, currentBlockIndex: prevIdx, fileType, currentPage } = get()

        if (idx < 0 || idx >= enhancedBlocks.length) {
            return
        }

        // Find chapter for this block
        const block = enhancedBlocks[idx]
        const chapter = chapters.find(ch => ch.blockIds.includes(block.id))

        // Update state
        set({
            currentBlockIndex: idx,
            currentChapterId: chapter?.id || null,
        })

        // NOTE: Page sync is now handled by viewport-based visibility detection in pdf-renderer.tsx
        // This ensures scrolling only happens when the highlighted content leaves the visible area
        // See PDFPageWrapper component for the getBoundingClientRect-based scroll logic

        get().saveProgress()
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
            const href = chapter.href
            if (href) {
                console.log(`[readerStore] Jumping to EPUB location: ${href}`)
                set({
                    epubLocation: href,
                    currentChapterId: chapterId,
                })
                get().saveProgress()
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
                get().saveProgress()
            }
        }
    },

    jumpToPage: (pageNumber) => {
        console.log(`[readerStore] Jumping to page ${pageNumber}`)
        set({ currentPage: pageNumber })
        get().saveProgress()
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
    // Auto-Scroll
    autoScroll: true,
    setAutoScroll: (enabled: boolean) => set({ autoScroll: enabled }),

    // Persistence
    saveProgress: async () => {
        const { bookId, currentBlockIndex, currentChapterId, currentPage, epubLocation, fileType, lastTextSnippet, lastCharOffset, lastSpineIndex } = get()
        if (!bookId) return

        // Debounce implementation using a module-level variable is risky in SSR/concurrent requests
        // But for client-side single store it's fine.
        // However, we can also just implement simple throttling or rely on component unmount
        // For now, let's just save.

        // We will add debouncing by checking last save time if needed, 
        // but simple timer in global scope (module scope) works for client-side.

        if (saveTimer) clearTimeout(saveTimer)

        saveTimer = setTimeout(async () => {
            const progress = {
                chapterId: currentChapterId || undefined,
                blockIndex: currentBlockIndex,
                pageNumber: currentPage,
                epubCfi: epubLocation || undefined,
                lastTextSnippet: lastTextSnippet || undefined,
                lastCharOffset: lastCharOffset ?? undefined,
                spineIndex: lastSpineIndex ?? undefined,
                updatedAt: new Date()
            }

            try {
                await fetch(`/api/library/books/${bookId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ progress })
                })
            } catch (error) {
                console.error("[readerStore] Failed to save progress:", error)
            }
        }, 1000)
    },

    // Karaoke Actions - stable word index system
    currentWordIndex: -1,
    setWordIndex: (index) => set({ currentWordIndex: index }),

    // Click-to-Read: Request TTS to start from a specific block
    pendingPlayFromBlock: null,
    requestPlayFromBlock: (blockIndex) => {
        // Set the block index and mark pending play
        set({
            currentBlockIndex: blockIndex,
            pendingPlayFromBlock: blockIndex
        })
        console.log('[readerStore] Request play from block:', blockIndex)
    },
    clearPendingPlay: () => set({ pendingPlayFromBlock: null }),

    // TTS Commands
    ttsCommand: { type: null, timestamp: 0 },
    triggerTTSCommand: (type) => set({ ttsCommand: { type, timestamp: Date.now() } }),

}))

// Timer for debounce
let saveTimer: NodeJS.Timeout | null = null
