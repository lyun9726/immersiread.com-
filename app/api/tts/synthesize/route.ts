/**
 * POST /api/tts/synthesize
 * Synthesize text to speech
 */

import { NextRequest, NextResponse } from "next/server"
import type { TTSSynthesizeRequest, TTSSynthesizeResponse } from "@/lib/types"
import { ttsProvider } from "@/lib/tts/provider"

export async function POST(request: NextRequest) {
  try {
    const body: TTSSynthesizeRequest = await request.json()
    const { items, voiceId = "default", rate = 1.0, pitch = 1.0 } = body

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Items are required" }, { status: 400 })
    }

    console.log(`[TTS Synthesize] Synthesizing ${items.length} items with voice=${voiceId}, rate=${rate}, pitch=${pitch}`)

    // Use TTS provider
    const result = await ttsProvider.synthesize(items, {
      voiceId,
      rate,
      pitch,
    })

    const response: TTSSynthesizeResponse = {
      audioUrl: result.audioUrl,
      metadata: {
        rate,
        pitch,
        voiceId,
        ...result.metadata,
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("[TTS Synthesize] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
