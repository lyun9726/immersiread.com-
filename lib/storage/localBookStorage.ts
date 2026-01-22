"use client"

/**
 * Local Storage Service for Guest Users
 * 
 * Stores books locally in browser for users who haven't logged in.
 * When user logs in, these books can be migrated to cloud storage.
 */

import type { Book } from "@/lib/types"

const LOCAL_BOOKS_KEY = "omniread_local_books"

export interface LocalBook extends Omit<Book, 'userId'> {
    isLocal: true  // Mark as local book
}

/**
 * Get all local books from browser storage
 */
export function getLocalBooks(): LocalBook[] {
    if (typeof window === 'undefined') return []

    try {
        const data = localStorage.getItem(LOCAL_BOOKS_KEY)
        if (!data) return []

        const books = JSON.parse(data) as LocalBook[]
        return books.map(book => ({
            ...book,
            isLocal: true as const,
            createdAt: book.createdAt ? new Date(book.createdAt) : undefined,
            updatedAt: book.updatedAt ? new Date(book.updatedAt) : undefined,
        }))
    } catch (error) {
        console.error('[LocalStorage] Error reading books:', error)
        return []
    }
}

/**
 * Save a book to local storage
 */
export function saveLocalBook(book: Omit<LocalBook, 'isLocal'>): LocalBook {
    if (typeof window === 'undefined') {
        throw new Error('Cannot save local book on server')
    }

    const books = getLocalBooks()
    const localBook: LocalBook = {
        ...book,
        isLocal: true,
        createdAt: book.createdAt || new Date(),
        updatedAt: new Date(),
    }

    // Check if book already exists
    const existingIndex = books.findIndex(b => b.id === book.id)
    if (existingIndex >= 0) {
        books[existingIndex] = localBook
    } else {
        books.push(localBook)
    }

    localStorage.setItem(LOCAL_BOOKS_KEY, JSON.stringify(books))
    console.log('[LocalStorage] Saved book:', book.id, book.title)

    return localBook
}

/**
 * Delete a book from local storage
 */
export function deleteLocalBook(bookId: string): boolean {
    if (typeof window === 'undefined') return false

    const books = getLocalBooks()
    const filtered = books.filter(b => b.id !== bookId)

    if (filtered.length === books.length) {
        return false // Book not found
    }

    localStorage.setItem(LOCAL_BOOKS_KEY, JSON.stringify(filtered))
    console.log('[LocalStorage] Deleted book:', bookId)

    return true
}

/**
 * Get a single local book by ID
 */
export function getLocalBook(bookId: string): LocalBook | undefined {
    const books = getLocalBooks()
    return books.find(b => b.id === bookId)
}

/**
 * Update a local book
 */
export function updateLocalBook(bookId: string, updates: Partial<LocalBook>): LocalBook | undefined {
    if (typeof window === 'undefined') return undefined

    const books = getLocalBooks()
    const index = books.findIndex(b => b.id === bookId)

    if (index < 0) return undefined

    const updatedBook: LocalBook = {
        ...books[index],
        ...updates,
        isLocal: true,
        updatedAt: new Date(),
    }

    books[index] = updatedBook
    localStorage.setItem(LOCAL_BOOKS_KEY, JSON.stringify(books))

    return updatedBook
}

/**
 * Clear all local books (after migration to cloud)
 */
export function clearLocalBooks(): void {
    if (typeof window === 'undefined') return

    localStorage.removeItem(LOCAL_BOOKS_KEY)
    console.log('[LocalStorage] Cleared all local books')
}

/**
 * Get books for migration to cloud
 * Returns the books and clears local storage
 */
export function getAndClearLocalBooks(): LocalBook[] {
    const books = getLocalBooks()
    clearLocalBooks()
    return books
}
