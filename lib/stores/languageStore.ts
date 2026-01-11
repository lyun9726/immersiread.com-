"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { UILanguage, TargetLanguage, AppLanguageSettings } from "@/lib/types"

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

interface LanguageStore extends AppLanguageSettings {
    // Actions
    setUILanguage: (lang: UILanguage) => void
    setDefaultTargetLanguage: (lang: TargetLanguage) => void

    // Helpers
    getDisplayName: (lang: string) => string
}

// Language display names
const LANGUAGE_NAMES: Record<string, { native: string; english: string }> = {
    "en": { native: "English", english: "English" },
    "zh": { native: "简体中文", english: "Chinese (Simplified)" },
    "zh-CN": { native: "简体中文", english: "Chinese (Simplified)" },
    "zh-TW": { native: "繁體中文", english: "Chinese (Traditional)" },
    "ja": { native: "日本語", english: "Japanese" },
    "ko": { native: "한국어", english: "Korean" },
    "es": { native: "Español", english: "Spanish" },
    "fr": { native: "Français", english: "French" },
    "de": { native: "Deutsch", english: "German" },
    "ru": { native: "Русский", english: "Russian" },
    "ar": { native: "العربية", english: "Arabic" },
}

export const useLanguageStore = create<LanguageStore>()(
    persist(
        (set, get) => ({
            // Default values
            uiLanguage: "zh",
            defaultTargetLanguage: "zh-CN",

            // Actions
            setUILanguage: (lang: UILanguage) => {
                set({ uiLanguage: lang })
                // Note: This does NOT automatically update defaultTargetLanguage
                // That would violate the decoupling rule
            },

            setDefaultTargetLanguage: (lang: TargetLanguage) => {
                set({ defaultTargetLanguage: lang })
            },

            // Helpers
            getDisplayName: (lang: string) => {
                const info = LANGUAGE_NAMES[lang]
                return info?.native || lang
            },
        }),
        {
            name: "language-settings",
            version: 1,
        }
    )
)

// Export language options for UI
export const UI_LANGUAGE_OPTIONS: { value: UILanguage; label: string }[] = [
    { value: "en", label: "English" },
    { value: "zh", label: "简体中文" },
]

export const TARGET_LANGUAGE_OPTIONS: { value: TargetLanguage; label: string }[] = [
    { value: "en", label: "English" },
    { value: "zh-CN", label: "简体中文" },
    { value: "zh-TW", label: "繁體中文" },
    { value: "ja", label: "日本語" },
    { value: "ko", label: "한국어" },
    { value: "es", label: "Español" },
    { value: "fr", label: "Français" },
    { value: "de", label: "Deutsch" },
    { value: "ru", label: "Русский" },
    { value: "ar", label: "العربية" },
]
