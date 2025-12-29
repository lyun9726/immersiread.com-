/**
 * POST /api/translate/instant
 * 
 * Instant translation using Google Translate for speed
 * Used as the first-pass fast translation before DeepSeek refinement
 * 
 * Features:
 * - Batch processing to handle large text arrays (Google limits ~128 texts per request)
 * - Retry logic with exponential backoff
 * - Graceful error handling
 */

import { NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60 second timeout for larger batches

// Google Translate API key
const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || ""

// Batch size - Google Translate API limits to ~128 texts per request
const BATCH_SIZE = 50 // Use smaller batches for reliability
const MAX_RETRIES = 2
const RETRY_DELAY = 500 // ms

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
    batchesProcessed?: number // Number of batches processed
}

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Translate a single batch with retry logic
async function translateBatch(
    texts: string[],
    targetLang: string,
    sourceLang: string,
    apiUrl: string,
    retryCount = 0
): Promise<string[]> {
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: texts,
                target: targetLang,
                source: sourceLang || undefined,
                format: 'text'
            })
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error(`[Instant Translate] Batch error ${response.status}:`, errorText.substring(0, 200))

            // Retry on 5xx errors or 429 (rate limit)
            if ((response.status >= 500 || response.status === 429) && retryCount < MAX_RETRIES) {
                console.log(`[Instant Translate] Retrying batch (attempt ${retryCount + 1}/${MAX_RETRIES})...`)
                await delay(RETRY_DELAY * (retryCount + 1)) // Exponential backoff
                return translateBatch(texts, targetLang, sourceLang, apiUrl, retryCount + 1)
            }

            // Return original texts on failure (graceful degradation)
            console.warn(`[Instant Translate] Batch failed after ${retryCount} retries, returning original texts`)
            return texts
        }

        const data = await response.json()
        return data.data?.translations?.map((t: any) => t.translatedText) || texts

    } catch (error) {
        console.error('[Instant Translate] Batch network error:', error)

        // Retry on network errors
        if (retryCount < MAX_RETRIES) {
            console.log(`[Instant Translate] Retrying batch after network error (attempt ${retryCount + 1}/${MAX_RETRIES})...`)
            await delay(RETRY_DELAY * (retryCount + 1))
            return translateBatch(texts, targetLang, sourceLang, apiUrl, retryCount + 1)
        }

        return texts // Return original texts on failure
    }
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
            return cleaned.length >= 2 && /[a-zA-Z\u4e00-\u9fff]/.test(cleaned)
        })

        console.log(`[Instant Translate] Filtered ${originalLength} -> ${texts.length} valid texts`)

        if (texts.length === 0) {
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

        const apiUrl = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`

        // Split texts into batches
        const batches: string[][] = []
        for (let i = 0; i < texts.length; i += BATCH_SIZE) {
            batches.push(texts.slice(i, i + BATCH_SIZE))
        }

        console.log(`[Instant Translate] Processing ${texts.length} texts in ${batches.length} batches`)

        // Process batches sequentially to avoid rate limiting
        const allTranslations: string[] = []
        let detectedLanguage: string | undefined

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i]
            console.log(`[Instant Translate] Processing batch ${i + 1}/${batches.length} (${batch.length} texts)`)

            const translations = await translateBatch(batch, targetLang, sourceLang, apiUrl)
            allTranslations.push(...translations)

            // Small delay between batches to avoid rate limiting
            if (i < batches.length - 1) {
                await delay(100)
            }
        }

        const duration = Date.now() - startTime
        console.log(`[Instant Translate] Completed ${allTranslations.length} translations in ${duration}ms (${batches.length} batches)`)

        const result: TranslateResponse = {
            translations: allTranslations,
            detectedLanguage,
            provider: "google",
            duration,
            batchesProcessed: batches.length
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
