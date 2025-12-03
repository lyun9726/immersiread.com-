/**
 * POST /api/translate/batch
 * Batch translate text items
 */

import { NextRequest, NextResponse } from "next/server"
import type { TranslateBatchRequest, TranslateBatchResponse } from "@/lib/types"
import { cache } from "@/lib/cache/simpleCache"

export async function POST(request: NextRequest) {
  try {
    const body: TranslateBatchRequest = await request.json()
    const { items, targetLang } = body

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Items are required" }, { status: 400 })
    }

    console.log(`[Translate Batch] Translating ${items.length} items to ${targetLang}`)

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
