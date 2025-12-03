/**
 * In-Memory Database for storing books and blocks
 * NOTE: This is for demo/development only
 * For production, swap with PostgreSQL, MongoDB, or your preferred database
 */

import type { Book, ReaderBlock } from "../types"

class InMemoryDB {
  private books: Map<string, Book> = new Map()
  private bookBlocks: Map<string, ReaderBlock[]> = new Map()

  // Book operations
  createBook(book: Book): Book {
    this.books.set(book.id, {
      ...book,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    return this.getBook(book.id)!
  }

  getBook(bookId: string): Book | undefined {
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
    return updated
  }

  deleteBook(bookId: string): boolean {
    this.bookBlocks.delete(bookId)
    return this.books.delete(bookId)
  }

  // Block operations
  setBlocks(bookId: string, blocks: ReaderBlock[]): void {
    this.bookBlocks.set(bookId, blocks)
  }

  getBlocks(bookId: string): ReaderBlock[] {
    return this.bookBlocks.get(bookId) || []
  }

  addBlock(bookId: string, block: ReaderBlock): void {
    const blocks = this.getBlocks(bookId)
    blocks.push(block)
    this.bookBlocks.set(bookId, blocks)
  }

  // Utility
  getAllBooks(): Book[] {
    return Array.from(this.books.values())
  }

  clear(): void {
    this.books.clear()
    this.bookBlocks.clear()
  }
}

// Singleton instance
export const db = new InMemoryDB()
