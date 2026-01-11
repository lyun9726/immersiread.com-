"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ReadingMode } from "@/lib/types"
import { useLanguageStore } from "./languageStore"

/**
 * Book Language Store
 * 
 * Stores language settings PER BOOK (isolated by bookId)
 * 
 * ⚠️ KEY RULES:
 * 1. Target Language is Book Level state (isolated per bookId)
 * 2. Changing Target Language in reader:
 *    - Only affects current book
 *    - Does NOT update global defaultTargetLanguage
 *    - Does NOT affect other books
 * 3. Reading Mode (Original/Translation/Bilingual):
 *    - Only controls display & translation behavior
 *    - Does NOT modify targetLanguage
 */

interface BookLanguageState {
    originalLanguage: string       // Auto-detected, read-only
    targetLanguage: string         // This book's translation target
    targetLanguageSource: "default" | "manual" // How it was set
    readingMode: ReadingMode       // Current display mode
}

interface BookLanguageStore {
    // State: Map of bookId -> BookLanguageState
    books: Record<string, BookLanguageState>

    // Actions
    initBook: (bookId: string, originalLanguage?: string) => void
    getBookState: (bookId: string) => BookLanguageState

    // Target Language (per book, does NOT affect global)
    setBookTargetLanguage: (bookId: string, lang: string) => void

    // Reading Mode (per book)
    setBookReadingMode: (bookId: string, mode: ReadingMode) => void

    // Original Language (read-only, set by system)
    setBookOriginalLanguage: (bookId: string, lang: string) => void
}

// Default book state factory
const createDefaultBookState = (originalLanguage: string = "en"): BookLanguageState => {
    // Get global default from language store
    const globalDefault = useLanguageStore.getState().defaultTargetLanguage

    return {
        originalLanguage,
        targetLanguage: globalDefault,
        targetLanguageSource: "default",
        readingMode: "original",
    }
}

export const useBookLanguageStore = create<BookLanguageStore>()(
    persist(
        (set, get) => ({
            books: {},

            // Initialize book state if not exists
            initBook: (bookId: string, originalLanguage?: string) => {
                const existing = get().books[bookId]
                if (existing) {
                    // If original language detected, update it
                    if (originalLanguage && !existing.originalLanguage) {
                        set(state => ({
                            books: {
                                ...state.books,
                                [bookId]: {
                                    ...existing,
                                    originalLanguage,
                                }
                            }
                        }))
                    }
                    return
                }

                // Create new book state with global defaults
                set(state => ({
                    books: {
                        ...state.books,
                        [bookId]: createDefaultBookState(originalLanguage),
                    }
                }))
            },

            // Get book state (with fallback to defaults)
            getBookState: (bookId: string): BookLanguageState => {
                const book = get().books[bookId]
                if (book) return book

                // If not found, return default (but don't persist)
                return createDefaultBookState()
            },

            // Set target language for a specific book
            // ⚠️ This does NOT update global defaultTargetLanguage
            setBookTargetLanguage: (bookId: string, lang: string) => {
                set(state => {
                    const existing = state.books[bookId] || createDefaultBookState()
                    return {
                        books: {
                            ...state.books,
                            [bookId]: {
                                ...existing,
                                targetLanguage: lang,
                                targetLanguageSource: "manual", // Mark as manually set
                            }
                        }
                    }
                })

                console.log(`[BookLanguageStore] Set book ${bookId} targetLanguage = ${lang} (manual)`)
            },

            // Set reading mode for a specific book
            // ⚠️ This does NOT modify targetLanguage
            setBookReadingMode: (bookId: string, mode: ReadingMode) => {
                set(state => {
                    const existing = state.books[bookId] || createDefaultBookState()

                    // ⚠️ KEY RULE: Reading Mode change MUST NOT modify targetLanguage
                    return {
                        books: {
                            ...state.books,
                            [bookId]: {
                                ...existing,
                                readingMode: mode,
                                // targetLanguage remains unchanged!
                            }
                        }
                    }
                })

                console.log(`[BookLanguageStore] Set book ${bookId} readingMode = ${mode} (targetLanguage unchanged)`)
            },

            // Set original language (auto-detected, read-only for users)
            setBookOriginalLanguage: (bookId: string, lang: string) => {
                set(state => {
                    const existing = state.books[bookId] || createDefaultBookState()
                    return {
                        books: {
                            ...state.books,
                            [bookId]: {
                                ...existing,
                                originalLanguage: lang,
                            }
                        }
                    }
                })
            },
        }),
        {
            name: "book-language-settings",
            version: 1,
        }
    )
)

// Hook for easy access in reader components
export function useBookLanguage(bookId: string | null) {
    const store = useBookLanguageStore()

    if (!bookId) {
        return {
            originalLanguage: "en",
            targetLanguage: useLanguageStore.getState().defaultTargetLanguage,
            targetLanguageSource: "default" as const,
            readingMode: "original" as ReadingMode,
            setTargetLanguage: () => { },
            setReadingMode: () => { },
        }
    }

    const bookState = store.getBookState(bookId)

    return {
        ...bookState,
        setTargetLanguage: (lang: string) => store.setBookTargetLanguage(bookId, lang),
        setReadingMode: (mode: ReadingMode) => store.setBookReadingMode(bookId, mode),
    }
}
