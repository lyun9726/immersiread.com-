/**
 * ReaderEngine - orchestrates parsing of different content sources
 */

import type { ParseResult } from "../types"
import { ReaderAdapterStub } from "./adapters/ReaderAdapterStub"

export class ReaderEngine {
  private adapter: ReaderAdapterStub

  constructor() {
    this.adapter = new ReaderAdapterStub()
  }

  async parseFromUrl(url: string): Promise<ParseResult> {
    return this.adapter.parseFromUrl(url)
  }

  async parseFromBuffer(buffer: Buffer, contentType: string): Promise<ParseResult> {
    return this.adapter.parseFromBuffer(buffer, contentType)
  }

  async parseHTML(html: string, url?: string): Promise<ParseResult> {
    return this.adapter.parseHTML(html, url)
  }
}

// Singleton instance
export const readerEngine = new ReaderEngine()
