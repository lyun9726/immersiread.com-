"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useReaderStore } from "@/lib/reader/stores/readerStore"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"
import { Languages, Check, ChevronDown } from "lucide-react"
import { primaryLanguages, extendedLanguages, getLanguageByCode } from "@/data/target-languages"
import { ScrollArea } from "@/components/ui/scroll-area"

// UI locales that have translation files
const UI_SUPPORTED_LOCALES = ['en', 'zh', 'ja', 'ko', 'fr', 'es', 'de'];

export function LanguageSwitcher() {
    const { targetLanguage, setTargetLanguage } = useReaderStore()
    const [mounted, setMounted] = useState(false)
    const pathname = usePathname()
    const router = useRouter()

    // Load saved language from localStorage on mount
    useEffect(() => {
        setMounted(true)
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('readai-target-language')
            if (saved && saved !== targetLanguage) {
                setTargetLanguage(saved)
            }
        }
    }, [])

    // Handle language change - updates both translation target AND UI locale
    const handleLanguageChange = (langCode: string) => {
        // 1. Update translation target language
        setTargetLanguage(langCode)

        // 2. If this language has UI translations, switch locale
        // For languages like zh-TW, map to base locale
        let uiLocale = langCode.split('-')[0]; // zh-TW -> zh

        // Check if UI supports this locale
        if (UI_SUPPORTED_LOCALES.includes(uiLocale)) {
            // Get current path and replace locale
            const segments = pathname.split('/')

            // Check if second segment is a locale
            if (segments.length > 1 && UI_SUPPORTED_LOCALES.includes(segments[1])) {
                // Only switch if different from current
                if (segments[1] !== uiLocale) {
                    segments[1] = uiLocale;
                    const newPath = segments.join('/')
                    router.replace(newPath)
                }
            }
        }
    }

    // Get current language display
    const currentLang = getLanguageByCode(targetLanguage)
    const displayName = currentLang ? currentLang.nativeName : targetLanguage

    if (!mounted) {
        return (
            <Button variant="ghost" size="sm" className="rounded-xl gap-2">
                <Languages className="h-4 w-4" />
                <span className="hidden sm:inline">Language</span>
            </Button>
        )
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="rounded-xl gap-2 hover:bg-primary/10">
                    <Languages className="h-4 w-4" />
                    <span className="hidden sm:inline text-sm font-medium">{displayName}</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                    翻译目标语言 / Target Language
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* Primary Languages */}
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground py-1">
                        常用 / Popular
                    </DropdownMenuLabel>
                    {primaryLanguages.map((lang) => (
                        <DropdownMenuItem
                            key={lang.code}
                            onClick={() => handleLanguageChange(lang.code)}
                            className="cursor-pointer"
                        >
                            <span className="mr-2">{lang.flag}</span>
                            <span className="flex-1">{lang.nativeName}</span>
                            {targetLanguage === lang.code && (
                                <Check className="h-4 w-4 text-primary" />
                            )}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                {/* Extended Languages in ScrollArea */}
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground py-1">
                        更多语言 / More Languages
                    </DropdownMenuLabel>
                    <ScrollArea className="h-[200px]">
                        {extendedLanguages.map((lang) => (
                            <DropdownMenuItem
                                key={lang.code}
                                onClick={() => handleLanguageChange(lang.code)}
                                className="cursor-pointer"
                            >
                                <span className="mr-2">{lang.flag}</span>
                                <span className="flex-1">{lang.nativeName}</span>
                                {targetLanguage === lang.code && (
                                    <Check className="h-4 w-4 text-primary" />
                                )}
                            </DropdownMenuItem>
                        ))}
                    </ScrollArea>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
