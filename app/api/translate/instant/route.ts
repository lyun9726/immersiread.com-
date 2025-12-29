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
        let { texts, sourceLang = "", targetLang = "zh-CN" } = body

        // Filter and clean texts
        if (!texts || !Array.isArray(texts)) {
            console.log('[Instant Translate] Invalid texts input:', typeof texts)
            return NextResponse.json(
                { error: "texts array is required" },
                { status: 400 }
            )
        }

        // Filter out empty, too short, or invalid texts
        const originalLength = texts.length
        texts = texts.filter(t => {
            if (typeof t !== 'string') return false
            const cleaned = t.trim()
            // Must be at least 2 chars and contain some actual content
            return cleaned.length >= 2 && /[a-zA-Z\u4e00-\u9fff]/.test(cleaned)
        })

        console.log(`[Instant Translate] Filtered ${originalLength} -> ${texts.length} valid texts`)

        if (texts.length === 0) {
            console.log('[Instant Translate] No valid texts after filtering, returning empty')
            // Return empty translations instead of error for graceful handling
            return NextResponse.json({
                translations: [],
                provider: "google",
                duration: Date.now() - startTime
            })
        }

        if (!GOOGLE_TRANSLATE_API_KEY) {
            console.error('[Instant Translate] API key not configured')
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
            console.error('[Instant Translate] Google API error:', response.status, errorText)

            // Try to parse error for more info
            try {
                const errorJson = JSON.parse(errorText)
                const errorMessage = errorJson?.error?.message || errorText
                console.error('[Instant Translate] Error message:', errorMessage)
            } catch (e) {
                // Ignore parse error
            }

            return NextResponse.json(
                { error: `Google Translate API error: ${response.status}`, translations: [] },
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
            { error: error instanceof Error ? error.message : "Translation failed", translations: [] },
            { status: 500 }
        )
    }
}
