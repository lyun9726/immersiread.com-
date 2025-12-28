/**
 * POST /api/translate/epub-chapter
 * 
 * Translate a single EPUB chapter instantly using Google Translate
 * For progressive/on-demand translation as user reads
 */

import { NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || ""

interface ChapterTranslateRequest {
    bookId: string
    chapterHtml: string        // The HTML content of the current chapter
    targetLang?: string        // Target language (default: zh-CN)
}

interface TranslatedSegment {
    original: string
    translated: string
    tag: string
}

export async function POST(request: NextRequest) {
    const startTime = Date.now()

    try {
        const body: ChapterTranslateRequest = await request.json()
        const { bookId, chapterHtml, targetLang = "zh-CN" } = body

        if (!bookId || !chapterHtml) {
            return NextResponse.json(
                { error: "bookId and chapterHtml are required" },
                { status: 400 }
            )
        }

        if (!GOOGLE_TRANSLATE_API_KEY) {
            return NextResponse.json(
                { error: "Google Translate API key not configured" },
                { status: 503 }
            )
        }

        console.log(`[Chapter Translate] Starting for book: ${bookId}, HTML length: ${chapterHtml.length}`)

        // Extract text segments from HTML
        const segments: { text: string; tag: string; position: number }[] = []

        // Match paragraph-level elements
        const tagPattern = /<(p|h1|h2|h3|h4|h5|h6|div|li|td|th|span|blockquote|figcaption)([^>]*)>([\s\S]*?)<\/\1>/gi
        let match

        while ((match = tagPattern.exec(chapterHtml)) !== null) {
            const tag = match[1]
            const innerHtml = match[3]
            // Strip nested HTML to get plain text
            const plainText = innerHtml.replace(/<[^>]*>/g, '').trim()

            // Only process segments with meaningful text (>5 chars)
            if (plainText.length >= 5) {
                segments.push({
                    text: plainText,
                    tag: tag.toLowerCase(),
                    position: match.index
                })
            }
        }

        if (segments.length === 0) {
            return NextResponse.json({
                translatedHtml: chapterHtml,
                segmentCount: 0,
                duration: Date.now() - startTime,
                provider: "none"
            })
        }

        console.log(`[Chapter Translate] Found ${segments.length} segments to translate`)

        // Translate all segments with Google Translate
        const textsToTranslate = segments.map(s => s.text)

        // Google Translate API call
        const apiUrl = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                q: textsToTranslate,
                target: targetLang,
                format: 'text'
            })
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error('[Chapter Translate] Google API error:', errorText)
            return NextResponse.json(
                { error: `Google Translate API error: ${response.status}` },
                { status: 502 }
            )
        }

        const data = await response.json()
        const translations = data.data?.translations?.map((t: any) => t.translatedText) || []

        // Build translated segments
        const translatedSegments: TranslatedSegment[] = segments.map((seg, i) => ({
            original: seg.text,
            translated: translations[i] || seg.text,
            tag: seg.tag
        }))

        // Inject translations into HTML
        // We'll add translated text as a new element after each original
        let modifiedHtml = chapterHtml

        // Process in reverse order to preserve positions
        for (let i = segments.length - 1; i >= 0; i--) {
            const seg = segments[i]
            const translation = translations[i]

            if (!translation) continue

            // Find the closing tag position for this element
            const originalMatch = chapterHtml.substring(seg.position).match(new RegExp(`<${seg.tag}([^>]*)>([\\s\\S]*?)<\\/${seg.tag}>`, 'i'))
            if (!originalMatch) continue

            const fullMatch = originalMatch[0]
            const endPos = seg.position + fullMatch.length

            // Create bilingual structure
            const attrs = originalMatch[1] || ''
            const originalContent = originalMatch[2]

            // Add bbm classes for mode switching
            const newAttrs = attrs.includes('class=')
                ? attrs.replace(/class="([^"]*)"/, 'class="$1 bbm-original"')
                : attrs + ' class="bbm-original"'

            const bilingualHtml = `<${seg.tag}${newAttrs}>${originalContent}</${seg.tag}><${seg.tag} class="bbm-translated" style="background-color: rgba(59, 130, 246, 0.1); border-left: 3px solid rgba(59, 130, 246, 0.6); padding-left: 0.75em; margin-top: 0.5em;">${translation}</${seg.tag}>`

            modifiedHtml = modifiedHtml.substring(0, seg.position) + bilingualHtml + modifiedHtml.substring(endPos)
        }

        const duration = Date.now() - startTime
        console.log(`[Chapter Translate] Completed in ${duration}ms`)

        return NextResponse.json({
            translatedHtml: modifiedHtml,
            segments: translatedSegments,
            segmentCount: segments.length,
            duration,
            provider: "google"
        })

    } catch (error) {
        console.error("[Chapter Translate] Error:", error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Translation failed" },
            { status: 500 }
        )
    }
}
