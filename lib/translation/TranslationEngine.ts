/**
 * Translation Engine - Layer 2
 * Acts as an ENHANCER - adds translations to blocks
 * Does NOT modify original blocks
 * Does NOT control TTS
 */

import type { ReaderBlock, EnhancedBlock, ReadingMode } from "../types"
import { translateBatch } from "../translate/translateBatch"

export class TranslationEngine {
  /**
   * Enhance blocks with translations
   * Original blocks remain unchanged
   */
  async enhanceBlocks(
    blocks: ReaderBlock[],
    targetLang: string = "zh",
    options?: {
      batchSize?: number
      concurrency?: number
      useCache?: boolean
    }
  ): Promise<EnhancedBlock[]> {
    // Filter only text blocks for translation
    const textBlocks = blocks.filter(b => b.type === "text" && typeof b.content === "string")

    if (textBlocks.length === 0) {
      // No text to translate, return as enhanced blocks without translation
      return blocks.map(b => this.toEnhancedBlock(b))
    }

    try {
      // Prepare translation items
      const items = textBlocks.map(b => ({
        id: b.id,
        text: b.content as string,
        lang: "en"
      }))

      // Call translation service
      const translated = await translateBatch(items, {
        batchSize: options?.batchSize ?? 32,
        concurrency: options?.concurrency ?? 3,
        useCache: options?.useCache ?? true,
      })

      // Create translation map
      const translationMap = new Map<string, string>()
      translated.forEach(t => {
        if (t.translation) {
          translationMap.set(t.id, t.translation)
        }
      })

      // Enhance all blocks
      return blocks.map(block => {
        const translation = translationMap.get(block.id)
        return this.toEnhancedBlock(block, translation)
      })

    } catch (error) {
      console.error("[TranslationEngine] Enhancement failed:", error)
      // On error, return blocks without translation
      return blocks.map(b => this.toEnhancedBlock(b))
    }
  }

  /**
   * Convert ReaderBlock to EnhancedBlock
   */
  private toEnhancedBlock(block: ReaderBlock, translation?: string): EnhancedBlock {
    return {
      id: block.id,
      original: typeof block.content === "string" ? block.content : "",
      translation,
      type: block.type,
      meta: block.meta,
    }
  }

  /**
   * Get text for display based on reading mode
   */
  getDisplayText(enhanced: EnhancedBlock, mode: ReadingMode): string {
    switch (mode) {
      case "original":
        return enhanced.original

      case "translation":
        return enhanced.translation || enhanced.original

      case "bilingual":
        if (enhanced.translation) {
          return `${enhanced.original}\n\n${enhanced.translation}`
        }
        return enhanced.original

      default:
        return enhanced.original
    }
  }

  /**
   * Get text for TTS based on mode
   * Returns array of items for alternating mode
   */
  getTTSText(enhanced: EnhancedBlock, mode: ReadingMode): Array<{ text: string; type: "original" | "translation" }> {
    switch (mode) {
      case "original":
        return [{ text: enhanced.original, type: "original" }]

      case "translation":
        return [{ text: enhanced.translation || enhanced.original, type: "translation" }]

      case "bilingual":
        // Alternating mode: first original, then translation
        const items: Array<{ text: string; type: "original" | "translation" }> = [
          { text: enhanced.original, type: "original" }
        ]
        if (enhanced.translation) {
          items.push({ text: enhanced.translation, type: "translation" })
        }
        return items

      default:
        return [{ text: enhanced.original, type: "original" }]
    }
  }
}

// Singleton instance
export const translationEngine = new TranslationEngine()
