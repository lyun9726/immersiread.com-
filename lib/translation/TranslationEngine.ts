/**
 * Translation Engine - Layer 2
 * Acts as an ENHANCER - adds translations to blocks
 * Does NOT modify original blocks
 * Does NOT control TTS
 */

import type { ReaderBlock, EnhancedBlock, ReadingMode } from "../types"

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
    // Get all blocks with text content (any type)
    const textBlocks = blocks.filter(b => typeof b.content === "string" && b.content.trim())

    if (textBlocks.length === 0) {
      // No text to translate, return as enhanced blocks without translation
      return blocks.map(b => this.toEnhancedBlock(b))
    }

    try {
      // Prepare translation items
      const items = textBlocks.map(b => ({
        id: b.id,
        text: b.content as string,
      }))

      console.log(`[TranslationEngine] Translating ${items.length} blocks to ${targetLang}`)

      // Call translation API route (server-side has access to API keys)
      const response = await fetch('/api/translate/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items, targetLang }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Translation API error: ${response.status} ${error}`)
      }

      const data = await response.json()

      // Debug: log the raw API response
      console.log('[TranslationEngine] API response:', JSON.stringify(data).slice(0, 500))

      // Create translation map
      const translationMap = new Map<string, string>()
      if (data.results && Array.isArray(data.results)) {
        console.log(`[TranslationEngine] Results count: ${data.results.length}`)
        data.results.forEach((t: { id: string; translated: string } | null, idx: number) => {
          // Debug first few results
          if (idx < 3) {
            console.log(`[TranslationEngine] Result ${idx}:`, JSON.stringify(t))
          }
          // Skip null results
          if (t && t.translated && !t.translated.includes('DEMO')) {
            translationMap.set(t.id, t.translated)
          }
        })
      } else {
        console.log('[TranslationEngine] No results array found in response')
      }

      console.log(`[TranslationEngine] Got ${translationMap.size} translations`)

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
