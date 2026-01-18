/**
 * Vercel KV-based Database for storing books, blocks, and chapters
 * This replaces inMemoryDB for production use on Vercel Serverless
 * 
 * KV Keys:
 * - book:{bookId} -> Book object
 * - blocks:{bookId} -> ReaderBlock[]
 * - chapters:{bookId} -> Chapter[]
 * - books:index -> string[] (list of book IDs for getAllBooks)
 */

import { kv } from "@vercel/kv"
import type { Book, ReaderBlock, Chapter } from "../types"

class VercelKVDB {
    // Book operations
    async createBook(book: Book): Promise<Book> {
        try {
            const bookWithDates = {
                ...book,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }

            // Store book - @vercel/kv auto-serializes objects
            await kv.set(`book:${book.id}`, bookWithDates)

            // Add to index
            const index = await this.getBookIndex()
            if (!index.includes(book.id)) {
                index.push(book.id)
                await kv.set('books:index', index)
            }

            console.log(`[KV-DB] Created book: ${book.id}`)
            return bookWithDates as unknown as Book
        } catch (error) {
            console.error(`[KV-DB] Error creating book:`, error)
            throw error
        }
    }

    async getBook(bookId: string): Promise<Book | undefined> {
        try {
            const book = await kv.get<Book>(`book:${bookId}`)
            if (!book) return undefined

            // Convert date strings back to Date objects
            return {
                ...book,
                createdAt: book.createdAt ? new Date(book.createdAt) : undefined,
                updatedAt: book.updatedAt ? new Date(book.updatedAt) : undefined,
            }
        } catch (error) {
            console.error(`[KV-DB] Error getting book ${bookId}:`, error)
            return undefined
        }
    }

    async updateBook(bookId: string, updates: Partial<Book>): Promise<Book | undefined> {
        try {
            const existing = await this.getBook(bookId)
            if (!existing) return undefined

            const updated = {
                ...existing,
                ...updates,
                updatedAt: new Date().toISOString(),
            }

            await kv.set(`book:${bookId}`, updated)
            return updated as unknown as Book
        } catch (error) {
            console.error(`[KV-DB] Error updating book ${bookId}:`, error)
            return undefined
        }
    }

    async deleteBook(bookId: string): Promise<boolean> {
        try {
            // Delete book and related data
            await kv.del(`book:${bookId}`)
            await kv.del(`blocks:${bookId}`)
            await kv.del(`chapters:${bookId}`)

            // Remove from index
            const index = await this.getBookIndex()
            const newIndex = index.filter(id => id !== bookId)
            await kv.set('books:index', newIndex)

            console.log(`[KV-DB] Deleted book: ${bookId}`)
            return true
        } catch (error) {
            console.error(`[KV-DB] Error deleting book ${bookId}:`, error)
            return false
        }
    }

    // Block operations
    async setBlocks(bookId: string, blocks: ReaderBlock[]): Promise<void> {
        try {
            await kv.set(`blocks:${bookId}`, blocks)
            console.log(`[KV-DB] Set ${blocks.length} blocks for book: ${bookId}`)
        } catch (error) {
            console.error(`[KV-DB] Error setting blocks for ${bookId}:`, error)
            throw error
        }
    }

    async getBlocks(bookId: string): Promise<ReaderBlock[]> {
        try {
            const blocks = await kv.get<ReaderBlock[]>(`blocks:${bookId}`)
            return blocks || []
        } catch (error) {
            console.error(`[KV-DB] Error getting blocks for ${bookId}:`, error)
            return []
        }
    }

    async addBlock(bookId: string, block: ReaderBlock): Promise<void> {
        const blocks = await this.getBlocks(bookId)
        blocks.push(block)
        await this.setBlocks(bookId, blocks)
    }

    // Chapter operations
    async setChapters(bookId: string, chapters: Chapter[]): Promise<void> {
        try {
            await kv.set(`chapters:${bookId}`, chapters)
            console.log(`[KV-DB] Set ${chapters.length} chapters for book: ${bookId}`)
        } catch (error) {
            console.error(`[KV-DB] Error setting chapters for ${bookId}:`, error)
            throw error
        }
    }

    async getChapters(bookId: string): Promise<Chapter[]> {
        try {
            const chapters = await kv.get<Chapter[]>(`chapters:${bookId}`)
            return chapters || []
        } catch (error) {
            console.error(`[KV-DB] Error getting chapters for ${bookId}:`, error)
            return []
        }
    }

    async addChapter(bookId: string, chapter: Chapter): Promise<void> {
        const chapters = await this.getChapters(bookId)
        chapters.push(chapter)
        await this.setChapters(bookId, chapters)
    }

    // Utility
    async getAllBooks(): Promise<Book[]> {
        try {
            const index = await this.getBookIndex()

            // Use Promise.all to fetch books in parallel instead of serially
            // This significantly improves performance when there are many books
            const bookPromises = index.map(bookId => this.getBook(bookId))
            const books = await Promise.all(bookPromises)

            // Filter out undefined results (deleted books) and sort by createdAt
            return books
                .filter((b): b is Book => !!b)
                .sort((a, b) => {
                    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
                    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
                    return bTime - aTime
                })
        } catch (error) {
            console.error('[KV-DB] Error getting all books:', error)
            return []
        }
    }

    async clear(): Promise<void> {
        try {
            const index = await this.getBookIndex()
            for (const bookId of index) {
                await kv.del(`book:${bookId}`)
                await kv.del(`blocks:${bookId}`)
                await kv.del(`chapters:${bookId}`)
            }
            await kv.set('books:index', [])
            console.log('[KV-DB] Cleared all data')
        } catch (error) {
            console.error('[KV-DB] Error clearing database:', error)
        }
    }

    // Helper to get book index
    private async getBookIndex(): Promise<string[]> {
        try {
            const index = await kv.get<string[]>('books:index')
            return index || []
        } catch (error) {
            console.error('[KV-DB] Error getting book index:', error)
            return []
        }
    }
}

// Singleton instance
export const kvDB = new VercelKVDB()

