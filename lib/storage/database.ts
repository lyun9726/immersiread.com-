/**
 * Unified Database Interface
 * 
 * Automatically selects between:
 * - InMemoryDB (file-based) for local development
 * - VercelKV for production on Vercel
 * 
 * All methods are async to support both backends
 */

import type { Book, ReaderBlock, Chapter } from "../types"

// Detect if running on Vercel
const isVercel = process.env.VERCEL === '1' ||
    process.env.KV_REST_API_URL !== undefined

console.log(`[DB] Environment: ${isVercel ? 'Vercel (KV)' : 'Local (InMemory)'}`)

// Database interface
interface Database {
    createBook(book: Book): Promise<Book>
    getBook(bookId: string): Promise<Book | undefined>
    updateBook(bookId: string, updates: Partial<Book>): Promise<Book | undefined>
    deleteBook(bookId: string): Promise<boolean>
    setBlocks(bookId: string, blocks: ReaderBlock[]): Promise<void>
    getBlocks(bookId: string): Promise<ReaderBlock[]>
    addBlock(bookId: string, block: ReaderBlock): Promise<void>
    setChapters(bookId: string, chapters: Chapter[]): Promise<void>
    getChapters(bookId: string): Promise<Chapter[]>
    addChapter(bookId: string, chapter: Chapter): Promise<void>
    getAllBooks(): Promise<Book[]>
    clear(): Promise<void>
}

// Wrapper for inMemoryDB to make it async
class InMemoryDBWrapper implements Database {
    private db: typeof import('./inMemoryDB').db | null = null

    private async getDb() {
        if (!this.db) {
            const module = await import('./inMemoryDB')
            this.db = module.db
        }
        return this.db
    }

    async createBook(book: Book): Promise<Book> {
        const db = await this.getDb()
        return db.createBook(book)
    }

    async getBook(bookId: string): Promise<Book | undefined> {
        const db = await this.getDb()
        return db.getBook(bookId)
    }

    async updateBook(bookId: string, updates: Partial<Book>): Promise<Book | undefined> {
        const db = await this.getDb()
        return db.updateBook(bookId, updates)
    }

    async deleteBook(bookId: string): Promise<boolean> {
        const db = await this.getDb()
        return db.deleteBook(bookId)
    }

    async setBlocks(bookId: string, blocks: ReaderBlock[]): Promise<void> {
        const db = await this.getDb()
        db.setBlocks(bookId, blocks)
    }

    async getBlocks(bookId: string): Promise<ReaderBlock[]> {
        const db = await this.getDb()
        return db.getBlocks(bookId)
    }

    async addBlock(bookId: string, block: ReaderBlock): Promise<void> {
        const db = await this.getDb()
        db.addBlock(bookId, block)
    }

    async setChapters(bookId: string, chapters: Chapter[]): Promise<void> {
        const db = await this.getDb()
        db.setChapters(bookId, chapters)
    }

    async getChapters(bookId: string): Promise<Chapter[]> {
        const db = await this.getDb()
        return db.getChapters(bookId)
    }

    async addChapter(bookId: string, chapter: Chapter): Promise<void> {
        const db = await this.getDb()
        db.addChapter(bookId, chapter)
    }

    async getAllBooks(): Promise<Book[]> {
        const db = await this.getDb()
        return db.getAllBooks()
    }

    async clear(): Promise<void> {
        const db = await this.getDb()
        db.clear()
    }
}

// KV DB wrapper
class KVDBWrapper implements Database {
    private db: typeof import('./kvDB').kvDB | null = null

    private async getDb() {
        if (!this.db) {
            const module = await import('./kvDB')
            this.db = module.kvDB
        }
        return this.db
    }

    async createBook(book: Book): Promise<Book> {
        const db = await this.getDb()
        return db.createBook(book)
    }

    async getBook(bookId: string): Promise<Book | undefined> {
        const db = await this.getDb()
        return db.getBook(bookId)
    }

    async updateBook(bookId: string, updates: Partial<Book>): Promise<Book | undefined> {
        const db = await this.getDb()
        return db.updateBook(bookId, updates)
    }

    async deleteBook(bookId: string): Promise<boolean> {
        const db = await this.getDb()
        return db.deleteBook(bookId)
    }

    async setBlocks(bookId: string, blocks: ReaderBlock[]): Promise<void> {
        const db = await this.getDb()
        await db.setBlocks(bookId, blocks)
    }

    async getBlocks(bookId: string): Promise<ReaderBlock[]> {
        const db = await this.getDb()
        return db.getBlocks(bookId)
    }

    async addBlock(bookId: string, block: ReaderBlock): Promise<void> {
        const db = await this.getDb()
        await db.addBlock(bookId, block)
    }

    async setChapters(bookId: string, chapters: Chapter[]): Promise<void> {
        const db = await this.getDb()
        await db.setChapters(bookId, chapters)
    }

    async getChapters(bookId: string): Promise<Chapter[]> {
        const db = await this.getDb()
        return db.getChapters(bookId)
    }

    async addChapter(bookId: string, chapter: Chapter): Promise<void> {
        const db = await this.getDb()
        await db.addChapter(bookId, chapter)
    }

    async getAllBooks(): Promise<Book[]> {
        const db = await this.getDb()
        return db.getAllBooks()
    }

    async clear(): Promise<void> {
        const db = await this.getDb()
        await db.clear()
    }
}

// Export the appropriate database based on environment
export const db: Database = isVercel ? new KVDBWrapper() : new InMemoryDBWrapper()
