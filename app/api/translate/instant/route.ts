/**
 * POST /api/translate/instant
 * 
 * Instant translation using Google Translate for speed
 * Used as the first-pass fast translation before DeepSeek refinement
 */

import { NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // 30 second timeout

// Google Translate API key
const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || ""

interface TranslateRequest {
    texts: string[]           // Array of texts to translate
    sourceLang?: string       // Source language (default: auto-detect)
    targetLang?: string       // Target language (default: zh-CN)
}

interface TranslateResponse {
    translations: string[]    // Translated texts in same order
    detectedLanguage?: string // Detected source language
    provider: "google"        // Translation provider used
    duration: number          // Time taken in ms
}

export async function POST(request: NextRequest) {
    const startTime = Date.now()

    try {
        const body: TranslateRequest = await request.json()
        const { texts, sourceLang = "", targetLang = "zh-CN" } = body

        if (!texts || !Array.isArray(texts) || texts.length === 0) {
            return NextResponse.json(
                { error: "texts array is required" },
                { status: 400 }
            )
        }

        if (!GOOGLE_TRANSLATE_API_KEY) {
            return NextResponse.json(
                { error: "Google Translate API key not configured" },
                { status: 503 }
            )
        }

        console.log(`[Instant Translate] Translating ${texts.length} texts to ${targetLang}`)

        // Use Google Cloud Translation API v2
        const apiUrl = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`

        // Google Translate accepts array of texts
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: texts,
                target: targetLang,
                source: sourceLang || undefined, // Let Google auto-detect if not specified
                format: 'text'
            })
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error('[Instant Translate] Google API error:', errorText)
            return NextResponse.json(
                { error: `Google Translate API error: ${response.status}` },
                { status: 502 }
            )
        }

        const data = await response.json()

        // Extract translations from Google's response format
        const translations = data.data?.translations?.map((t: any) => t.translatedText) || []
        const detectedLanguage = data.data?.translations?.[0]?.detectedSourceLanguage

        const duration = Date.now() - startTime
        console.log(`[Instant Translate] Completed ${translations.length} translations in ${duration}ms`)

        const result: TranslateResponse = {
            translations,
            detectedLanguage,
            provider: "google",
            duration
        }

        return NextResponse.json(result)

    } catch (error) {
        console.error("[Instant Translate] Error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Translation failed" },
            { status: 500 }
        )
    }
}
