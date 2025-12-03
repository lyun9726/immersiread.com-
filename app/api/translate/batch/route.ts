/**
 * POST /api/translate/batch
 * Batch translate text items using Claude API or demo mode
 */

import { NextRequest, NextResponse } from "next/server"
import type { TranslateBatchRequest, TranslateBatchResponse } from "@/lib/types"
import { cache } from "@/lib/cache/simpleCache"
import { translateBatch } from "@/lib/translate/translateBatch"

export async function POST(request: NextRequest) {
  try {
    const body: TranslateBatchRequest = await request.json()
    const { items, targetLang } = body

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Items are required" }, { status: 400 })
    }

    console.log(`[Translate Batch] Translating ${items.length} items to ${targetLang}`)

    // Check if Claude API is configured
    const useRealTranslation = !!process.env.ANTHROPIC_API_KEY

    if (useRealTranslation) {
      // Use real Claude API translation
      console.log("[Translate Batch] Using Claude API for translation")

      try {
        const inputItems = items.map(item => ({
          id: item.id,
          text: item.text,
          lang: "en" // Assume English for now
        }))

        const translated = await translateBatch(inputItems, {
          batchSize: 32,
          concurrency: 3,
          retries: 3,
          useCache: true,
        })

        const results = translated.map(t => ({
          id: t.id,
          translated: t.translation || t.original, // Fallback to original if translation failed
        }))

        const response: TranslateBatchResponse = { results }
        return NextResponse.json(response)

      } catch (error) {
        console.error("[Translate Batch] Claude API error, falling back to demo mode:", error)
        // Fall through to demo mode
      }
    }

    // Demo mode: simple translation with cache
    console.log("[Translate Batch] Using demo translation mode")

    const results = items.map((item) => {
      const cacheKey = `translate:${item.id}:${targetLang}:${item.text}`

      // Check cache
      const cached = cache.get<string>(cacheKey)
      if (cached) {
        console.log(`[Translate Batch] Cache hit for item ${item.id}`)
        return {
          id: item.id,
          translated: cached,
        }
      }

      // Demo translation: append language suffix
      const translated = `${item.text} (${targetLang.toUpperCase()} DEMO)`

      // Cache the result
      cache.set(cacheKey, translated, 3600000) // 1 hour TTL

      return {
        id: item.id,
        translated,
      }
    })

    const response: TranslateBatchResponse = {
      results,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("[Translate Batch] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
