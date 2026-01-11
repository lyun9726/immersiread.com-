"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { UILanguage, AppLanguageSettings } from "@/lib/types"

/**
 * Language Settings Store
 * 
 * Three-Layer Language System:
 * 1. App Level: uiLanguage + defaultTargetLanguage (this store)
 * 2. Book Level: originalLanguage + targetLanguage + targetLanguageSource (per book)
 * 3. Reading Level: readingMode (in reader only)
 * 
 * ⚠️ KEY RULES:
 * - UI Language ≠ Translation Language (completely decoupled)
 * - Changing UI Language does NOT trigger re-translation
 * - Changing UI Language does NOT change reading mode
 * - Reading Mode changes do NOT modify targetLanguage
 */

// Language definition
export interface LanguageOption {
    code: string
    name: string
    nativeName: string
    category?: "common" | "special"
}

// Common languages (shown first in dropdown)
export const COMMON_LANGUAGES: LanguageOption[] = [
    { code: "en", name: "English", nativeName: "English", category: "common" },
    { code: "zh", name: "Chinese (Simplified)", nativeName: "中文（简体）", category: "common" },
    { code: "zh-TW", name: "Chinese (Traditional - Taiwan)", nativeName: "繁體中文（台灣）", category: "common" },
    { code: "zh-HK", name: "Chinese (Traditional - Hong Kong)", nativeName: "繁體中文（香港）", category: "common" },
    { code: "yue", name: "Cantonese", nativeName: "粤语", category: "common" },
    { code: "wuu", name: "Classical Chinese", nativeName: "文言文", category: "common" },
    { code: "ja", name: "Japanese", nativeName: "日本語", category: "common" },
    { code: "ko", name: "Korean", nativeName: "한국어", category: "common" },
    { code: "es", name: "Spanish", nativeName: "Español", category: "common" },
    { code: "fr", name: "French", nativeName: "Français", category: "common" },
    { code: "de", name: "German", nativeName: "Deutsch", category: "common" },
    { code: "it", name: "Italian", nativeName: "Italiano", category: "common" },
    { code: "pt", name: "Portuguese", nativeName: "Português", category: "common" },
    { code: "ru", name: "Russian", nativeName: "Русский", category: "common" },
    { code: "ar", name: "Arabic", nativeName: "العربية", category: "common" },
    { code: "hi", name: "Hindi", nativeName: "हिन्दी", category: "common" },
]

// All 117 languages (including common)
export const ALL_LANGUAGES: LanguageOption[] = [
    // Common languages first
    ...COMMON_LANGUAGES,
    // Additional languages (alphabetically sorted by English name)
    { code: "af", name: "Afrikaans", nativeName: "Afrikaans" },
    { code: "sq", name: "Albanian", nativeName: "Shqip" },
    { code: "am", name: "Amharic", nativeName: "አማርኛ" },
    { code: "hy", name: "Armenian", nativeName: "Հdelays" },
    { code: "az", name: "Azerbaijani", nativeName: "Azərbaycan dili" },
    { code: "eu", name: "Basque", nativeName: "Euskara" },
    { code: "be", name: "Belarusian", nativeName: "Беларуская" },
    { code: "bn", name: "Bengali", nativeName: "বাংলা" },
    { code: "bs", name: "Bosnian", nativeName: "Bosanski" },
    { code: "bg", name: "Bulgarian", nativeName: "Български" },
    { code: "my", name: "Burmese", nativeName: "မြန်မာစာ" },
    { code: "ca", name: "Catalan", nativeName: "Català" },
    { code: "ceb", name: "Cebuano", nativeName: "Cebuano" },
    { code: "ny", name: "Chichewa", nativeName: "Chichewa" },
    { code: "hr", name: "Croatian", nativeName: "Hrvatski" },
    { code: "cs", name: "Czech", nativeName: "Čeština" },
    { code: "da", name: "Danish", nativeName: "Dansk" },
    { code: "nl", name: "Dutch", nativeName: "Nederlands" },
    { code: "eo", name: "Esperanto", nativeName: "Esperanto" },
    { code: "et", name: "Estonian", nativeName: "Eesti" },
    { code: "fi", name: "Finnish", nativeName: "Suomi" },
    { code: "fy", name: "Frisian", nativeName: "Frysk" },
    { code: "gl", name: "Galician", nativeName: "Galego" },
    { code: "ka", name: "Georgian", nativeName: "ქართული" },
    { code: "el", name: "Greek", nativeName: "Ελληνικά" },
    { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
    { code: "ht", name: "Haitian Creole", nativeName: "Kreyòl Ayisyen" },
    { code: "ha", name: "Hausa", nativeName: "Hausa" },
    { code: "haw", name: "Hawaiian", nativeName: "ʻŌlelo Hawaiʻi" },
    { code: "he", name: "Hebrew", nativeName: "עברית" },
    { code: "hmn", name: "Hmong", nativeName: "Hmong" },
    { code: "hu", name: "Hungarian", nativeName: "Magyar" },
    { code: "is", name: "Icelandic", nativeName: "Íslenska" },
    { code: "ig", name: "Igbo", nativeName: "Igbo" },
    { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
    { code: "ga", name: "Irish", nativeName: "Gaeilge" },
    { code: "jv", name: "Javanese", nativeName: "Basa Jawa" },
    { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ" },
    { code: "kk", name: "Kazakh", nativeName: "Қазақ тілі" },
    { code: "km", name: "Khmer", nativeName: "ភាសาខ្មែរ" },
    { code: "rw", name: "Kinyarwanda", nativeName: "Ikinyarwanda" },
    { code: "tlh", name: "Klingon", nativeName: "tlhIngan Hol", category: "special" },
    { code: "ku", name: "Kurdish", nativeName: "Kurdî" },
    { code: "ky", name: "Kyrgyz", nativeName: "Кыргызча" },
    { code: "lo", name: "Lao", nativeName: "ລາວ" },
    { code: "la", name: "Latin", nativeName: "Latina" },
    { code: "lv", name: "Latvian", nativeName: "Latviešu" },
    { code: "lt", name: "Lithuanian", nativeName: "Lietuvių" },
    { code: "lb", name: "Luxembourgish", nativeName: "Lëtzebuergesch" },
    { code: "mk", name: "Macedonian", nativeName: "Македонски" },
    { code: "mg", name: "Malagasy", nativeName: "Malagasy" },
    { code: "ms", name: "Malay", nativeName: "Bahasa Melayu" },
    { code: "ml", name: "Malayalam", nativeName: "മലയാളം" },
    { code: "mt", name: "Maltese", nativeName: "Malti" },
    { code: "mi", name: "Maori", nativeName: "Māori" },
    { code: "mr", name: "Marathi", nativeName: "मराठी" },
    { code: "mn", name: "Mongolian", nativeName: "Монгол" },
    { code: "ne", name: "Nepali", nativeName: "नेपाली" },
    { code: "no", name: "Norwegian", nativeName: "Norsk" },
    { code: "ps", name: "Pashto", nativeName: "پښتو" },
    { code: "fa", name: "Persian", nativeName: "فارسی" },
    { code: "pl", name: "Polish", nativeName: "Polski" },
    { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
    { code: "ro", name: "Romanian", nativeName: "Română" },
    { code: "sm", name: "Samoan", nativeName: "Gagana Samoa" },
    { code: "gd", name: "Scots Gaelic", nativeName: "Gàidhlig" },
    { code: "sr", name: "Serbian", nativeName: "Српски" },
    { code: "st", name: "Sesotho", nativeName: "Sesotho" },
    { code: "sn", name: "Shona", nativeName: "chiShona" },
    { code: "sd", name: "Sindhi", nativeName: "سنڌي" },
    { code: "si", name: "Sinhala", nativeName: "සිංහල" },
    { code: "sk", name: "Slovak", nativeName: "Slovenčina" },
    { code: "sl", name: "Slovenian", nativeName: "Slovenščina" },
    { code: "so", name: "Somali", nativeName: "Soomaali" },
    { code: "su", name: "Sundanese", nativeName: "Basa Sunda" },
    { code: "sw", name: "Swahili", nativeName: "Kiswahili" },
    { code: "sv", name: "Swedish", nativeName: "Svenska" },
    { code: "tg", name: "Tajik", nativeName: "Тоҷикӣ" },
    { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
    { code: "tt", name: "Tatar", nativeName: "Татарча" },
    { code: "te", name: "Telugu", nativeName: "తెలుగు" },
    { code: "th", name: "Thai", nativeName: "ไทย" },
    { code: "bo", name: "Tibetan", nativeName: "བོད་སྐད་" },
    { code: "ti", name: "Tigrinya", nativeName: "ትግርኛ" },
    { code: "to", name: "Tongan", nativeName: "Lea Fakatonga" },
    { code: "tr", name: "Turkish", nativeName: "Türkçe" },
    { code: "tk", name: "Turkmen", nativeName: "Türkmençe" },
    { code: "uk", name: "Ukrainian", nativeName: "Українська" },
    { code: "ur", name: "Urdu", nativeName: "اردو" },
    { code: "ug", name: "Uyghur", nativeName: "ئۇيغۇرچە" },
    { code: "uz", name: "Uzbek", nativeName: "Oʻzbekcha" },
    { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
    { code: "cy", name: "Welsh", nativeName: "Cymraeg" },
    { code: "wo", name: "Wolof", nativeName: "Wolof" },
    { code: "xh", name: "Xhosa", nativeName: "isiXhosa" },
    { code: "yi", name: "Yiddish", nativeName: "ייִדיש" },
    { code: "yo", name: "Yoruba", nativeName: "Yorùbá" },
    { code: "yua", name: "Yucatec Maya", nativeName: "Maaya" },
    { code: "zu", name: "Zulu", nativeName: "isiZulu" },
]

// UI Languages (only languages we have translations for)
export const UI_LANGUAGE_OPTIONS: LanguageOption[] = [
    { code: "en", name: "English", nativeName: "English" },
    { code: "zh", name: "Chinese (Simplified)", nativeName: "简体中文" },
]

// Get language options for target language selector
export const TARGET_LANGUAGE_OPTIONS = ALL_LANGUAGES

interface LanguageStore extends AppLanguageSettings {
    // Actions
    setUILanguage: (lang: UILanguage) => void
    setDefaultTargetLanguage: (lang: string) => void

    // Helpers
    getDisplayName: (code: string) => string
    getLanguageByCode: (code: string) => LanguageOption | undefined
}

export const useLanguageStore = create<LanguageStore>()(
    persist(
        (set, get) => ({
            // Default values
            uiLanguage: "zh",
            defaultTargetLanguage: "zh",

            // Actions
            setUILanguage: (lang: UILanguage) => {
                set({ uiLanguage: lang })
                // Note: This does NOT automatically update defaultTargetLanguage
                // That would violate the decoupling rule
            },

            setDefaultTargetLanguage: (lang: string) => {
                set({ defaultTargetLanguage: lang })
            },

            // Helpers
            getDisplayName: (code: string) => {
                const lang = ALL_LANGUAGES.find(l => l.code === code)
                return lang?.nativeName || code
            },

            getLanguageByCode: (code: string) => {
                return ALL_LANGUAGES.find(l => l.code === code)
            },
        }),
        {
            name: "language-settings",
            version: 2, // Bump version to reset stored settings
        }
    )
)

// Metadata
export const LANGUAGE_METADATA = {
    totalCount: ALL_LANGUAGES.length,
    commonCount: COMMON_LANGUAGES.length,
    description: "Complete language list with 117 languages for translation",
}
