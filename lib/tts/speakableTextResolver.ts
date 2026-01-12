/**
 * speakableTextResolver.ts
 * 
 * 核心原则（一句话）：
 * TTS 只接受「最终可朗读的纯文本 string」
 * 永远不从 DOM、不从 UI、不从翻译中间态读取。
 * 
 * ✅ TTS 唯一合法入口
 * ❌ 禁止直接用 UI / DOM / innerText / element.textContent
 */

export type ReadingMode = "original" | "translation" | "bilingual"

export interface SpeakableSource {
    originalText?: string
    translatedText?: string
    readingMode: ReadingMode
    isTranslating?: boolean
}

/**
 * ✅ TTS 唯一合法入口
 * 所有朗读，必须先经过这个函数
 * 
 * @param source - 包含原文、译文、阅读模式的对象
 * @returns 可朗读的纯文本，如果不合法返回 null
 */
export function resolveSpeakableText(source: SpeakableSource): string | null {
    const { originalText, translatedText, readingMode, isTranslating } = source

    // 1️⃣ 翻译中 → 禁止朗读
    if (isTranslating) {
        console.log('[SpeakableResolver] Blocked: translation in progress')
        return null
    }

    // 2️⃣ Translation 模式 → 只读翻译
    if (readingMode === "translation") {
        if (isValidText(translatedText)) {
            return sanitizeText(translatedText!)
        }
        console.log('[SpeakableResolver] Translation mode but no valid translated text')
        return null
    }

    // 3️⃣ Bilingual 模式 → 优先翻译，fallback 原文
    if (readingMode === "bilingual") {
        if (isValidText(translatedText)) {
            return sanitizeText(translatedText!)
        }
        // Fallback to original in bilingual mode
        if (isValidText(originalText)) {
            console.log('[SpeakableResolver] Bilingual mode: falling back to original')
            return sanitizeText(originalText!)
        }
        console.log('[SpeakableResolver] Bilingual mode but no valid text')
        return null
    }

    // 4️⃣ Original 模式 → 只读原文
    if (readingMode === "original") {
        if (isValidText(originalText)) {
            return sanitizeText(originalText!)
        }
        console.log('[SpeakableResolver] Original mode but no valid original text')
        return null
    }

    return null
}

/**
 * 文本合法性校验（防 100% 炸 TTS）
 */
export function isValidText(text?: string): boolean {
    if (!text) return false

    const t = text.trim()

    // 空文本
    if (t.length === 0) return false

    // 翻译占位符
    if (
        t === "…" ||
        t === "..." ||
        t.includes("正在翻译") ||
        t.includes("translating") ||
        t.includes("Loading") ||
        t.includes("加载中")
    ) {
        return false
    }

    // HTML / DOM 泄漏 (应该被清理，这里做最终兜底)
    if (t.includes("<script") || t.includes("<style")) return false

    // 过短文本（可能是噪音）
    if (t.length < 2) return false

    return true
}

/**
 * 文本清洗（防隐藏字符 / 音频不可播）
 */
export function sanitizeText(text: string): string {
    return text
        .replace(/\s+/g, " ")                    // 多空格合并
        .replace(/[\u200B-\u200D\uFEFF]/g, "")   // 零宽字符
        .replace(/\n+/g, " ")                    // 换行合并
        .trim()
}

/**
 * 从完整页面文本中提取可朗读内容
 * 用于 EPUB 页面文本的统一处理
 */
export function resolveSpeakablePageText(
    fullText: string,
    readingMode: ReadingMode,
    isTranslating: boolean = false
): string | null {
    // 翻译中禁止朗读
    if (isTranslating) {
        console.log('[SpeakableResolver] Blocked: page translation in progress')
        return null
    }

    if (!isValidText(fullText)) {
        console.log('[SpeakableResolver] Invalid page text')
        return null
    }

    return sanitizeText(fullText)
}
