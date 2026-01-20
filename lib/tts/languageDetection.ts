/**
 * Language Detection Utility for TTS
 * Detects the primary language of text based on character patterns
 */

// Unicode ranges for different languages
const LANGUAGE_PATTERNS = {
    // East Asian
    ko: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/g, // Korean Hangul
    ja: /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF]/g, // Japanese Hiragana/Katakana
    zh: /[\u4E00-\u9FFF\u3400-\u4DBF]/g, // Chinese characters (also used in Japanese)

    // Southeast Asian
    th: /[\u0E00-\u0E7F]/g, // Thai
    vi: /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, // Vietnamese

    // South Asian
    hi: /[\u0900-\u097F]/g, // Hindi (Devanagari)
    bn: /[\u0980-\u09FF]/g, // Bengali
    ta: /[\u0B80-\u0BFF]/g, // Tamil
    te: /[\u0C00-\u0C7F]/g, // Telugu

    // Middle Eastern
    ar: /[\u0600-\u06FF\u0750-\u077F]/g, // Arabic
    he: /[\u0590-\u05FF]/g, // Hebrew
    fa: /[\u0600-\u06FF]/g, // Persian (overlaps with Arabic)

    // European
    ru: /[\u0400-\u04FF]/g, // Russian (Cyrillic)
    el: /[\u0370-\u03FF]/g, // Greek
    de: /[äöüßÄÖÜ]/g, // German specific chars
    fr: /[àâæçéèêëîïôœùûüÿ]/gi, // French specific chars
    es: /[áéíóúüñ¿¡]/gi, // Spanish specific chars
    pt: /[àáâãçéêíóôõú]/gi, // Portuguese specific chars
    it: /[àèéìíîòóùú]/gi, // Italian specific chars
    pl: /[ąćęłńóśźż]/gi, // Polish
    tr: /[çğıöşü]/gi, // Turkish
    nl: /[ĳ]/gi, // Dutch
    sv: /[åäö]/gi, // Swedish
    da: /[æøå]/gi, // Danish
    no: /[æøå]/gi, // Norwegian
    fi: /[äö]/gi, // Finnish

    // Default (Latin/English)
    en: /[a-zA-Z]/g,
};

// Language priority for disambiguation (when multiple matches)
const LANGUAGE_PRIORITY = [
    'ko', 'ja', 'th', 'hi', 'bn', 'ta', 'te', 'ar', 'he', 'ru', 'el',
    'zh', 'vi', 'de', 'fr', 'es', 'pt', 'it', 'pl', 'tr', 'nl', 'sv', 'da', 'no', 'fi',
    'en'
];

export interface LanguageDetectionResult {
    language: string;
    confidence: number;
    scores: Record<string, number>;
}

/**
 * Detect the primary language of the given text
 * @param text - Text to analyze
 * @returns Detected language code and confidence
 */
export function detectLanguage(text: string): LanguageDetectionResult {
    if (!text || text.trim().length === 0) {
        return { language: 'en', confidence: 0, scores: {} };
    }

    const cleanText = text.trim();
    const totalChars = cleanText.replace(/\s/g, '').length;

    if (totalChars === 0) {
        return { language: 'en', confidence: 0, scores: {} };
    }

    const scores: Record<string, number> = {};

    // Count matches for each language pattern
    for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
        const matches = cleanText.match(pattern);
        const matchCount = matches ? matches.length : 0;
        scores[lang] = matchCount / totalChars;
    }

    // Special handling for Chinese vs Japanese
    // If we have Hiragana/Katakana, it's Japanese even if there are Chinese characters
    if (scores['ja'] > 0.05) {
        // Has significant Japanese kana, likely Japanese
        scores['ja'] += scores['zh'] * 0.5; // Add portion of kanji to Japanese score
        scores['zh'] *= 0.3; // Reduce Chinese score
    }

    // Find the language with highest score
    let bestLang = 'en';
    let bestScore = 0;

    // Use priority order for tie-breaking
    for (const lang of LANGUAGE_PRIORITY) {
        if (scores[lang] && scores[lang] > bestScore) {
            bestScore = scores[lang];
            bestLang = lang;
        }
    }

    // If best score is very low but we have Latin characters, default to English
    if (bestScore < 0.1 && scores['en'] > 0.5) {
        bestLang = 'en';
        bestScore = scores['en'];
    }

    return {
        language: bestLang,
        confidence: Math.min(bestScore * 2, 1), // Scale to 0-1
        scores
    };
}

/**
 * Get the best TTS voice for a detected language
 * @param detectedLang - Language code from detection
 * @param availableVoices - Available TTS voices
 * @returns Best matching voice or null
 */
export function getBestVoiceForLanguage(
    detectedLang: string,
    availableVoices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
    // Map detected language to possible voice language prefixes
    const voicePrefixes: Record<string, string[]> = {
        'ko': ['ko-KR', 'ko'],
        'ja': ['ja-JP', 'ja'],
        'zh': ['zh-CN', 'zh-TW', 'zh-HK', 'zh', 'cmn'],
        'th': ['th-TH', 'th'],
        'vi': ['vi-VN', 'vi'],
        'hi': ['hi-IN', 'hi'],
        'bn': ['bn-IN', 'bn-BD', 'bn'],
        'ta': ['ta-IN', 'ta'],
        'te': ['te-IN', 'te'],
        'ar': ['ar-SA', 'ar-EG', 'ar'],
        'he': ['he-IL', 'he'],
        'fa': ['fa-IR', 'fa'],
        'ru': ['ru-RU', 'ru'],
        'el': ['el-GR', 'el'],
        'de': ['de-DE', 'de-AT', 'de-CH', 'de'],
        'fr': ['fr-FR', 'fr-CA', 'fr'],
        'es': ['es-ES', 'es-MX', 'es-US', 'es'],
        'pt': ['pt-BR', 'pt-PT', 'pt'],
        'it': ['it-IT', 'it'],
        'pl': ['pl-PL', 'pl'],
        'tr': ['tr-TR', 'tr'],
        'nl': ['nl-NL', 'nl-BE', 'nl'],
        'sv': ['sv-SE', 'sv'],
        'da': ['da-DK', 'da'],
        'no': ['nb-NO', 'nn-NO', 'no'],
        'fi': ['fi-FI', 'fi'],
        'en': ['en-US', 'en-GB', 'en-AU', 'en'],
    };

    const prefixes = voicePrefixes[detectedLang] || [detectedLang];

    // Try each prefix in order of preference
    for (const prefix of prefixes) {
        // Exact match first
        const exactMatch = availableVoices.find(v =>
            v.lang.toLowerCase() === prefix.toLowerCase()
        );
        if (exactMatch) return exactMatch;

        // Prefix match
        const prefixMatch = availableVoices.find(v =>
            v.lang.toLowerCase().startsWith(prefix.toLowerCase().split('-')[0])
        );
        if (prefixMatch) return prefixMatch;
    }

    return null;
}

/**
 * Quick language check - returns true if text contains significant non-Latin characters
 */
export function hasNonLatinCharacters(text: string): boolean {
    const nonLatinPattern = /[\u0080-\uFFFF]/;
    return nonLatinPattern.test(text);
}

/**
 * Check if text is primarily CJK (Chinese, Japanese, Korean)
 */
export function isCJKText(text: string): boolean {
    const cjkPattern = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g;
    const matches = text.match(cjkPattern);
    const totalChars = text.replace(/\s/g, '').length;
    return matches ? (matches.length / totalChars) > 0.3 : false;
}
