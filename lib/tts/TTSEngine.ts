/**
 * TTS Engine - Layer 3
 * Works directly on EnhancedBlocks from Layer 2
 * Does NOT require translation to function
 * Supports 3 independent modes: original, translation, alternating
 */

import type { EnhancedBlock, TTSOptions, TTSResult, TTSItem } from "../types"

export class TTSEngine {
  /**
   * Synthesize TTS for a single block based on mode
   * Returns array of TTS results for alternating mode
   */
  async synthesizeBlock(
    enhanced: EnhancedBlock,
    options: TTSOptions
  ): Promise<TTSResult[]> {
    const items = this.prepareItems(enhanced, options.mode)

    if (items.length === 0) {
      throw new Error("No text to synthesize")
    }

    // For alternating mode, synthesize each item separately
    if (options.mode === "alternating") {
      return this.synthesizeAlternating(items, options)
    }

    // For original/translation mode, synthesize single item
    return [await this.synthesizeSingle(items[0], options)]
  }

  /**
   * Synthesize multiple blocks in sequence
   * Returns array of all TTS results
   */
  async synthesizeBlocks(
    enhancedBlocks: EnhancedBlock[],
    options: TTSOptions
  ): Promise<TTSResult[]> {
    const allResults: TTSResult[] = []

    for (const block of enhancedBlocks) {
      // Skip non-text blocks
      if (block.type !== "text" || !block.original) {
        continue
      }

      try {
        const results = await this.synthesizeBlock(block, options)
        allResults.push(...results)
      } catch (error) {
        console.error(`[TTSEngine] Failed to synthesize block ${block.id}:`, error)
        // Continue with next block
      }
    }

    return allResults
  }

  /**
   * Prepare TTS items based on mode
   */
  private prepareItems(
    enhanced: EnhancedBlock,
    mode: TTSOptions["mode"]
  ): TTSItem[] {
    switch (mode) {
      case "original":
        // Mode 1: Read original text only
        return [{
          id: `${enhanced.id}-original`,
          text: enhanced.original,
          type: "original"
        }]

      case "translation":
        // Mode 2: Read translation only (fallback to original if no translation)
        return [{
          id: `${enhanced.id}-translation`,
          text: enhanced.translation || enhanced.original,
          type: "translation"
        }]

      case "alternating":
        // Mode 3: Read original, then translation (if available)
        const items: TTSItem[] = [{
          id: `${enhanced.id}-original`,
          text: enhanced.original,
          type: "original"
        }]

        if (enhanced.translation) {
          items.push({
            id: `${enhanced.id}-translation`,
            text: enhanced.translation,
            type: "translation"
          })
        }

        return items

      default:
        return [{
          id: `${enhanced.id}-original`,
          text: enhanced.original,
          type: "original"
        }]
    }
  }

  /**
   * Synthesize alternating mode: original → translation → original → ...
   */
  private async synthesizeAlternating(
    items: TTSItem[],
    options: TTSOptions
  ): Promise<TTSResult[]> {
    const results: TTSResult[] = []

    for (const item of items) {
      const voiceId = item.type === "original"
        ? (options.originalVoiceId || options.voiceId)
        : (options.translationVoiceId || options.voiceId)

      const result = await this.synthesizeSingle(item, {
        ...options,
        voiceId
      })

      results.push(result)
    }

    return results
  }

  /**
   * Synthesize single TTS item
   * Calls the TTS API endpoint
   */
  private async synthesizeSingle(
    item: TTSItem,
    options: TTSOptions
  ): Promise<TTSResult> {
    try {
      const response = await fetch("/api/tts/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [item],
          voiceId: options.voiceId,
          rate: options.rate,
          pitch: options.pitch,
        }),
      })

      if (!response.ok) {
        throw new Error(`TTS API error: ${response.status}`)
      }

      const data = await response.json()
      return {
        audioUrl: data.audioUrl,
        metadata: {
          voiceId: options.voiceId,
          rate: options.rate,
          pitch: options.pitch,
        }
      }
    } catch (error) {
      console.error("[TTSEngine] Synthesis failed:", error)
      throw error
    }
  }

  /**
   * Get voice for item type
   * Used in alternating mode to select appropriate voice
   */
  getVoiceForType(
    type: "original" | "translation",
    options: TTSOptions
  ): string | undefined {
    if (type === "original") {
      return options.originalVoiceId || options.voiceId
    } else {
      return options.translationVoiceId || options.voiceId
    }
  }
}

// Singleton instance
export const ttsEngine = new TTSEngine()
