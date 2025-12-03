/**
 * In-Memory Database for storing books, blocks, and chapters
 * NOTE: This is for demo/development only
 * For production, swap with PostgreSQL, MongoDB, or your preferred database
 *
 * Now with file-based persistence to survive hot reloads
 */

import type { Book, ReaderBlock, Chapter } from "../types"
import fs from "fs"
import path from "path"

const DB_FILE = path.join(process.cwd(), ".tmp", "db.json")

class InMemoryDB {
  private books: Map<string, Book> = new Map()
  private bookBlocks: Map<string, ReaderBlock[]> = new Map()
  private bookChapters: Map<string, Chapter[]> = new Map()

  constructor() {
    this.load()
  }

  // Persistence methods
  private load(): void {
    try {
      if (fs.existsSync(DB_FILE)) {
        const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"))

        // Convert books back to Map and restore Date objects
        const booksEntries = Object.entries(data.books || {}).map(([id, book]: [string, any]) => {
          return [id, {
            ...book,
            createdAt: book.createdAt ? new Date(book.createdAt) : undefined,
            updatedAt: book.updatedAt ? new Date(book.updatedAt) : undefined,
          }]
        })
        this.books = new Map(booksEntries)

        // Convert blocks and chapters back to Map
        this.bookBlocks = new Map(Object.entries(data.bookBlocks || {}))
        this.bookChapters = new Map(Object.entries(data.bookChapters || {}))

        console.log(`[DB] Loaded ${this.books.size} books from disk`)
      }
    } catch (error) {
      console.error("[DB] Error loading database:", error)
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(DB_FILE)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const data = {
        books: Object.fromEntries(this.books),
        bookBlocks: Object.fromEntries(this.bookBlocks),
        bookChapters: Object.fromEntries(this.bookChapters),
      }

      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error("[DB] Error saving database:", error)
    }
  }

  // Book operations
  createBook(book: Book): Book {
    this.books.set(book.id, {
      ...book,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    this.save()
    return this.getBook(book.id)!
  }

  getBook(bookId: string): Book | undefined {
    // Reload from disk to ensure we have the latest data
    this.load()
    return this.books.get(bookId)
  }

  updateBook(bookId: string, updates: Partial<Book>): Book | undefined {
    const existing = this.books.get(bookId)
    if (!existing) return undefined

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    }
    this.books.set(bookId, updated)
    this.save()
    return updated
  }

  deleteBook(bookId: string): boolean {
    this.bookBlocks.delete(bookId)
    this.bookChapters.delete(bookId)
    const result = this.books.delete(bookId)
    this.save()
    return result
  }

  // Block operations
  setBlocks(bookId: string, blocks: ReaderBlock[]): void {
    this.bookBlocks.set(bookId, blocks)
    this.save()
  }

  getBlocks(bookId: string): ReaderBlock[] {
    // Reload from disk to ensure we have the latest data
    this.load()
    return this.bookBlocks.get(bookId) || []
  }

  addBlock(bookId: string, block: ReaderBlock): void {
    const blocks = this.getBlocks(bookId)
    blocks.push(block)
    this.bookBlocks.set(bookId, blocks)
    this.save()
  }

  // Chapter operations
  setChapters(bookId: string, chapters: Chapter[]): void {
    this.bookChapters.set(bookId, chapters)
    this.save()
  }

  getChapters(bookId: string): Chapter[] {
    // Reload from disk to ensure we have the latest data
    this.load()
    return this.bookChapters.get(bookId) || []
  }

  addChapter(bookId: string, chapter: Chapter): void {
    const chapters = this.getChapters(bookId)
    chapters.push(chapter)
    this.bookChapters.set(bookId, chapters)
    this.save()
  }

  // Utility
  getAllBooks(): Book[] {
    // Reload from disk to get the latest data
    // This ensures we always return fresh data even if the file was updated by another process
    this.load()
    return Array.from(this.books.values())
  }

  clear(): void {
    this.books.clear()
    this.bookBlocks.clear()
    this.bookChapters.clear()
    this.save()
  }
}

// Singleton instance
export const db = new InMemoryDB()
